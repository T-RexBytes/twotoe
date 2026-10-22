import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pemBundleHas } from "../src/probe/RealProbe";
import { normalizeVersion, parsePhpVersion, subjectHasCN } from "../src/probe/SystemProbe";
import { parseDockerfileFroms, parseImageRef, readComposeImages, readDockerfileImages } from "../src/scanners/dockerfiles";
import {
  parseEnginesNode, parseNodeVersionFile, parseNpmLock, parsePnpmLock, parseYarnLock,
} from "../src/scanners/nodeLockfiles";
import { classifyFile, dedupeRoots, walkRoots } from "../src/scanners/walk";
import { redactText } from "../src/util/redact";
import { SkipCounter } from "../src/util/safeFs";
import { CANARY, makeTree, tempDir } from "./helpers";

describe("classifyFile", () => {
  it.each([
    [".env", "env"], [".env.local", "env"], [".env.example", "env"], ["prod.env", "env"],
    ["docker-compose.yml", "compose"], ["docker-compose.prod.yaml", "compose"], ["compose.yaml", "compose"],
    ["Dockerfile", "dockerfile"], ["Dockerfile.dev", "dockerfile"], ["api.dockerfile", "dockerfile"],
    [".nvmrc", "nodeVersionFile"], [".node-version", "nodeVersionFile"], ["package.json", "packageJson"],
    ["package-lock.json", "npmLock"], ["pnpm-lock.yaml", "pnpmLock"], ["yarn.lock", "yarnLock"],
    ["requirements-dev.txt", "pyPins"], ["poetry.lock", "pyPins"], ["uv.lock", "pyPins"], ["Pipfile.lock", "pyPins"],
    ["railway.toml", "railway"], ["railway.json", "railway"], ["pyvenv.cfg", "pyvenvCfg"],
  ])("%s -> %s", (name, cat) => expect(classifyFile(name)).toBe(cat));

  it.each([".envrc", "env", "README.md", "composer.json", "cook.pth"])("%s -> null", (name) => {
    expect(classifyFile(name)).toBeNull();
  });
});

describe("walkRoots", () => {
  it("skips SPEC 8.3 directories and OneDrive, and dedupes nested roots", async () => {
    const root = makeTree(tempDir(), {
      "a/.env": "A=1",
      "a/node_modules/x/.env": "B=1",
      "a/.git/.env": "C=1",
      "a/dist/.env": "D=1",
      "OneDrive/proj/.env": "E=1",
      "x/AppData/Local/Temp/.env": "F=1",
    });
    expect(dedupeRoots([root, path.join(root, "a")])).toEqual([path.resolve(root)]);
    const res = await walkRoots([root, path.join(root, "a")], new SkipCounter());
    expect(res.files.env).toEqual([path.join(root, "a", ".env")]);
    expect(res.stats.oneDriveSkipped).toBe(1);
  });

  it("skips folders holding .twotoe-ignore and folders in the exclude list", async () => {
    const root = makeTree(tempDir(), {
      "real/.env": "A=1",
      "repo/eval/fixtures/.twotoe-ignore": "skip me",
      "repo/eval/fixtures/f06/project/app/.env": "RAILWAY_TOKEN=x",
      "private/.env": "B=1",
      "marker-at-root/.env": "C=1",
    });
    fs.writeFileSync(path.join(root, "marker-at-root", ".twotoe-ignore"), "");
    const res = await walkRoots([root], new SkipCounter(), { exclude: [path.join(root, "private")] });
    expect(res.files.env.map((f) => path.relative(root, f).split(path.sep).join("/")).sort()).toEqual(["real/.env"]);
    expect(res.stats.ignoredDirs).toBe(2);
    expect(res.stats.excludedDirs).toBe(1);
    // A fixture run starts below the marker, so it still scans.
    const fx = await walkRoots([path.join(root, "repo", "eval", "fixtures", "f06", "project")], new SkipCounter());
    expect(fx.files.env).toHaveLength(1);
  });

  it("stops at maxFiles and says so", async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 30; i++) files[`f${i}.txt`] = "";
    const root = makeTree(tempDir(), files);
    const res = await walkRoots([root], new SkipCounter(), { maxFiles: 10 });
    expect(res.stats.truncated).toBe(true);
    expect(res.stats.filesVisited).toBe(10);
  });

  it("counts a locked directory instead of crashing", async () => {
    const root = makeTree(tempDir(), { "ok/.env": "A=1", "locked/.env": "B=1" });
    const real = fs.promises.readdir.bind(fs.promises);
    const { vi } = await import("vitest");
    const spy = vi.spyOn(fs.promises, "readdir").mockImplementation((async (p: fs.PathLike, o?: unknown) => {
      if (String(p).endsWith("locked")) throw Object.assign(new Error("denied"), { code: "EPERM" });
      return real(p, o as never);
    }) as typeof fs.promises.readdir);
    const skips = new SkipCounter();
    const res = await walkRoots([root], skips);
    spy.mockRestore();
    expect(skips.locked).toBe(1);
    expect(res.files.env).toEqual([path.join(root, "ok", ".env")]);
  });
});

describe("docker", () => {
  it.each([
    ["node:24.22.0-alpine", { image: "node", tag: "24.22.0-alpine" }],
    ["node", { image: "node", tag: "latest" }],
    ["docker.io/library/php:8.3.35-apache", { image: "php", tag: "8.3.35-apache" }],
    ["ghcr.io/berriai/litellm:v1.107.0", { image: "ghcr.io/berriai/litellm", tag: "v1.107.0" }],
    ["localhost:5000/team/app", { image: "localhost:5000/team/app", tag: "latest" }],
    ["plexinc/pms-docker:latest@sha256:abc", { image: "plexinc/pms-docker", tag: "latest" }],
    ["node:${NODE_VERSION}", { image: "node", tag: "${NODE_VERSION}" }],
  ])("parseImageRef(%s)", (ref, expected) => expect(parseImageRef(ref)).toEqual(expected));

  it("ignores scratch and build stages", () => {
    const lines: Array<[string, number]> = [
      ["FROM --platform=linux/amd64 node:24-alpine AS build", 1],
      ["RUN npm ci", 2],
      ["from build as test", 3],
      ["FROM scratch", 4],
      ["FROM gitlab/gitlab-ce:19.4.2-ce.0", 5],
    ];
    expect(parseDockerfileFroms(lines)).toEqual([
      { image: "node", tag: "24-alpine", line: 1 },
      { image: "gitlab/gitlab-ce", tag: "19.4.2-ce.0", line: 5 },
    ]);
  });

  it("reads Dockerfiles and compose files without keeping other lines", async () => {
    const dir = makeTree(tempDir(), {
      Dockerfile: `FROM php:8.1.30-fpm\r\nENV API_KEY=${CANARY}\r\nARG TOKEN=${CANARY}\r\n`,
      "docker-compose.yml": `services:\n  plex:\n    image: "plexinc/pms-docker:1.43.3.10860"\n    environment:\n      - PLEX_CLAIM=${CANARY}\n`,
    });
    const d = await readDockerfileImages(path.join(dir, "Dockerfile"));
    const c = await readComposeImages(path.join(dir, "docker-compose.yml"));
    expect(d.images).toEqual([{ image: "php", tag: "8.1.30-fpm", line: 1 }]);
    expect(c.images).toEqual([{ image: "plexinc/pms-docker", tag: "1.43.3.10860", line: 3 }]);
    expect(JSON.stringify([d, c])).not.toContain(CANARY);
  });
});

describe("node lockfiles and version files", () => {
  it("parses package-lock v3", () => {
    const text = JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "app", version: "1.0.0" },
        "node_modules/undici": { version: "7.1.0", resolved: `https://u:${CANARY}@registry/undici.tgz` },
        "node_modules/a/node_modules/@scope/b": { version: "2.0.0" },
      },
    });
    const out = parseNpmLock(text);
    expect(out).toEqual([{ name: "undici", version: "7.1.0" }, { name: "@scope/b", version: "2.0.0" }]);
    expect(JSON.stringify(out)).not.toContain(CANARY);
  });

  it("parses pnpm-lock v9, v6 and v5 keys", () => {
    const v9 = "lockfileVersion: '9.0'\n\nimporters:\n  .:\n    dependencies: {}\n\npackages:\n\n  '@babel/core@7.24.7':\n    resolution: {integrity: x}\n\n  zod@3.25.76:\n    resolution: {}\n\nsnapshots:\n  zod@3.25.76: {}\n";
    const v6 = "lockfileVersion: '6.0'\npackages:\n  /undici@7.1.0(foo@1.0.0):\n    resolution: {}\n";
    const v5 = "lockfileVersion: 5.4\npackages:\n  /@types/node/24.19.2:\n    resolution: {}\n";
    expect(parsePnpmLock(v9)).toEqual([{ name: "@babel/core", version: "7.24.7" }, { name: "zod", version: "3.25.76" }]);
    expect(parsePnpmLock(v6)).toEqual([{ name: "undici", version: "7.1.0" }]);
    expect(parsePnpmLock(v5)).toEqual([{ name: "@types/node", version: "24.19.2" }]);
  });

  it("parses yarn v1 and berry", () => {
    const v1 = `# yarn lockfile v1\n\n"@babel/code-frame@^7.0.0", "@babel/code-frame@^7.10.4":\n  version "7.12.13"\n  resolved "https://u:${CANARY}@r/x.tgz"\n\nleft-pad@1.3.0:\n  version "1.3.0"\n`;
    const berry = `"zod@npm:^3.25.0":\n  version: 3.25.76\n  resolution: "zod@npm:3.25.76"\n`;
    expect(parseYarnLock(v1)).toEqual([{ name: "@babel/code-frame", version: "7.12.13" }, { name: "left-pad", version: "1.3.0" }]);
    expect(parseYarnLock(berry)).toEqual([{ name: "zod", version: "3.25.76" }]);
  });

  it("reads .nvmrc and engines", () => {
    expect(parseNodeVersionFile("# pinned\r\nv24.22.0\r\n")).toBe("24.22.0");
    expect(parseNodeVersionFile("lts/*")).toBe("lts/*");
    expect(parseEnginesNode(JSON.stringify({ engines: { node: ">=24.22.1" } }))).toBe(">=24.22.1");
    expect(parseEnginesNode("{ not json")).toBeNull();
  });
});

describe("probe helpers", () => {
  it("normalizes versions", () => {
    expect(normalizeVersion("v24.22.0\r\n")).toBe("24.22.0");
    expect(normalizeVersion("1.43.3.10861-abc")).toBe("1.43.3.10861");
    expect(normalizeVersion("nope")).toBeNull();
    expect(parsePhpVersion("PHP 8.3.35 (cli) (built: Oct  1 2026)")).toBe("8.3.35");
  });

  it("matches CN exactly", () => {
    expect(subjectHasCN("CN=emSign ECC Root CA - G3, O=eMudhra Technologies Limited, C=IN", "emSign ECC Root CA - G3")).toBe(true);
    expect(subjectHasCN("C=US, OU=emSign PKI, O=eMudhra Inc, CN=emSign ECC Root CA - C3", "emSign ECC Root CA - G3")).toBe(false);
    expect(subjectHasCN("CN=emSign Root CA - G1, O=eMudhra", "emSign ECC Root CA - G3")).toBe(false);
  });

  it("searches PEM bundles by heading, label, or subject comment", async () => {
    const dir = makeTree(tempDir(), {
      "mk.crt": "emSign ECC Root CA - G3\r\n=======================\r\n-----BEGIN CERTIFICATE-----\r\n",
      "git.crt": "# emSign ECC Root CA - C3\n-----BEGIN CERTIFICATE-----\n# emSign ECC Root CA - G3\n-----BEGIN CERTIFICATE-----\n",
      "git-clean.crt": "# emSign ECC Root CA - C3\n# emSign Root CA - G1\n",
      "certifi.pem": "# Issuer: CN=emSign ECC Root CA - G3 O=eMudhra Technologies Limited\n# Label: \"emSign ECC Root CA - G3\"\n",
      "clean.pem": "# Label: \"emSign ECC Root CA - C3\"\n# Subject: CN=emSign ECC Root CA - G30 O=x\n",
    });
    const s = "emSign ECC Root CA - G3";
    expect(await pemBundleHas(path.join(dir, "mk.crt"), s)).toBe(true);
    expect(await pemBundleHas(path.join(dir, "git.crt"), s)).toBe(true);
    expect(await pemBundleHas(path.join(dir, "git-clean.crt"), s)).toBe(false);
    expect(await pemBundleHas(path.join(dir, "certifi.pem"), s)).toBe(true);
    expect(await pemBundleHas(path.join(dir, "clean.pem"), s)).toBe(false);
  });
});

describe("redactText", () => {
  const home = "C:\\Users\\alice";
  it.each([
    ["C:\\Users\\alice\\code\\x\\.env", "~\\code\\x\\.env"],
    ["c:\\users\\ALICE\\code", "~\\code"],
    ["C:/Users/alice/code", "~/code"],
    [JSON.stringify("C:\\Users\\alice\\code"), JSON.stringify("~\\code")],
    ["D:\\x C:\\Users\\bob\\proj", "D:\\x ~\\proj"],
    ["C:\\Users\\ALICE~1\\AppData", "~\\AppData"],
    ["/home/carol/src and /Users/dave/src", "~/src and ~/src"],
    ["D:\\work\\twotoe", "D:\\work\\twotoe"],
  ])("%s", (input, expected) => expect(redactText(input, home)).toBe(expected));
});
