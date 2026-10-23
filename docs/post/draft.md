---
title: "Breach week dropped 10 'patch NOW' posts. A local Gemma read them while I slept and gave me 2 lines."
published: false
tags: devchallenge, hf26challenge, ai, security
cover_image: docs/post/images/cover-1000x420.png
---

<!-- DRAFT. Structure and numbers by Claude; rewrite every sentence in your own voice (DEV's AI-assisted-writing guidelines apply).
     Every number has a source at the bottom. If you change a number, change its source line too. No em dashes anywhere.
     Images: upload each file from docs/post/images/ in the DEV editor and replace the local path with the uploaded URL.
     Remaining {{...}} placeholders are things only you can fill. -->

*This is a submission for the [Hacktoberfest Open-Source AI Challenge, Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19).*

## The internet did not break. But something on my laptop might have.

On Oct 21 a post went viral: "the internet broke today", ten incidents in one list. I checked every one. Eight are real. One number was off by about 2,000x (eMudhra's "60M certs at risk"; eMudhra's own estimate is about 30,000 certificates to migrate). Some did not happen "today" (OpenCode disclosed on Oct 17).

The question I actually had was smaller: **which of these hit my machine, and what do I do before breakfast?**

The shortcut was to paste my lockfiles and `.env` names into a chatbot. But half of that week's incidents were leaked credentials (Railway, OpenCode, LiteLLM). Sending my key names to someone else's cloud to find out whether my keys leaked felt like incident number eleven.

> **TL;DR**
> - **What:** a local agent that does breach-week triage overnight and leaves you two lines and a short checklist.
> - **Model:** Gemma 4 E4B via Ollama on a Windows laptop (RTX 3050, 4 GB): 9.0 s median writer time, 19 tokens/s.
> - **Proof:** matcher 20/20 on 24 synthetic fixtures. Four eval rounds, 0 ungrounded tokens in any final brief. In round one the validator caught 141 drafts with invented or misplaced facts.
> - **Privacy:** reads env key names, never values. The network ledger shows nothing left the machine except the CISA KEV feed request.
> - **Repo:** https://github.com/T-RexBytes/twotoe

## What I Built

TwoToe runs at 3 a.m. (or as soon as the laptop is back on), scans my project folders and machine, and leaves me this:

![TwoToe brief in the terminal](docs/post/images/terminal-brief.gif)

Then a checklist of at most 7 items. Each says what to do, why, where it was found, how sure TwoToe is (`definite`, `likely`, `possible`), and links the vendor advisory. In the morning I open the card:

![The morning card on a phone](docs/post/images/card-phone-light.png)

Who gets to be lazier: anyone with five side projects, two Python venvs, a Railway hobby app and a Plex server, who saw the viral post and thought "I should check that... later."

## Demo

- The terminal GIF above is a real run on a synthetic "kitchen sink" fixture (Plex, LiteLLM, Railway and Node all vulnerable).
- The card: {{hosted link, or drop this line}}. Three example briefs, all from synthetic fixtures.
- Full card, light and dark: `card-kitchen-sink-light.png`, `card-kitchen-sink-dark.png`.

## The fact-check

| # | Viral claim | Verdict | What the sources say |
|---|---|---|---|
| 1 | eMudhra: 8 keys, 60M+ certs at risk | Inflated | Keys were trivially recoverable; about 30,000 certs need migration; no source says 60M; no forged certs reported |
| 2 | SBI: 3,897 customers' data on the dark web | Confirmed | Regulation 30 filing, Oct 21 |
| 3 | Rajasthan Police, 70,000 records | Unverified | Only a forum claim. **Not in my pack.** |
| 4 | PHP "php2shell", CVSS 9.2, patch or go offline | Partly | Two CVEs, CVSS v4.0 9.2; CISA's offline advice is for 8.1 and older or systems that cannot update. Not in KEV |
| 5 | GitLab CVSS 10.0 unauthenticated RCE | Confirmed | CVE-2026-110264, fixed in 7 branches on Oct 21 |
| 6 | Node.js Brotli RCE + TLS bypass, 10 CVEs | Confirmed | 10 CVEs, 4 High; fixed in 22.23.4, 24.22.1, 26.12.1 |
| 7 | Railway breached, env vars decrypted | Confirmed (wording) | "may have" accessed encrypted env vars, "some" decrypted, a subset of users |
| 8 | OpenCode provider keys exposed | Confirmed, wrong date | Disclosed Oct 17; 1.4% of Console users |
| 9 | LiteLLM 1.107.0 on PyPI was malware | Confirmed | 1.106.2 is the last safe release |
| 10 | Plex2Shell exploited, KEV deadline Oct 23 | Partly | In KEV since Oct 20; two CVEs due Oct 23, two due Nov 3 |

Every fact in TwoToe's advisory pack links to the source it came from and carries the date it was last checked (Oct 23).

## How I Built It

**Two walls around a small model.** Code decides what is true. The model only phrases it. Code checks what the model said.

```
scan (facts) -> matcher (no AI) -> Gemma writes -> validator (no AI) -> brief
                                                    rejects -> retry once -> template
```

- **The left wall, the matcher:** pure functions over an inventory. Every finding carries `allowedTokens`: the exact versions, CVE IDs, vendor names and numbers the model may say about it.
- **The right wall, the validator:** pulls every version, CVE, number and vendor name out of the model's text and rejects anything not in that finding's allowed tokens. Hype words ("critical", "actively exploited") are allowed only when the severity or CISA KEV status earns them.
- **The env scanner never holds a value.** <!-- paste the key loop from packages/core/src/scanners/envKeys.ts with the "right side is never stored" comment -->
- **Temporal** runs it nightly with an 18-hour catch-up window, so a 3 a.m. run missed because the laptop was off happens when it is back. <!-- paste the schedule snippet from packages/worker/src/schedule.ts -->
- **The network ledger.** Every request goes through an allowlist (loopback, www.cisa.gov, Sentry only if you opt in). "0 secrets left this machine" is computed from the ledger, never written by the model.
- **Ask a follow-up.** `twotoe ask "why does the Node one matter?"` answers only from tonight's findings and goes through the same validator:

![twotoe ask](docs/post/images/terminal-ask.png)

## What Broke (the honest part)

**Four eval rounds. Each fix was right about the symptom; the drafts pointed at the real cause every time.**

![How often the validator said no](docs/post/images/eval-rejections-by-round.png)

| Round | Drafts with an ungrounded token (before the validator) | gemma4:e4b drafts rejected | e4b briefs needing the template |
|---|---|---|---|
| v1 | 141 of 405 | 43% | 7 of 80 |
| v2 | 0 of 384 | 48% | 14 of 80 |
| v3 | 0 | 26% | 10 of 80 |
| v4 | 0 | **0 of 80** | 0 of 80 |

- **v1:** models restated checklist facts in the FYI section, added line-1 actions that should not exist, and copied the spec's own example ("bump Node to 24.22.1") into a brief about OpenCode.
- **v2:** zero inventions, but more length rejections. The models copied the full advisory summary word for word and ignored the trimmed one I put next to it.
- **v3:** I hid the full summary. 87 drafts still contained it. The leak was mine: the allowed-token list carried the whole summary sentence, and the models copied it from there.
- **v4:** with that fixed, gemma4:e4b and qwen3:4b had no rejections at all. gemma4:e2b still had 23 of 94, all formatting (line-1 actions over 60 characters, FYI items in the wrong place).

**The catch in that 0%.** The validator did not get looser; the models got closer to the facts they were handed. gemma4:e4b kept the template's action word for word in 79 of 95 items, reworded the "why" in about two thirds, and its most personal touch is a line-2 tail: "take a deep breath." (46 of 80 briefs). {{BLIND_TEST: two readers ranked template vs model on 6 fixtures; report the result whatever it says.}}

Other things that broke, all found by using the thing:
- TwoToe's first real run warned that **it was itself running on an unpatched Node** (24.11.0; the fix is 24.22.1), and that Node still trusted the eMudhra root. winget's Node package was still unpatched too.
- The `doctor` pre-warm did not warm: it loaded the model with a different context size, so the first brief reloaded it (45 s instead of 29.5 s). A screenshot gave it away.
- Temporal's history held my home path and my PC's name: the schedule's input, activity results, the worker identity. All visible in the Temporal UI. The test meant to catch this could never fail (it searched the history as JSON, but payloads are bytes). Both fixed, and the fixed test is what found the config path.
- My "hidden" nightly tasks opened two terminal windows at login, because Windows Terminal ignores PowerShell's hidden flag.

What the validator cannot see: it checks tokens, not meaning. A grounded version used in the wrong direction, or "you are not affected", would pass. That is listed in the repo as a known gap.

## Why Does Open Innovation Matter?

Railway, OpenCode and LiteLLM were all credential incidents. A triage tool that needs your credentials in someone else's cloud is just incident number eleven.

Local model, local facts. It works offline, it works when your cloud keys are revoked mid-incident, it costs nothing per night, and you can swap the model with one setting (`TWOTOE_MODEL`).

## My Agent Session

Built with Claude Code running natively on Windows, one phase at a time with a stop at every gate. {{Pick the moment: the spec's own few-shot example leaking into briefs, or the v3 allowed-token leak. The raw transcript contains real machine paths: redact before embedding.}}

## The Lazy Payoff

Manual triage of the viral list against my own machine: {{STOPWATCH}} minutes with a stopwatch. TwoToe: {{REAL_RUN_SECONDS}} seconds, while I was asleep. Then I fixed {{K}} things before breakfast.

I killed the worker mid-thought. It finished anyway, and nothing ran twice:

![Crash test summary](docs/post/images/terminal-crash-test.png)

![Temporal timeline: the model activity is killed, retried, and finishes](docs/post/images/crash-test-timeline.gif)

## Prize Categories

<!-- Re-read each category's text on the challenge page before claiming (SPEC 11.1). -->
- **Gemma:** the local writer model; bake-off of gemma4:e4b vs gemma4:e2b vs qwen3:4b across four eval rounds.
- **Temporal:** nightly workflow, schedule with a catch-up window, crash test with 0 duplicate executions.
- **Sentry Agent Tracing:** one trace per run, each model attempt and validator verdict as spans.

![Sentry trace: scan, match, two model attempts each checked by the validator, assemble](docs/post/images/sentry-trace-waterfall.png)

*The first draft in this demo trace was rejected on purpose (`--force-reject-first`, labelled as forced in the brief itself) so the retry shows. Prompts and responses were attached only because it ran on a fixture in demo mode.* {{Optional: replace with a trace of a natural rejection, see docs/post/recording-plan.md; and/or add a second screenshot with the first groundingValidator span selected, so its rejection is visible.}}
- {{.tech domain / DigitalOcean only if deployed}}

## Sources

Railway: https://blog.railway.com/p/security-disclosure-wednesday-october-21st
Node.js: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
PHP: https://www.php.net/ and https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching
GitLab: https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/ and https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-4-2-released/
Plex: https://forums.plex.tv/t/important-security-update-for-plex-media-server-v1-43-2-and-earlier/942319 and https://www.cisa.gov/known-exploited-vulnerabilities-catalog
LiteLLM: https://docs.litellm.ai/blog/security-incident-oct-21-2026 and https://www.wiz.io/blog/litellm-compromised-steals-credentials
eMudhra: https://bugzilla.mozilla.org/show_bug.cgi?id=2083449 and https://scotthelme.co.uk/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds/ and https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2
OpenCode: https://thehackernews.com/2026/10/opencode-console-breach-may-have.html and https://www.infosecurity-magazine.com/news/opencode-breach-openai-anthropic/
SBI: https://internetfreedom.in/sbi-told-investors-its-data-breach-doesnt-matter-what-about-the-3-897-customers-it-affected/
CISA KEV feed: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

---

<!-- NUMBER SOURCES (delete before publishing)
- "Eight are real", fact-check table: docs/research/research-incidents.md; re-verified Oct 23 (docs/VERIFY.md)
- "about 2,000x": 60,000,000 / 30,000; 30,000 from Bugzilla 2083449 comment 19
- RTX 3050 4 GB: build-log "Before Gate 3"; eval/RESULTS.md hardware line
- 9.0 s median, 19.0 tokens/s, 0 of 80, e2b 23 of 94: eval/RESULTS.md (v4), section 2
- v1/v2/v3 rows: eval/RESULTS-v1.md, RESULTS-v2.md, RESULTS-v3.md; 141 of 405 and 0 of 384 from build-log Gate 6 and 6b; 87 drafts from Gate 6c
- 79 of 95 actions, 35 of 95 whys, 46 of 80 tails: build-log Gate 6d (measured over eval/out)
- 20/20 matcher: eval/RESULTS.md section 1
- 45 s vs 29.5 s: build-log "Phase 8 prep"
- Node 24.11.0 dogfood: build-log "The dogfood moment"
- crash test: terminal-crash-test.png (Oct 23 run); build-log Phase 8 prep
- 18-hour catch-up: docs/DECISIONS.md, packages/worker/src/schedule.ts
-->
