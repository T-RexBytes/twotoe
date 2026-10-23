// Renders real command output (with ANSI colors) as a Windows Terminal style
// window, then screenshots it with headless Chrome. The prompt is "PS twotoe>",
// so no real path is ever on screen.
import fs from "node:fs";
import path from "node:path";
import type { Browser } from "./cdp";
import { WORK } from "./lib";

// Campbell scheme (Windows Terminal default)
const FG: Record<number, string> = { 30: "#0C0C0C", 31: "#E74856", 32: "#16C60C", 33: "#F9F1A5", 34: "#3B78FF", 35: "#B4009E", 36: "#61D6D6", 37: "#F2F2F2", 90: "#767676", 91: "#E74856", 92: "#16C60C", 93: "#F9F1A5", 94: "#3B78FF", 95: "#B4009E", 96: "#61D6D6", 97: "#F2F2F2" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function ansiToHtml(text: string): string {
  let bold = false, dim = false, color: string | null = null;
  let out = "";
  const parts = text.split(/\x1b\[([0-9;]*)m/);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      for (const c of (parts[i] || "0").split(";").map(Number)) {
        if (c === 0) { bold = false; dim = false; color = null; }
        else if (c === 1) bold = true;
        else if (c === 2) dim = true;
        else if (c === 22) { bold = false; dim = false; }
        else if (c === 39) color = null;
        else if (FG[c]) color = FG[c]!;
      }
      continue;
    }
    if (!parts[i]) continue;
    const style = [color ? `color:${color}` : "", bold ? "font-weight:700" : "", dim ? "opacity:.62" : ""].filter(Boolean).join(";");
    out += style ? `<span style="${style}">${esc(parts[i]!)}</span>` : esc(parts[i]!);
  }
  return out;
}

export function terminalHtml(blocks: Array<{ command: string; output: string }>, title = "Windows PowerShell"): string {
  const body = blocks.map((b) => `<span class="ps">PS twotoe&gt;</span> <span class="cmd">${esc(b.command)}</span>\n${ansiToHtml(b.output.replace(/\r\n/g, "\n").replace(/\n+$/, ""))}\n`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;background:#e9e4da}
  .win{margin:28px;border-radius:10px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.28),0 0 0 1px rgba(0,0,0,.25);background:#0C0C0C;display:block}
  .bar{height:38px;background:#202020;display:flex;align-items:center;gap:10px;padding:0 14px;font:13px "Segoe UI",system-ui,sans-serif;color:#d6d6d6}
  .tab{background:#0C0C0C;border-radius:8px 8px 0 0;padding:9px 16px 9px 12px;margin-top:6px;display:flex;gap:8px;align-items:center}
  .icon{width:14px;height:14px;border-radius:3px;background:#2671be;display:inline-block}
  .ctl{margin-left:auto;display:flex;gap:22px;color:#bdbdbd;font-size:14px}
  pre{margin:0;padding:18px 22px 24px;color:#CCCCCC;font:15px/1.5 "Cascadia Mono","Cascadia Code",Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
  .ps{color:#CCCCCC}.cmd{color:#F9F1A5}
  </style></head><body><div class="win"><div class="bar"><div class="tab"><span class="icon"></span>${esc(title)}</div><div class="ctl"><span>&#9472;</span><span>&#9744;</span><span>&#10005;</span></div></div><pre>${body}</pre></div></body></html>`;
}

export async function shootTerminal(b: Browser, html: string, out: string, width = 1180): Promise<void> {
  const file = path.join(WORK, `${path.basename(out, ".png")}.html`);
  fs.writeFileSync(file, html);
  await b.shot({ url: `file:///${file.replace(/\\/g, "/")}`, out, width, height: 80, dpr: 2, fullPage: true, waitMs: 500 });
  fs.rmSync(file);
}
