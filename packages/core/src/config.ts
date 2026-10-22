import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { FixtureProbe } from "./probe/FixtureProbe";
import { RealProbe } from "./probe/RealProbe";
import { collectInventory, type ScanResult } from "./scan";

// ~/.twotoe/config.json (SPEC 12). Unknown keys pass through.
export const TwotoeConfig = z.object({
  roots: z.array(z.string()).optional(),
  region: z.string().nullable().optional(),
  model: z.string().optional(),
  // Eval/demo/crash-test only: scan <fixture>/project with <fixture>/probe.json.
  fixture: z.string().optional(),
  notify: z.object({ toast: z.boolean().optional() }).passthrough().optional(),
}).passthrough();
export type TwotoeConfig = z.infer<typeof TwotoeConfig>;

export function twotoeHome(home: string = os.homedir()): string {
  return path.join(home, ".twotoe");
}

export function defaultConfigPath(home: string = os.homedir()): string {
  return path.join(twotoeHome(home), "config.json");
}

// Missing file -> {}. A file that exists but does not parse is an error the
// user should see, not a silently empty config.
export function loadConfig(file: string = defaultConfigPath()): TwotoeConfig {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return {};
  }
  return TwotoeConfig.parse(JSON.parse(text.replace(/^﻿/, "")));
}

export function expandHome(p: string, home: string = os.homedir()): string {
  return p === "~" || p.startsWith("~/") || p.startsWith("~\\") ? path.join(home, p.slice(2)) : p;
}

// SPEC 8.3 default roots on Windows (only those that exist are scanned).
export function defaultRoots(home: string = os.homedir()): string[] {
  return [
    ["code"], ["projects"], ["dev"], ["Documents", "GitHub"], ["source", "repos"], ["Desktop"],
  ].map((segs) => path.join(home, ...segs)).filter((p) => fs.existsSync(p));
}

export interface CollectForConfigOptions {
  roots?: string[];          // explicit roots win over config
  fixture?: string;          // explicit fixture wins over config.fixture
  machine?: boolean;         // machine-level Python locations (real scans only)
  configDir?: string;        // resolves a relative config.fixture
}

// One scan as configured: a fixture (FixtureProbe, no machine Python) or this
// machine (RealProbe; explicit roots, else config roots, else default roots).
export async function collectForConfig(config: TwotoeConfig, opts: CollectForConfigOptions = {}): Promise<ScanResult> {
  const fixture = opts.fixture ?? (config.fixture ? path.resolve(opts.configDir ?? ".", expandHome(config.fixture)) : undefined);
  if (fixture) {
    const dir = path.resolve(fixture);
    return collectInventory({
      roots: [path.join(dir, "project")],
      probe: new FixtureProbe(path.join(dir, "probe.json")),
      machinePython: false,
    });
  }
  const roots = opts.roots?.length ? opts.roots : config.roots?.length ? config.roots.map((r) => expandHome(r)) : defaultRoots();
  return collectInventory({ roots, probe: new RealProbe(), machinePython: opts.machine !== false });
}
