import path from "node:path";
import { forEachChunk, forEachLine, type ReadOutcome } from "../util/safeFs";

// SPEC 8.2.6. Hard rule 1: only key NAMES leave this file. Values are never
// sliced, stored, logged or put in an error message.

export const KEY_RE = /^[A-Z_][A-Z0-9_]*$/i;

const TEMPLATE_NAMES = new Set([".env.example", ".env.sample", ".env.template"]);

// Template files are reported but never trigger actions.
export function isTemplateEnvFile(file: string): boolean {
  const base = path.basename(file).toLowerCase();
  return TEMPLATE_NAMES.has(base) || /\.(example|sample|template)\.env$/.test(base);
}

// A long mixed-case alphanumeric "key" with no underscore is almost certainly a
// base64 line from an unquoted multi-line value (a PEM body ending in "=").
// Drop it rather than report a secret fragment as a key name.
export function looksLikeValueFragment(key: string): boolean {
  return key.length >= 20 && !key.includes("_") && /[a-z]/.test(key) && /[A-Z]/.test(key) && /\d/.test(key);
}

export interface EnvKeyResult {
  outcome: ReadOutcome;
  keys: string[];
  suspectedFragments: number;
  unterminatedQuote: boolean;
}

const MAX_KEY_CHARS = 256;

type Mode = "lineStart" | "key" | "valueStart" | "quoted" | "skipLine";

// Streaming character state machine for dotenv files. It follows the SPEC
// algorithm (trimStart, skip "#" lines, split on the first "=", strip
// "export ", test KEY_RE) and adds one guard: a value that opens a quote and
// does not close it on the same line is a multi-line value, and every line
// until the closing quote is skipped, so "KEY=" lines inside a quoted PEM or
// JSON blob are never reported. The parser only remembers which quote
// character is open, never any value text.
export class EnvKeyParser {
  readonly keys: string[] = [];
  suspectedFragments = 0;
  private mode: Mode = "lineStart";
  private keyBuf = "";
  private quote = "";
  private escaped = false;

  feed(chunk: string): void {
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk[i]!;
      if (c === "\n") {
        if (this.mode !== "quoted") this.mode = "lineStart";
        this.keyBuf = "";
        this.escaped = false;
        continue;
      }
      switch (this.mode) {
        case "lineStart":
          if (c === " " || c === "\t" || c === "\r" || c === "﻿") break;
          if (c === "#") { this.mode = "skipLine"; break; }
          this.mode = "key";
          this.keyChar(c);
          break;
        case "key":
          this.keyChar(c);
          break;
        case "valueStart":
          if (c === " " || c === "\t") break;
          if (c === "\"" || c === "'" || c === "`") {
            this.quote = c;
            this.mode = "quoted";
          } else {
            this.mode = "skipLine";
          }
          break;
        case "quoted":
          if (this.escaped) { this.escaped = false; break; }
          if (c === "\\" && this.quote === "\"") { this.escaped = true; break; }
          if (c === this.quote) { this.quote = ""; this.mode = "skipLine"; }
          break;
        case "skipLine":
          break;
      }
    }
  }

  private keyChar(c: string): void {
    if (c !== "=") {
      this.keyBuf += c;
      if (this.keyBuf.length > MAX_KEY_CHARS) { this.keyBuf = ""; this.mode = "skipLine"; }
      return;
    }
    const key = this.keyBuf.replace(/^export\s+/, "").trim();
    this.keyBuf = "";
    if (key && KEY_RE.test(key)) {
      if (looksLikeValueFragment(key)) this.suspectedFragments++;
      else this.keys.push(key);
    }
    this.mode = "valueStart";
  }

  get unterminatedQuote(): boolean {
    return this.mode === "quoted";
  }
}

function dedupe(keys: string[]): string[] {
  return [...new Set(keys)];
}

export async function readEnvKeys(file: string): Promise<EnvKeyResult> {
  const parser = new EnvKeyParser();
  const outcome = await forEachChunk(file, (chunk) => parser.feed(chunk));
  if (outcome !== "ok") return { outcome, keys: [], suspectedFragments: 0, unterminatedQuote: false };
  return {
    outcome,
    keys: dedupe(parser.keys),
    suspectedFragments: parser.suspectedFragments,
    unterminatedQuote: parser.unterminatedQuote,
  };
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

// docker-compose `environment:` keys, list form (`- KEY=value`, `- KEY`) or map
// form (`KEY: value`). Only lines at the first item's indent count, so block
// scalar continuation lines (a PEM under `KEY: |`) are ignored.
export async function readComposeEnvKeys(file: string): Promise<EnvKeyResult> {
  const keys: string[] = [];
  let envIndent = -1;
  let itemIndent = -1;
  const outcome = await forEachLine(file, (line) => {
    const trimmed = line.trimStart();
    if (!trimmed || trimmed.startsWith("#")) return;
    const indent = indentOf(line);
    if (envIndent >= 0 && indent <= envIndent) {
      envIndent = -1;
      itemIndent = -1;
    }
    if (envIndent < 0) {
      if (/^environment:\s*(#.*)?$/.test(trimmed)) envIndent = indent;
      return;
    }
    if (itemIndent < 0) itemIndent = indent;
    if (indent !== itemIndent) return;
    let key: string;
    if (trimmed.startsWith("- ")) {
      let item = trimmed.slice(2).trimStart();
      if (item.startsWith("\"") || item.startsWith("'")) item = item.slice(1);
      const eq = item.indexOf("=");
      key = (eq >= 0 ? item.slice(0, eq) : item.replace(/["'\s].*$/, "")).trim();
    } else {
      const colon = trimmed.indexOf(":");
      if (colon <= 0) return;
      key = trimmed.slice(0, colon).replace(/^["']|["']$/g, "").trim();
    }
    if (KEY_RE.test(key) && !looksLikeValueFragment(key)) keys.push(key);
  });
  return { outcome, keys: outcome === "ok" ? dedupe(keys) : [], suspectedFragments: 0, unterminatedQuote: false };
}
