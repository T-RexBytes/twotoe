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
- Inventory and pack move between activities as on-disk cache references, so Temporal's history database never contains env key names. (Corrected Oct 23: file paths and the PC name did reach it until the Phase 8 prep fix below.)
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

## Gate 6 (Oct 22): eval (full tables in eval/RESULTS.md)

Setup: 24 synthetic fixtures (SPEC 14.2) with hand-written ground truth, every one carrying the canary in a real `.env`. Three local models, 5 runs each (run *r* uses seed 41 + *r*; run 1 is the production seed), temperature 0.2, thinking off, warmed up before timing. 16 fixtures have findings, so 80 briefs per model, 240 in total. Wall time 64.7 minutes on the RTX 3050 laptop. Egress during the whole eval: 127.0.0.1 only. Canary hits: 0.

Matcher: 20 of 20 expected findings, 0 false positives, 0 misses (precision and recall 100%). Kitchen-sink priority order correct; clean machine says "Nothing needs you today."

Writer:

| Model | Drafts rejected | Drafts with an ungrounded token | Briefs needing the template | Ungrounded tokens in final briefs | Median / p90 writer time | Tokens/s |
|---|---|---|---|---|---|---|
| gemma4:e4b | 56 of 129 (43%) | 5 (3.9%) | 7 of 80 | 0 | 15.5 s / 20.1 s | 21.3 |
| gemma4:e2b | 151 of 157 (96%) | 128 (81.5%) | 74 of 80 | 0 | 6.6 s / 11.4 s | 65.9 |
| qwen3:4b | 66 of 119 (55%) | 8 (6.7%) | 27 of 80 | 0 | 16.5 s / 45.7 s | 12.2 |

The headline for the post: across 405 model drafts the validator rejected 273. 141 of them contained an ungrounded token: a version, CVE, number or product name that code had not established for that spot. Some are inventions (a fake finding id, a Node version in an OpenCode brief); most of e2b's are real facts in the wrong section (checklist facts restated as FYI). Not one ungrounded token reached a final brief. The template fallback did its job 108 times.

What the numbers say about each model:
- gemma4:e4b is the default for a reason: most rejections are about length, not invention, and 9 of 10 briefs end up in the model's own words.
- gemma4:e2b is three times faster but fills the FYI section with restated checklist facts when there is nothing to say (123 drafts). The validator rejects every token in it, so 74 of 80 briefs fall back to the template. Fast, but in practice a template with extra steps.
- qwen3:4b invented finding ids 5 times and copied the few-shot example's "bump Node to 24.22.1" into a brief about OpenCode. Its p90 latency (45.7 s) is more than twice e4b's.

Root causes found in the drafts (fix proposals, not applied; ground truth untouched):
1. "Why over 140 chars" (118 rejections): 9 of 11 pack summaries are longer than 140 characters, and models copy them. All 118 come from those 9 advisories. Fix: send the model a 140-character "why" budget and the template's trimmed sentence as a suggestion, or shorten the pack summaries (keeping every fact token).
2. Wrong number of line-1 actions (131): models add a line-1 action when only "possible" items exist (expected 0), or split one action into two. Fix: put the exact count in the prompt ("line1Actions must have 1 item"), and let code drop extra line-1 actions when the first ones are grounded (formatting, not facts).
3. FYI filling (123 e2b drafts): code should set `fyi` to `[]` when there are no FYI findings before validating; add "fyi must be [] when the FYI list is empty" to the prompt.
4. Few-shot leakage (7 drafts mention 24.22.1 outside Node fixtures; 5 reused the example's fake ids `:a1`, `:b2`): the SPEC 10.4 example teaches the model specific facts and ids. Fix: use obviously fake placeholders in the example, or A/B the prompt without it.

Honest limits of this eval:
- The same person (and agent) wrote the matcher and the ground truth, so 100% matcher scores are weaker evidence than they look. RESEARCH P14 (held-out fixtures written first) is not done.
- `kev-recent` has no fixture: 0 TP, 0 FP, 0 FN means "not exercised", not "perfect".
- The validator checks tokens, not meaning. A grounded version used in the wrong direction would pass.
- Report bug caught before saving: the first RESULTS.md said "llm-fallback, fixed on retry" (a contradiction) and did not highlight tokens. Fixed in the report code and re-rendered from the saved raw results (`--from-results`), with a diff proving sections 1 to 4 and all 240 writer runs unchanged. A first re-render also leaked today's commit hash and re-timed the scans; caught by the diff and fixed so re-renders keep the original commit, wall time and timings.

## Gate 6b (Oct 22): eval after the writer fixes (v1 kept in eval/RESULTS-v1.md)

Same 24 fixtures, same 3 models x 5 runs, prompt version 2026-10-22.2 (v1 was 2026-10-22.1). Wall time 56.1 minutes. Matcher still 20/20, canary 0, egress 127.0.0.1 only. Ran on commit 34fb8d3 plus uncommitted writer changes (the report's commit line alone does not capture that; the prompt version does).

| Model | Drafts with an ungrounded token, v1 -> v2 | Drafts rejected, v1 -> v2 | Briefs needing the template, v1 -> v2 | Median writer time, v1 -> v2 |
|---|---|---|---|---|
| gemma4:e4b | 5 -> **0** | 43% -> 48% | 7 -> **14** (worse) | 15.5 s -> 13.5 s |
| gemma4:e2b | 128 -> **0** | 96% -> 63% | 74 -> 34 | 6.6 s -> 4.7 s |
| qwen3:4b | 8 -> **0** | 55% -> 61% | 27 -> 29 | 16.5 s -> 16.9 s |

What worked: no model produced a single ungrounded token in 384 drafts. Wrong line-1 counts (131 in v1), FYI filling (123) and few-shot leakage are gone. gemma4:e2b went from "a template with extra steps" (74 of 80 fallbacks) to usable (34).

What did not: length. "Why over 140 chars" rose (e4b 44 -> 58, qwen 58 -> 86) and gemma4:e4b's fallbacks doubled (7 -> 14). Root cause, measured in the drafts: the models copy the advisory `summary` word for word (37 of 58 e4b cases, 76 of 86 qwen cases, 151 to 202 characters) and ignore the trimmed `suggestedWhy` placed right next to it. Adding a field did not help because the long one was still there.

Proposed v3 fix (not applied): send the model only a summary that already fits 140 characters (drop the full one from the model's view; allowedTokens still carry every fact), and consider a word-boundary trim for line-1 actions over 60. Expected effect: most of the remaining rejections disappear. Cost: another ~56-minute eval.

Lesson worth a paragraph: the first round of fixes was right about the cause and wrong about the cure. Measuring the drafts again showed it in minutes.

## Gate 6c (Oct 22): eval v3 (eval/RESULTS-v3.md)

Prompt 2026-10-22.3: the model sees only a summary that fits 140 chars and a `shortAction` that fits 60. The run was stopped by Claude Code for low system memory (2.3 GB free of 15.3 GB; Ollama's model server held about 6 GB) after 239 of 240 briefs, before its final save. The report was rebuilt from the per-brief artifacts; the missing brief is qwen3:4b run 5 on f22-kitchen-sink, and the report names it.

| Model | Drafts rejected v1 / v2 / v3 | Briefs needing the template v1 / v2 / v3 | Median writer time v3 |
|---|---|---|---|
| gemma4:e4b | 43% / 48% / **26%** | 7 / 14 / **10** | 8.3 s |
| gemma4:e2b | 96% / 63% / **37%** | 74 / 34 / **16** | 2.7 s |
| qwen3:4b | 55% / 61% / 63% | 27 / 29 / 35 (of 79) | 17.1 s |

Ungrounded tokens before the validator: 0 for every model in v2 and v3 (v1: 141 drafts). Matcher 20/20, canary 0.

The surprise: in v3 the model never sees the full summary, yet 87 drafts still contained it word for word (13 e4b, 7 e2b, 67 qwen). The leak was in `allowedTokens`: the token builder added every input string whole, so each finding's allowed-token list carried the full 150 to 200 character summary sentence, and the models copied it from there. Fixed after v3 (only the summary's extracted tokens go in; a test checks no allowed token is longer than 40 chars). Validation is unchanged because the validator only ever matched extracted tokens. Measuring the fix needs another eval (v4).

Three rounds, one lesson: each fix was right about the symptom; the drafts themselves pointed to the real source every time.

## Gate 7 (Oct 22): Sentry agent tracing

- One trace per run: `twotoe.brief` -> scan -> match -> `invoke_agent TwoToe` -> `chat gemma4:e4b` (attempt 1) -> `execute_tool groundingValidator` (failed: rejected) -> `chat gemma4:e4b` (attempt 2) -> validator (ok) -> assemble and persist. Ops and `gen_ai.*` attributes per Sentry's current manual-instrumentation docs, including token counts and tokens/s.
- Demo trace on the kitchen-sink fixture with a forced first-attempt rejection and demo content on: trace `c09da4f7d9c1462b8ac78c72d8048a65`. The brief itself reported it honestly: "data went to o(org id).ingest.us.sentry.io (33776 bytes)" and "validator: 1 rejection, fixed on retry".
- Opt-in only, configured in `~/.twotoe/config.json` (not env vars). The SDK is not loaded when telemetry is off. The only allowed extra host is the DSN's ingest host. Uploads go through the guarded fetch and land in the brief's own network ledger.
- Privacy: prompts and responses only with `--trace-content demo` on fixtures; scrub hook strips home paths, env key names and the canary; `serverName: "twotoe"`; `dataCollection` set to collect nothing (SDK 11 replaced `sendDefaultPii`).
- Surprises: SDK 11 removed `sendDefaultPii`, renamed the content attributes, streams gen_ai spans outside transactions, and ignores `beforeSendTransaction` in its default streaming mode (it warned on the first real run). The scrub lives in `beforeSendSpan`; tests run against real SDK envelopes from a fake loopback ingest server and check no hostname, path or canary leaves.

## The dogfood moment (aggregate)

- TwoToe's first real run warned that it was itself running on an unpatched Node (24.11.0, fix is 24.22.1).
- That Node still trusted the eMudhra root ("emSign ECC Root CA - G3"). So did the Git for Windows CA bundle and the certifi bundle in 1 of 3 Python environments (certifi older than the fixed 2026.10.18). The Windows root store did not.
- winget's Node LTS package was still on 24.20.0 (also unpatched), so the fix was the official 24.22.1 MSI, hash and signature checked.
- After the upgrade, the same scan shows Node no longer trusts the root. Git for Windows and certifi still do: next actions for the checklist.

## What the check cannot see yet

- How Microsoft's block of the eMudhra root shows up in the Windows store (no Microsoft source found).
- Microsoft Store Python, pipx and uv tool layouts, and Plex's version string format: none installed on the dev machine.
- Docker with an empty environment: untested (Docker not installed).

## Gate 6d (Oct 23): eval v4 (eval/RESULTS.md; v3 kept as eval/RESULTS-v3.md)

Same 24 fixtures, 3 models x 5 runs, prompt 2026-10-22.3, after the allowed-token fix (only a summary's extracted tokens, not the whole sentence). Wall time 39.1 minutes. Matcher 20/20, canary 0, egress 127.0.0.1 only. Commit e48cb5d plus uncommitted changes (none in the writer or matcher).

| Model | Drafts rejected v1 / v2 / v3 / v4 | Briefs needing the template v4 | Median / p90 writer time v4 | Tokens/s v4 |
|---|---|---|---|---|
| gemma4:e4b | 43% / 48% / 26% / **0% (0 of 80)** | 0 of 80 | 9.0 s / 13.4 s | 19.0 |
| gemma4:e2b | 96% / 63% / 37% / **24.5% (23 of 94)** | 9 of 80 | 2.9 s / 6.5 s | 65.0 |
| qwen3:4b | 55% / 61% / 63% / **0% (0 of 80)** | 0 of 80 | 12.6 s / 22.7 s | 12.5 |

Ungrounded tokens before the validator: 0 for every model (v1: 141 drafts). After: 0, as always. e2b's 23 rejections are all formatting: 14 line-1 actions over 60 characters, 9 FYI items placed in the checklist plus 9 FYI lines over 160.

The honest cost of 0 rejections (measured over the 240 v4 briefs against the template for the same fixture):
- gemma4:e4b copied the template's action word for word in 79 of 95 checklist items. It reworded the "why" in about two thirds of items (35 of 95 match the trimmed summary it was shown). Its own words are mostly the line-2 tail: "take a deep breath." in 46 of 80 briefs.
- qwen3:4b copied more: 85 of 95 actions and 63 of 95 "why" lines word for word; tail "go back to sleep." in 51 of 80.
- gemma4:e2b rewrote almost every "why" (1 of 95 copied) and is the only model the validator still rejects.
- So the validator did not get looser; the models got closer to the facts they were handed. Whether that reads better than the template is what the blind check (eval/blind/sheet.md) is for.

## Phase 8 prep (Oct 23): bugs found while taking the screenshots

Taking real screenshots turned out to be a test suite of its own:
- **The pre-warm did not warm.** `twotoe doctor` loaded the model with Ollama's default context size; the brief asks for `num_ctx` 8192, so Ollama reloaded the model on the first brief. Brief time after `doctor`: 45 s before the fix, 29.5 s after. Found because a screenshot said 45 s next to an eval median of 26.9 s.
- **Nested egress guards left the process unguarded.** Installing a second guard replaced the first, and uninstalling it removed both. No shipped command nests guards (checked every caller), but a capture script did, and its ledger came back empty. Guards now stack: an inner guard can only narrow the allowlist, both ledgers record, and uninstalling restores the outer one. Two new tests.
- **Temporal's history held the home path and the PC name.** The schedule passed the absolute config path as workflow input, activity results carried absolute evidence paths and the saved brief path, and the worker identity was `pid@hostname`. All of it shows in the Temporal UI and stays in `temporal.db`. Now: the schedule passes `~\.twotoe\config.json` and the activity expands it, values crossing history are redacted to `~`, and identities are `twotoe` / `twotoe-worker-<pid>`. The earlier line in this log ("Temporal's history database never contains env key names or file paths") was half wrong: key names, yes; paths, no, until this fix.
- **A test that could not fail.** The workflow test checked `JSON.stringify(history)` for leaked data, but payloads are bytes, so their text was never searched. It now decodes every payload (and asserts the decoded text contains the brief, so a broken decoder cannot pass). The decoded check is what found the config-path leak.
- **The crash test showed the user folder.** Its state lived under `%TEMP%`, so the Temporal UI showed `C:\Users\<name>\...` as workflow input. It now lives in `<repo>/.twotoe-demo` (gitignored, skipped by scans) with a relative path.
- **The nightly tasks.** The hidden launcher died on the worker's first stderr line (PowerShell 5.1 turns redirected stderr into errors), and Windows Terminal ignored `-WindowStyle Hidden`, so two windows opened at log on. Fixed with OS-level redirection and `conhost.exe --headless`.
- **Report bug:** the eval's "sample rejected drafts" printed empty quotes for line-1 and FYI reasons. Fixed and re-rendered from the saved results; only those three lines changed.

Crash test re-run twice on the fixed code: 0 activities executed twice, 0 model requests computed twice, model result reused from cache after the kill, canary 0.

Also built in this phase: `doctor`, `explain`, `pack`, `eval`, `ask` (grounded follow-up through the same validator; not Mastra, whose telemetry posts to PostHog by default), `brief --open`, `brief --speak` (Windows speech, offline), `sleep --launchd` (untested on a Mac). Coverage enforced at 90% lines (core 90.5%, writer 97.6%). Pack re-verified against every source on Oct 23; no fact changed.
