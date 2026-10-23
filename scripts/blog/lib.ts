// Shared paths and tool lookup for the blog asset scripts. No machine-specific
// paths: the repo is found from this file, tools from their usual install places.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const IMAGES = path.join(REPO, "docs", "post", "images");
// Scratch output between scripts (gitignored): Chrome profiles, frames, captured text.
export const WORK = path.join(REPO, "scripts", "blog", ".work");
fs.mkdirSync(WORK, { recursive: true });

function firstExisting(candidates: string[]): string | null {
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

export function chromeExe(): string {
  const found = firstExisting([
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(os.homedir(), "AppData", "Local", "Google", "Chrome", "Application", "chrome.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ]);
  if (!found) throw new Error("Chrome (or Edge) not found");
  return found;
}

// winget puts ffmpeg here; otherwise rely on PATH.
export function ffmpegExe(): string {
  return firstExisting([path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Links", "ffmpeg.exe")]) ?? "ffmpeg";
}

export const CANARY = "TWOTOE_CANARY_9f3a";
export const F22 = path.join(REPO, "eval", "fixtures", "f22-kitchen-sink");
export const FX = "eval/fixtures/f22-kitchen-sink";
export const NOW = new Date(2026, 9, 23, 7, 0);   // the brief's morning (fixture clock)
