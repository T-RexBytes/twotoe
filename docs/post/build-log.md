# Build log (raw material for the DEV post)

Notes captured at each gate so the post can quote real numbers and real failures. Real-machine results are aggregate counts only (SPEC 3, rule 7). No paths from the dev machine belong in this file.

## Agent session

- Built with Claude Code running natively on Windows 11 (PowerShell 5.1), not WSL.
- The full session transcript is kept locally by Claude Code under `~\.claude\projects\`. It contains real machine paths: redact before quoting or embedding it in "My Agent Session".
- Working pattern: one phase at a time, hard stop at every gate, human "go" before the next phase.

## Gate 0 (Oct 22): the spec's facts, checked against sources

Every advisory fact was re-fetched from a primary or reputable source before it went into the pack. What the spec (written from the viral post plus a first fact-check) had wrong:

| Claim in the spec | What the source says | Source |
|---|---|---|
| GitLab CVE-2026-110264 fix: "VERIFY" | 19.5.1, 19.4.3, 19.3.6, 19.2.9, 19.1.9, 19.0.10, 18.11.13 | GitLab patch release post |
| GitLab CVE-2026-97229 needs "ability to commit CI config to a public project" | GitLab only says "under certain conditions"; dropped | GitLab 19.4.2 post |
| GitLab CVE-2026-97229 affects broadly | Only 19.2 to 19.4 | same |
| PHP2Shell in KEV: "VERIFY" | Not in KEV (catalog 2026.10.21) | CISA KEV |
| LiteLLM "hourly backdoor" | Wiz contradicts itself on which OSes run it; dropped | Wiz |
| eMudhra "60M certs at risk" | About 30,000 to migrate; 60M appears in no source | Mozilla Bugzilla 2083449 |
| eMudhra root "distrusted by browsers" | Firefox yes (Oct 20); Chrome blocks the intermediates now, root removal expected Oct 27 | Bugzilla, Scott Helme |
| certifi fix "2026.10.19 (VERIFY)" | 2026.10.18 | certifi GHSA-6q48-6c7w-9gw2 |
| Gemma 4 E4B tag: "VERIFY" | `gemma4:e4b`; cloud tags (`gemma4:cloud`) also exist, so the writer must refuse them | ollama.com/library/gemma4 |

Added from sources: per-OS SHA-256 hashes for the LiteLLM IOC files (Wiz), LiteLLM Docker tags and time windows, per-CVE Plex KEV due dates (Oct 23 and Nov 3).

Primary sources that could not be read: SBI's BSE filing (HTTP 403, secondary source used), OpenCode's own X post (secondary sources used).

## Gate 1 (Oct 22): scanners

Numbers:
- 161 tests green (153 core, 8 CLI) on Node 24.22.1.
- Real machine, machine-level checks only (no project roots existed yet): 269 installed Python packages across 3 environments, 7 trust store checks, 3 markers, 16 checks, about 1 second.
- Canary, home path and `C:\Users` found in output: 0, 0, 0.

Bugs the tests and the first real run caught (good material for the honest-failure section):
1. pnpm lockfile keys with a peer suffix (`undici@7.1.0(foo@1.0.0)`) were split on the wrong `@`, producing a package named `undici@7.1.0(foo`.
2. Redaction turned the Windows short name `C:\Users\ALICE~1` into `~~1`, because the real home path matched the start of the short name. Fixed with a boundary check.
3. False negative on the real machine: Git for Windows writes its CA bundle headings as `# emSign ECC Root CA - G3`. The text search expected other formats and said "not present". Git Bash `curl` did trust the root. Fixed, and the format is now in the tests.
4. `| Select-Object -First 50` reports exit -1 in Windows PowerShell 5.1: PowerShell stops the program early. Not a TwoToe bug, but a Windows quirk worth one line.

Privacy design decisions worth explaining:
- The .env parser never holds a value. It is a character state machine that only remembers which quote is open, so `KEY=` lines inside a quoted multi-line PEM are never reported as keys. Unquoted base64 lines that look like keys are dropped and counted.
- TwoToe never reads env values, even its own: paths come from the home directory and fixed defaults. Every tool it spawns runs with an empty environment from an empty temp folder, so `NODE_OPTIONS=--require` cannot inject code and a planted `node.exe` in a project folder never runs.
- IOC files are hashed as raw bytes; a test spies on every file-reading function to prove they are never opened as text.

## Gate 2 (Oct 22): matcher and `brief --no-llm`

Numbers:
- 236 tests green (209 core, 14 writer, 13 CLI). All 20 rows of the SPEC 9.3 truth table, each run through the real pipeline (synthetic files, scan, match), not hand-built inventories.
- Kitchen-sink fixture (f01 + f06 + f10 + f17): 4 findings in the expected order (Plex first because of the KEV due date, then LiteLLM, Railway, Node), canary absent, about 0.02 s.
- Real machine, template mode: 1 thing needs attention (two CA bundles still trust the eMudhra root), 1 "possible" (OpenCode installed), 16 checks, 0.7 s, zero model calls.

Design notes worth a paragraph:
- The model is not needed to decide anything. `--no-llm` produces the full brief from the pack and the findings; the model in Phase 3 only gets to rephrase it, and the validator checks it against the same token extractor the matcher used to build `allowedTokens`.
- Priority is plain arithmetic (SPEC 7.4): severity, minus KEV and due-date bonuses, minus confidence. Ties go to credential leaks, because a leaked key is being used now and a patch gap is only being scanned for.
- "0 secrets left this machine" is computed from the egress ledger, not written.

Small catches:
- The spec's terminal mockup says "Thu Oct 23". Oct 23, 2026 is a Friday; the test caught it because the code computes the weekday.
- First real-machine wording read "update certifi and update Git for Windows". Fixed to "update certifi and Git for Windows". Reading real output beats reading templates.

## Before Gate 3 (Oct 22): the local model

Hardware for the post's latency numbers: AMD Ryzen 7 7445HS, 15.3 GB RAM, NVIDIA GeForce RTX 3050 Laptop GPU (4 GB) plus Radeon 740M. Windows 11.

- Ollama 0.40.8, `gemma4:e4b` (Q4_K_M, 7.5B parameters as reported), `ollama ps`: 100% GPU.
- First structured-output call: HTTP 200, schema-valid JSON, about 35 s wall time including a 15.4 s cold model load, 20.9 tokens/s.
- Surprise: the model "thinks" by default. 391 output tokens for a two-field answer. Turning thinking off is the first latency lever to measure in Phase 3.
- The test also showed why the validator exists: asked for a calm tail with no numbers, the model wrote "Everything remains stable and reliable." (fine), and lowercased "node" in the action (a vendor-name check will notice).

## Gate 3 (Oct 22): writer, validator, egress guard

Numbers:
- 293 tests green (216 core, 63 writer, 14 CLI). Validator tests cover unknown and duplicate ids, invented CVEs and versions, a version borrowed from another finding, hype words gated by severity and KEV, the Confirm rule, digits and vendor names in the line-2 tail, coverage, line-1 grounding, length caps, FYI grounding. A property test checks that every template draft passes the validator.
- Real model, kitchen-sink fixture, 5 runs (gemma4:e4b, RTX 3050 laptop): 5 of 5 ended in mode `llm` with 0 rejections. Brief time 21.3 s, 22.9 s, 23.2 s, 23.2 s, 23.0 s (median 23.0 s). Each run: 2,619 prompt tokens, 438 to 483 output tokens, one POST of 7,905 bytes to 127.0.0.1, nothing else on the egress ledger. Canary absent in all outputs.
- A run just before the final code (same fixture, slightly different prompt) was rejected once ("why over 140 characters" for Railway) and fixed on retry: 27.2 s + 23.0 s.
- `think: false` cut a small request from 14.9 s to 2.1 s.

Honest observations for "What broke" / "What the check can't see":
- With `seed: 42`, runs 2 to 5 were byte-identical. Five runs are not five samples; the eval needs other fixtures or seeds to measure the rejection rate.
- The model mostly copied the template's actions and summaries, lightly trimmed. On this fixture it added a tail ("you are doing great work") and little else. That makes the template vs model question in the eval a real one.
- The validator checks tokens, not meaning. It would accept a grounded version used in the wrong direction, a negation ("you are not affected"), or a confident tone on a "possible" finding. These are listed as known gaps, not fixed.
- An invented "CVE-2026-1" passed the spec's CVE regex (it needs 4+ digits after the year). The regex was widened; caught by a unit test, not in the wild.
- A test fixture bug looked like a model failure: two temp fixture folders gave different finding ids (ids hash evidence paths), and the validator correctly rejected the "model" draft as unknown ids. The validator was right; the test was wrong.

## Gate 4 (Oct 22): Temporal

Numbers:
- 309 tests green (216 core, 63 writer, 9 worker, 21 CLI). TestWorkflowEnvironment runs the real workflow on the installed Temporal CLI: happy path, an activity that fails after the model answered (retried, the model response reused, nothing computed twice), and the nightly schedule (create, update in place, remove).
- Crash test, three real runs (real dev server, real gemma4:e4b, `taskkill /PID <pid> /T /F`):

```
TwoToe crash test summary
  workflow                           -> llm, 4 checklist items, 88.4s
  killed                             worker 1, 8s into a 20s delay inside writeBriefWithValidation
  activities completed before crash  3 (collectInventory, loadPack, matchAdvisories)
  activities retried                 1 (writeBriefWithValidation (attempt 2))
  activities executed twice          0   <- must be 0
  model calls / reused from cache    2 / 2
  model requests computed twice      0   <- must be 0
  canary hits in cache, logs, briefs 0
```

- Run 1 had 1 model call (draft accepted first time). Runs 2 and 3 had 2 (the validator rejected attempt 1: two "why" fields over 140 characters and an FYI line over 160). In every run each request was computed once and reused after the crash.
- Schedule on a dev server: daily 03:00 Asia/Calcutta, catch-up window 6 h, overlap SKIP, next run 21:30 UTC.

What broke, honestly:
- Run 2 exited 1. Not a durability failure: the crash-test script required exactly one model call, and that run legitimately needed two (validator retry). The criterion was wrong; it now checks "no model request computed twice" per request key.
- All three runs finished at 88.4 s despite kill times of 52.5 s, 64.9 s and 63.7 s. Looked like a bug; it is the SDK throttling heartbeats to every 24 s (0.8 x the 30 s timeout). Recovery is "last heartbeat that got through + 30 s + 10 s backoff". The code says "heartbeat every 10 s"; the server sees every 24 s.
- `twotoe sleep` printed the real home path in its first version (rule 6). Caught by reading the output; now redacted, with a test.
- The Temporal CLI was missing from the "install before Phase 3/4" list; installed with winget when the phase started.

Design notes for the post:
- Inventory and pack move between activities as on-disk cache references, so Temporal's history database never contains env key names or file paths.
- Laziness feature: `catchupWindow` runs a missed 3 a.m. job when the laptop is next awake. Honest caveat (RESEARCH): Temporal cannot wake the laptop; `--no-temporal` with Task Scheduler `WakeToRun` can, if wake timers are allowed.

## Gate 5 (Oct 22): the morning card

Numbers:
- 328 tests green (216 core, 63 writer, 9 worker, 25 CLI, 15 card). Card tests render each example brief, check checkbox persistence (and that the card still works with storage blocked), run axe-core on every example, and assert the bundled examples contain no real path and no canary.
- Lighthouse accessibility: 100 on all three examples in light mode, 100 in dark. No horizontal overflow at 360 px in either theme.
- Example briefs are real runs of the full pipeline on synthetic fixtures with the local model: kitchen sink (4 items, accepted first try, 40.9 s), Railway user (1 item, 2 validator rejections then accepted, 15.8 s), clean night (no model call).
- Hosted page: one JS file (76 KB gzipped), one CSS file, self-hosted fonts, zero third-party requests.

What broke, honestly:
- The spec palette fails WCAG AA for small text on paper (clay 4.48, moss 4.10, amber 2.65 against the 4.5 needed). Kept the spec colors where large text allows them and added deeper shades of the same hues for chips and small text.
- My first 360 px screenshot looked broken (text cut off on the right). It was headless Chrome's minimum window width on Windows, not the card; an emulated 360 px viewport showed the page fitting.
- My first "light mode" Lighthouse run was actually dark: headless Chrome inherited Windows dark mode. Re-ran with light forced.

Choices worth a sentence in the post:
- Hosting on DigitalOcean App Platform as a static site, showing only fixture briefs. The real card never leaves 127.0.0.1.
- The checklist remembers ticks in the browser only, keyed by brief date and finding.

## The dogfood moment (aggregate)

- TwoToe's first real run warned that it was itself running on an unpatched Node (24.11.0, fix is 24.22.1).
- That Node still trusted the eMudhra root ("emSign ECC Root CA - G3"). So did the Git for Windows CA bundle and the certifi bundle in 1 of 3 Python environments (certifi older than the fixed 2026.10.18). The Windows root store did not.
- winget's Node LTS package was still on 24.20.0 (also unpatched), so the fix was the official 24.22.1 MSI, hash and signature checked.
- After the upgrade, the same scan shows Node no longer trusts the root. Git for Windows and certifi still do: next actions for the checklist.

## What the check cannot see yet

- How Microsoft's block of the eMudhra root shows up in the Windows store (no Microsoft source found).
- Microsoft Store Python, pipx and uv tool layouts, and Plex's version string format: none installed on the dev machine.
- Docker with an empty environment: untested (Docker not installed).
