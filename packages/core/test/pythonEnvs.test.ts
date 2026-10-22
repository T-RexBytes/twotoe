import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  dedupeByRealpath, normalizePyName, parseDistInfoName, parsePipfileLock, parseRequirementsLine,
  parseTomlLock, readPyvenvVersion, readSitePackages,
} from "../src/scanners/pythonEnvs";
import { walkRoots } from "../src/scanners/walk";
import { SkipCounter } from "../src/util/safeFs";
import { makeTree, tempDir } from "./helpers";

describe("dist-info parsing", () => {
  it.each([
    ["litellm-1.107.0.dist-info", { name: "litellm", version: "1.107.0" }],
    ["LiteLLM-1.106.2.dist-info", { name: "litellm", version: "1.106.2" }],
    ["certifi-2026.10.18.dist-info", { name: "certifi", version: "2026.10.18" }],
    ["typing_extensions-4.12.2.dist-info", { name: "typing-extensions", version: "4.12.2" }],
    ["six-1.16.0-py3.12.egg-info", { name: "six", version: "1.16.0" }],
  ])("%s", (folder, expected) => {
    expect(parseDistInfoName(folder)).toEqual(expected);
  });

  it.each(["my-pkg-1.0.0.dist-info", "nodash.dist-info", "pkg-notaversion.dist-info", "readme.txt"])(
    "%s is ambiguous", (folder) => expect(parseDistInfoName(folder)).toBeNull(),
  );

  it("normalizes names per PEP 503", () => {
    expect(normalizePyName("Foo.Bar__baz")).toBe("foo-bar-baz");
  });
});

describe("readSitePackages", () => {
  it("lists packages, falls back to METADATA, and finds certifi", async () => {
    const base = makeTree(tempDir(), {
      "site-packages/litellm-1.107.0.dist-info/METADATA": "Name: litellm\nVersion: 1.107.0\n",
      "site-packages/my-pkg-2.0.0.dist-info/METADATA": "Metadata-Version: 2.1\r\nName: my-pkg\r\nVersion: 2.0.0\r\n\r\nBody text\r\n",
      "site-packages/certifi-2024.2.2.dist-info/METADATA": "Name: certifi\n",
      "site-packages/certifi/cacert.pem": "# Label: \"emSign ECC Root CA - G3\"\n",
      "site-packages/requests/__init__.py": "",
    });
    const info = await readSitePackages(path.join(base, "site-packages"), new SkipCounter());
    expect(info.packages).toEqual(expect.arrayContaining([
      { name: "litellm", version: "1.107.0" },
      { name: "my-pkg", version: "2.0.0" },
      { name: "certifi", version: "2024.2.2" },
    ]));
    expect(info.packages).toHaveLength(3);
    expect(info.certifiPem).toBe(path.join(base, "site-packages", "certifi", "cacert.pem"));
  });
});

describe("environment discovery", () => {
  it("finds Windows and POSIX venv layouts and does not descend into site-packages", async () => {
    const root = makeTree(tempDir(), {
      "app/.venv/Lib/site-packages/litellm-1.107.0.dist-info/METADATA": "x",
      "app/.venv/Lib/site-packages/deep/a/b/c/.env": "SHOULD_NOT_BE_SEEN=1",
      "app/.venv/pyvenv.cfg": "home = C:\\Python312\r\nversion = 3.12.4\r\n",
      "svc/venv/lib/python3.12/site-packages/x-1.0.dist-info/METADATA": "x",
      "node_modules/pkg/.venv/Lib/site-packages/y-1.0.dist-info/METADATA": "x",
    });
    const res = await walkRoots([root], new SkipCounter());
    expect(res.sitePackages.map((p) => path.relative(root, p).split(path.sep).join("/"))).toEqual([
      "app/.venv/Lib/site-packages",
      "svc/venv/lib/python3.12/site-packages",
    ]);
    expect(res.files.env).toEqual([]);
    expect(await readPyvenvVersion(res.files.pyvenvCfg[0]!)).toEqual({ outcome: "ok", version: "3.12.4" });
  });

  it("respects the depth limit", async () => {
    const root = makeTree(tempDir(), {
      "a/.venv/Lib/site-packages/ok-1.0.dist-info/METADATA": "x",
      "a/b/c/d/e/f/.venv/Lib/site-packages/toodeep-1.0.dist-info/METADATA": "x",
    });
    const res = await walkRoots([root], new SkipCounter(), { maxDepth: 6 });
    expect(res.sitePackages).toHaveLength(1);
    expect(res.sitePackages[0]).toContain(path.join("a", ".venv"));
  });

  it("terminates on symlink loops and dedupes aliases by real path", async () => {
    const root = makeTree(tempDir(), { "proj/.venv/Lib/site-packages/z-1.0.dist-info/METADATA": "x" });
    // A junction back up to the root (loop) and a second name for the venv.
    fs.symlinkSync(root, path.join(root, "proj", "loop"), "junction");
    fs.symlinkSync(path.join(root, "proj", ".venv"), path.join(root, "alias-venv"), "junction");
    const res = await walkRoots([root], new SkipCounter());
    expect(res.stats.symlinksSkipped).toBe(2);
    expect(res.sitePackages).toHaveLength(1);
    const real = res.sitePackages[0]!;
    const alias = path.join(root, "alias-venv", "Lib", "site-packages");
    expect(await dedupeByRealpath([real, alias])).toEqual([real]);
  });
});

describe("pins", () => {
  it.each([
    ["litellm==1.107.0", { name: "litellm", version: "1.107.0" }],
    ["LiteLLM[proxy] == 1.107.0 ; python_version >= '3.9'", { name: "litellm", version: "1.107.0" }],
    ["certifi===2026.10.18  # pinned", { name: "certifi", version: "2026.10.18" }],
  ])("requirements: %s", (line, expected) => expect(parseRequirementsLine(line)).toEqual(expected));

  it.each(["litellm>=1.0", "# litellm==1.107.0", "--index-url https://u:p@host/simple", "-r base.txt", ""])(
    "requirements ignores: %s", (line) => expect(parseRequirementsLine(line)).toBeNull(),
  );

  it("reads poetry.lock / uv.lock", () => {
    const text = `[[package]]\r\nname = "litellm"\r\nversion = "1.107.0"\r\n\r\n[[package]]\r\nname = "certifi"\r\nversion = "2026.10.18"\r\n`;
    expect(parseTomlLock(text)).toEqual([
      { name: "litellm", version: "1.107.0", line: 2 },
      { name: "certifi", version: "2026.10.18", line: 6 },
    ]);
  });

  it("reads Pipfile.lock", () => {
    const text = JSON.stringify({ _meta: { sources: [{ url: "https://u:p@host" }] }, default: { litellm: { version: "==1.107.0" } }, develop: {} });
    expect(parsePipfileLock(text)).toEqual([{ name: "litellm", version: "1.107.0", line: 0 }]);
  });
});
