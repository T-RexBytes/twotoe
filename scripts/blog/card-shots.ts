// Card screenshots for the DEV post. Serves the built card (apps/card/dist) on
// loopback with no /brief.json, so only the bundled fixture examples can show.
// Needs: pnpm --filter @twotoe/card build
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Browser } from "./cdp";
import { IMAGES, REPO, WORK } from "./lib";

const DIST = path.join(REPO, "apps", "card", "dist");
if (!fs.existsSync(path.join(DIST, "index.html"))) throw new Error("card not built: pnpm --filter @twotoe/card build");
const PORT = 4799;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent((req.url ?? "/").split("?")[0]!);
  const file = path.resolve(DIST, u === "/" ? "index.html" : u.slice(1));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  res.end(fs.readFileSync(file));
});
await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r()));

const url = (slug: string) => `http://127.0.0.1:${PORT}/#${slug}`;
const openFirst = "document.querySelector('main details')?.setAttribute('open', '')";
const openAll = "document.querySelectorAll('main details').forEach(d => d.setAttribute('open',''))";
const hideSwitcher = "document.querySelector('nav[aria-label=\"Example briefs\"]')?.remove(); window.scrollTo(0,0)";

const b = new Browser();
await b.start(path.join(WORK, "profile-card"));
const shots = [
  { url: url("f22"), out: "card-kitchen-sink-light.png", width: 900, height: 900, fullPage: true, before: openFirst },
  { url: url("f22"), out: "card-kitchen-sink-dark.png", width: 900, height: 900, fullPage: true, dark: true, before: openFirst },
  { url: url("f06"), out: "card-railway-light.png", width: 900, height: 900, fullPage: true, before: openAll },
  { url: url("f23"), out: "card-clean-night-light.png", width: 900, height: 900, fullPage: true },
  { url: url("f22"), out: "card-phone-light.png", width: 360, height: 780, dpr: 3, mobile: true },
  { url: url("f22"), out: "card-phone-dark.png", width: 360, height: 780, dpr: 3, mobile: true, dark: true },
  { url: url("f22"), out: "card-phone-full-light.png", width: 360, height: 780, dpr: 3, mobile: true, fullPage: true, before: openFirst },
  { url: url("f22"), out: "cover-1000x420.png", width: 1000, height: 420, dpr: 1, before: hideSwitcher },
  { url: url("f22"), out: "cover-2000x840.png", width: 1000, height: 420, dpr: 2, before: hideSwitcher },
];
for (const s of shots) {
  await b.shot({ ...s, out: path.join(IMAGES, s.out) });
  process.stdout.write(`shot ${s.out}\n`);
}
await b.close();
server.close();
