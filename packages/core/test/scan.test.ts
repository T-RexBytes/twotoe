import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FixtureProbe } from "../src/probe/FixtureProbe";
import { RealProbe } from "../src/probe/RealProbe";
import { collectInventory, SOURCE_PIN, SOURCE_SITE_PACKAGES } from "../src/scan";
import { Inventory, type InventoryItem } from "../src/schemas";
import { CANARY, makeTree, tempDir } from "./helpers";

afterEach(() => vi.restoreAllMocks());

const IOC_MARKER = "TWOTOE_IOC_CONTENT_MARKER";

// A synthetic machine: secrets carry the canary everywhere a value could hide.
function kitchenSink(): { home: string; root: string; probe: FixtureProbe } {
  const home = tempDir("twotoe-home-");
  const root = path.join(home, "code");
  makeTree(root, {
    "railapp/.env": `export RAILWAY_TOKEN="${CANARY}"\r\nOPENAI_API_KEY=${CANARY}\r\n# GH_TOKEN=${CANARY}\r\nPEM="-----BEGIN-----\r\n${CANARY}=x\r\n-----END-----"\r\n`,
    "railapp/.env.example": `RAILWAY_TOKEN=${CANARY}\n`,
    "railapp/railway.toml": `[deploy]\nstartCommand = "${CANARY}"\n`,
    "railapp/Dockerfile": `FROM node:24-alpine\nENV SECRET=${CANARY}\n`,
    "railapp/.nvmrc": "24.22.0\n",
    "railapp/package.json": JSON.stringify({ name: "railapp", engines: { node: ">=24" } }),
    "railapp/package-lock.json": JSON.stringify({ lockfileVersion: 3, packages: { "node_modules/undici": { version: "7.1.0", resolved: `https://u:${CANARY}@r/u.tgz` } } }),
    "railapp/docker-compose.yml": `services:\n  web:\n    image: php:8.3.35-apache\n    environment:\n      - DB_PASSWORD=${CANARY}\n`,
    "pyapp/requirements.txt": `--index-url https://u:${CANARY}@pypi.example/simple\nlitellm==1.107.0\n`,
    "pyapp/.venv/pyvenv.cfg": `home = ${home}\\Python312\nversion = 3.12.4\n`,
    "pyapp/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\nVersion: 1.107.0\n",
    "pyapp/.venv/Lib/site-packages/certifi-2024.2.2.dist-info/METADATA": "Name: certifi\n",
    "pyapp/.venv/Lib/site-packages/certifi/cacert.pem": "# Label: \"emSign ECC Root CA - G3\"\n",
    "pyapp/.venv/Lib/site-packages/cook.pth": `import cook # ${IOC_MARKER}\n`,
  });
  const probe = new FixtureProbe({
    platform: "win32",
    nodeVersion: "24.22.0",
    phpVersion: "8.3.35",
    plexVersion: "1.43.3.10860",
    dockerImages: [{ repo: "gitlab/gitlab-ce", tag: "19.4.1-ce.0" }],
    trustStores: { "emSign ECC Root CA - G3": [{ store: "node", present: true }, { store: "windows:LocalMachine\\Root", present: false }] },
    commands: ["opencode"],
    homeMarkers: ["~\\.config\\opencode"],
  });
  return { home, root, probe };
}

function find<K extends InventoryItem["kind"]>(items: InventoryItem[], kind: K): Array<Extract<InventoryItem, { kind: K }>> {
  return items.filter((i): i is Extract<InventoryItem, { kind: K }> => i.kind === kind);
}

describe("collectInventory on a fixture machine", () => {
  it("produces a schema-valid inventory with the expected facts", async () => {
    const { home, root, probe } = kitchenSink();
    const { inventory, stats } = await collectInventory({ roots: [root], probe, home, machinePython: false, now: () => new Date("2026-10-23T03:00:00Z") });
    expect(Inventory.safeParse(inventory).success).toBe(true);
    expect(inventory.scannedAt).toBe("2026-10-23T03:00:00.000Z");
    expect(inventory.roots).toEqual([path.join("~", "code")]);
    const items = inventory.items;

    expect(find(items, "envKey").map((e) => `${path.basename(e.file)}:${e.key}`).sort()).toEqual([
      ".env.example:RAILWAY_TOKEN", ".env:OPENAI_API_KEY", ".env:PEM", ".env:RAILWAY_TOKEN", "docker-compose.yml:DB_PASSWORD",
    ]);
    expect(find(items, "runtime").map((r) => `${r.name} ${r.version} ${r.source.split(":")[0]}`).sort()).toEqual([
      "node 24.22.0 .nvmrc", "node 24.22.0 node --version", "node >=24 package.json#engines.node", "php 8.3.35 php -v", "python 3.12.4 pyvenv.cfg",
    ]);
    const pypi = find(items, "package").filter((p) => p.ecosystem === "pypi");
    expect(pypi.filter((p) => p.name === "litellm").map((p) => p.source.split(":")[0] + ":")).toEqual([SOURCE_PIN, SOURCE_SITE_PACKAGES].sort());
    expect(find(items, "package").some((p) => p.ecosystem === "npm" && p.name === "undici")).toBe(true);
    expect(find(items, "dockerImage").map((d) => `${d.image}:${d.tag}`).sort()).toEqual(["gitlab/gitlab-ce:19.4.1-ce.0", "node:24-alpine", "php:8.3.35-apache"]);
    expect(find(items, "app")).toEqual([{ kind: "app", name: "plex", version: "1.43.3.10860", source: "Plex Media Server" }]);
    expect(find(items, "iocFile").map((i) => i.filename)).toEqual(["cook.pth"]);
    expect(find(items, "trustAnchor").filter((t) => t.present).map((t) => t.store.split(":")[0]).sort()).toEqual(["certifi", "node"]);
    expect(find(items, "marker").map((m) => m.marker).sort()).toEqual(["cli:opencode", "home:.config/opencode", "railway.toml"]);
    expect(inventory.checksRun).toBeGreaterThan(15);
    expect(stats.sitePackagesScanned).toBe(1);
  });

  it("never lets the canary, IOC contents, or the home path reach any output", async () => {
    const { home, root, probe } = kitchenSink();
    const logs = [
      vi.spyOn(console, "log"), vi.spyOn(console, "error"), vi.spyOn(console, "warn"), vi.spyOn(console, "info"),
    ];
    const readFile = vi.spyOn(fs.promises, "readFile");
    const result = await collectInventory({ roots: [root], probe, home, machinePython: false });
    const json = JSON.stringify(result);
    expect(json).not.toContain(CANARY);
    expect(json).not.toContain(IOC_MARKER);
    expect(json.toLowerCase()).not.toContain(home.toLowerCase().replace(/\\/g, "\\\\"));
    expect(json.toLowerCase()).not.toContain(home.toLowerCase());
    for (const l of logs) expect(l).not.toHaveBeenCalled();
    for (const call of readFile.mock.calls) {
      const p = String(call[0]);
      expect(path.basename(p)).not.toMatch(/^\.env|^cook\.|^sitecustomize\.py$/);
    }
  });

  it("counts a locked env file and keeps going", async () => {
    const { home, root, probe } = kitchenSink();
    const real = fs.createReadStream.bind(fs);
    vi.spyOn(fs, "createReadStream").mockImplementation(((p: fs.PathLike, o?: never) => {
      if (path.basename(String(p)) === ".env") throw Object.assign(new Error("busy"), { code: "EBUSY" });
      return real(p, o);
    }) as typeof fs.createReadStream);
    const { inventory, stats } = await collectInventory({ roots: [root], probe, home, machinePython: false });
    expect(stats.skippedLocked).toBe(1);
    expect(find(inventory.items, "envKey").some((e) => path.basename(e.file) === ".env")).toBe(false);
    expect(find(inventory.items, "envKey").some((e) => e.key === "DB_PASSWORD")).toBe(true);
  });

  it("reports a missing root instead of failing", async () => {
    const { home, probe } = kitchenSink();
    const { inventory, stats } = await collectInventory({ roots: [path.join(home, "nope")], probe, home, machinePython: false });
    expect(stats.rootsMissing).toEqual([path.join("~", "nope")]);
    expect(inventory.roots).toEqual([]);
  });
});

describe("RealProbe smoke test (this machine)", () => {
  it("reads the user's Node version and Node trust store", async () => {
    const probe = new RealProbe();
    expect(await probe.nodeVersion()).toMatch(/^\d+\.\d+\.\d+$/);
    const stores = await probe.trustStoreHas("emSign ECC Root CA - G3");
    expect(stores.some((s) => s.store === "node")).toBe(true);
    expect(await probe.commandExists("node")).toBe(true);
    expect(await probe.commandExists("twotoe-no-such-command")).toBe(false);
  }, 30_000);
});
