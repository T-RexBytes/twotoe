import path from "node:path";
import pc from "picocolors";
import {
  collectForConfig, loadConfig, loadPack, redactText, type ScanResult, type TwotoeConfig,
} from "@twotoe/core";

function parseVersion(v: string): number[] {
  return v.replace(/^v/, "").split(".").map((n) => Number.parseInt(n, 10) || 0);
}

// SPEC 8.2.1 dogfood check: is the Node running TwoToe itself patched?
export function selfNodeStatus(version: string = process.version): { version: string; patched: boolean | null; fixed: string | null } {
  const node = loadPack().advisories.find((a) => a.id === "nodejs-2026-10-21");
  const fixed = (node?.check.params.fixed ?? {}) as Record<string, string>;
  const [major = 0, minor = 0, patch = 0] = parseVersion(version);
  const target = fixed[String(major)];
  if (!target) return { version: version.replace(/^v/, ""), patched: null, fixed: null };
  const [, tMinor = 0, tPatch = 0] = parseVersion(target);
  const patched = minor > tMinor || (minor === tMinor && patch >= tPatch);
  return { version: version.replace(/^v/, ""), patched, fixed: target };
}

export function warnIfSelfUnpatched(): ReturnType<typeof selfNodeStatus> {
  const self = selfNodeStatus();
  if (self.patched === false) {
    process.stderr.write(pc.red(pc.bold(
      `WARNING: TwoToe is running on Node ${self.version}, which is missing the Oct 21 security fixes. Upgrade to ${self.fixed} or newer.\n`,
    )));
  }
  return self;
}

export interface CollectOptions {
  fixture?: string;
  machine?: boolean;
}

// Scan this machine or a fixture, plus the config that goes with it
// (~/.twotoe/config.json, or <fixture>/config.json).
export async function collect(rootsArg: string[], opts: CollectOptions): Promise<{ result: ScanResult; config: TwotoeConfig }> {
  const config = opts.fixture ? loadConfig(path.join(path.resolve(opts.fixture), "config.json")) : loadConfig();
  const result = await collectForConfig(config, {
    roots: rootsArg,
    ...(opts.fixture ? { fixture: opts.fixture } : {}),
    ...(opts.machine !== undefined ? { machine: opts.machine } : {}),
  });
  return { result, config };
}

export interface ScanCommandOptions extends CollectOptions {
  json?: boolean;
}

export async function runScan(rootsArg: string[], opts: ScanCommandOptions): Promise<ScanResult> {
  const self = warnIfSelfUnpatched();
  const { result } = await collect(rootsArg, opts);
  // Redact again on the way out: defense in depth for anything a scanner missed.
  if (opts.json) {
    process.stdout.write(redactText(JSON.stringify({ ...result, selfNode: self }, null, 2)) + "\n");
  } else {
    process.stdout.write(redactText(summarize(result)) + "\n");
  }
  return result;
}

export function summarize({ inventory, stats }: ScanResult): string {
  const byKind = new Map<string, number>();
  for (const it of inventory.items) byKind.set(it.kind, (byKind.get(it.kind) ?? 0) + 1);
  const kinds = [...byKind.entries()].map(([k, n]) => `${k} ${n}`).join(", ") || "nothing";
  const lines = [
    `Scanned ${inventory.roots.length} root(s) in ${(inventory.durationMs / 1000).toFixed(1)}s, ${inventory.checksRun} checks.`,
    `Found: ${kinds}.`,
    `Files visited ${stats.filesVisited}, site-packages ${stats.sitePackagesScanned}, env files ${stats.envFilesScanned}.`,
  ];
  if (stats.skippedLocked) lines.push(`Skipped ${stats.skippedLocked} locked file(s).`);
  if (stats.rootsMissing.length) lines.push(`Not found: ${stats.rootsMissing.join(", ")}.`);
  if (stats.notes.length) lines.push(`Notes: ${stats.notes.join("; ")}.`);
  return lines.join("\n");
}
