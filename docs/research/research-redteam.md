# TwoToe spec red-team (2026-10-22)

Reviewer stance: skeptical senior engineer + skeptical DEV judge. Read SPEC.md (all 1523 lines) and CLAUDE.md. No project files modified.

Verified externally today:
- DEV challenge API (Week 3, id 81): `ends_at = 2026-10-25T06:59:00Z`, i.e. **Oct 24 11:59 PM PDT = Oct 25 12:29 PM IST**. The prose on the same page says "October 25: Submissions due at 11:59 PM PDT". Week 2's ends_at matched its prose; Week 3's does not.
- Same page: "you can only win once per challenge"; each week is described as its own challenge ("Every challenge is a fresh start"). A Week 1 win does not formally block Week 3.
- Ollama library: `gemma4:e2b` (4.6 to 7.5 GB) and `gemma4:e4b` (6.6 to 9.5 GB) exist, plus `gemma4:cloud` / `31b-cloud` tags. Gemma 4 has configurable thinking. Recommended sampling is temp 1.0.
- Temporal TS SDK `ScheduleSpec.timezone` is the field name (IANA, default UTC). `catchupWindow` default is **1 year** (min 10s) per current docs; it only matters when the Temporal *service* was down/unable at the scheduled time.
- Third-party reports: grammar-constrained JSON plus Gemma 4 thinking has had bugs (vLLM bypasses grammar when thinking disabled; Ollama 0.34.4 changed think-then-JSON behavior). Treat as VERIFY on your Ollama version.

---

## A. Fatal / high-risk flaws

### A1. Deadline is probably a day earlier than the spec says (section 0.2, 16, 20). FATAL if wrong.
The challenge API's `ends_at` is Oct 25 12:29 PM IST, not Oct 26 12:29 PM IST. The spec's own plan (Phase 8 "Oct 25 evening", "Freeze Oct 25 9 PM IST at the latest") would miss that. Your personal Oct 25 morning IST freeze is only safe if it really is morning.
**Fix:** treat Oct 25 11:00 AM IST as the hard publish time. Rewrite 0.2 and the 16 table. Post draft must exist by Oct 24 night IST. Ask DEV in the challenge thread only if you have time; do not plan around the later date.

### A2. Scope is ~1.5x the hours that exist (section 16).
Spec says 35 to 40 h of MUST+SHOULD. From Oct 22 evening to Oct 25 ~10 AM IST is ~63 wall hours. After 3 nights of sleep, meals and Windows friction, a realistic solo budget is **26 to 30 focused hours including the post**. The plan also hides compute: 24 fixtures x 3 models x 5 runs = 360 model calls; on a CPU-only laptop at ~1 to 2 min/call (prefill of a 2 to 3k token prompt plus ~400 output tokens, plus retries) that is **6 to 12 hours of compute**, which collides with your dev loop.
**Fix:** cut list in section D. Run the eval overnight while you sleep (and say so; it is on-theme).

### A3. The model barely earns its place (sections 4.1, 10, 14.4). Judge risk on "open-source AI at its core".
By design the matcher decides everything, the template (10.6) produces a complete brief, `line1`/`line2` are assembled by code, and the model only rephrases `action`/`why`. The spec itself anticipates "if the template wins the blind read". A judge can fairly say: "the AI is a thesaurus bolted onto a rules engine; delete it and nothing changes." The challenge text says the open pieces should be "what makes your project work".
**Fix (pick one, ~3 to 4 h):** give Gemma a bounded job that code genuinely cannot do well, and validate it the same way:
- **Entity resolution for KEV and installed software.** Inventory installed Windows programs read-only from the registry Uninstall keys (`reg.exe query ... /s`, DisplayName/DisplayVersion/Publisher). Each night, Gemma maps new KEV entries (`vendorProject`, `product`, `shortDescription`) to inventory items ("Plex Media Server" vs "plexinc pms", "Node.js" vs "node"). Output schema: `{kevCve, inventoryItemId, reason}` chosen from enumerated IDs only (enum in the JSON schema), so it cannot invent either side. Code then caps confidence at `possible` (KEV has no version ranges) unless a pack entry adds ranges. This is exactly "reads things overnight", makes the tool useful next week, and gives you a real precision/recall number for the model (hand-label ~40 KEV/program pairs).
- Keep the phrasing job too, but the post's AI claim rests on the resolution job.

### A4. "The run happens when the laptop wakes, before you do" is false as written (section 11.3 Schedule, 18).
- Temporal cannot wake a sleeping laptop. Catch-up only means "the schedule fires when the service is next able to". On Modern Standby/S3 the dev server and worker are suspended; on resume they continue and the missed 03:00 action fires. That is *when you open the lid*, i.e. after you wake. The brief arrives 1 to 3 minutes later on CPU.
- `catchupWindow: "6h"` is actively harmful: the default is 1 year. If the laptop is closed from 23:00 to 09:30 (6.5 h after 03:00) the night's run is silently skipped. Use something like `"20h"`.
- `temporal server start-dev` is in-memory unless `--db-filename` is passed. A reboot loses the schedule. The logon task must pass `--db-filename` and the worker task must start after the server is reachable.
- Also: the worker must be up, Ollama tray app must be up (it starts at logon), and Task Scheduler defaults include "Start only if on AC power" and "Stop if going on batteries". Laptops at 3 AM on battery will not run.
- `WakeToRun` on Modern Standby (S0ix) machines is unreliable for user tasks; check `powercfg /a` and `powercfg /waketimers` before claiming it in the post.
**Fix:** reword the claim to "if the laptop slept through 3 a.m., the run fires when you open it, and the brief is ready in ~{{s}} seconds". Set `catchupWindow: "20h"`, `timezone: Intl.DateTimeFormat().resolvedOptions().timeZone`, Task Scheduler settings `-AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable`, and pass `--db-filename`.

### A5. "Toast at 7 a.m." does not exist in the pipeline (sections 2.3 #8, 4.1, 11.3, 18).
`persistAndNotify` runs at the end of the 03:00 run. The toast fires at 03:01 and sits in Action Center. Video beat 0:32 ("7 a.m.: two lines") is not what the code does.
**Fix (cheap, and real Temporal value):** after persist, `await sleep(msUntil(07:00 local))` in the workflow (a durable timer), then a `notify` activity. That is something cron cannot do cleanly, it survives reboot, and it is a better Temporal story than catch-up. Also the notify task must run "only when user is logged on" or the toast is invisible.

### A6. Crash-test metric "executed twice must be 0" will be false (section 11.3 Crash test).
Activities are at-least-once. The model activity killed at 8 s into a 20 s delay *will* run again (attempt 2). The on-disk cache helps only if the model call finished before the kill. Also with `heartbeatTimeout: 30s` the retry starts up to 30 s after the kill.
**Fix:** define the metric precisely: "completed activities re-executed: 0; in-flight activity retried: 1; Ollama calls whose result was recomputed: 0 if killed after the call returned". Run two variants (kill before and after the model returns) so the cache claim is actually demonstrated.

### A7. Unverifiable or fragile pack facts gate the whole honesty story (sections 7.2, 7.3, Rule 8).
Several entries are marked VERIFY (GitLab fixed version, PHP KEV status, Node 20 EOL wording, Plex ProductVersion format). Rule 8 forbids hardcoding unverified facts, so any source that blocks WebFetch (Bugzilla, Railway blog, vendor pages) turns a MUST into a hole on Day 1.
**Fix:** time-box verification to 90 minutes in Phase 0. Drop both GitLab entries (no Windows install, Docker-only, fixed version is VERIFY) unless verified in that box. Anything unverified ships as `fyi` with "unverified" wording, never as `definite`.

### A8. Sentry "one trace per run" is not trivial under Temporal (section 11.4).
Workflow code runs in a deterministic V8 sandbox; you cannot call Sentry there. Activities run in the worker process, each as a separate invocation, so you get disconnected transactions unless you propagate trace context (Temporal's samples-typescript has a Sentry interceptor pattern). Budget 3 h is optimistic if you also want the rejected-attempt waterfall.
**Fix:** instrument only inside `writeBriefWithValidation` (one `gen_ai.invoke_agent` span with `gen_ai.chat` children and a validator `gen_ai.execute_tool` span). That single activity is the story the judge wants. Skip cross-activity tracing.

---

## B. Product weaknesses a judge will notice

1. **"Useless next week."** The pack is the Oct 21 news cycle (7.2). Without refresh, TwoToe is a one-week art piece. KEV matching (7.5) only compares against node/php/plex/gitlab plus package names, so it almost never fires: KEV is mostly Microsoft, Chrome, Ivanti, Fortinet, etc., none of which are inventoried. **Fix:** registry installed-programs inventory (A3) + KEV entity resolution, and a documented, schema-validated pack format with a `twotoe pack add <file>` and CI that validates PRs. It is Hacktoberfest; "send a pack PR when the next breach week hits" is the on-theme open-source story.
2. **"Why not osv-scanner / pip-audit / npm audit?"** Answer it in the post explicitly, with a table: those tools cover package CVEs well, but by default query `api.osv.dev` with your package list (egress), and do not cover runtimes on PATH, Plex/desktop apps, IOC files, env-key credential exposure (Railway/OpenCode), trust stores, or produce a 2-line decision. Optional stretch: ingest `osv-scanner --offline` JSON as another inventory source. Do not claim TwoToe replaces them (2.4 already says so; promote it).
3. **Eval circularity.** 24 fixtures written by the same person (or agent) who wrote the matcher, with targets of 100%/100% (14.1). Judges discount this. **Fix:** say it plainly; write 6 to 8 "held-out" fixtures *before* matcher code (or have a separate agent write them from the pack only), and report those separately.
4. **"What broke" may be empty.** With a JSON schema, temp 0.2 and fixed seed 42 (10.1), Gemma may almost never emit an ungrounded token, and `--runs 5` with a fixed seed gives near-identical drafts (runs are meaningless). The "star of the post" then has no material. **Fix:** vary seed per run; build the adversarial validator corpus (E2) so the validator story does not depend on the model failing.
5. **Two lines is fine, but "Checked 412 things" is vanity.** "Things" is vague. Prefer "Checked 6 projects, 3 Python envs, 2 runtimes, 1 app".
6. **Brand.** "TwoToe" reads as two-toed sloth only once explained, and the folder is literally `TWOTOW` (typo risk in repo/domain). Add a one-line tagline everywhere: "Two lines. Two toes. Zero secrets sent." Check `twotoe.tech` availability before writing it into 17 places.
7. **"0 secrets left this machine" over-claims (2.5, 10.7).** TwoToe can only attest to its own process. Reword: "TwoToe sent 0 bytes of your data off this machine". See also C5 on cloud model tags, which can make even that false.
8. **Partner sprawl reads as tick-box.** Gemma + Temporal is a coherent pair. Sentry, .tech, Render/DO each cost hours for $100 shots. Since you can win only once, every partner hour is an hour off Writing Quality, the heaviest criterion.

---

## C. Security / privacy holes in the design

### C1. Env scanner leaks fragments of multi-line secrets (8.2.6). Real bug.
Quoted multi-line values (PEM keys, service-account JSON) put base64 lines on their own lines. A base64 line ending in `=` or `==` (padding) has `eq > 0`, the left side matches `/^[A-Z_][A-Z0-9_]*$/i` (case-insensitive accepts any alnum run starting with a letter or underscore), and **a slice of a private key is stored as a "key name"**, then flows into Inventory, evidence, prompts, cache, briefs.
**Fix:** track quote state (a line that opens `"` or `'` without closing it starts a multi-line value; skip until the closing quote); require uppercase keys (`/^[A-Z_][A-Z0-9_]{0,63}$/` without `/i`); reject keys with high character entropy or length > 64; add fixtures with a PEM block and a JSON blob whose lines contain the canary *and* `=` padding.

### C2. YAML / JSON parse errors echo values.
`docker-compose*.yml` `environment:` parsing via `yaml` loads values, and parse errors include source snippets in `error.message`. If that message hits a log, scanner warning, Sentry breadcrumb or `brief.meta`, the canary leaks.
**Fix:** wrap every parser so errors are replaced with `{file, line, code}` only; never forward `err.message`. Add a test: malformed compose file containing the canary, assert canary not in any output.

### C3. Spawning user binaries can execute user-controlled code (8.2.1, 8.2.2, 8.2.9).
- `node -e <script>` to read `tls.rootCertificates` honors `NODE_OPTIONS` (e.g. `--require ./x.js`) from the environment: that executes arbitrary user code. Also the Node bundled store is compiled in, so it is a pure function of the version; you do not need to spawn at all. Map version to "bundled store includes emSign" and separately note `NODE_EXTRA_CA_CERTS` / `--use-system-ca` key presence.
- `php -v` loads `php.ini` and extension DLLs. Use `php -n -v`, or better, read the PE `FileVersion` of `php.exe` (no execution).
- **PATH/CWD hijack on Windows:** libuv's executable search checks the current directory before PATH. If the cwd is a scanned project root, a `node.exe` or `php.exe` dropped in a cloned repo runs. Resolve absolute paths first (`where.exe`), always pass `cwd: os.tmpdir()` or `~/.twotoe`, and pass a minimal `env` (strip `NODE_OPTIONS`, `PHPRC`, `PHP_INI_SCAN_DIR`).

### C4. CLAUDE.md hard rule 1 contradicts the spec.
"Never read ... env VALUES" vs. the spec needing `%LOCALAPPDATA%`, `%APPDATA%`, `%ProgramFiles%`, `PATH`, `SENTRY_DSN`, `TWOTOE_*`. Claude Code will either violate the rule or stall.
**Fix:** reword: "Never read values from env *files* or secret-bearing process env vars. Allowed process env reads: USERPROFILE, APPDATA, LOCALAPPDATA, ProgramFiles, ProgramFiles(x86), PATH, PATHEXT, TWOTOE_*, SENTRY_DSN (only when telemetry is on)." Requires your approval since it edits CLAUDE.md/spec.

### C5. Egress guard has blind spots (15.1).
- Patching `globalThis.fetch` misses `http`/`https`/`net`, the Sentry Node transport, and Temporal's **Rust core** gRPC (native, invisible to JS). The ledger is self-reported and partial.
- **Ollama cloud models:** `gemma4:cloud` exists. If `TWOTOE_MODEL` is a cloud tag (or the local Ollama is configured to forward), the request goes to `127.0.0.1:11434`, the ledger shows loopback, and your findings leave the machine. **Fix:** in `doctor` and before each run, call `/api/show` and refuse models that are remote/cloud (`-cloud` suffix or `remote_host` set).
- **Fix for the ledger:** hook at socket level (`net.Socket.prototype.connect` or `diagnostics_channel` `net.client.socket`) and assert loopback for Temporal at startup. Cheap independent witness for the post: snapshot `Get-NetTCPConnection -OwningProcess <pid>` during a run and show remote addresses match the ledger.

### C6. Sentry leaks the machine identity (11.4).
Sentry Node sends `server_name` (= `os.hostname()`, often `SOUMYA-LAPTOP`) and OS/device contexts by default; `sendDefaultPii: false` does not remove `server_name`. Breadcrumbs capture console output and HTTP URLs.
**Fix:** `serverName: "twotoe"`, drop `contexts.device`/`os` in `beforeSend*`, disable console breadcrumbs, and run the redaction regex on the whole serialized event.

### C7. Redaction regex will miss real forms (5.4 #5, CLAUDE.md rule 6).
Must cover: `C:\Users\x`, `C:/Users/x` (fast-glob returns forward slashes), lowercase `c:\users`, **JSON-escaped `C:\\Users\\x`**, 8.3 short names (`SOUMYA~1`), `\\?\C:\Users\x`, `file:///C:/Users/x`, URL-encoded, and OneDrive `C:\Users\x\OneDrive - Org`. Also the bare username elsewhere (hostname, git config). Redact on the final serialized string, plus a test that greps outputs for `os.userInfo().username`.

### C8. The token validator can be satisfied while lying (10.5). This is the most interesting finding for the post.
All of these pass a token-membership check:
- **Swapped direction:** "Upgrade Node from 24.22.1 to 24.22.0" (both tokens allowed).
- **Negation / dismissal:** "Plex 1.43.3.10860 is not affected; no action needed." "You can ignore the Railway notice."
- **Confidence inflation/deflation:** "Your LiteLLM environment is compromised" for a `likely` pin-only finding; "might" for a `definite` IOC hit.
- **Cross-finding borrowing in line 1:** rule 7 checks line1 tokens against the *union* of the top-2 findings, so "bump Plex to 24.22.1" passes.
- **Dangerous advice with no risky tokens:** "Set NODE_TLS_REJECT_UNAUTHORIZED=0 until you update" (only `0` is a digit, single-digit numbers are not checked), "disable the certificate check", "reinstall litellm" (no version, installs latest, possibly bad).
- **Uncaught entities:** the vendor list is 13 names. "Microsoft patched this", "Docker", "PyPI", "Windows", "pip" are not on it. Single-digit counts ("rotate 3 keys"), words ("all", "every", "only", "three"), relative dates ("yesterday") are not checked.
- **Prompt injection via evidence:** evidence basenames are user-controlled (any cloned repo's folder or file name) and are both sent to the model *and added to allowedTokens* (9.1), so an attacker string becomes pre-approved text.
- **False rejections:** "Node 24" (major only) is not in allowedTokens (`24.22.1` is), so normal phrasing gets rejected and inflates fallback rate.
**Fixes (in order of value):**
1. The model does not author `action`. `action` stays the canonical template string (code). Model writes `why` and line-1 phrasing only. Removes the most safety-critical free text.
2. `line1Actions` becomes `[{findingId, text}]` and each is checked against that finding's tokens only.
3. Structural checks: if both found and fixed versions appear, require order found-before-fixed; negation lexicon (`not affected`, `no action`, `ignore`, `safe to`, `don't need`) rejected for any non-fyi item; confidence lexicon per tier (`compromised`/`confirmed` only for definite IOC; `might/may` forbidden for definite); banned-advice list (`TLS_REJECT_UNAUTHORIZED`, `disable`, `verify=False`, `--insecure`, `-k`, `curl | sh`, `pip install` without `==`).
4. Use the KEV snapshot's `vendorProject` list (hundreds of vendors) as the vendor lexicon, and reject any number (including single digits) or number word not in allowedTokens.
5. Evidence goes to the model as opaque labels (`E1`, `E2`); code substitutes display paths after validation. Never add raw basenames to allowedTokens.
6. Normalize version tokens so a major or major.minor prefix of an allowed version is allowed.

### C9. IOC and trust-store edge cases (8.2.4, 8.2.9).
- Windows lazily populates `Cert:\LocalMachine\Root` from Windows Update; absence does not mean untrusted. The meaningful signal is presence in `Cert:\LocalMachine\Disallowed`. Simplify: Disallowed present means protected, otherwise `possible`.
- Defender may quarantine `cook.pth` between stat and hash: handle ENOENT as "seen then removed by AV" (still `definite`, note it).
- Reading `certifi/cacert.pem` as text is safe (no execution). Alternative that needs no reading: certifi version from dist-info folder name versus the release that removed emSign.

### C10. Plex version read (8.2.8).
`VersionInfo.ProductVersion` may include a hash suffix or differ from FileVersion. Safer and no PowerShell: `reg.exe query "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "Plex Media Server"` and read `DisplayVersion` (also check WOW6432Node and HKCU). Parse leading `\d+\.\d+\.\d+\.\d+`. This is also the same code path as the installed-programs inventory in A3.

---

## D. Concrete fixes ranked by impact per hour

| # | Change (spec section) | Hours | Impact |
|---|---|---|---|
| 1 | Re-date deadline to Oct 25 12:29 PM IST; publish by Oct 25 ~10 AM IST (0.2, 16, 20) | 0.1 | Avoid disqualification |
| 2 | Cut list below; rewrite 16 table to ~26 h | 0.3 | Makes shipping possible |
| 3 | `catchupWindow: "20h"`, `timezone`, `--db-filename`, battery settings, honest wake wording (11.3) | 0.5 | Stops silent skipped runs and a false claim |
| 4 | Env scanner multi-line/quote fix + uppercase keys + PEM canary fixture (8.2.6, 15) | 1 | Fixes a real secret leak |
| 5 | Model does not author `action`; per-finding line1; order/negation/confidence/banned-advice checks; opaque evidence labels (10.2, 10.5) | 3 | Closes validator holes, gives "What broke" material |
| 6 | Adversarial validator corpus (E2) | 1.5 | Star of the post regardless of model behavior |
| 7 | Durable 07:00 timer + notify activity (11.3) | 1 | Makes the toast true and gives Temporal a non-cron job |
| 8 | Spawn hygiene: absolute exe path, safe cwd, stripped env, `php -n`, no `node -e` (8.2) | 1 | Closes code-exec path |
| 9 | Refuse Ollama cloud/remote models in `doctor` and pre-run (10.1, 15.1) | 0.5 | Keeps the privacy claim true |
| 10 | Registry installed-programs inventory + Gemma KEV entity resolution with enum-constrained output (A3) | 4 | Model earns its place; not one-week-only |
| 11 | Seed varies per run; `think: false`; verify `format` + Gemma 4 on your Ollama version (10.1) | 0.3 | Meaningful eval runs, lower latency |
| 12 | Sentry: `serverName`, context stripping, single-activity spans (11.4) | 1.5 | Partner shot without leaking hostname |
| 13 | Redaction regex for all path forms + username grep test (5.4) | 0.5 | Rule 6 actually holds |
| 14 | CLAUDE.md rule 1 clarification (C4) | 0.1 | Prevents agent stalls |

### Cut list (drop entirely)
- macOS/Linux probe branches, `--launchd`, ubuntu CI matrix (keep windows-latest only).
- GitLab entries (both) unless verified in the 90-min box; f19.
- Git-for-Windows CA bundle and PowerShell root-store subject search (replace with Disallowed check or drop eMudhra store checks to Node-version + certifi version).
- docker-compose `environment:` parsing (keep `.env*` only). Docker images: keep only if Docker answers in <3 s, no extra work.
- npm lockfile parsing (8.2.5) unless doing KEV entity resolution on packages.
- `twotoe explain`, `twotoe pack` (fold `--refresh` into `brief`), `--taskscheduler` two-task setup (keep `--no-temporal` single task as fallback; it is 1 hour and is the honest "it just works" path).
- Mastra, ElevenLabs, Arduino, local voice.
- 90% coverage target, Lighthouse 95 gate (do a quick a11y pass instead).
- Fixtures: 24 -> 14 (keep f01, f02, f03, f05, f06, f07, f09, f10, f12, f14, f17, f20, f22, f23 equivalents, plus 4 to 6 held-out ones). Bake-off: 2 models (E4B, E2B), 2 runs each with different seeds, overnight. Add a non-Gemma 4B only if time.
- Probably drop: Render/DO hosting + .tech domain if the card slips. A GitHub Pages-free static demo is not a partner category, but the card can ship as screenshots plus a repo-local `twotoe card`. Decide on Oct 24 noon IST.

### Minimal must-ship scope that can still win
1. `twotoe brief` (scan, match, Gemma phrasing, hardened validator, template fallback) on Windows.
2. Pack of ~8 verified entries + KEV refresh + installed-programs inventory with Gemma entity resolution (the AI-at-core story).
3. Temporal: workflow, schedule (`20h` catch-up, timezone), durable 07:00 toast, crash test with honest metrics.
4. Eval: matcher table (incl. held-out), writer table for 2 Gemma sizes, adversarial validator scoreboard, canary 0.
5. Card served locally, one hosted example if time; GIF + crash clip.
6. Post with fact-check table, "What broke", lazy payoff stopwatch.

### Realistic hour budget (start Oct 22 ~7 PM IST, publish by Oct 25 ~10 AM IST)
| Phase | Hours | Target (IST) |
|---|---|---|
| 0 Scaffold, schemas, pack verify (90-min box) | 2.5 | Oct 22 late night |
| 1 Windows probe + scanners (env, python, IOC, node/php/plex via registry, markers) | 5 | Oct 23 early afternoon |
| 2 Matcher + template + `brief --no-llm` | 2.5 | Oct 23 evening |
| 3 Writer + hardened validator + egress guard + cloud-model refusal | 4.5 | Oct 23 night (start eval overnight #1 as smoke) |
| 3b KEV entity-resolution job + labeled pairs | 3 | Oct 24 morning |
| 4 Temporal workflow, schedule, 07:00 timer, crash test | 3.5 | Oct 24 afternoon |
| 6 Fixtures + adversarial corpus + run-eval (compute overnight #2) | 2.5 | Oct 24 evening |
| 5 Card (local) + optional deploy | 2 | Oct 24 night |
| 7 Sentry (optional) | 1.5 | only if ahead |
| 8 Post, GIF, crash clip, real-machine run | 5 | Oct 25 early morning |
| Buffer (Windows surprises) | 2 | |
| **Total** | **~32 (29.5 without Sentry)** | |

That is still tight. If behind at Oct 24 noon IST, drop 3b to a "planned" paragraph and drop deploy; do not drop the post time.

---

## E. Cheap wow for judges

1. **"Replay the viral post" mode** (`twotoe replay viral-2026-10-21`, ~1.5 h). Input the 10 claims; output a per-claim verdict *for this machine*: "affects you / not on this machine / not machine-checkable / unverified, not in pack (Rajasthan, 'AI is exploiting them')". It is the post's fact-check table, personalized and executable. Excellent GIF and hook.
2. **Adversarial validator scoreboard** (~1.5 h). 40 hand-written lying drafts in 8 categories from C8 (swapped versions, negation, cross-finding borrowing, confidence inflation, dangerous advice, unlisted vendor, single-digit counts, injection via filename). Report "v1 token validator caught 19/40; v2 structural validator caught 38/40; here are the 2 it still misses." Honest, numeric, memorable. This is the "What broke" section even if Gemma behaves perfectly.
3. **"I ran the eval while I slept"** (0 h extra). Literally schedule the bake-off as a Temporal workflow overnight and show the morning brief summarizing the eval. Meta-lazy and on theme.
4. **Not one-week-only**: KEV + installed-programs entity resolution by Gemma (A3), plus a pack schema and `pack add` with CI validation, invite Hacktoberfest contributors to send a pack PR for the next breach week.
5. **Independent egress witness** (~0.5 h): during a run, sample `Get-NetTCPConnection -OwningProcess` and show only 127.0.0.1 and cisa.gov. A second witness beyond self-reported ledger beats "trust me".
6. **Model bake-off with honest hardware numbers**: E2B vs E4B, tokens/s, p50/p90, fallback rate, KEV-resolution precision, on your exact laptop specs. If template beats the model on blind read, say so and show where the model still wins (entity resolution).
7. **Durable 07:00 delivery clip**: kill the worker at 06:59 in a fast-forwarded test env (Temporal `TestWorkflowEnvironment` time skipping) and show the toast still lands. Cheaper and more visual than a real-time crash.

---

## Open questions for the builder
- Which deadline does DEV enforce (API `ends_at` Oct 24 PDT vs prose Oct 25 PDT)? Plan for the earlier one.
- Laptop RAM/GPU: `gemma4:e4b` is 6.6 to 9.5 GB; on 8 GB RAM, E2B is the realistic default.
- Is `twotoe.tech` actually available via promos?
- Approve the CLAUDE.md rule 1 clarification (C4) before Phase 1.

## Sources
- DEV challenge API, Week 3 (id 81) details and ends_at, via DevRelay get_challenges.
- https://ollama.com/library/gemma4
- https://typescript.temporal.io/api/interfaces/client.ScheduleSpec (timezone field)
- https://docs.temporal.io/schedule and https://docs.temporal.io/troubleshooting/schedule-missed-actions (catchupWindow default 1 year, min 10 s)
- https://github.com/vllm-project/vllm/issues/39130 (Gemma 4 + grammar bypass, vLLM)
- https://pub.towardsai.net/ollama-0-34-4-lets-qwen-think-before-json-then-blocks-the-tool-call-5-of-6-parsers-tested-8313c8dfb089 (third-party, think+JSON behavior)
