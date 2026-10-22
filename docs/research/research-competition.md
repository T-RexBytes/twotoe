# TwoToe competitive research: Hacktoberfest Open-Source AI Challenge Week 3 "Slow and Steady"

Date: 2026-10-22. Sources: DevRelay DEV tools (tag listing `hf26challenge`, pages 1-4 at 100/page; semantic search), WebSearch, WebFetch.

**Data limits:**
- The DevRelay tag listing returned 398 unique posts. 281 of them say "Week 3" or "Slow and Steady" in their description, and many more are Week 3 entries with no description. Pages 5 and later were not fetched; they mostly hold older weeks.
- The API returned no reaction or comment counts. Quality ratings below come from reading the posts, not from engagement data.

---

## 1. Week 3 submissions that overlap with TwoToe

### Direct overlap (security or dev-machine hygiene)

| Entry | Author | URL | Idea | Quality (my read) |
|---|---|---|---|---|
| The Day an SSH Username Tried to Prompt-Inject My Security Tool (Sloth SOC) | farhans123456 | https://dev.to/farhans123456/the-day-an-ssh-username-tried-to-prompt-inject-my-security-tool-ego | Nightly offline log analyst for sshd, nginx and ufw logs. "Math decides, a local Gemma only narrates." Uses a closed enum of actions, a loopback-only Ollama client, a DigestValidator (no invented IPs or URLs), a template fallback, a no-egress test, and a red-team eval: 14 payloads, attack success rate 78.6% naive vs 0% hardened. Runs on Windows 11. Includes an agent session embed. | **Strongest competitor in architecture.** It already claims TwoToe's "code owns facts, validator rejects, egress-proof" story, with numbers to back it. |
| SlothSec: Your Local AI Security Analyst That Finds and Fixes Vulnerabilities | sayuj_sur_ | https://dev.to/sayuj_sur_/slothsec-your-local-ai-security-analyst-that-finds-and-fixes-vulnerabilities-3aga | FastAPI and React dashboard that wraps Semgrep, OSV-Scanner and Gitleaks, with Qwen3:4b via Ollama to explain findings and patch them. Scans run on a cron schedule. | Broad "wrap the scanners" approach, no grounding validator, 10 tests. This is the "why not just run osv-scanner" entry. |
| G4ENV: The Lazy Secret Hunter That Never Leaves Your Laptop | cybwithflourish | https://dev.to/cybwithflourish/g4env-5ggp | Python CLI. Nine deterministic rules find secrets in .env, config and CI files. Optional Gemma via Ollama (or Gemini) reads **redacted secret content**. Masked output, schema-validated reports, a bench command. | Solid and honest. It **reads secret values** and can send redacted content to a hosted API. TwoToe reads key names only, which is a clean contrast. |
| Safe to Upgrade? | tyy130 | https://dev.to/tyy130/safe-to-upgrade-know-before-you-bump-per-dependency-upgrade-verdicts-with-fileline-evidence-56e3 | Gemma extracts removed APIs from migration guides; deterministic code greps your code and returns REVIEW, SAFE or UNKNOWN with file:line. Has a grounding check, an EVALUATION.md, and reports "3 of 39 verdicts, 36 UNKNOWN". | High quality. It wins on honesty: it publishes its own bad numbers. |
| Patch Pacer | ye11oc4t | https://dev.to/ye11oc4t/patch-pacer-a-local-model-that-makes-a-noisy-patch-queue-smaller-4lbc | Local bge-small embeddings group duplicate advisories from a JSONL export; deterministic ranking. | Small and modest, with synthetic data. Low threat. |
| RepoSage: Local-First GitHub Audits with Open-Weight Gemma 4 & Anti-Hallucination Gates | ahmmikun | https://dev.to/ahmmikun/reposage-local-first-github-audits-with-open-weight-gemma-4-anti-hallucination-gates-25fk | Repo audit with anti-hallucination gates (title-level overlap only). | Not read in full. |
| Quiet Sentinel: let the server watch itself, quietly | thegaf | https://dev.to/thegaf/quiet-sentinel-let-the-server-watch-itself-quietly-5akf | Server self-monitoring. | Not read in full. |
| Nova: Intelligent Incident Triage | yjamdade49 | https://dev.to/yjamdade49/nova-intelligent-incident-triage-2jkg | Incident triage. | Not read in full. |
| SlothSRE (NapOps) | robinamirbahar (org /gde) | https://dev.to/gde/slothsre-napops-an-overnight-gemma-4-adk-agent-that-compresses-418-lines-of-3-am-alerts-into-a-1pk6 | Overnight Gemma 4 and ADK agent that turns 418 alert lines into a 2-line digest and checks patches in a pytest sandbox. Uses Sentry agent tracing. | Polished and backed by a GDE org. Ops overlap, and it also uses Sentry. |

### Adjacent: "the model gets checked" pattern (same pitch as TwoToe's validator)

- **MorningDrop** by nightmoose, https://dev.to/nightmoose/morningdrop-a-local-gemma-agent-that-checks-last-nights-data-drops-and-gets-checked-itself-29j0. Runs nightly from cron and checks data drops against contracts. Gemma writes 2 lines, then an AISchemaGate and grounding checks run: "every number in the text must already appear in the facts". Includes a repair loop, a template fallback, and doesn't wake the model on clean nights. Very well executed, with a demo GIF and CI that runs real Gemma.
- **standup-sloth** by dhanushnehru, https://dev.to/dhanushnehru/standup-sloth-a-local-llm-drafts-your-standup-and-a-citation-check-keeps-it-honest-5h7h. A citation check keeps the LLM standup honest.
- **I built a chat digest that checks its own work, then tried to trick it** by ninefyi, https://dev.to/ninefyi/i-built-a-chat-digest-that-checks-its-own-work-then-tried-to-trick-it-40lk.
- **Shoebox** by kaichen_dev, https://dev.to/kaichen_dev/shoebox-a-small-model-reads-your-receipts-overnight-slowly-and-never-guesses-a-number-k01. "Never guesses a number."
- **Rent Sloth** by onyxaholguincyber, https://dev.to/onyxaholguincyber/rent-sloth-a-local-gemma-4-reads-your-rent-alerts-overnight-plain-code-keeps-the-ledger-nbg. "Plain code keeps the ledger."

**Implication: "code owns facts, the model only phrases them" is now table stakes among the strong entries. It is not a differentiator by itself.**

Week 2 security entries, for context: LocalAudit by hardikgaikwad, https://dev.to/hardikgaikwad/localaudit-an-ai-security-auditor-that-never-sees-your-secrets-and-never-leaves-your-laptop-2p72, and SecureLocal AI by kushal_pandey101, https://dev.to/kushal_pandey101/securelocal-ai-a-local-first-python-security-auditor-for-hacktoberfest-week-2-a90.

**No Week 3 entry targets the Oct 21 incidents** (LiteLLM, Railway, OpenCode, Node/PHP/GitLab/Plex, eMudhra). None does host-level IOC checks, maps env key names to rotation actions, or uses CISA KEV.

## 2. Saturation

From title matching across the 398 posts:

- **About 87 file, Downloads or screenshot organizers.** This is the biggest clone cluster: SlothSort, LazyDesk, SlothDesk and "Lazy Mode" all appear many times, and some titles are identical across authors.
- **About 32 brief, digest, recap or inbox entries.** At least 12 are near-verbatim versions of DEV's own example (group chat or news read overnight, two lines in the morning). Examples:
  - Sloth Brief by anhtudo97, https://dev.to/anhtudo97/sloth-brief-a-local-ai-that-reads-your-group-chats-while-you-sleep-and-gives-you-two-lines-in-the-55m1
  - Nightbrief by sherotree, https://dev.to/sherotree/nightbrief-two-lines-in-the-morning-gemma-overnight-e6
  - Sloth Recap by asosa933, https://dev.to/asosa933/sloth-recap-wake-up-to-2-lines-instead-of-200-group-chat-messages-embeddinggemma-100-in-your-1kp7
  - catchup by sansk_ya, https://dev.to/sansk_ya/catchup-a-lazy-morning-brief-for-group-chats-on-a-laptop-with-no-internet-5ga5
  - waleedshamhan2050sys, https://dev.to/waleedshamhan2050sys/i-built-a-local-agent-that-reads-my-chats-overnight-and-writes-my-morning-digest-gemma-3-ollama-11ne
  - SlothBrief by ishaanchowdhury_ic10, Sloth Brief (news) by kami_butt_69b922ade8de012, TL;DR Sloth by jayeshjain, Quiet Catchup by ktiwari05
- **About 12 security-flavored entries.** Only Sloth SOC, Safe to Upgrade and G4ENV are rigorous.
- Many low-effort posts (titles like "hi", "Hello", ".", "3", "week 3").

**What makes the strong entries stand out:**

1. **A specific, real job with a specific number.** "418 lines of alerts into 2 lines" (SlothSRE). "12 of 12 verdicts right" (Pix receipts, rafaorlando3: https://dev.to/rafaorlando3/gemma-4-checks-my-pix-receipts-while-i-sleep-12-of-12-verdicts-right-even-when-it-misreads-44jn). "35 of 36 with 0 false alarms" (Wait For It, miawab: https://dev.to/miawab/i-built-wait-for-it-tell-an-open-gemma-what-youre-waiting-for-it-checks-rarely-and-it-got-35-of-jgg).
2. **Honest eval with failures shown.** Safe to Upgrade's 36 UNKNOWNs. MorningDrop's list of what each model size got wrong.
3. **Adversarial testing.** Sloth SOC's red-team table, and "then tried to trick it" (ninefyi).
4. **A deterministic fallback, and not waking the model when nothing changed.**
5. **A demo GIF or screenshot, an MIT repo with tests and CI, and a "Why open innovation" section tied to privacy.**

## 3. Existing tools, and "why not just run osv-scanner?"

| Tool | Covers | Gap relative to TwoToe |
|---|---|---|
| osv-scanner | Lockfile and SBOM deps vs the OSV DB (includes malicious-package MAL- records; check that LiteLLM 1.107.0 is listed) | Per project only. Doesn't cover platform breaches (Railway env vars, OpenCode console keys), CA trust (eMudhra), installed servers (Plex, GitLab), host persistence files (.pth in global or user site-packages, pipx/uv tool envs), or which keys to rotate. |
| npm audit / pip-audit | Same, per ecosystem | Same. pip-audit resolves envs; npm audit needs the network (registry). |
| Trivy / Grype | Containers, filesystems, SBOMs, some secrets (Trivy) | Generic CVE lists with no "this week" framing and no rotation plan. Trivy secret scanning reads values. |
| Socket CLI | Behavioral supply-chain risk | Cloud service, so it fails the egress rule. |
| gitleaks / trufflehog | Secret values in git and files | **Read values** (trufflehog also verifies live). TwoToe deliberately never reads values. |
| Dependabot | Version bump PRs | Cloud, per repo, and no machine-level view. |

**DEV evidence that advisory databases lag or miss things:**
- "31.6% of security advisories for self-hosted AI tools never reach the database your scanner reads" by munimv2, https://dev.to/munimv2/316-of-security-advisories-for-self-hosted-ai-tools-never-reach-the-database-your-scanner-reads-4cfh
- "Two Critical Next.js RCE Fixes Ship With No CVE ID. npm audit May Never Tell You." by jamilxt, https://dev.to/jamilxt/two-critical-nextjs-rce-fixes-ship-with-no-cve-id-npm-audit-may-never-tell-you-1gek
- "Zero CVEs. but found 1,249 risky paths!" by jj1423, https://dev.to/jj1423/zero-cves-but-found-1249-risky-paths-3h4p

**Crisp differentiation (for the post):**
> osv-scanner answers "does this lockfile contain a known-bad version?" TwoToe answers "after this week's breaches, is *this machine* exposed, which keys do I rotate first, and where was each one issued?" Half of breach week had no package to scan: a hosting platform leaked env vars, a coding-agent console leaked keys, and a CA's keys were cracked. TwoToe checks lockfiles, installed tools, persistence files, trust stores and env **key names**. It turns the result into an ordered rotate and patch checklist. And it never reads a secret value, so the triage tool can't become the next leak.

**Should TwoToe use OSV?** Yes, as an optional fact source, not a dependency.

What the official docs say (https://google.github.io/osv-scanner/usage/offline-mode/, fetched 2026-10-22):
- `--offline`: "No network connection is required when using this flag." It does not download or update the DB and does not send dependency information anywhere.
- `--offline-vulnerabilities` alone may still make network requests (for transitive resolution). **Do not use it.**
- The DB lives at `OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY/osv-scanner/<ECOSYSTEM>/all.zip`, or the user cache dir, or the temp dir. It downloads from `https://osv-vulnerabilities.storage.googleapis.com/<ECOSYSTEM>/all.zip` or via `--download-offline-databases`. The fetched page was ambiguous about which offline flag that one pairs with; verify.
- The page has no Windows-specific notes. Older v1 builds used `--experimental-offline` flags, so check the installed version.

Recommendation, consistent with the hard rules:
- If `osv-scanner` is on PATH **and** a local DB exists, run `execFile('osv-scanner', ['--offline', '--format', 'json', ...])` with a timeout and ingest the results as facts labeled `source: osv-offline`.
- Never auto-download. `storage.googleapis.com` is **not** in the egress allowlist, and adding it needs the user's explicit approval under hard rule 4. Instead, print the download command for the user to run.
- Pitch this as "TwoToe stands on OSV instead of reinventing it." That answers the judge's question head on.

## 4. DEV community sentiment on the Oct 21 incidents

Devs are posting actively. The angles already taken are explainers and checklists, and nobody has shipped a tool:

- **Railway:** "Railway Says Some Customer Secrets May Have Been Decrypted. What Should Teams Do?" by jamilxt, https://dev.to/jamilxt/railway-says-some-customer-secrets-may-have-been-decrypted-what-should-teams-do-41ae. Main point: rotate at the issuing service, keep a secret inventory, and builds were paused so redeploy-based fixes stalled. **This is exactly TwoToe's rotate-checklist niche.**
- **LiteLLM:** "Popular LiteLLM library hacked, version with hidden malware released" by hacksgr, https://dev.to/hacksgr/popular-litellm-library-hacked-version-with-hidden-malware-released-320h. Covers v1.107.0, stolen GitHub OAuth tokens, a credential stealer plus a backdoor, and advises rotating from a clean device.
- **OpenCode:** "Your Coding Agent Is a Key Vault You Never Audited. The OpenCode Breach Proves It" by jamilxt, https://dev.to/jamilxt/your-coding-agent-is-a-key-vault-you-never-audited-the-opencode-breach-proves-it-4bhi. The post dates the incident to Oct 17, not Oct 21; check the advisory pack date.
- **Node, PHP and GitLab:** "Urgent Patch Alert: PHP2Shell, GitLab RCE, and Node.js Brotli RCE" by anoymask, https://dev.to/anoymask/patch-alert-critical-gitlab-and-php-flaws-plus-nodejs-security-updates-43k9, and "Two Critical PHP Vulnerabilities: What to Do Before the Emergency Release" by jamilxt, https://dev.to/jamilxt/two-critical-php-vulnerabilities-what-to-do-before-the-emergency-release-n14
- **Plex:** "How the four Plex CVEs relate" by andreagomez, https://dev.to/andreagomez/how-the-four-plex-cves-relate-three-request-flaws-and-one-path-to-code-execution-251h, and "Plex2Shell..." by anoymask, https://dev.to/anoymask/plex2shell-four-vulnerability-chain-exploited-the-day-after-poc-release-to-deploy-miners-and-residential-proxies-3d4d.
- **eMudhra:** "Eight CA private keys were integers under 256..." by frankchu, https://dev.to/frankchu/eight-ca-private-keys-were-integers-under-256-i-recovered-all-eight-in-11-milliseconds-4o1f. It reports "6 of 12 still verify" against the local trust store, a useful framing for a trust-store check (defensive check only). Also "Eight Bits of Trust" by technoblogger14o3, https://dev.to/technoblogger14o3/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds-2l4
- **Related:** "Rotating Secrets After an AI-Tooling Compromise: A Checklist for the September 2026 KEV Wave" by kozhevniko, https://dev.to/kozhevniko/rotating-secrets-after-an-ai-tooling-compromise-a-checklist-for-the-september-2026-kev-wave-4l38, and "Build a 5-Minute Morning Security Brief: CISA KEV + Microsoft MSRC..." by adam_lewandowski_59674796, https://dev.to/adam_lewandowski_59674796/build-a-5-minute-morning-security-brief-cisa-kev-microsoft-msrc-to-a-compliance-drift-report-in-3ggd. That one is prior art for a "KEV morning brief" (not a challenge entry).

## Recommendations for TwoToe's entry

1. **Lead with timeliness.** "The internet broke on Tuesday; here is what I woke up to." No other entry uses breach week.
2. **Don't claim the validator as novel.** Cite the pattern and go further: a red-team fixture where the advisory text or package metadata contains an injection, plus a published "unsupported-claim rejection rate". Sloth SOC set the bar with its attack success rate table.
3. **Make "key names, never values" and the canary test the headline contrast** with G4ENV, gitleaks and trufflehog.
4. **Show the egress ledger** as a screenshot. Sloth SOC already has a no-egress test.
5. **Publish eval numbers on fixtures,** including UNKNOWN or miss rates (Safe to Upgrade's honesty wins).
6. **Use OSV in offline mode only, optionally,** and say so in the post.
7. **Skip the model on clean nights** (like MorningDrop), and keep a template fallback.
