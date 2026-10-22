import path from "node:path";
import { ApplicationFailure, Context } from "@temporalio/activity";
import {
  collectForConfig, loadConfig, loadKevSnapshot, loadPack, matchAll, refreshKev,
  type AdvisoryPack, type Brief, type EgressEntry, type Finding, type Inventory, type KevEntry, type Ledger, type ScanStats,
} from "@twotoe/core";
import { buildBrief, localDate, resolveModel, writeDraft, type ModelClient, type WriteResult } from "@twotoe/writer";
import { inputHash, RunStore } from "./cache";
import { CachingModelClient } from "./cachingClient";
import { persistBrief, type PersistedRun } from "./persist";

// SPEC 11.3 activities. Each one is idempotent: its output is cached on disk
// keyed by a hash of its input, per workflow run. Large data (inventory, pack)
// moves between activities as cache references, so env key names and paths
// never land in Temporal's history database and payloads stay small.

export interface ActivityDeps {
  stateDir: string;                 // ~/.twotoe
  modelClient: ModelClient;
  ledger: Ledger;                   // the worker's egress ledger
  modelDelayMs?: number;            // crash test: pause inside the model activity after the model answered
  failFirstModelAttempt?: boolean;  // tests: fail attempt 1 after the model answered
  notify?: (brief: Brief) => Promise<unknown>;
  now?: () => Date;
}

export interface CollectedRef {
  inventoryRef: string;
  roots: string[];
  checksRun: number;
  items: number;
  region: string | null;
  model: string | null;
  notify: boolean;
  skippedLocked: number;
}

export interface PackRef {
  packRef: string;
  kevSource: "bundled" | "network" | "snapshot";
  kevEntries: number;
  egress: EgressEntry[];
}

export interface WriteSummary extends Omit<WriteResult, "draft"> {
  draft: WriteResult["draft"];
  egress: EgressEntry[];
}

interface PackBlob {
  pack: AdvisoryPack;
  kev: KevEntry[];
}

export function createActivities(deps: ActivityDeps) {
  const now = deps.now ?? (() => new Date());
  const ctx = () => Context.current();
  // Standalone activities (no workflow) get a per-activity cache dir.
  const store = () => new RunStore(path.join(deps.stateDir, "cache"), ctx().info.workflowExecution?.workflowId ?? `standalone-${ctx().info.activityId}`);

  async function cached<T>(activity: string, input: unknown, fn: (s: RunStore, attempt: number) => Promise<T>): Promise<T> {
    const s = store();
    const key = inputHash(input);
    const attempt = ctx().info.attempt;
    s.journal({ activity, attempt, event: "start", key });
    const hit = s.read<T>(activity, key);
    if (hit !== undefined) {
      s.journal({ activity, attempt, event: "cache-hit", key });
      return hit;
    }
    const value = await fn(s, attempt);
    s.write(activity, key, value);
    s.journal({ activity, attempt, event: "computed", key });
    return value;
  }

  function blob<T>(name: string, ref: string): T {
    const v = store().read<T>(name, ref);
    if (v === undefined) throw ApplicationFailure.nonRetryable(`missing cached ${name} ${ref}`, "CacheMissing");
    return v;
  }

  function egressSince(before: number): EgressEntry[] {
    return deps.ledger.entries().slice(before);
  }

  return {
    async collectInventory(configPath: string): Promise<CollectedRef> {
      return cached("collectInventory", { configPath }, async (s) => {
        const config = loadConfig(configPath);
        const scan = await collectForConfig(config, { configDir: path.dirname(configPath) });
        const inventoryRef = inputHash(scan.inventory);
        s.write("inventory", inventoryRef, { inventory: scan.inventory, stats: scan.stats });
        return {
          inventoryRef,
          roots: scan.inventory.roots,
          checksRun: scan.inventory.checksRun,
          items: scan.inventory.items.length,
          region: config.region ?? null,
          model: config.model ?? null,
          notify: config.notify?.toast === true,
          skippedLocked: scan.stats.skippedLocked,
        };
      });
    },

    async loadPack(): Promise<PackRef> {
      return cached("loadPack", { offline: true }, async (s) => {
        const value: PackBlob = { pack: loadPack(), kev: loadKevSnapshot() };
        const packRef = inputHash(value);
        s.write("pack", packRef, value);
        return { packRef, kevSource: "bundled" as const, kevEntries: value.kev.length, egress: [] };
      });
    },

    async refreshKevAndLoadPack(): Promise<PackRef> {
      return cached("refreshKevAndLoadPack", { offline: false }, async (s) => {
        const before = deps.ledger.entries().length;
        const kev = await refreshKev({ now: now(), snapshotPath: path.join(deps.stateDir, "kev-snapshot.json") });
        const value: PackBlob = { pack: loadPack(), kev: kev.entries };
        const packRef = inputHash(value);
        s.write("pack", packRef, value);
        return { packRef, kevSource: kev.source, kevEntries: kev.entries.length, egress: egressSince(before) };
      });
    },

    async matchAdvisories(collected: CollectedRef, pack: PackRef): Promise<Finding[]> {
      return cached("matchAdvisories", { inv: collected.inventoryRef, pack: pack.packRef, region: collected.region }, async () => {
        const { inventory } = blob<{ inventory: Inventory }>("inventory", collected.inventoryRef);
        const p = blob<PackBlob>("pack", pack.packRef);
        return matchAll(inventory, p.pack, { region: collected.region, now: now(), kev: p.kev });
      });
    },

    // Heartbeats every 10 s while waiting on Ollama (SPEC 11.3).
    async writeBriefWithValidation(input: { findings: Finding[]; collected: CollectedRef; pack: PackRef }): Promise<WriteSummary> {
      return cached("writeBriefWithValidation", { ids: input.findings.map((f) => f.id), model: input.collected.model }, async (s, attempt) => {
        const c = ctx();
        c.heartbeat();
        const beat = setInterval(() => c.heartbeat(), 10_000);
        try {
          const before = deps.ledger.entries().length;
          const p = blob<PackBlob>("pack", input.pack.packRef);
          const w = await writeDraft({
            findings: input.findings,
            pack: p.pack,
            date: localDate(now()),
            roots: input.collected.roots,
            client: new CachingModelClient(deps.modelClient, s, "writeBriefWithValidation", attempt),
            model: resolveModel({ config: input.collected.model }),
          });
          if (deps.failFirstModelAttempt && attempt === 1) {
            s.journal({ activity: "writeBriefWithValidation", attempt, event: "injected-failure" });
            throw ApplicationFailure.retryable("injected failure after the model answered", "InjectedFailure");
          }
          if (deps.modelDelayMs) {
            s.journal({ activity: "writeBriefWithValidation", attempt, event: "delay-start" });
            await c.sleep(deps.modelDelayMs);
          }
          return { ...w, egress: egressSince(before) };
        } finally {
          clearInterval(beat);
        }
      });
    },

    async assembleBrief(input: { collected: CollectedRef; findings: Finding[]; write: WriteSummary; startedAt: string; egress: EgressEntry[] }): Promise<Brief> {
      return cached("assembleBrief", { inv: input.collected.inventoryRef, ids: input.findings.map((f) => f.id), mode: input.write.mode, startedAt: input.startedAt }, async () => {
        const { inventory } = blob<{ inventory: Inventory }>("inventory", input.collected.inventoryRef);
        const t = now();
        return buildBrief({
          draft: input.write.draft,
          findings: input.findings,
          inventory,
          now: t,
          durationMs: Math.max(0, t.getTime() - Date.parse(input.startedAt)),
          egress: input.egress,
          mode: input.write.mode,
          model: input.write.model,
          attempts: input.write.attempts,
          validatorRejections: input.write.rejections,
        });
      });
    },

    // Cached too, so a retry never shows the toast twice.
    async persistAndNotify(input: { brief: Brief; findings: Finding[]; notify: boolean; run?: PersistedRun }): Promise<{ latestPath: string; notified: boolean }> {
      return cached("persistAndNotify", { date: input.brief.date, line1: input.brief.line1, n: input.findings.length }, async () => {
        const { latestPath } = persistBrief(deps.stateDir, input.brief, input.findings, input.run);
        let notified = false;
        if (input.notify && deps.notify) notified = Boolean(await deps.notify(input.brief).catch(() => false));
        return { latestPath, notified };
      });
    },
  };
}

export type Activities = ReturnType<typeof createActivities>;
export type { ScanStats };
