# TwoToe blog: everything you need to write and publish the post

This file is the handover for whoever writes and publishes the DEV post. It collects the facts, numbers, images, links and open tasks in one place, and lists what is **not** in this repo (on the original machine or in someone's account) so nothing is a surprise.

A ready-to-edit sample post is next to this file: [`dummy-post.md`](dummy-post.md). Every number in it comes from this file.

---

## 1. Status at handover (Oct 23, 2026)

- The code is done and green, locally and on GitHub CI (both jobs, Oct 23): 422 tests pass, typecheck clean, line coverage 94.0% (core) and 98.0% (writer). Three CI failures on Oct 23, all fixed: the eval fixtures' synthetic `.env` files were gitignored (now committed); the RealProbe smoke test hit the 5 s exec limit on a busy runner (it now retries and names the failing step); and core coverage was 89.98% on CI because RealProbe was only tested against the host (now covered by machine-independent tests: 92.8% even without the host test).
- All screenshots, GIFs, clips and the eval chart exist in [`docs/post/images/`](../post/images/) (section 8).
- A structured draft with real numbers is [`docs/post/draft.md`](../post/draft.md); a full sample post is [`dummy-post.md`](dummy-post.md).
- **Not done yet** (section 10): stopwatch baseline, blind readability check, the author's own voice, repo made public, live demo link, tag, publish.

## 2. The challenge

| | |
|---|---|
| Challenge | DEV Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady" (build something that rewards laziness, with open-source AI at its core) |
| Page | https://dev.to/challenges/hacktoberfest-week3-2026-10-19 |
| Launch post | https://dev.to/devteam/join-the-hacktoberfest-open-source-ai-challenge-slow-and-steady-2850-in-prizes-across-21-3iee |
| Required tags | `#devchallenge` and `#hf26challenge` (the template adds both; do not remove them) |
| Official end | Oct 25, 2026, 11:59 PM PDT = **Oct 26, 12:29 PM IST** (rules and page) |
| Safe target | **Publish before Oct 25, 12:29 PM IST** (Oct 24 11:59 PM PDT). The DEV events API reported an end one day earlier; nobody verified which clock the submission system uses. See [`docs/research/research-challenge.md`](../research/research-challenge.md). |
| Template sections | What I Built, Demo, Code, How I Built It, Why Does Open Innovation Matter?, My Agent Session (optional), The Lazy Payoff (optional), Prize Categories |
| Rules that can disqualify | Project started and finished inside Oct 19 to 25 (repo started Oct 22). Commits after the deadline must be noted in the README. English only. 18+. One submission per challenge. |
| Freeze rule (from CLAUDE.md) | Tag `v1.0-submission` before publishing, and **never push after that tag** until winners are announced. |
| Judging | Writing quality weighs most ("a great project with a thin write-up won't win"), then relevance to the theme, creativity, technical execution, partner tech (optional). |

### Prize categories: what TwoToe can honestly claim

Category texts are quoted from the challenge page in [`docs/research/research-challenge.md`](../research/research-challenge.md). Re-read them on the live page before publishing.

| Category | Claim? | Why |
|---|---|---|
| **Gemma** ($200, featured) | Yes | The writer model is Gemma 4 E4B, run locally. The post has a 3-model bake-off and 4 eval rounds. |
| **Temporal** ($100) | Yes | The category is about durability, not scheduling. TwoToe has the nightly workflow plus a crash test: the worker is killed mid model-activity, restarted, and finishes with 0 activities executed twice. UI timeline screenshot and clip exist. |
| **Sentry Agent Tracing** ($100) | Yes, with care | The text asks to "show your agent's work ... what you found, and how you debugged it. Include traces or screenshots". We have the trace screenshots (section 8). Weakness: the demo rejection was forced, and we did not find a bug *through* a Sentry trace (the bugs were found through Temporal UI screenshots and tests). Be honest about it. |
| Entire ($100) | Maybe | "Share the agent sessions behind your project in the write-up." The redacted session is committed: `docs/blog/agent-session.md` and `agent-session-full.md`. Link it from My Agent Session. |
| .tech Domain ($100) | Only if deployed | Needs the card live on a claimed `.tech` domain (e.g. twotoe.tech). Not done. |
| DigitalOcean ($200, featured) | Only if deployed | Deploy guide ready in [`docs/DEPLOY.md`](../DEPLOY.md) (App Platform static site). Not done. |
| Mastra | **No** | `twotoe ask` was built without Mastra on purpose: `@mastra/core` sends usage telemetry to PostHog by default, which breaks the project's network rule. Say so in the post if you like; it is a nice honesty beat. |
| ElevenLabs | No | Not built (needs a cloud API key). `--speak` uses the offline Windows voice instead. |

## 3. The product in short

TwoToe is a local, open-weight agent that does breach-week triage overnight and leaves you two lines and a short checklist in the morning.

- **The two walls.** Code (the matcher) decides what is true. A local model (Gemma via Ollama) only phrases it. A validator rejects any version, CVE, number or vendor name the model wrote that code did not establish for that finding. Rejected twice: the template writes it instead.
- **Privacy.** Reads env key *names*, never values (a canary value is planted in every test fixture and must never appear in any output). Never opens or runs malware indicator files (hash only). Never runs package managers. All network goes through an allowlist: loopback, `www.cisa.gov` (KEV feed), and Sentry only when telemetry is opted in. "0 secrets left this machine" is computed from that ledger.
- **Nightly.** Temporal schedule at 03:00 with an 18-hour catch-up window (a run missed because the PC was off happens when it is back), started by Windows scheduled tasks at logon. A Task Scheduler-only mode exists too.
- **Commands:** `scan`, `brief` (`--no-llm`, `--save`, `--open`, `--speak`, `--fixture`), `card` (local morning card), `explain`, `ask`, `doctor`, `pack`, `sleep`, `eval`, `worker`. See the README.

Hardware for every timing: AMD Ryzen 7 7445HS, 15.3 GB RAM, NVIDIA RTX 3050 Laptop GPU (4 GB), Windows 11. Ollama 0.40.8, Node 24.22.1.

## 4. The hook and the fact-check

On Oct 21, 2026 a post went viral: "the internet broke today", ten incidents. The honest question was "which of these hit my machine, and what do I do before breakfast?", and pasting `.env` names into a cloud chatbot to answer it is backwards when half the incidents were leaked credentials (Railway, OpenCode, LiteLLM).

| # | Viral claim | Verdict | What the sources say |
|---|---|---|---|
| 1 | eMudhra: 8 keys, 60M+ certs at risk | Inflated | Keys trivially recoverable; about 30,000 certs need migration (eMudhra, Bugzilla comment 19); 60M appears in no source; no forged certs reported |
| 2 | SBI: 3,897 customers' data on the dark web | Confirmed | Regulation 30 filing, Oct 21 |
| 3 | Rajasthan Police, 70,000 records | Unverified | Only a forum claim; **deliberately not in TwoToe's pack** |
| 4 | PHP "php2shell", CVSS 9.2, patch or go offline | Partly | CVE-2026-109618/-109619, CVSS v4.0 9.2; CISA's offline advice is for 8.1 and older or systems that cannot update; not in KEV |
| 5 | GitLab CVSS 10.0 unauthenticated RCE | Confirmed | CVE-2026-110264, fixed in 7 branches on Oct 21 |
| 6 | Node.js Brotli RCE + TLS bypass, 10 CVEs | Confirmed | 10 CVEs, 4 High; fixed in 22.23.4, 24.22.1, 26.12.1 |
| 7 | Railway breached, env vars decrypted | Confirmed (wording) | "may have" accessed encrypted env vars, "some" decrypted, a subset of users |
| 8 | OpenCode provider keys exposed | Confirmed, wrong date | Disclosed Oct 17, not Oct 21; 1.4% of Console users |
| 9 | LiteLLM 1.107.0 on PyPI was malware | Confirmed | 1.106.2 is the last safe release |
| 10 | Plex2Shell exploited, KEV deadline Oct 23 | Partly | In KEV since Oct 20; two CVEs due Oct 23, two due Nov 3 |

"About 2,000x off": 60,000,000 / 30,000. Full research: [`docs/research/research-incidents.md`](../research/research-incidents.md). Every advisory fact was re-fetched from its source on Oct 23 (pack 2026.10.23-1); details and open items in [`docs/VERIFY.md`](../VERIFY.md). **Re-check on publish day.**

Source links (all fetched Oct 23):
- Railway: https://blog.railway.com/p/security-disclosure-wednesday-october-21st
- Node.js: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- PHP: https://www.php.net/ and https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching
- GitLab: https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/ and https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-4-2-released/
- Plex: https://forums.plex.tv/t/important-security-update-for-plex-media-server-v1-43-2-and-earlier/942319 and https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- LiteLLM: https://docs.litellm.ai/blog/security-incident-oct-21-2026 and https://www.wiz.io/blog/litellm-compromised-steals-credentials
- eMudhra: https://bugzilla.mozilla.org/show_bug.cgi?id=2083449, https://scotthelme.co.uk/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds/, https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2
- OpenCode: https://thehackernews.com/2026/10/opencode-console-breach-may-have.html and https://www.infosecurity-magazine.com/news/opencode-breach-openai-anthropic/
- SBI: https://internetfreedom.in/sbi-told-investors-its-data-breach-doesnt-matter-what-about-the-3-897-customers-it-affected/
- CISA KEV feed: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

## 5. Numbers you can quote (each with its source)

| Number | Value | Source |
|---|---|---|
| Matcher accuracy | 20 of 20 expected findings, 0 false positives, precision and recall 100% | `eval/RESULTS.md` section 1 |
| Fixtures | 24 synthetic, hand-written ground truth, canary in every `.env` | `eval/fixtures/`, `eval/gen-fixtures.ts` |
| Canary hits | 0 in every eval round | `eval/RESULTS*.md` section 4 |
| Egress during evals | 127.0.0.1 only | `eval/RESULTS.md` section 4 |
| gemma4:e4b writer time (v4) | median 9.0 s, p90 13.4 s, 19.0 tokens/s | `eval/RESULTS.md` section 2 |
| gemma4:e2b (v4) | median 2.9 s, 65.0 tokens/s, 23 of 94 drafts rejected (24.5%) | same |
| qwen3:4b (v4) | median 12.6 s, 12.5 tokens/s, 0 of 80 rejected | same |
| Kitchen-sink fixture end to end (e4b, v4) | median 26.9 s for 4 findings | `eval/RESULTS.md` section 3 |
| Ungrounded tokens in any final brief | 0, in every round | all `eval/RESULTS*.md` |
| v1 drafts with an ungrounded token | 141 of 405 (caught by the validator) | `docs/post/build-log.md` Gate 6 |
| v2 drafts with an ungrounded token | 0 of 384 | build log Gate 6b |
| v3 drafts still containing the full hidden summary | 87 | build log Gate 6c |
| e4b copying in v4 | action word for word in 79 of 95 items; "why" copied from the shown summary in 35 of 95; tail "take a deep breath." in 46 of 80 briefs | build log Gate 6d; reproduce with `pnpm tsx scripts/blog/copy-rate.ts` |
| Brief time after `doctor` warm-up fix | 45 s before, 29.5 s after | build log "Phase 8 prep" |
| Crash test (Oct 23 run) | workflow 89.9 s; model answered at 53.2 s; worker killed at +61.2 s (8 s into a 20 s delay); 3 activities done before the crash; 1 retried; **0 executed twice**; model result reused from cache (1 call, 1 reuse) | `terminal-crash-test.png`; script `packages/worker/scripts/crash-test.ts` |
| Real nightly scan (owner's PC) | 9,246 files, 1.3 s, 49 checks | measured Oct 23; aggregate only, no paths |
| Dogfood | TwoToe's first real run warned it was itself on an unpatched Node (24.11.0; fix is 24.22.1), and that Node trusted the eMudhra root | build log "The dogfood moment" |
| Tests | 422 passing (core 238, writer 77, worker 14, cli 47, card 15, eval 31) | `pnpm test` |

Eval history per model (share of drafts rejected): gemma4:e4b 43% / 48% / 26% / 0%; gemma4:e2b 96% / 63% / 37% / 24.5%; qwen3:4b 55% / 61% / 63% / 0% (v1 to v4). Chart: `eval-rejections-by-round.png`.

## 6. The honest story ("What Broke")

Four eval rounds; each fix was right about the symptom, and the drafts pointed at the real cause:
- **v1:** models restated checklist facts in the FYI section, added line-1 actions that should not exist, and copied the spec's own example ("bump Node to 24.22.1") into a brief about OpenCode. 141 drafts had an ungrounded token; the validator caught all of them.
- **v2:** zero inventions, but more length rejections: models copied the full advisory summary word for word and ignored the trimmed one beside it.
- **v3:** the full summary was hidden, yet 87 drafts still contained it. The leak was in the allowed-token list, which carried the whole summary sentence.
- **v4:** with that fixed, gemma4:e4b and qwen3:4b had no rejections. **The catch:** the models got closer to the facts they were handed, not looser checks (79 of 95 e4b actions are the template's words).

Bugs found by using the thing (all fixed, all in the build log):
- The `doctor` pre-warm loaded the model with a different context size, so the first brief reloaded it (45 s vs 29.5 s). Found from a screenshot.
- Temporal's history held the home path and the PC name (schedule input, activity results, worker identity), visible in the Temporal UI. The test meant to catch it could never fail (it searched payload bytes as JSON). Both fixed; the fixed test found the config path.
- Nested egress guards left the process unguarded after uninstall (no shipped command nested them; a capture script did).
- The hidden nightly tasks died on the first stderr line (PowerShell 5.1) and opened two terminal windows at logon (Windows Terminal ignores the hidden flag).
- The crash test failed once, and the bug was in the test (it expected one model call; a validator retry legitimately needed two).
- The spec's own terminal mockup said "Thu Oct 23"; Oct 23, 2026 is a Friday.

Known limits to state: the validator checks tokens, not meaning (a grounded version used in the wrong direction, or "you are not affected", would pass). The same person wrote the matcher and the ground truth. `kev-recent` has no fixture.

## 7. Sentry

- Org slug `none-0un`. Demo trace: https://none-0un.sentry.io/explore/traces/trace/c09da4f7d9c1462b8ac78c72d8048a65/ (needs a login to that Sentry org).
- The trace: `twotoe.brief` -> scan -> match -> `invoke_agent TwoToe` -> `chat gemma4:e4b` (attempt 1, 42.43 s, 2.9K tokens in, 472 out) -> `execute_tool groundingValidator` (rejected, shown red) -> `chat gemma4:e4b` (attempt 2, 24.88 s) -> validator (passed) -> assemble. 9 spans, 1.12 min.
- **Honesty:** the first rejection was forced for the demo (`--force-reject-first`); the validator's own output on that span says "forced rejection for the demo trace (draft was otherwise checked as usual)". Prompts/responses are attached only in demo mode on fixtures.
- Optional stronger trace (sends one trace to the Sentry project in `~/.twotoe/config.json`): `pnpm tsx packages/cli/src/index.ts brief --fixture eval/fixtures/f06-railway-user --model gemma4:e2b --telemetry` produced a natural rejection locally (2 rejections, then the template).
- Telemetry config lives only in `~/.twotoe/config.json` (`telemetry.sentry`, `telemetry.dsn`), never env vars. See the README "Telemetry" section.

## 8. Images and clips (`docs/post/images/`)

All are real runs on synthetic fixtures, captured Oct 23. Regenerate with [`scripts/blog/`](../../scripts/blog/README.md). Upload each to DEV in the editor and replace the path with the uploaded URL.

| File | Shows | Suggested section |
|---|---|---|
| `cover-1000x420.png` (`cover-2000x840.png` 2x) | Card header: sloth, "Good morning.", line 1 | Cover image |
| `terminal-brief.gif` / `.mp4` | `pnpm twotoe brief` typed, model wait (sped up, captioned), real output | What I Built / Demo |
| `terminal-brief.png` | Same output, still | Demo |
| `terminal-brief-no-llm.png` | Template-only brief (no model) | How I Built It |
| `card-phone-light.png`, `card-phone-dark.png`, `card-phone-full-light.png` | Morning card at 360 px | What I Built |
| `card-kitchen-sink-light.png`, `card-kitchen-sink-dark.png` | Full card: checklist, evidence, network ledger, run stats | Demo |
| `card-railway-light.png`, `card-clean-night-light.png` | Other two examples (Railway user; "Nothing needs you today.") | Demo |
| `terminal-explain.png` | `explain plex`: evidence rows, CVEs, sources | How I Built It |
| `terminal-ask.png` | `ask "why does the Node one matter?"`: grounded answer, validator passed | How I Built It |
| `terminal-doctor.png` | `doctor`: setup checks on the owner's PC (no paths) | optional |
| `eval-rejections-by-round.png` | Chart: rejected drafts per round per model | What Broke |
| `terminal-crash-test.png` | Crash test summary (0 executed twice) | Lazy Payoff / Temporal |
| `crash-test-timeline.gif` / `.mp4` | Temporal UI timeline during a real crash run, sped up ~8x | Lazy Payoff / Temporal |
| `temporal-crash-test-timeline.png` | Temporal UI still: activity retried (attempt 2) | Temporal |
| `sentry-agent-activity-rejected.png` | **Best Sentry shot:** Agent Activity, first validator call red, its output beside it | Sentry |
| `sentry-validator-output.png` | Waterfall with the rejected span selected | Sentry |
| `sentry-validator-attributes.png` | `twotoe.validator.rejections: 1` on the span | Sentry |
| `sentry-chat-output.png` | Model span: gemma4:e4b, tokens, the draft | Sentry |
| `sentry-waterfall.png`, `sentry-trace-waterfall.png`, `sentry-trace.png` | Full trace waterfall (clean / owner's own screenshots) | Sentry (pick one) |

## 9. Not in this repo: things you cannot see from a clone

These are gitignored, live on the original machine, or sit in someone's account. Everything the post needs has a committed substitute, noted per item.

| Item | Where it lives | Needed for | What to do |
|---|---|---|---|
| Raw Claude Code session file | Original machine (`~\.claude\projects\<project-id>\*.jsonl`) | Nothing: a redacted export is committed | **Committed:** `docs/blog/agent-session.md` (conversation) and `docs/blog/agent-session-full.md` (every tool call, results trimmed), made by `scripts/blog/export-session.ts` with home paths, user and host names, emails, DSNs (including any fragment of the key, org id or ingest host) and keys redacted. Only the owner can re-export (the raw file stays on their machine). |
| `~/.twotoe/config.json` (Sentry DSN, telemetry switch, scan roots) | Original machine, user home | New Sentry traces | Not needed for the post: the Sentry screenshots are committed. For new traces, create your own Sentry project and put `{"telemetry": {"sentry": true, "dsn": "<your DSN>"}}` in your own `~/.twotoe/config.json`. Never commit a DSN. |
| Sentry account and org `none-0un` | Owner's Sentry login | Opening the trace link | Ask the owner for access, or use the committed `sentry-*.png`. |
| GitHub repo admin | Owner | Making the repo public, CI logs | The repo was **private** on Oct 23 (404 when signed out). It must be public before submitting. |
| DEV account | Whoever publishes | Publishing | The DevRelay connector (to stage a DEV draft) failed to connect in the build session; paste the post into the DEV editor by hand. |
| DigitalOcean account, `.tech` domain | Not set up | Live demo link, two prize categories | Optional. Steps in `docs/DEPLOY.md`. Claim the domain at hacktoberfest.com/my/promos. |
| `apps/card/dist/` (gitignored build output) | Built locally | `twotoe card`, `scripts/blog/card-shots.ts`, `chart.ts` | `pnpm --filter @twotoe/card build` |
| `eval/out/` (gitignored, rewritten by each eval run) | Built locally | Copy-rate numbers, blind kit | A frozen copy of the v4 run is committed as `eval/out-v4/`; the scripts fall back to it. |
| `.twotoe-demo/` (gitignored) | Created by the crash test | Nothing | Regenerated by each crash-test run. |
| `scripts/blog/.work/` (gitignored) | Created by the blog scripts | Nothing | Scratch: Chrome profiles, frames. |
| Local models | Ollama on the owner's PC (`gemma4:e4b`, `gemma4:e2b`, `qwen3:4b`) | Any model run | `ollama pull gemma4:e4b` (and the others for the bake-off). |
| Temporal dev server data, logs, scheduled tasks | Owner's PC (`~/.twotoe/temporal.db`, `~/.twotoe/logs/`, tasks `TwoToe-*`) | Nightly run on that PC | Not needed for the post. On another PC: `pnpm twotoe sleep --taskscheduler`. |
| Raw Sentry screenshots (uncropped) | Owner's temp folder | Nothing | Cropped versions are committed. |
| Stopwatch baseline, blind readers' answers | Not done | Lazy Payoff, What Broke | See section 10. |
| Real-machine nightly result for "I fixed k things" | Owner's PC after the 03:00 run (`~/.twotoe/briefs/latest.json`) | Lazy Payoff | The owner reads it and reports **aggregate counts only** (no paths, no findings detail). |

## 10. Before publishing: checklist

1. **Stopwatch baseline:** time how long it takes to manually triage the viral list against your own machine, *before* looking at TwoToe's real-machine output. Put minutes in The Lazy Payoff.
2. **Blind readability check (optional but strong):** give [`eval/blind/sheet.md`](../../eval/blind/sheet.md) to two people, collect "A / B / same" per pair, save as JSON like `{"reader1": ["A","B","same","A","B","A"], "reader2": [...]}`, run `pnpm tsx eval/blind-kit.ts --score answers.json`, report the result whatever it says. Do not open `eval/blind/.key.json` first.
3. **Real-machine numbers:** the owner's nightly brief (aggregate: how many things needed action, how long it took).
4. **Rewrite the post in your own voice.** Check DEV's current guidelines on AI-assisted posts before publishing, and keep "built with Claude Code" visible either way.
5. **Re-verify advisory facts on publish day** (section 4 links; `pnpm twotoe pack --refresh` for KEV).
6. **Make the repo public** and check that CI is green on GitHub.
7. **Optional:** deploy the card (DigitalOcean + `.tech`) and add the link; then claim those two categories.
8. **Tag and push:** `git tag v1.0-submission` then `git push origin main --tags`. **No pushes after this** until winners are out (or note them in the README).
9. **Publish** with tags `devchallenge, hf26challenge`, cover image `cover-1000x420.png`, before Oct 25, 12:29 PM IST to be safe.

## 11. Writing rules

- Every number traces to `eval/RESULTS*.md`, the build log, or a source link. If a number is not measured, cut the sentence.
- No em dashes anywhere (project rule).
- Do not repeat the viral post's inflated claims as fact; quote only to correct.
- Real-machine results: aggregate counts only, never paths or key names.
- Say what was forced (the demo Sentry rejection) and what is not built (Mastra, ElevenLabs, live demo if not deployed).

## 12. Where everything is

| What | Where |
|---|---|
| Spec (authoritative) | `docs/SPEC.md` |
| Working agreement (hard rules) | `CLAUDE.md` |
| Decisions and their reasons | `docs/DECISIONS.md` |
| Fact verification log | `docs/VERIFY.md` |
| Build log (all post raw material, per gate) | `docs/post/build-log.md` |
| Structured draft | `docs/post/draft.md` |
| Agent session (redacted) | `docs/blog/agent-session.md`, `docs/blog/agent-session-full.md` |
| Sample full post | `docs/blog/dummy-post.md` |
| Recording plan (video, re-recording) | `docs/post/recording-plan.md` |
| Research (challenge rules, incidents, competition, red team) | `docs/research/` |
| Eval results v1 to v4 | `eval/RESULTS-v1.md` ... `eval/RESULTS.md` |
| Blind readability kit | `eval/blind-kit.ts`, `eval/blind/` |
| Image scripts | `scripts/blog/` |
| Deploy guide | `docs/DEPLOY.md` |

Quick start on a fresh machine (Windows): install Node 24.22.1+, `corepack enable --install-directory (npm config get prefix) pnpm`, Ollama + `ollama pull gemma4:e4b`, optionally `winget install Temporal.TemporalCLI` and `winget install Gyan.FFmpeg`; then `pnpm install`, `pnpm test`, `pnpm twotoe doctor`, `pnpm twotoe brief --fixture eval/fixtures/f22-kitchen-sink`.
