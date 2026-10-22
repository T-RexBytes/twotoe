import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EnvKeyParser, isTemplateEnvFile, looksLikeValueFragment, readComposeEnvKeys, readEnvKeys,
} from "../src/scanners/envKeys";
import { CANARY, makeTree, tempDir } from "./helpers";

afterEach(() => vi.restoreAllMocks());

function keysOf(text: string): string[] {
  const p = new EnvKeyParser();
  p.feed(text);
  return p.keys;
}

describe("EnvKeyParser", () => {
  it("keeps key names and never the values", () => {
    const keys = keysOf(`OPENAI_API_KEY=${CANARY}\nDATABASE_URL=postgres://u:${CANARY}@h/db\n`);
    expect(keys).toEqual(["OPENAI_API_KEY", "DATABASE_URL"]);
    expect(JSON.stringify(keys)).not.toContain(CANARY);
  });

  it("strips export prefixes", () => {
    expect(keysOf(`export RAILWAY_TOKEN=${CANARY}\nexport  AWS_SECRET_ACCESS_KEY="${CANARY}"\n`))
      .toEqual(["RAILWAY_TOKEN", "AWS_SECRET_ACCESS_KEY"]);
  });

  it("handles quoted values that contain = and #", () => {
    expect(keysOf(`A="x=1 # not a comment"\nB='y=2'\nC=\`z=3\`\nD=plain # trailing\n`)).toEqual(["A", "B", "C", "D"]);
  });

  it("skips comments, blank lines, and lines with no key", () => {
    expect(keysOf(`# RAILWAY_TOKEN=${CANARY}\n   # GH_TOKEN=x\n\n=novalue\nnot a key line\n  GOOD_KEY=1\n`)).toEqual(["GOOD_KEY"]);
  });

  it("rejects keys that fail the key regex", () => {
    expect(keysOf(`1BAD=1\nBAD-KEY=2\nbad key=3\nok_lower=4\n`)).toEqual(["ok_lower"]);
  });

  it("accepts CRLF and a BOM", () => {
    expect(keysOf(`﻿FIRST=1\r\nSECOND="two"\r\n# c\r\nTHIRD=3\r\n`)).toEqual(["FIRST", "SECOND", "THIRD"]);
  });

  it("skips every line inside a multi-line quoted value", () => {
    const text = [
      `PRIVATE_KEY="-----BEGIN PRIVATE KEY-----`,
      `${CANARY}=leak`,
      `MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ=`,
      `INNER_LOOKING_KEY=x`,
      `-----END PRIVATE KEY-----"`,
      `AFTER_KEY=1`,
      `JSON_BLOB='{"a": "b",`,
      `"EVIL_KEY=1": 2}'`,
      `LAST=1`,
    ].join("\n");
    expect(keysOf(text)).toEqual(["PRIVATE_KEY", "AFTER_KEY", "JSON_BLOB", "LAST"]);
  });

  it("honours escaped quotes inside double-quoted values", () => {
    expect(keysOf(`A="say \\"hi\\" = ok"\nB=1\n`)).toEqual(["A", "B"]);
  });

  it("drops unquoted base64 lines that look like keys", () => {
    const p = new EnvKeyParser();
    p.feed(`MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQ=\nREAL_KEY=1\n`);
    expect(p.keys).toEqual(["REAL_KEY"]);
    expect(p.suspectedFragments).toBe(1);
  });

  it("gives the same result however the input is chunked", () => {
    const text = `export A="multi\nline=1"\nB=2\r\n# C=3\nD='x'\n`;
    const whole = keysOf(text);
    const p = new EnvKeyParser();
    for (const ch of text) p.feed(ch);
    expect(p.keys).toEqual(whole);
    expect(whole).toEqual(["A", "B", "D"]);
  });

  it("reports an unterminated quote", () => {
    const p = new EnvKeyParser();
    p.feed(`A="never closed\nB=1\n`);
    expect(p.keys).toEqual(["A"]);
    expect(p.unterminatedQuote).toBe(true);
  });
});

describe("helpers", () => {
  it("recognizes template env files", () => {
    for (const f of [".env.example", ".env.sample", ".env.template", "prod.example.env"]) expect(isTemplateEnvFile(f)).toBe(true);
    for (const f of [".env", ".env.local", "prod.env"]) expect(isTemplateEnvFile(f)).toBe(false);
  });

  it("flags base64-looking keys only", () => {
    expect(looksLikeValueFragment("MIIEvQIBADANBgkqhkiG9w0BAQEFAAS")).toBe(true);
    expect(looksLikeValueFragment("OPENAI_API_KEY")).toBe(false);
    expect(looksLikeValueFragment("NextPublicApiUrl")).toBe(false);
  });
});

describe("readEnvKeys (files)", () => {
  it("reads a file from disk by streaming", async () => {
    const dir = makeTree(tempDir(), { ".env": `A=${CANARY}\r\nexport B="${CANARY}"\r\n` });
    const readFile = vi.spyOn(fs, "readFile");
    const readFileP = vi.spyOn(fs.promises, "readFile");
    const r = await readEnvKeys(path.join(dir, ".env"));
    expect(r).toEqual({ outcome: "ok", keys: ["A", "B"], suspectedFragments: 0, unterminatedQuote: false });
    expect(readFile).not.toHaveBeenCalled();
    expect(readFileP).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain(CANARY);
  });

  it.each(["EBUSY", "EPERM", "EACCES"])("skips a %s file without crashing", async (code) => {
    const dir = makeTree(tempDir(), { ".env": "A=1\n" });
    vi.spyOn(fs, "createReadStream").mockImplementation((() => new Readable({
      read() { this.destroy(Object.assign(new Error(`${code}: locked ${CANARY}`), { code })); },
    })) as unknown as typeof fs.createReadStream);
    const r = await readEnvKeys(path.join(dir, ".env"));
    expect(r.outcome).toBe("locked");
    expect(r.keys).toEqual([]);
    expect(JSON.stringify(r)).not.toContain(CANARY);
  });

  it("streams a 10 MB file without loading it whole", async () => {
    const dir = tempDir();
    const file = path.join(dir, ".env");
    const pad = `# ${"x".repeat(96)}\n`;
    const fd = fs.openSync(file, "w");
    let written = 0;
    let n = 0;
    fs.writeSync(fd, `BIG="${"y".repeat(2 * 1024 * 1024)}"\n`);
    while (written < 10 * 1024 * 1024) {
      const block = n % 1000 === 0 ? `KEY_${n}=${CANARY}\n` : pad;
      fs.writeSync(fd, block);
      written += block.length;
      n++;
    }
    fs.closeSync(fd);
    const readFile = vi.spyOn(fs.promises, "readFile");
    const before = process.memoryUsage().heapUsed;
    const r = await readEnvKeys(file);
    const grown = process.memoryUsage().heapUsed - before;
    expect(readFile).not.toHaveBeenCalled();
    expect(r.outcome).toBe("ok");
    expect(r.keys[0]).toBe("BIG");
    expect(r.keys.length).toBeGreaterThan(50);
    expect(JSON.stringify(r)).not.toContain(CANARY);
    // A whole-file read would hold 10 MB as a 20 MB UTF-16 string at least.
    expect(grown).toBeLessThan(40 * 1024 * 1024);
  });
});

describe("readComposeEnvKeys", () => {
  it("reads list and map forms and ignores block scalars", async () => {
    const dir = makeTree(tempDir(), {
      "docker-compose.yml": [
        "services:",
        "  web:",
        "    image: php:8.3.35-apache",
        "    environment:",
        `      - DB_PASSWORD=${CANARY}`,
        `      - "QUOTED_KEY=${CANARY}"`,
        "      - BARE_KEY",
        "    ports:",
        "      - 8080:80",
        "  worker:",
        "    environment:",
        `      OPENAI_API_KEY: ${CANARY}`,
        "      TLS_CERT: |",
        "        MIIEvQIBADANBgkqhkiG9w0BAQEFAASC: x",
        `        ${CANARY}: y`,
        "      # COMMENTED: 1",
        "      RAILWAY_TOKEN: abc",
        "",
      ].join("\r\n"),
    });
    const r = await readComposeEnvKeys(path.join(dir, "docker-compose.yml"));
    expect(r.keys).toEqual(["DB_PASSWORD", "QUOTED_KEY", "BARE_KEY", "OPENAI_API_KEY", "TLS_CERT", "RAILWAY_TOKEN"]);
    expect(JSON.stringify(r)).not.toContain(CANARY);
  });
});
