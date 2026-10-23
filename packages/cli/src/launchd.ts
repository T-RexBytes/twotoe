import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFile } from "@twotoe/core";
import type { TaskPlan } from "./taskScheduler";

// SPEC 11.3 (SHOULD, for macOS readers): `twotoe sleep --launchd` installs
// LaunchAgents equivalent to the Task Scheduler tasks. Same plans, same
// launch specs; "at log on" becomes RunAtLoad, "daily" becomes
// StartCalendarInterval (launchd runs a missed calendar job when the Mac
// wakes, like StartWhenAvailable). Built from the Windows plans; not yet run
// on a real Mac.

export const LABEL_PREFIX = "tech.twotoe.";

export function labelOf(plan: TaskPlan): string {
  return LABEL_PREFIX + plan.name.replace(/^TwoToe-/, "").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
}

function xml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function plistFor(plan: TaskPlan): string {
  const { launch } = plan;
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">`,
    `<plist version="1.0">`,
    `<dict>`,
    `  <key>Label</key><string>${xml(labelOf(plan))}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    ...[launch.exe, ...launch.args].map((a) => `    <string>${xml(a)}</string>`),
    `  </array>`,
    `  <key>WorkingDirectory</key><string>${xml(launch.cwd)}</string>`,
  ];
  if (plan.trigger.type === "logon") {
    lines.push(`  <key>RunAtLoad</key><true/>`);
  } else {
    const [hour, minute] = plan.trigger.at.split(":").map(Number);
    lines.push(`  <key>StartCalendarInterval</key>`, `  <dict><key>Hour</key><integer>${hour}</integer><key>Minute</key><integer>${minute}</integer></dict>`);
  }
  if (launch.log) {
    lines.push(`  <key>StandardOutPath</key><string>${xml(launch.log)}</string>`);
    lines.push(`  <key>StandardErrorPath</key><string>${xml(launch.log.replace(/\.log$/, ".err.log"))}</string>`);
  }
  lines.push(`  <key>ProcessType</key><string>Background</string>`, `</dict>`, `</plist>`, ``);
  return lines.join("\n");
}

export function launchAgentsDir(home: string = os.homedir()): string {
  return path.join(home, "Library", "LaunchAgents");
}

function guiDomain(): string {
  const uid = typeof process.getuid === "function" ? process.getuid() : -1;
  if (uid < 0) throw new Error("launchd needs a user id (macOS only)");
  return `gui/${uid}`;
}

export async function installLaunchAgents(list: TaskPlan[], home: string = os.homedir()): Promise<string[]> {
  if (process.platform !== "darwin") throw new Error("--launchd is for macOS; on Windows use --taskscheduler or --no-temporal");
  const dir = launchAgentsDir(home);
  fs.mkdirSync(dir, { recursive: true });
  const done: string[] = [];
  for (const p of list) {
    const label = labelOf(p);
    const file = path.join(dir, `${label}.plist`);
    if (p.launch.log) fs.mkdirSync(path.dirname(p.launch.log), { recursive: true });
    // Replace an older copy: bootout fails harmlessly when it is not loaded.
    await runFile("/bin/launchctl", ["bootout", `${guiDomain()}/${label}`]);
    fs.writeFileSync(file, plistFor(p));
    const r = await runFile("/bin/launchctl", ["bootstrap", guiDomain(), file]);
    if (!r.ok) throw new Error(`could not load ${label}`);
    done.push(label);
  }
  return done;
}

export async function uninstallLaunchAgents(home: string = os.homedir()): Promise<string[]> {
  if (process.platform !== "darwin") return [];
  const dir = launchAgentsDir(home);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith(LABEL_PREFIX) && f.endsWith(".plist"));
  } catch {
    return [];
  }
  for (const f of files) {
    await runFile("/bin/launchctl", ["bootout", `${guiDomain()}/${f.replace(/\.plist$/, "")}`]);
    fs.rmSync(path.join(dir, f), { force: true });
  }
  return files.map((f) => f.replace(/\.plist$/, ""));
}
