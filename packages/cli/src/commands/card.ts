import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack, redactText, systemExe, twotoeHome } from "@twotoe/core";
import { buildCardData, type CardData } from "@twotoe/writer";
import { readPersisted } from "@twotoe/worker";

// SPEC 12 `twotoe card`: serve the built card and the latest brief on
// 127.0.0.1:4777. Loopback only, GET/HEAD only, no directory listing, no
// file outside the build folder, and a CSP that allows only this origin.

export const DEFAULT_PORT = 4777;
export const CARD_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "apps", "card", "dist");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export function localCardData(stateDir: string): CardData | null {
  const saved = readPersisted(stateDir);
  if (!saved) return null;
  return buildCardData({
    source: "local",
    label: "Your brief",
    brief: saved.brief,
    findings: saved.findings,
    pack: loadPack(),
    attempts: saved.run?.attempts ?? [],
    promptVersion: saved.run?.promptVersion ?? null,
    checksRun: saved.run?.checksRun ?? null,
  });
}

// Maps a URL path to a file inside dist, or null if it would escape it.
export function resolveStatic(dist: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]!);
  } catch {
    return null;
  }
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const full = path.resolve(dist, rel);
  const root = path.resolve(dist);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export function createCardServer(opts: { dist: string; stateDir: string }): http.Server {
  return http.createServer((req, res) => {
    const send = (status: number, body: string | Buffer, type = "text/plain; charset=utf-8", extra: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": type, ...SECURITY_HEADERS, ...extra });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "Method not allowed", undefined, { allow: "GET, HEAD" });
    const url = req.url ?? "/";
    if (url.split("?")[0] === "/brief.json") {
      const data = localCardData(opts.stateDir);
      if (!data) return send(404, "No brief yet. Run `twotoe brief --save`.");
      return send(200, redactText(JSON.stringify(data)), TYPES[".json"], { "cache-control": "no-store" });
    }
    const file = resolveStatic(opts.dist, url);
    if (!file) return send(404, "Not found");
    fs.readFile(file, (err, buf) => {
      if (err) return send(404, "Not found");
      send(200, buf, TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream");
    });
  });
}

// Opens the default browser with an argument array (no shell). The browser
// inherits the environment; TwoToe itself reads nothing from it.
function openBrowser(url: string): void {
  if (process.platform === "win32") {
    const rundll = systemExe("rundll32.exe");
    if (rundll) spawn(rundll, ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else {
    spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

export interface CardCommandOptions {
  port?: string;
  open?: boolean;     // commander sets false for --no-open
  stateDir?: string;
}

export async function runCard(opts: CardCommandOptions): Promise<number> {
  const out = (s: string) => process.stdout.write(`${redactText(s)}\n`);
  if (!fs.existsSync(path.join(CARD_DIST, "index.html"))) {
    out("The card is not built yet. Run: pnpm --filter @twotoe/card build");
    return 2;
  }
  const stateDir = path.resolve(opts.stateDir ?? twotoeHome());
  const port = opts.port ? Number(opts.port) : DEFAULT_PORT;
  const server = createCardServer({ dist: CARD_DIST, stateDir });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const url = `http://127.0.0.1:${port}/`;
  out(`TwoToe card on ${url} (Ctrl+C to stop)`);
  if (!localCardData(stateDir)) out("No saved brief yet, so the card shows the examples. Run `twotoe brief --save` first.");
  if (opts.open !== false) openBrowser(url);
  await new Promise<void>((resolve) => server.once("close", () => resolve()));
  return 0;
}
