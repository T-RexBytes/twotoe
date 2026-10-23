// Animated terminal GIF (and MP4) of a real `brief` run: the command is typed,
// the model wait is shown sped up (captioned), then the real output appears at
// once, the way the CLI prints it. Needs terminal-shots.ts brief first.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Browser } from "./cdp";
import { ffmpegExe, FX, IMAGES, WORK } from "./lib";
import { terminalHtml } from "./terminal";

const { output, seconds } = JSON.parse(fs.readFileSync(path.join(WORK, "brief-output.json"), "utf8")) as { output: string; seconds: number };
const FRAMES = path.join(WORK, "gif-frames");
const COMMAND = `pnpm twotoe brief --fixture ${FX}`;
const lines = output.split("\n").length;
// Lines holding one space keep their height (the renderer trims trailing newlines).
const pad = (s: string) => s + "\n ".repeat(Math.max(0, lines - s.split("\n").length));
fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const caption = (text: string) => `\x1b[90m${text}\x1b[39m`;
const frames: string[] = [];
const push = (cmd: string, out: string, times = 1) => { for (let i = 0; i < times; i++) frames.push(terminalHtml([{ command: cmd, output: pad(out) }])); };
push("", "", 6);
for (let i = 2; i <= COMMAND.length; i += 2) push(COMMAND.slice(0, i), "");
push(COMMAND, "", 6);
for (let s = 0; s < 10; s++) push(COMMAND, caption(`  local model writing... ${Math.round((seconds * (s + 1)) / 10)}s of ${seconds.toFixed(1)}s (sped up)`));
push(COMMAND, output, 60);

const b = new Browser();
await b.start(path.join(WORK, "profile-gif"), 9337);
const tmp = path.join(FRAMES, "frame.html");
fs.writeFileSync(tmp, frames.at(-1)!);
await b.shot({ url: `file:///${tmp.replace(/\\/g, "/")}`, out: path.join(FRAMES, "measure.png"), width: 1180, height: 80, dpr: 1, fullPage: true, waitMs: 200 });
const height = await b.eval("Math.ceil(document.documentElement.scrollHeight)");
for (const [i, html] of frames.entries()) {
  fs.writeFileSync(tmp, html);
  await b.shot({ url: `file:///${tmp.replace(/\\/g, "/")}`, out: path.join(FRAMES, `g${String(i).padStart(4, "0")}.png`), width: 1180, height, dpr: 1, waitMs: 120 });
}
await b.close();
const input = ["-framerate", "12", "-i", path.join(FRAMES, "g%04d.png")];
execFileSync(ffmpegExe(), ["-y", "-loglevel", "error", ...input, "-vf", "split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none", "-loop", "0", path.join(IMAGES, "terminal-brief.gif")]);
execFileSync(ffmpegExe(), ["-y", "-loglevel", "error", ...input, "-vf", "format=yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", path.join(IMAGES, "terminal-brief.mp4")]);
process.stdout.write(`frames ${frames.length}\n`);
