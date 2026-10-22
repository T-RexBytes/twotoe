import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanIocFiles, sha256File } from "../src/scanners/iocFiles";
import { SkipCounter } from "../src/util/safeFs";
import { makeTree, tempDir } from "./helpers";

afterEach(() => vi.restoreAllMocks());

// Benign synthetic stand-ins. The marker must never show up in any output.
const MARKER = "TWOTOE_IOC_CONTENT_MARKER";
const PTH = `import cook  # ${MARKER}\n`;
const PY = `print("${MARKER}")\n`;
const PYC = Buffer.from([0x55, 0x0d, 0x0d, 0x0a, ...Buffer.from(MARKER)]);

function sha(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function sitePackages(files: Record<string, string | Buffer>): string {
  const base = tempDir();
  makeTree(base, Object.fromEntries(Object.entries(files).map(([k, v]) => [`Lib/site-packages/${k}`, v])));
  return path.join(base, "Lib", "site-packages");
}

function spyAllTextReads() {
  return {
    readFile: vi.spyOn(fs, "readFile"),
    readFileSync: vi.spyOn(fs, "readFileSync"),
    readFileP: vi.spyOn(fs.promises, "readFile"),
    createReadStream: vi.spyOn(fs, "createReadStream"),
  };
}

describe("scanIocFiles", () => {
  it("never opens IOC files for a text read, and hashes raw bytes", async () => {
    const dir = sitePackages({
      "cook.pth": PTH,
      "cook.py": PY,
      "sitecustomize.py": PY,
      "__pycache__/cook.cpython-312.pyc": PYC,
      "__pycache__/other.cpython-312.pyc": PYC,
      "requests-2.32.3.dist-info/METADATA": "Name: requests\n",
    });
    const spies = spyAllTextReads();
    const hits = await scanIocFiles(dir, new SkipCounter());

    expect(spies.readFile).not.toHaveBeenCalled();
    expect(spies.readFileSync).not.toHaveBeenCalled();
    expect(spies.readFileP).not.toHaveBeenCalled();
    for (const call of spies.createReadStream.mock.calls) {
      const opts = call[1];
      expect(typeof opts === "string" || (opts && typeof opts === "object" && "encoding" in opts && opts.encoding)).toBeFalsy();
    }

    expect(hits.map((h) => h.filename)).toEqual([
      "cook.pth", "cook.py", "sitecustomize.py", "__pycache__/cook.cpython-312.pyc",
    ]);
    expect(hits[0]).toMatchObject({ size: Buffer.byteLength(PTH), sha256: sha(PTH) });
    expect(hits[1]!.sha256).toBe(sha(PY));
    expect(hits[3]!.sha256).toBe(sha(PYC));
    expect(JSON.stringify(hits)).not.toContain(MARKER);
  });

  it("reports sitecustomize.py alone", async () => {
    const dir = sitePackages({ "sitecustomize.py": PY });
    const hits = await scanIocFiles(dir, new SkipCounter());
    expect(hits.map((h) => h.filename)).toEqual(["sitecustomize.py"]);
  });

  it("finds nothing in a clean site-packages", async () => {
    const dir = sitePackages({ "litellm-1.106.2.dist-info/METADATA": "Name: litellm\n" });
    expect(await scanIocFiles(dir, new SkipCounter())).toEqual([]);
  });

  it("counts a locked IOC file instead of crashing", async () => {
    const dir = sitePackages({ "cook.pth": PTH });
    const realStat = fs.promises.stat.bind(fs.promises);
    vi.spyOn(fs.promises, "stat").mockImplementation((async (p: fs.PathLike) => {
      if (String(p).endsWith("cook.pth")) throw Object.assign(new Error("busy"), { code: "EBUSY" });
      return realStat(p);
    }) as typeof fs.promises.stat);
    const skips = new SkipCounter();
    expect(await scanIocFiles(dir, skips)).toEqual([]);
    expect(skips.locked).toBe(1);
  });

  it("sha256File matches a known digest", async () => {
    const dir = makeTree(tempDir(), { "f.bin": Buffer.from("abc") });
    expect(await sha256File(path.join(dir, "f.bin")))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
