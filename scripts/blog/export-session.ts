// Exports the Claude Code session(s) behind this repo as redacted Markdown for
// the post's "My Agent Session" section:
//   docs/blog/agent-session.md       the conversation (user + assistant text)
//   docs/blog/agent-session-full.md  the same plus every tool call, results trimmed
// Usage: pnpm tsx scripts/blog/export-session.ts [session.jsonl ...]
// Default: every session file Claude Code stored for this repo's folder.
//
// Redaction (the repo is public): home paths and the user name, the host name,
// email addresses (except Anthropic's noreply), Sentry DSNs and key-like
// tokens, this machine's repo and projects folder paths, and the listing of the
// user's other project folders. Reasoning blocks, system reminders, API
// metadata and images are dropped. The script refuses to write if anything on
// the deny list survives.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { redactText } from "../../packages/core/src/index";
import { REPO } from "./lib";

const OUT = path.join(REPO, "docs", "blog");
const projectId = REPO.replace(/[:\\/]/g, "-");
const sessionDir = path.join(os.homedir(), ".claude", "projects", projectId);
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : fs.readdirSync(sessionDir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(sessionDir, f));
if (!files.length) throw new Error("no session files found");

const home = os.homedir();
const user = path.basename(home);
const host = os.hostname();
const projectsDir = path.dirname(path.dirname(REPO));   // e.g. the folder holding all projects
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// The DSN's public key and org id, read from the local config and held in
// memory only, so partial copies (a grep for a key prefix, an ingest host) are
// caught too. Never printed.
function dsnParts(): { key: string; org: string } | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(home, ".twotoe", "config.json"), "utf8")) as { telemetry?: { dsn?: unknown } };
    const m = typeof cfg.telemetry?.dsn === "string" ? /\/\/([0-9a-f]{16,})@o(\d+)\./i.exec(cfg.telemetry.dsn) : null;
    return m ? { key: m[1]!, org: m[2]! } : null;
  } catch {
    return null;
  }
}
const dsn = dsnParts();
// Every 8-character window of the key: any copy longer than that contains one.
const keyWindows = dsn ? Array.from({ length: dsn.key.length - 7 }, (_, i) => dsn.key.slice(i, i + 8)) : [];
const variants = (p: string) => [...new Set([p, p.replace(/\\/g, "/"), p.replace(/\\/g, "\\\\"), p.replace(/\//g, "\\")])].sort((a, b) => b.length - a.length);

export function redact(text: string): string {
  let t = text;
  for (const v of variants(REPO)) t = t.replace(new RegExp(esc(v), "gi"), "<repo>");
  for (const v of variants(projectsDir)) t = t.replace(new RegExp(`${esc(v)}(?![\\w-])`, "gi"), "<projects>");
  t = t.replace(new RegExp(esc(projectId), "gi"), "<project-id>");
  t = redactText(t, home);
  t = t.replace(new RegExp(`\\b${esc(user)}\\b`, "gi"), "<user>");
  if (host.length > 2) t = t.replace(new RegExp(esc(host), "gi"), "<host>");
  t = t.replace(/https?:\/\/[0-9a-f]{16,}@[^\s"'`)]+/gi, "<sentry-dsn>");
  t = t.replace(/\b[0-9a-f]{32}@o\d+\b/gi, "<sentry-key>");
  t = t.replace(/\bo\d+\.ingest(?:\.[a-z]+)?\.sentry\.io\b/gi, "<sentry-host>");
  t = t.replace(/[0-9a-f]{8,}/gi, (m) => (keyWindows.some((w) => m.toLowerCase().includes(w)) ? "<sentry-key>" : m));
  if (dsn) t = t.replace(new RegExp(`(?<!\\d)${dsn.org}(?!\\d)`, "g"), "<sentry-org>");
  // Domains start with a letter, so package versions like pnpm@11.28.7 survive.
  t = t.replace(/\b[\w.+-]+@[a-z][\w-]*(?:\.[a-z][\w-]*)*\.[a-z]{2,}\b/gi, (m) => (m === "noreply@anthropic.com" ? m : "<email>"));
  t = t.replace(/\b(?:phc|ghp|gho|ghu|ghs|github_pat|sk|xox[abpor])[-_][A-Za-z0-9_-]{16,}\b/g, "<redacted-key>");
  t = t.replace(/\bAKIA[0-9A-Z]{16}\b/g, "<redacted-key>");
  return t;
}

const stripReminders = (s: string) => s.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "").replace(/<\/?pasted_content[^>]*>/g, "").trim();
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n... [${s.length - max} more characters trimmed]` : s);

interface Block { type: string; text?: string; name?: string; input?: Record<string, unknown>; content?: unknown; tool_use_id?: string }

function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c: { type?: string; text?: string }) => (c.type === "text" ? c.text ?? "" : c.type === "image" ? "[image]" : "")).join("\n");
  return "";
}

function toolCallSummary(b: Block): string {
  const i = b.input ?? {};
  const pick = (k: string) => (typeof i[k] === "string" ? String(i[k]) : "");
  const desc = pick("description");
  if (b.name === "PowerShell" || b.name === "Bash") return `${desc ? `${desc}\n` : ""}\`\`\`\n${clip(pick("command"), 1500)}\n\`\`\``;
  if (b.name === "Write") return `write \`${pick("file_path")}\` (${pick("content").length} characters)`;
  if (b.name === "Edit") return `edit \`${pick("file_path")}\`\n\`\`\`diff\n${clip(pick("old_string").split("\n").map((l) => `- ${l}`).join("\n"), 600)}\n${clip(pick("new_string").split("\n").map((l) => `+ ${l}`).join("\n"), 900)}\n\`\`\``;
  if (b.name === "Read") return `read \`${pick("file_path")}\``;
  if (b.name === "Grep" || b.name === "Glob") return `${b.name} \`${pick("pattern")}\`${pick("path") ? ` in \`${pick("path")}\`` : ""}`;
  if (b.name === "WebFetch") return `fetch ${pick("url")}`;
  return `\`\`\`json\n${clip(JSON.stringify(i, null, 2), 800)}\n\`\`\``;
}

const convo: string[] = [];
const full: string[] = [];
const pendingTools = new Map<string, string>();
let turns = 0, toolCalls = 0;
let first = "", last = "";

for (const file of files) {
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  for await (const line of rl) {
    let o: { type?: string; isMeta?: boolean; isCompactSummary?: boolean; timestamp?: string; message?: { content?: string | Block[] } };
    try { o = JSON.parse(line); } catch { continue; }
    if ((o.type !== "user" && o.type !== "assistant") || o.isMeta) continue;
    if (o.timestamp) { first ||= o.timestamp; last = o.timestamp; }
    const when = o.timestamp ? o.timestamp.slice(0, 16).replace("T", " ") + " UTC" : "";
    const c = o.message?.content;
    if (o.isCompactSummary) {
      const s = typeof c === "string" ? c : (c ?? []).map((b) => b.text ?? "").join("\n");
      const block = `\n---\n\n> **Context compacted** (${when}). Claude Code summarized the session so far and continued from this summary:\n\n<details><summary>Summary</summary>\n\n${clip(stripReminders(s), 20000)}\n\n</details>\n`;
      convo.push(block); full.push(block);
      continue;
    }
    if (o.type === "user") {
      const blocks: Block[] = typeof c === "string" ? [{ type: "text", text: c }] : c ?? [];
      const text = blocks.filter((b) => b.type === "text").map((b) => stripReminders(b.text ?? "")).filter(Boolean).join("\n\n");
      if (text && !/^<(local-command|command-name|task-notification)/.test(text)) {
        turns++;
        const md = `\n### User (${when})\n\n${text.split("\n").map((l) => `> ${l}`).join("\n")}\n`;
        convo.push(md); full.push(md);
      } else if (text.startsWith("<command-name>")) {
        const name = /<command-name>(.*?)<\/command-name>/.exec(text)?.[1] ?? "command";
        const md = `\n*User ran \`${name}\`.*\n`;
        convo.push(md); full.push(md);
      }
      for (const b of blocks.filter((x) => x.type === "tool_result")) {
        const call = pendingTools.get(b.tool_use_id ?? "");
        let result = toolResultText(b.content);
        if (/D:\\work children:|children:\r?\n\s+\.pytest_cache/.test(result)) result = "[listing of the user's other project folders removed]";
        full.push(`<details><summary>${call ?? "tool result"}</summary>\n\n\`\`\`\n${clip(result.replace(/```/g, "'''"), 1200)}\n\`\`\`\n\n</details>\n`);
      }
    } else {
      for (const b of (Array.isArray(c) ? c : [])) {
        if (b.type === "text" && b.text?.trim()) {
          const md = `\n### Claude (${when})\n\n${b.text.trim()}\n`;
          convo.push(md); full.push(md);
        } else if (b.type === "tool_use") {
          toolCalls++;
          const label = `${b.name}${typeof b.input?.description === "string" ? `: ${b.input.description}` : typeof b.input?.file_path === "string" ? `: ${path.basename(String(b.input.file_path))}` : ""}`;
          pendingTools.set((b as { id?: string }).id ?? "", label.replace(/</g, "&lt;"));
          full.push(`\n**Tool call:** ${toolCallSummary(b)}\n`);
        }
      }
    }
  }
}

const header = (title: string, note: string) => [
  `# ${title}`,
  "",
  `The Claude Code session that built TwoToe, from ${first.slice(0, 10)} to ${last.slice(0, 10)}: ${turns} user messages, ${toolCalls} tool calls. Claude Code ran natively on Windows (PowerShell), one phase at a time with a stop at every gate (docs/SPEC.md section 16).`,
  "",
  note,
  "",
  "Redacted for publication: home paths and the user name (`<user>`, `~`), the host name (`<host>`), email addresses, Sentry DSNs (and any part of their key, org id or ingest host) and key-like tokens, this machine's repo and projects folder paths (`<repo>`, `<projects>`), and one listing of the user's other project folders. Claude's internal reasoning blocks, system reminders and images are not included. Generated by `scripts/blog/export-session.ts`.",
  "",
].join("\n");

const deny = [home, home.replace(/\\/g, "/"), home.replace(/\\/g, "\\\\"), user, host, REPO, projectsDir, projectId, ...keyWindows, ...(dsn ? [dsn.org] : [])].filter((s) => s.length > 2).map((s) => s.toLowerCase());
const docs: Array<[string, string]> = [
  ["agent-session.md", header("Agent session: the conversation", "This file has the conversation only. Every tool call (commands, edits, results trimmed) is in [agent-session-full.md](agent-session-full.md).") + redact(convo.join("\n"))],
  ["agent-session-full.md", header("Agent session: full log", "Every message and tool call. Tool results are trimmed to 1,200 characters, edits to their first lines.") + redact(full.join("\n"))],
];
for (const [name, text] of docs) {
  const lower = text.toLowerCase();
  const leaks = deny.filter((d) => lower.includes(d));
  const sentry = /[0-9a-f]{16,}@o\d+\.ingest|\bo\d+\.ingest(?:\.[a-z]+)?\.sentry\.io/i.test(text);
  const email = (text.match(/\b[\w.+-]+@[a-z][\w-]*(?:\.[a-z][\w-]*)*\.[a-z]{2,}\b/gi) ?? []).filter((m) => m !== "noreply@anthropic.com");
  if (leaks.length || sentry || email.length) throw new Error(`refusing to write ${name}: ${leaks.length} deny-list hits, sentry=${sentry}, emails=${email.length}`);
  fs.writeFileSync(path.join(OUT, name), text);
  process.stdout.write(`${name}: ${(text.length / 1024).toFixed(0)} KB\n`);
}
