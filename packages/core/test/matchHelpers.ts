import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { matchAll } from "../src/match/matchAll";
import { loadPack } from "../src/pack/loadPack";
import { FixtureProbe } from "../src/probe/FixtureProbe";
import { collectInventory } from "../src/scan";
import type { Finding } from "../src/schemas";
import { CANARY, makeTree, tempDir } from "./helpers";

// Brief time in the SPEC 12 example: Thu Oct 23, 07:00 IST.
export const NOW = new Date("2026-10-23T07:00:00+05:30");

// Real pipeline: synthetic files + FixtureProbe -> collectInventory -> matchAll.
export async function findingsFor(files: Record<string, string>, probe: Record<string, unknown> = {}, region?: string): Promise<Finding[]> {
  const home = tempDir("twotoe-tt-");
  const root = path.join(home, "project");
  fs.mkdirSync(root, { recursive: true });
  makeTree(root, files);
  const { inventory } = await collectInventory({ roots: [root], probe: new FixtureProbe(probe), home, machinePython: false });
  const findings = matchAll(inventory, loadPack(), { region: region ?? null, now: NOW });
  expect(JSON.stringify(findings)).not.toContain(CANARY);
  return findings;
}
