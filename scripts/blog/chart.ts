// Eval chart for the DEV post: share of model drafts the validator rejected,
// per eval round, per model. Numbers are parsed from eval/RESULTS-v1..v3.md and
// eval/RESULTS.md (v4), never typed in. Palette: the dataviz reference slots
// 1-3 (blue, orange, aqua), validated on the card's paper surface; contrast
// relief comes from the direct end labels plus the legend.
// Needs the built card (fonts): pnpm --filter @twotoe/card build
import fs from "node:fs";
import path from "node:path";
import { Browser } from "./cdp";
import { IMAGES, REPO, WORK } from "./lib";

const ROUNDS: Array<[string, string, string]> = [
  ["v1", "RESULTS-v1.md", "first prompt"],
  ["v2", "RESULTS-v2.md", "exact counts, safe few-shot"],
  ["v3", "RESULTS-v3.md", "summary trimmed to fit"],
  ["v4", "RESULTS.md", "allowed-token leak fixed"],
];
const MODELS = ["gemma4:e4b", "gemma4:e2b", "qwen3:4b"];
const COLORS: Record<string, string> = { "gemma4:e4b": "#2a78d6", "gemma4:e2b": "#eb6834", "qwen3:4b": "#1baf7a" };

function rejected(file: string, model: string): { pct: number; n: number; drafts: number } {
  const text = fs.readFileSync(path.join(REPO, "eval", file), "utf8");
  const row = text.split(/\r?\n/).find((l) => l.startsWith(`| ${model} |`));
  if (!row) throw new Error(`${model} not in ${file}`);
  const cells = row.split("|").map((c) => c.trim());
  const m = /^(\d+) \(([\d.]+)%\)$/.exec(cells[4]!);
  if (!m) throw new Error(`bad cell in ${file}: ${cells[4]}`);
  return { n: Number(m[1]), pct: Number(m[2]), drafts: Number(cells[3]) };
}

const data = MODELS.map((model) => ({ model, points: ROUNDS.map(([, file]) => rejected(file, model)) }));

const W = 1000, H = 600;
const L = 72, R = 200, T = 150, B = 110;
const pw = W - L - R, ph = H - T - B;
const x = (i: number) => L + (pw * i) / (ROUNDS.length - 1);
const y = (pct: number) => T + ph - (ph * pct) / 100;

const INK = "#1F1D1A", MUTED = "#6b655c", GRID = "#e4ddcf", SURFACE = "#F7F3EA";
let svg = "";
for (const t of [0, 25, 50, 75, 100]) {
  svg += `<line x1="${L}" x2="${L + pw}" y1="${y(t)}" y2="${y(t)}" stroke="${t === 0 ? "#cfc6b4" : GRID}" stroke-width="1"/>`;
  svg += `<text x="${L - 12}" y="${y(t) + 5}" text-anchor="end" class="tick">${t}%</text>`;
}
ROUNDS.forEach(([name, , note], i) => {
  svg += `<text x="${x(i)}" y="${T + ph + 34}" text-anchor="middle" class="round">${name}</text>`;
  svg += `<text x="${x(i)}" y="${T + ph + 58}" text-anchor="middle" class="note">${note}</text>`;
});
for (const s of [...data].reverse()) {   // the default model (slot 1) draws last, on top
  const c = COLORS[s.model]!;
  svg += `<polyline fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${s.points.map((p, i) => `${x(i)},${y(p.pct)}`).join(" ")}"/>`;
  s.points.forEach((p, i) => { svg += `<circle cx="${x(i)}" cy="${y(p.pct)}" r="5.5" fill="${c}" stroke="${SURFACE}" stroke-width="2.5"/>`; });
}
// End labels at least 26px apart, moved up (never into the x-axis band), with a leader line.
const ends = data.map((s) => ({ s, py: y(s.points.at(-1)!.pct), ly: y(s.points.at(-1)!.pct) })).sort((a, b) => b.py - a.py);
for (let i = 1; i < ends.length; i++) if (ends[i - 1]!.ly - ends[i]!.ly < 26) ends[i]!.ly = ends[i - 1]!.ly - 26;
for (const e of ends) {
  const last = e.s.points.at(-1)!;
  const lx = x(ROUNDS.length - 1) + 16;
  if (Math.abs(e.ly - e.py) > 2) svg += `<line x1="${x(ROUNDS.length - 1) + 7}" y1="${e.py}" x2="${lx - 4}" y2="${e.ly}" stroke="${MUTED}" stroke-width="1"/>`;
  svg += `<circle cx="${lx + 5}" cy="${e.ly}" r="5" fill="${COLORS[e.s.model]}"/>`;
  svg += `<text x="${lx + 16}" y="${e.ly + 5}" class="end"><tspan class="endval">${Math.round(last.pct)}%</tspan>  ${e.s.model}</text>`;
}
let lgx = L;
for (const s of data) {
  svg += `<circle cx="${lgx + 6}" cy="${T - 34}" r="6" fill="${COLORS[s.model]}"/><text x="${lgx + 18}" y="${T - 29}" class="legend">${s.model}</text>`;
  lgx += 150;
}

const assets = path.join(REPO, "apps", "card", "dist", "assets");
if (!fs.existsSync(assets)) throw new Error("card not built (fonts): pnpm --filter @twotoe/card build");
const font = (f: string) => `file:///${path.join(assets, fs.readdirSync(assets).find((n) => n.startsWith(f) && n.endsWith(".woff2"))!).replace(/\\/g, "/")}`;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Atkinson";src:url("${font("atkinson-hyperlegible-latin-400-normal")}") format("woff2");font-weight:400}
@font-face{font-family:"Atkinson";src:url("${font("atkinson-hyperlegible-latin-700-normal")}") format("woff2");font-weight:700}
@font-face{font-family:"Fraunces";src:url("${font("fraunces-latin-soft-normal")}") format("woff2");font-weight:100 900}
html,body{margin:0;background:${SURFACE}}
svg{display:block;font-family:"Atkinson",system-ui,sans-serif}
.title{font-family:"Fraunces",Georgia,serif;font-size:30px;font-weight:600;fill:${INK}}
.sub{font-size:16px;fill:${MUTED}}
.tick{font-size:14px;fill:${MUTED};font-variant-numeric:tabular-nums}
.round{font-size:16px;font-weight:700;fill:${INK}}
.note{font-size:13px;fill:${MUTED}}
.legend{font-size:15px;fill:${INK}}
.end{font-size:15px;fill:${INK}}
.endval{font-weight:700}
.foot{font-size:13px;fill:${MUTED}}
</style></head><body>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Share of model drafts rejected by the validator per eval round">
<text x="${L}" y="52" class="title">How often the validator said no</text>
<text x="${L}" y="82" class="sub">Share of model drafts rejected, per eval round. 24 synthetic fixtures, 5 runs per model, RTX 3050 laptop.</text>
${svg}
<text x="${L}" y="${H - 22}" class="foot">Ungrounded tokens in any final brief: 0 in every round. Source: eval/RESULTS-v1.md to v3.md and eval/RESULTS.md (v4).</text>
</svg></body></html>`;

const file = path.join(WORK, "chart.html");
fs.writeFileSync(file, html);
const b = new Browser();
await b.start(path.join(WORK, "profile-chart"), 9334);
await b.shot({ url: `file:///${file.replace(/\\/g, "/")}`, out: path.join(IMAGES, "eval-rejections-by-round.png"), width: W, height: H, dpr: 2, waitMs: 800 });
await b.close();
process.stdout.write(`${JSON.stringify(data.map((s) => [s.model, s.points.map((p) => p.pct)]))}\n`);
