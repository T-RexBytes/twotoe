# Blog asset scripts

These regenerate every image and clip in `docs/post/images/` from real runs on synthetic fixtures. They drive headless Chrome over the DevTools protocol (no extra dependencies) and use ffmpeg for the GIF/MP4 files. Scratch output goes to `scripts/blog/.work/` (gitignored).

Run from the repo root. In PowerShell, colors need `Remove-Item Env:NO_COLOR -ErrorAction SilentlyContinue; $env:FORCE_COLOR = "1"` first.

| Script | Makes | Needs |
|---|---|---|
| `pnpm tsx scripts/blog/card-shots.ts` | `card-*.png`, `cover-1000x420.png`, `cover-2000x840.png` | built card: `pnpm --filter @twotoe/card build` |
| `pnpm tsx scripts/blog/terminal-shots.ts` | `terminal-doctor.png`, `terminal-brief.png`, `terminal-brief-no-llm.png`, `terminal-explain.png`, `terminal-ask.png` | Ollama with `gemma4:e4b` (doctor and explain alone do not need it) |
| `pnpm tsx scripts/blog/brief-gif.ts` | `terminal-brief.gif`, `terminal-brief.mp4` | `terminal-shots.ts brief` first, ffmpeg |
| `pnpm tsx scripts/blog/crash-clip.ts` | `crash-test-timeline.mp4`, `crash-test-timeline.gif` | Temporal dev server on 127.0.0.1:7233, Ollama, ffmpeg |
| `pnpm tsx scripts/blog/terminal-shots.ts crash` | `terminal-crash-test.png` | `crash-clip.ts` first |
| `pnpm tsx scripts/blog/chart.ts` | `eval-rejections-by-round.png` | built card (it borrows the card's fonts) |
| `pnpm tsx scripts/blog/copy-rate.ts` | prints the "how much did the model copy the template" numbers | `eval/out` or the committed `eval/out-v4` |

Not scriptable here:
- `temporal-crash-test-timeline.png`: a still of the Temporal UI timeline (`http://127.0.0.1:8233`, a `twotoe-crash-...` workflow, Timeline tab), taken by hand.
- `sentry-*.png`: screenshots of the Sentry trace UI, which needs the Sentry account that received the trace. See `docs/blog/info.md`.

Model output varies a little between runs (GPU), so a re-run can differ in the line-2 tail and the timings. Fixture-only data: nothing here reads the real machine except `doctor`, which reports setup, not findings.
