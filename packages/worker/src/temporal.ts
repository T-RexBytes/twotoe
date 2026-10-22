import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { normalizeHost, whichAll, LOOPBACK_HOSTS } from "@twotoe/core";

export const TEMPORAL_ADDRESS = "127.0.0.1:7233";
export const TEMPORAL_UI = "http://127.0.0.1:8233";
export const TASK_QUEUE = "twotoe";

// Temporal gRPC must stay on this machine (SPEC 15.1).
export function assertLoopbackAddress(address: string): void {
  const host = normalizeHost(address.replace(/:\d+$/, ""));
  if (!LOOPBACK_HOSTS.has(host)) throw new Error(`Temporal address must be loopback, got ${host}`);
}

// temporal.exe on PATH, or where winget puts it (a fresh install is not on
// the PATH of shells that were already open).
export async function findTemporalExe(home: string = os.homedir()): Promise<string | null> {
  const onPath = (await whichAll("temporal")).find((p) => /temporal(\.exe)?$/i.test(p));
  if (onPath) return onPath;
  const winget = path.join(home, "AppData", "Local", "Microsoft", "WinGet", "Links", "temporal.exe");
  return fs.existsSync(winget) ? winget : null;
}

export function isPortOpen(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

export function devServerArgs(dbFilename: string): string[] {
  return ["server", "start-dev", "--ip", "127.0.0.1", "--port", "7233", "--ui-port", "8233", "--db-filename", dbFilename];
}
