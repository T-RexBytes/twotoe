// Runs the real crash test, screenshots the live Temporal UI timeline about once
// a second, and assembles a captioned timelapse (MP4 + GIF). Saves the crash
// test's output for `terminal-shots.ts crash`.
// Needs: a Temporal dev server on 127.0.0.1:7233 (the logon task or
// `temporal server start-dev`), Ollama with gemma4:e4b, ffmpeg.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findTemporalExe } from "../../packages/worker/src/temporal";
import { Browser } from "./cdp";
import { ffmpegExe, IMAGES, REPO, WORK } from "./lib";

const FRAMES = path.join(WORK, "crash-frames");
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const temporal = await findTemporalExe();
if (!temporal) throw new Error("temporal.exe not found: winget install Temporal.TemporalCLI");

let text = "";
const child = spawn(process.execPath, ["--import", "tsx", path.join(REPO, "packages", "worker", "scripts", "crash-test.ts")], { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d) => { text += String(d); process.stdout.write(String(d)); });
child.stderr.on("data", () => { /* worker build noise */ });
let done = false;
const exited = new Promise<number>((r) => child.on("exit", (c) => { done = true; r(c ?? 2); }));

let id = "";
while (!id) {
  const m = /starting (twotoe-crash-[\w-]+)/.exec(text);
  if (m) id = m[1]!;
  else if (done) throw new Error("crash test ended before starting the workflow");
  else await new Promise((r) => setTimeout(r, 300));
}
const desc = JSON.parse(execFileSync(temporal, ["workflow", "describe", "--workflow-id", id, "--address", "127.0.0.1:7233", "-o", "json"], { encoding: "utf8" }));
const url = `http://127.0.0.1:8233/namespaces/default/workflows/${id}/${desc.workflowExecutionInfo.execution.runId}/timeline`;

const b = new Browser();
await b.start(path.join(WORK, "profile-crash"), 9336);
await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await b.send("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 4000));
let n = 0;
const frame = async () => {
  const r = await b.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(FRAMES, `f${String(n++).padStart(4, "0")}.png`), Buffer.from(r.data, "base64"));
};
while (!done) {
  await b.send("Page.reload");
  await new Promise((r) => setTimeout(r, 1600));
  await frame();
}
await new Promise((r) => setTimeout(r, 3000));
await b.send("Page.reload");
await new Promise((r) => setTimeout(r, 2500));
for (let i = 0; i < 4; i++) await frame();
await b.close();
const code = await exited;
fs.writeFileSync(path.join(WORK, "crash-test.txt"), text);

const ff = ffmpegExe();
const mp4 = path.join(IMAGES, "crash-test-timeline.mp4");
const vf = "drawbox=x=iw-470:y=ih-58:w=450:h=40:color=black@0.55:t=fill,"
  + "drawtext=fontfile='C\\:/Windows/Fonts/segoeui.ttf':text='Real crash-test run, sped up about 8x':fontcolor=white:fontsize=22:x=w-455:y=h-50,"
  + "tpad=stop_mode=clone:stop_duration=3,format=yuv420p";
execFileSync(ff, ["-y", "-loglevel", "error", "-framerate", "4", "-i", path.join(FRAMES, "f%04d.png"), "-vf", vf, "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", mp4]);
execFileSync(ff, ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=4,scale=1100:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", path.join(IMAGES, "crash-test-timeline.gif")]);
process.stdout.write(`\nframes ${n}, crash test exit ${code}, workflow ${id}\n`);
