# Recording plan

Everything on screen comes from fixtures (SPEC 3.7). Nothing here needs your real projects.

**Already made (Oct 23), in `docs/post/images/`:** the terminal GIF (`terminal-brief.gif` / `.mp4`), the crash-test clip (`crash-test-timeline.gif` / `.mp4`) and still (`temporal-crash-test-timeline.png`), terminal stills for brief, ask, explain, doctor and the crash test, the card in light, dark and phone sizes, the cover, and the eval chart. All are real runs on fixtures. Sections 1 and 2 below are only needed if you want to re-record them yourself; what is left for you is the Sentry screenshot (3), and the video (5) if you make one.

## Before any recording

1. Close Discord, Brave and anything that can pop a notification. Turn on Do Not Disturb (Win + N, then the bell).
2. Open Windows Terminal, PowerShell profile, font size 16 or more, window about 110 columns wide.
3. Hide the real path in the prompt for this window only:

   ```powershell
   function prompt { "PS twotoe> " }
   Set-Location D:\path\to\twotoe   # run this before the prompt change if you are elsewhere
   ```

4. Check the machine is ready: `pnpm tsx packages/cli/src/index.ts doctor`. Every line should be `ok` (a `warn` for project roots is fine).
5. Warm the model so the first take is not slow: `pnpm tsx packages/cli/src/index.ts doctor` already pre-warms it.

## 1. Terminal GIF (the SPEC 12 layout)

Record with Snipping Tool (Win + Shift + R, select the terminal), then convert.

```powershell
cls
pnpm tsx packages/cli/src/index.ts brief --fixture eval/fixtures/f22-kitchen-sink
```

The model takes about 10 to 25 s; trim the wait in the GIF or keep it (it is honest). For a short loop, the template version is instant:

```powershell
pnpm tsx packages/cli/src/index.ts brief --fixture eval/fixtures/f22-kitchen-sink --no-llm
```

Convert (ffmpeg is installed):

```powershell
ffmpeg -i brief.mp4 -vf "fps=12,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" -loop 0 docs/post/brief.gif
```

Check the size: DEV accepts large GIFs but under 5 MB loads well. Lower `fps` or `scale` if needed.

## 2. Crash-test clip (Temporal)

The crash test reuses the Temporal server that the logon task already runs, on its own task queue, so it does not touch the nightly schedule. Its state now lives in `<repo>/.twotoe-demo` (ignored by git and by TwoToe scans), so the Temporal UI shows a relative config path, not your user folder.

1. Open http://127.0.0.1:8233 in the browser, namespace `default`, Workflows list.
2. Put the terminal and the browser side by side and start recording the screen.
3. Run:

   ```powershell
   pnpm tsx packages/worker/scripts/crash-test.ts
   ```

4. In the browser, open the `twotoe-crash-...` workflow as soon as it appears and switch to the timeline view. You will see `writeBriefWithValidation` stall when the worker is killed, then retry and finish on worker 2.
5. Stop when the terminal prints the summary ending in `activities executed twice  0  <- must be 0`.

Do not open the nightly `twotoe-nightly-...` workflows on camera after 03:00: their input is your real config path and their results list real findings.

## 3. Sentry trace screenshot

The demo trace from Gate 7: https://none-0un.sentry.io/explore/traces/trace/c09da4f7d9c1462b8ac78c72d8048a65/

Screenshot the waterfall with the first `execute_tool groundingValidator` span in red. That rejection was forced with `--force-reject-first` (labelled in the brief as "forced rejection for the demo trace"); say so in the caption, or record a new trace with a natural rejection (see the note at the end).

## 4. Card on a phone

The hosted card is not deployed yet (DigitalOcean was deferred). Two options:

- **Phone on the same Wi-Fi:** `pnpm --filter @twotoe/card build`, then `pnpm --filter @twotoe/card exec vite preview --host 0.0.0.0 --port 4173` and open `http://<your PC's LAN IP>:4173` on the phone. It only serves the three fixture example briefs. Stop it with Ctrl+C right after the screenshot; Windows may ask to allow Node through the firewall, choose Private networks only.
- **No phone:** run `pnpm tsx packages/cli/src/index.ts card`, press F12, toggle the device toolbar (Ctrl + Shift + M), pick a 360 px wide phone, screenshot.

Click "See an Example", then expand one checklist item's evidence before the screenshot.

## 5. Demo video (SPEC 18, adjusted)

The 07:00 toast was cut (the PC is not on at night), so that shot changes. Suggested order, 60 to 90 s:

| Time | Visual | Caption |
|---|---|---|
| 0:00 | The viral "internet broke today" post scrolling | Ten scary headlines. Which ones hit my laptop? |
| 0:07 | `twotoe sleep --taskscheduler` | One command. Then I went to bed. |
| 0:12 | Temporal UI, a run starting | A local Gemma reads the findings. |
| 0:20 | Crash-test clip: worker killed, restarted, workflow completes | I killed it mid-thought. It finished anyway. |
| 0:32 | `brief --fixture ... --speak` (the two lines read aloud) or the terminal GIF | Two lines. |
| 0:38 | Card on phone: checklist, confidence chips, vendor links | A short checklist. Every item links to the vendor. |
| 0:50 | Card's network ledger: only 127.0.0.1 | Zero secrets left this machine. |
| 0:58 | Sentry trace with the rejected attempt | When the model got it wrong, the validator threw it out. |
| 1:08 | Sloth + repo link | TwoToe. Patch, rotate, go back to sleep. |

`--speak` reads the lines with the Windows speech engine; nothing leaves the machine.

## Note: a natural rejection trace (optional)

A trace where Gemma's own draft was rejected (not forced) makes a stronger Sentry story. It needs telemetry turned on for one fixture run, which sends that trace to your Sentry project.

Production uses a fixed seed, so repeating the same command gives the same draft; and in the v4 eval gemma4:e4b had no rejections at all. The deterministic way to show a natural rejection is gemma4:e2b on the Railway fixture, which the v4 eval rejected on both attempts at the production seed (line-1 action over 60 characters) before the template stepped in:

```powershell
pnpm tsx packages/cli/src/index.ts brief --fixture eval/fixtures/f06-railway-user --model gemma4:e2b --telemetry
```

GPU runs are not always bit-identical, so check that the line `validator:` reports a rejection before using the trace.
