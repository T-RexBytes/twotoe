// Minimal Chrome DevTools Protocol driver for blog screenshots (no dependencies).
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromeExe } from "./lib";

export interface ShotOptions {
  url: string;
  out: string;
  width: number;
  height: number;
  dpr?: number;
  mobile?: boolean;
  dark?: boolean;
  fullPage?: boolean;
  waitMs?: number;
  before?: string;          // JS run in the page before the capture
}

type Message = { id?: number; method?: string; result?: any; error?: { message: string } };

export class Browser {
  private proc!: ChildProcess;
  private ws!: WebSocket;
  private id = 0;
  private pending = new Map<number, (m: Message) => void>();
  private listeners: Array<(m: Message) => void> = [];

  async start(profileDir: string, port = 9333): Promise<void> {
    fs.rmSync(profileDir, { recursive: true, force: true });
    this.proc = spawn(chromeExe(), [
      "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
      "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--disable-extensions",
      "--force-color-profile=srgb", "--font-render-hinting=none", "about:blank",
    ], { stdio: "ignore" });
    let wsUrl = "";
    for (let i = 0; i < 50 && !wsUrl; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
        wsUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
      } catch { /* not up yet */ }
    }
    if (!wsUrl) throw new Error("chrome did not start");
    this.ws = new WebSocket(wsUrl);
    await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = (ev) => {
      const m = JSON.parse(String(ev.data)) as Message;
      if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)!(m); this.pending.delete(m.id); }
      else for (const l of this.listeners) l(m);
    };
    await this.send("Page.enable");
    await this.send("Runtime.enable");
  }

  send(method: string, params: object = {}): Promise<any> {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  private waitEvent(name: string, timeoutMs = 15000): Promise<void> {
    return new Promise((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      const l = (m: Message) => { if (m.method === name) { clearTimeout(t); this.listeners = this.listeners.filter((x) => x !== l); resolve(); } };
      this.listeners.push(l);
    });
  }

  async eval(expr: string): Promise<any> {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result?.value;
  }

  async shot(o: ShotOptions): Promise<string> {
    const dpr = o.dpr ?? 2;
    await this.send("Emulation.setDeviceMetricsOverride", { width: o.width, height: o.height, deviceScaleFactor: dpr, mobile: o.mobile ?? false });
    await this.send("Emulation.setEmulatedMedia", { features: [
      { name: "prefers-color-scheme", value: o.dark ? "dark" : "light" },
      { name: "prefers-reduced-motion", value: "reduce" },
    ] });
    const loaded = this.waitEvent("Page.loadEventFired");
    await this.send("Page.navigate", { url: "about:blank" });
    await this.send("Page.navigate", { url: o.url });
    await loaded;
    await new Promise((r) => setTimeout(r, o.waitMs ?? 1200));
    if (o.before) { await this.eval(o.before); await new Promise((r) => setTimeout(r, 400)); }
    let clip: object | undefined;
    if (o.fullPage) {
      const h = await this.eval("Math.ceil(document.documentElement.scrollHeight)");
      await this.send("Emulation.setDeviceMetricsOverride", { width: o.width, height: h, deviceScaleFactor: dpr, mobile: o.mobile ?? false });
      await new Promise((r) => setTimeout(r, 400));
      clip = { x: 0, y: 0, width: o.width, height: h, scale: 1 };
    }
    const r = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!o.fullPage, ...(clip ? { clip } : {}) });
    fs.mkdirSync(path.dirname(o.out), { recursive: true });
    fs.writeFileSync(o.out, Buffer.from(r.data, "base64"));
    return o.out;
  }

  async close(): Promise<void> {
    try { this.ws.close(); } catch { /* ignore */ }
    this.proc.kill();
  }
}
