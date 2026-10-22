import fs from "node:fs";
import { z } from "zod";
import type { SystemProbe } from "./SystemProbe";

// Shape of eval/fixtures/*/probe.json.
export const ProbeFixture = z.object({
  platform: z.enum(["win32", "darwin", "linux", "other"]).default("win32"),
  nodeVersion: z.string().nullable().default(null),
  phpVersion: z.string().nullable().default(null),
  plexVersion: z.string().nullable().default(null),
  gitlabVersion: z.string().nullable().default(null),
  dockerImages: z.array(z.object({ repo: z.string(), tag: z.string() })).default([]),
  trustStores: z.record(z.array(z.object({ store: z.string(), present: z.boolean() }))).default({}),
  commands: z.array(z.string()).default([]),
  homeMarkers: z.array(z.string()).default([]),
});
export type ProbeFixture = z.infer<typeof ProbeFixture>;

export class FixtureProbe implements SystemProbe {
  readonly data: ProbeFixture;

  constructor(source: string | unknown) {
    const raw = typeof source === "string" ? JSON.parse(fs.readFileSync(source, "utf8")) : source;
    this.data = ProbeFixture.parse(raw);
  }

  async platform() { return this.data.platform; }
  async nodeVersion() { return this.data.nodeVersion; }
  async phpVersion() { return this.data.phpVersion; }
  async plexVersion() { return this.data.plexVersion; }
  async gitlabVersion() { return this.data.gitlabVersion; }
  async dockerImages() { return this.data.dockerImages.map((d) => ({ ...d })); }
  async trustStoreHas(subject: string) { return (this.data.trustStores[subject] ?? []).map((s) => ({ ...s })); }
  async commandExists(cmd: string) { return this.data.commands.includes(cmd); }
  async homeMarkers() { return [...this.data.homeMarkers]; }
}
