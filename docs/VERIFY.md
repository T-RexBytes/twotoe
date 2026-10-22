# VERIFY log

Every VERIFY item from SPEC sections 0 to 7 (plus later-phase items seen while reading), what was checked, and against which URL. Checked on 2026-10-22 unless noted. Re-check everything before tagging `v1.0-submission` and again on publish day.

Status key: **confirmed** (value fetched and matches), **corrected** (fetched, the spec was wrong, the pack uses the source value), **open** (could not confirm; placeholder or caveat in the pack), **deferred** (belongs to a later phase; checked then).

## Open placeholders in advisories.json

These are the literal `"VERIFY"` values in the pack. A test fails if one is missing from this list.

| Pack path | Why open | Plan |
|---|---|---|
| `emudhra-weak-ca-keys.check.params.windowsStoreBehavior` | How Microsoft's block shows up (root removed vs moved to `Disallowed`) and whether it happened on Oct 20 as SPEC 8.2.9 says. No fetched source mentions a Microsoft action. On the dev machine (2026-10-22) "emSign ECC Root CA - G3" is in neither `Root` nor `Disallowed` (only "emSign Root CA - G1" is in `Root`), which fits "never shipped" or "removed" but proves neither. | Find a Microsoft source; until then Windows store presence stays `possible` |

Resolved in Phase 1: `opencode-console-2026-10-17.check.params.configDirCandidates`. OpenCode docs give `~/.config/opencode` for the global config (https://opencode.ai/docs/config/, no separate Windows path). The dev machine has `~\.config\opencode` and `~\.local\share\opencode`. The detector checks those two plus `%APPDATA%\opencode`, existence only.

## Advisory facts (SPEC 7.2, 7.3)

| Item | Status | Result | Source fetched |
|---|---|---|---|
| Node fixed versions 22.23.4 / 24.22.1 / 26.12.1 | confirmed | No other lines released | https://nodejs.org/en/blog/vulnerability/october-2026-security-releases |
| Node CVE count and Brotli / TLS CVEs | confirmed | 10 CVEs (4 High, 3 Medium, 3 Low). Brotli OOB write is CVE-2026-111497 (High). TLS hostname issues are CVE-2026-105483, -106069 (High) and -106072 (Medium). Release also updates the CA store for the eMudhra compromise. | same |
| Node 20 EOL wording (SPEC 9.2) | confirmed | Node 20, 23 and 25 are listed as End-of-life; 22 and 24 are LTS, 26 is Current. The matcher says "its line is end-of-life" and gives no date (the page's date column is "last updated", not an EOL date). | https://nodejs.org/en/about/previous-releases |
| PHP fixed versions 8.5.12 / 8.4.27 / 8.3.36 / 8.2.35 | confirmed | | https://www.php.net/ |
| PHP CVEs and CVSS v4 9.2 | confirmed | CVE-2026-109618, CVE-2026-109619, both CVSS v4.0 9.2 (php.net Oct 20 notice). CISA alert gives no score. RESEARCH.md mentions NVD CVSS 3.1 9.8; not fetched, not in pack. | https://www.php.net/ |
| PHP 8.1 and older: take offline | confirmed | CISA: orgs still on 8.1 or earlier unsupported versions should take PHP systems offline | https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching |
| PHP in KEV | corrected to `kev: false` | Not in KEV catalog 2026.10.21 (newest entries dated 2026-10-20) | https://www.cisa.gov/known-exploited-vulnerabilities-catalog and the JSON feed |
| GitLab CVE-2026-110264 fixed versions | corrected | Fixed in 19.5.1, 19.4.3, 19.3.6, 19.2.9, 19.1.9, 19.0.10, 18.11.13 (released Oct 21). CVSS 3.1 10.0, unauthenticated, affects all versions from 7.0. Versions below 18.11 have no fix line: treat as "upgrade". | https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/ |
| GitLab CVE-2026-110264 in KEV | confirmed `kev: false` | Not in catalog 2026.10.21 | KEV catalog |
| GitLab CVE-2026-97229 | corrected | Released Oct 12. Fixed in 19.4.2, 19.3.5, 19.2.8. Affects only 19.2 to 19.4. CVSS 3.1 10.0. | https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-4-2-released/ |
| GitLab CVE-2026-97229 precondition "needs ability to commit CI config to a public project" | open (dropped from pack) | GitLab's post only says "under certain conditions" via a crafted regex in CI/CD config. The precondition comes from the Rapid7 analysis, which I did not fetch. | Rapid7 analysis (not fetched) |
| GitLab CVE-2026-97229 in KEV | confirmed `kev: false` | | KEV catalog |
| Plex fixed version 1.43.3.10861 | confirmed | | https://forums.plex.tv/t/important-security-update-for-plex-media-server-v1-43-2-and-earlier/942319 |
| Plex KEV and due dates | confirmed | Added 2026-10-20. Due 2026-10-23: CVE-2026-96654, -96656. Due 2026-11-03: CVE-2026-96652, -96655. Pack `kevDueDate` uses the earliest (2026-10-23); per-CVE dates are in `check.params.kevDueDates`. | https://www.cisa.gov/known-exploited-vulnerabilities-catalog |
| LiteLLM bad version, last safe, window | confirmed | 1.107.0 bad, 1.106.2 last safe, PyPI 11:39:51 to about 13:23 UTC Oct 21 | https://docs.litellm.ai/blog/security-incident-oct-21-2026 |
| LiteLLM Docker exposure | confirmed, added | Docker Hub and GHCR tags `v1.107.0`, `latest`, `main-latest`, `main-stable` (Docker Hub until 14:20 UTC, GHCR until about 13:51 UTC) | same |
| LiteLLM IOC filenames | confirmed, extended | `cook.pth`, `cook.py`, `sitecustomize.py`, matching `__pycache__` files, `litellm-1.107.0.dist-info` | same |
| LiteLLM IOC hashes (SPEC 8.2.4) | confirmed, added | Wiz publishes Windows and Linux/macOS SHA-256 for `cook.pth`, `cook.py`, `sitecustomize.py`; stored in `check.params.iocSha256` | https://www.wiz.io/blog/litellm-compromised-steals-credentials |
| LiteLLM "hourly backdoor" wording (SPEC 7.2) | open (dropped from pack) | Wiz lists Windows variants of `sitecustomize.py` but its text says that script "will only run on Linux & MacOS". Not resolved, so the pack summary says "remote code loader" and makes no hourly or per-OS claim. | Wiz (same) |
| LiteLLM CVE / OSV `MAL-` id | open | No CVE in any fetched source; pack `cves` is empty | not checked |
| Railway facts | confirmed | Encrypted env vars may have been accessed, some decrypted; roll env vars, API keys, private registry credentials; possibly a subset of users | https://blog.railway.com/p/security-disclosure-wednesday-october-21st |
| OpenCode facts | confirmed from secondary sources | Legacy system accessed, disclosed Oct 17, 1.4% of Console users, provider keys saved in Console may be exposed; CLI and desktop keys are local and not affected. OpenCode's own X post was not fetched. | https://thehackernews.com/2026/10/opencode-console-breach-may-have.html, https://www.infosecurity-magazine.com/news/opencode-breach-openai-anthropic/ |
| eMudhra root name | open, partly resolved | Mozilla's emergency distrust targets **emSign ECC Root CA - G3**; the pack matches that subject. Bugzilla comment 0 files the compromised intermediates under "emSign Root TLS CA - G3" (TLS) and "emSign Root CS CA - G3" (code signing). Should the matcher also look for those two subjects? Your call. | https://bugzilla.mozilla.org/show_bug.cgi?id=2083449 |
| eMudhra cert counts | confirmed | About 30,000 certs to migrate (eMudhra estimate, Bugzilla comment 19). The "60M" figure appears in no fetched source. No forged certs reported. | same |
| eMudhra "root distrusted by browsers" | corrected | Firefox: distrusted Oct 20. Chrome: CRLSet blocks the intermediates (Oct 17); root removal is due in Chrome Root Store v43 (expected Oct 27). Pack summary only claims the Mozilla distrust. | Bugzilla, https://scotthelme.co.uk/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds/ |
| Non-browser clients still trust it | confirmed | curl, Python and Node accepted the chain by default in Scott Helme's tests | Scott Helme (same) |
| certifi fixed version | corrected | 2026.10.18 removes the emSign roots (RESEARCH.md guessed 2026.10.19) | https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2 |
| SBI facts | confirmed from a secondary source | Regulation 30 filing on Oct 21, 3,897 customers, contact details plus loan and lead metadata; SBI never asks for OTP, user ID, password or PIN. The BSE PDF returned HTTP 403, so the primary filing was not read. | https://internetfreedom.in/sbi-told-investors-its-data-breach-doesnt-matter-what-about-the-3-897-customers-it-affected/ |
| CISA KEV feed URL and field names (SPEC 7.5) | confirmed | URL works. Top level: `title`, `catalogVersion`, `dateReleased`, `count`, `vulnerabilities`. Entry fields: `cveID`, `vendorProject`, `product`, `vulnerabilityName`, `dateAdded`, `shortDescription`, `requiredAction`, `dueDate`, `knownRansomwareCampaignUse`, `forensicTriage`, `notes`, `cwes` | https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json |

## Tooling and environment (SPEC 5.3, 5.4, 8)

| Item | Status | Result | Source |
|---|---|---|---|
| Node pin `>= 24.22.1` | confirmed | `.nvmrc` = 24.22.1, root `engines` = `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1`. Dev machine upgraded from v24.11.0 to v24.22.1 on 2026-10-22 via the official MSI (SHA-256 checked against SHASUMS256.txt, OpenJS Authenticode signature valid). winget's `OpenJS.NodeJS.LTS` was still on 24.20.0 (unpatched) at that time. | https://nodejs.org/dist/v24.22.1/SHASUMS256.txt |
| Gemma 4 E4B Ollama tag | confirmed | `gemma4:e4b` (also `gemma4:e2b`; `gemma4:latest` is E4B). `gemma4:cloud` and `gemma4:31b-cloud` exist: the writer must refuse cloud tags. | https://ollama.com/library/gemma4 |
| Ollama structured output (`format` takes a JSON schema) | confirmed in practice | Ollama 0.40.8 on the dev machine: `/api/chat` with a JSON schema in `format` returned schema-valid JSON from `gemma4:e4b`. The model also returns a `thinking` field by default (to be turned off in Phase 3). | dev machine, 2026-10-22 |
| Ollama runs on GPU | confirmed | `ollama ps`: gemma4:e4b, 100% GPU, context 8192 (RTX 3050 Laptop, 4 GB). Full eval plan applies, not the CPU-only fallback in SPEC 5.4. | dev machine |
| Temporal CLI on Windows (winget/scoop?) | confirmed | winget package `Temporal.TemporalCLI` 1.9.1, publisher Temporal Technologies, portable zip from the official GitHub release (latest, v1.9.1). Per-user install, no admin. Installed on the dev machine 2026-10-22: `temporal version 1.9.1 (Server 1.32.0, UI 2.54.1)`. | https://github.com/temporalio/cli/releases/latest, `winget show Temporal.TemporalCLI` |
| Temporal TS SDK version | confirmed | All `@temporalio/*` pinned to 1.24.0. | npm |
| Schedule timezone field name (SPEC 11.3) | confirmed | `spec.timezone` (IANA name) in `@temporalio/client` 1.24.0 `ScheduleSpec`. On this machine `Intl` reports `Asia/Calcutta`; the server accepted it and computed the next run as 21:30 UTC (03:00 IST). | SDK type definitions, dev server |
| `conhost.exe --headless` for hidden tasks (SPEC 11.3) | open, not used | Tasks launch `powershell.exe -WindowStyle Hidden -File <launcher>`. A console may flash for a moment at log on; untested whether conhost --headless avoids it. | n/a |
| Heartbeat throttling | observed | The Temporal SDK sends heartbeats at most every 0.8 x heartbeatTimeout (24 s for 30 s), so the 10 s heartbeat interval reaches the server about every 24 s. Crash recovery time is set by the last heartbeat that got through, not the kill time. | crash test runs |
| Sentry AI agent monitoring docs | deferred | Phase 7 | Sentry docs |
| DigitalOcean category text allows a static deploy (SPEC 11.6) | confirmed from the research notes | "Build or deploy your project on DigitalOcean: host your app or agent, ...". Re-read on the live challenge page before claiming the category. | docs/research/research-challenge.md |
| App Platform spec fields, pnpm and Node detection, custom domain DNS | confirmed | See docs/DEPLOY.md for every source URL. | DigitalOcean docs |
| App Platform `environment_slug: node-js` and Node 24.22.1 availability in the buildpack | open | The spec reference lists slugs such as `html`, `hugo`, `jekyll` but the fetched page did not list `node-js` explicitly; the buildpack page did not list available Node versions. First deploy will tell. | n/a |
| Card a11y >= 95 (SPEC 13.4) | confirmed | Lighthouse 13.5.0 accessibility, headless Chrome: 100 for f22, f06, f23 with light forced, 100 for f22 in dark. Full-page screenshots at an emulated 360 px viewport show no horizontal overflow in either theme. | local run 2026-10-22 |
| Claude Code Windows requirements (Git Bash) | confirmed in practice | This session runs natively on Windows with Git for Windows 2.51.2 | n/a |
| Microsoft Store Python, pipx, uv tool paths (8.2.3) | open | None of these exist on the dev machine, so the globs are untested against real installs. python.org installs (`%LOCALAPPDATA%\Programs\Python\Python3*`) and the user site (`%APPDATA%\Python\Python3*`) were found and scanned. | n/a |
| Plex `ProductVersion` holds full build (8.2.8) | open | Plex is not installed on the dev machine. The PowerShell call itself was tested on `node.exe` (returns the full version). | n/a |
| Git for Windows CA bundle path (8.2.9) | confirmed | `C:\Program Files\Git\mingw64\etc\ssl\certs\ca-bundle.crt` (Git 2.51.2). Headings use the p11-kit form `# <name>`. It contains "emSign ECC Root CA - G3". | dev machine |
| Plex macOS plist key (8.2.8) | deferred | SHOULD, no Mac available | n/a |
| Node root store and eMudhra | confirmed | Node 24.11.0 trusted "emSign ECC Root CA - G3" (146 roots). After upgrading the same machine to 24.22.1, `tls.rootCertificates` no longer contains it, matching the release's "ca-cert (eMudhra Intermediate CA Compromise)" update. | dev machine, nodejs.org release page |
