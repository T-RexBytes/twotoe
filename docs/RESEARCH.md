# TwoToe research brief (Oct 22, 2026)

Four research agents ran in parallel: challenge rules and past winners, a fact-check of the Oct 21 incidents, a scan of competing Week 3 entries, and a red-team of SPEC.md. Raw reports with every source URL are in `docs/research/`. This file is the synthesis plus the proposed spec changes. Nothing in SPEC.md has been changed yet.

## 1. Verdict

The idea is still worth building, but the pitch has to move.

- **Still open:** no Week 3 entry targets the Oct 21 breach week. DEV posts on it so far are explainers and checklists, not tools.
- **Already taken:** "code owns facts, a validator rejects model text" is not novel in this challenge. Sloth SOC (nightly log triage, grounding validator, loopback-only egress, red-team table) and MorningDrop already use it, and the Week 1 overall winner Paper Trail was built on it.
- **New headline:** "half of breach week had no package to scan". Railway env vars, OpenCode keys, eMudhra trust, installed Plex, and `.pth` persistence are invisible to osv-scanner, npm audit and pip-audit. TwoToe checks the machine, not just the lockfile, and never reads a secret value.
- **Biggest weakness:** Gemma only rewrites sentences a template could already write. Give it one bounded job that code cannot do well (see change P2).

## 2. Deadline (act on this first)

| Source | Close time |
|---|---|
| Rules page and page countdown | Oct 25 11:59 PM PDT (Oct 26 12:29 PM IST) |
| DEV Events API `ends_at` | Oct 25 06:59 UTC (Oct 25 12:29 PM IST) |

The two disagree by 24 hours. **Plan for the earlier one: post published by Oct 25, 10:00 AM IST.** Code freeze moves to Oct 24 night IST. The Week 1 win does not disqualify you (one prize per challenge, each week is its own challenge), but DEV says it wants to spread wins, so the entry has to be clearly ahead.

## 3. Fact-check corrections for the advisory pack

All other pack facts in SPEC 7.2 were confirmed against primary sources.

| Pack id | Correction |
|---|---|
| `php2shell-2026` | Not in CISA KEV (catalog 2026.10.21). Set kev: false. NVD also lists CVSS 3.1 9.8. CISA offline advice is for 8.1 and older or systems that cannot patch now. |
| `gitlab-cve-2026-110264` | Fixed in 19.5.1, 19.4.3, 19.3.6, 19.2.9, 19.1.9, 19.0.10, 18.11.13. Oct 12 patches are still vulnerable. Not in KEV. |
| `gitlab-cve-2026-97229` | Fixed in 19.4.2, 19.3.5, 19.2.8 (Oct 12). Not in KEV. |
| `plex2shell-2026` | KEV added Oct 20. Due Oct 23: CVE-2026-96654, -96656. Due Nov 3: CVE-2026-96652, -96655. |
| `nodejs-2026-10-21` | 10 CVEs (4 High, 3 Medium, 3 Low), no other lines released. TLS bypass is CVE-2026-105483, -106069, -106072. Node now rejects chains with the eMudhra keys and ships NSS 3.131.1 roots. |
| `litellm-1.107.0` | Add Docker exposure: GHCR and Docker Hub tags `v1.107.0`, `latest`, `main-latest`, `main-stable` until 13:51 / 14:20 UTC. Add IOC `litellm-1.107.0.dist-info`. The hourly backdoor is Linux/macOS only; the stealer runs on Windows. Wiz publishes per-OS SHA-256 values. |
| `emudhra-weak-ca-keys` | Root name conflict: "emSign ECC Root CA - G3" (browsers) vs "emSign Root TLS CA - G3" (Bugzilla). VERIFY before matching. No forged certs found. ~30,000 certs to migrate (60M is unsupported). certifi: recommend 2026.10.19 or newer (VERIFY). |
| `opencode-console-2026-10-17` | Confirmed Oct 17, 1.4% of Console users. |
| VERIFY (not fetched directly) | SafeDep LiteLLM page, OpenCode X post, SBI filing PDF. |

Optional new entries found by the fact-check: Go 1.27.3 / 1.26.10 (eMudhra keys blocked, needs rebuild), Oracle Java CVE-2026-91403, GhostAction workflow secret theft (Oct 8 to 12).

## 4. Flaws found, with fixes

### Fatal or high risk
1. **Scope is about 1.5x the hours left.** Spec needs 35 to 40 h, about 26 to 30 h are real. Fix: cut list in section 6.
2. **Gemma is decorative.** Fix: P2.
3. **"Catches up before you wake" is false.** Temporal cannot wake a laptop; catch-up fires on lid open. `catchupWindow: "6h"` silently skips a run if the lid stays shut past 9 a.m. The dev server loses schedules without `--db-filename`. Fix: catchupWindow 18h, always pass `--db-filename`, say honestly "runs when the laptop is next awake".
4. **The 7 a.m. toast does not exist as specified** (it fires at about 3:01). Fix: a durable `sleep()` timer in the workflow until 07:00 local, then notify. This is real Temporal value a cron job cannot give.
5. **"Activities executed twice: 0" will be false.** A killed activity is retried by design. Fix: measure "completed activities re-executed: 0" and "model results reused from cache: 1".

### Security and privacy holes in the design
6. **Secret fragments can leak as key names.** Multi-line PEM or JSON values with base64 lines ending in `=` pass the key regex. Fix: strict key regex `^[A-Za-z_][A-Za-z0-9_.]*$`, reject lines with no key before `=`, skip continuation lines inside quotes, canary test with a PEM fixture.
7. **Version probes can execute user code.** `node -e` honours `NODE_OPTIONS=--require`; Windows resolves the current folder before PATH. Fix: absolute exe paths, `cwd` = temp dir, minimal env (no NODE_OPTIONS), `node --version` only, `php -n -v`, or read the PE file version instead of running anything.
8. **Rule 1 conflict.** CLAUDE.md says never read env values, but the probe needs `APPDATA`, `PATH`, `USERPROFILE`. Needs your approval for a written carve-out: process env values for those named variables only, never logged.
9. **Egress guard only patches fetch.** It misses `http`/`https` and Temporal's native gRPC client, and an Ollama cloud tag would send data while the ledger shows localhost. Fix: guard `http`/`https`/`net.connect`, refuse model tags containing `cloud` or `:remote`, and add an independent `Get-NetTCPConnection` witness during the run.
10. **Validator can be fooled with grounded tokens:** swapped from/to versions, negation ("not affected"), inflated confidence words, line 1 mixing tokens across findings, unflagged dangerous advice (`NODE_TLS_REJECT_UNAUTHORIZED=0`, `--trusted-host`), prompt injection through file or key names. Fix: P3.
11. **Sentry sends hostname as `server_name`.** Set `serverName: "twotoe"`. Redaction must also cover JSON-escaped (`C:\\Users\\`), forward-slash and 8.3 short paths.

### What a judge will ask
12. "Why not osv-scanner?" Answer in the post with the "no package to scan" list. Optionally ingest `osv-scanner --offline` JSON if the user already has the local DB; TwoToe never downloads it (the DB host is not on the allowlist).
13. "Useful next week?" Fix: P2 (KEV matching keeps it fresh) and a schema-validated pack format that takes PRs.
14. Eval is circular (same author writes matcher and ground truth). Fix: write 4 held-out fixtures before Phase 2 and report them separately.
15. "0 secrets left this machine" overclaims. Say "TwoToe sent 0 bytes of your data; here is the ledger and an independent connection log".

## 5. Proposed spec changes (need your approval)

| # | Change | Spec sections | Cost |
|---|---|---|---|
| P1 | Deadline: publish by Oct 25 10:00 AM IST, freeze Oct 24 night | 0.2, 16, 20 | 0 h |
| P2 | Gemma's second job: map new CISA KEV entries to installed Windows apps (registry Uninstall keys, names and versions only). Model output is a list of `{kevId, appId}` from given IDs; code rejects unknown IDs and caps confidence at `possible` unless code confirms the version. | 4.2, 7.5, 10 | 4 h |
| P3 | Validator v2: code writes every `action`; model writes only `why` and line 1 phrasing; line 1 checked per finding; checks for version order, negation, confidence words, banned advice list; vendor list from KEV; evidence passed to the model as opaque labels (E1, E2), never raw names | 10.2 to 10.7 | 3 h |
| P4 | Adversarial scoreboard: 40 hand-written lying drafts (including injection via a file named like an instruction), report caught/missed for v1 vs v2, including what v2 still misses | 14 | 2 h |
| P5 | `twotoe replay`: verdict on each of the 10 viral claims for this machine (affects you / not you / not checkable / unverified) | 12, 17 | 2 h |
| P6 | Temporal: 07:00 durable timer before notify, catchupWindow 18h, `--db-filename` always, honest crash metric | 11.3 | 1 h |
| P7 | Security fixes 6, 7, 9, 11 above, each with a test | 3, 8, 15 | 3 h |
| P8 | Pack corrections from section 3 | 7.2, 7.3 | 1 h |
| P9 | Rule 1 carve-out for named process env vars (APPDATA, PATH, USERPROFILE, LOCALAPPDATA) | CLAUDE.md, 3 | 0 h |
| P10 | Skip the model on clean nights (template only, say so) | 10 | 0.5 h |

## 6. Cut list and budget

**Cut:** macOS/Linux code and launchd, Ubuntu CI, Mastra, ElevenLabs, Arduino, `explain` and `pack` commands, npm lockfiles, docker-compose env parsing, Git and PowerShell trust-store hunts, two-task Task Scheduler setup, coverage and Lighthouse gates. GitLab stays only as a dockerTag check (fixed versions are now verified).

**Shrink:** eval to 14 fixtures plus 4 held-out; bake-off to Gemma 4 E2B vs E4B, 2 runs each, run overnight on Oct 23 ("I ran the eval while I slept").

**Partner categories to claim:** Gemma (core), Temporal (kill-and-resume clip plus the 07:00 timer), Sentry (only if a real bug is found through a trace and written up; every Sentry winner did this). `.tech` only as a static fixture demo page, if time allows. Skip Render, DigitalOcean, Atlas, Tiger Data, SerpApi, Browserbase, Auth0, Tinker.

| Block | Hours |
|---|---|
| Scaffold, probe, scanners with P7 fixes | 7 |
| Matcher, pack (P8), replay (P5) | 5 |
| Writer, validator v2 (P3), KEV mapping (P2) | 7 |
| Temporal (P6) and crash test | 4 |
| Eval, adversarial scoreboard (P4), held-out set | 4 |
| Card (local, static export) | 2 |
| Post, GIF, video | 5 (never cut) |
| **Total** | **34** (Sentry +3, cut first if late) |

This is still tight. If Oct 23 night slips, drop P2 before anything in the post.

## 7. What the winning posts had (copy the pattern)

From the Week 1 and weekend winners (Paper Trail, Kitchen Table and others):
- A number or tension in the title, a human scene in the first paragraph.
- A hero GIF or short video near the top, a pipeline diagram.
- Real model errors quoted next to their source, and a "What the check can't see" section.
- A "where a closed model would be better" note (honesty reads as judgment).
- Held-out results "ran once, changed nothing".
- Each prize category bullet states the mechanism and one measured result, with a screenshot.
- About 1,500 words. The Lazy Payoff filled in with a stopwatch number.

## 8. Still unverified

- Which deadline the DEV submission system enforces.
- Whether a static `.tech` page satisfies that category.
- Exact eMudhra root display name; certifi fixed version.
- SafeDep, OpenCode X post, SBI PDF (secondary sources only).
- Whether LiteLLM 1.107.0 has an OSV `MAL-` entry.
- Week 2 winners (not announced at research time).
