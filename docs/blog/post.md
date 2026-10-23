---
title: "Breach Week Dropped 10 'Patch Now' Posts. A Local Gemma Boiled Them Down to 2 Lines, and Code Checked Every Number It Wrote."
published: true
description: TwoToe scans your machine at 3 a.m., lets a local Gemma 4 E4B phrase what it found, rejects any version, CVE or number the model wrote that code did not establish, and leaves you two lines and a checklist. Then it goes back to sleep.
tags: devchallenge, hf26challenge, ai, security
cover_image: https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/cover-1000x420.png
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 3: Slow and Steady](https://dev.to/challenges/hacktoberfest-week3-2026-10-19)*

On Oct 21 a post went viral: "the internet broke today", ten incidents in one list. I checked every one against its source. Eight are real, one number was off by about **2,000x**, and one never had a source beyond a forum. So I built **TwoToe**, a sloth that does breach-week triage on my laptop at 3 a.m., or the minute I log on if the laptop was asleep. Code scans the machine and decides what is true. A local **Gemma 4 E4B** only phrases it. A validator with no AI in it rejects any version, CVE, number or vendor name the model wrote that code did not establish for that finding. In the first eval round it caught **141 of 405** drafts doing exactly that. By round four, gemma4:e4b had **0 of 80** drafts rejected at a **9.0 s** median on a 4 GB laptop GPU, and across all four rounds **0** ungrounded tokens reached a final brief. On my own machine the nightly scan covers **9,246 files in 1.3 s**.

The model's only job is to write two lines and a short checklist each morning, so you can stop reading breach threads and go back to bed.

> **TL;DR**
> - **What:** TwoToe scans your projects and machine overnight against this week's advisories and leaves you two lines and a checklist of at most 7 items: what to do, why, where it was found, how sure it is, and the vendor's link. Then it stays quiet until tomorrow night.
> - **The model result:** four eval rounds on 24 synthetic fixtures, 3 local models, 5 runs each. Round 1: the validator rejected **141 of 405** drafts for an ungrounded token, and caught all of them. Round 4: **gemma4:e4b 0 of 80 rejected**, 9.0 s median, 19 tokens/s on an RTX 3050 Laptop GPU (4 GB). The matcher found **20 of 20** expected findings with **0** false positives.
> - **Cost:** no API, no account, no key. The model runs in Ollama on 127.0.0.1. The only outside request is the CISA KEV feed.
> - **Durability:** the nightly run is a **Temporal** workflow. I killed the worker with `taskkill /F` 8 s after the model had answered: 3 activities were already done and kept, 1 was retried, **0 ran twice**, and the model's finished answer came from cache instead of a second model call.
> - **Honesty:** that 0% is partly copying. Gemma kept the template's action word for word in **79 of 95** items. And the validator checks tokens, not meaning: "you are not affected" would pass. Both are in the tables below.
> - **Everything is open:** code, fixtures, all four eval reports, the redacted agent session and the scripts behind every image are in **[T-RexBytes/twotoe](https://github.com/T-RexBytes/twotoe)**. MIT licensed.

> **3 findings in 30 seconds**
>
> 1. **The model copies more than it writes.** In round 4 Gemma passed the validator every time, mostly by keeping the template's words. Its most personal touch is a line-2 tail, "take a deep breath.", in 46 of 80 briefs.
> 2. **Every fix was right about the symptom and wrong about the cause.** In round 3 I hid the long advisory summary from the model. 87 drafts still contained it word for word. The leak was mine: the allowed-token list carried the whole sentence.
> 3. **The tool's first real run flagged the tool.** TwoToe warned that it was itself running on an unpatched Node (24.11.0; the fix is 24.22.1) that still trusted the eMudhra root. winget's Node package was unpatched too.

> **Nothing private was sent anywhere.** TwoToe reads `.env` key *names*, never values. Every fixture `.env` carries a planted canary value, and it appeared in **0** outputs in every eval round. Indicator files are hashed, never opened. All network goes through an allowlist: loopback, `www.cisa.gov`, and Sentry only if you opt in. The brief prints that ledger. Every screenshot in this post is a synthetic fixture.

---

![TwoToe morning card for Friday, October 23, written by the local model gemma4:e4b: "4 things need you today: update Plex Media Server to 1.43.3.10861 or newer; rebuild env with litellm 1.106.2 and rotate keys; +2 more in the checklist." Below it, the checklist with evidence rows, the network ledger and run stats](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/card-kitchen-sink-light.png)

## Why this matters: ten incidents, and the shortcut was backwards

> "...may have accessed encrypted environment variables and, for some of them, obtained the decrypted contents."

That's Railway on Oct 21, describing what an unauthorized third party did. "May have" and "for some of them" are doing a lot of work in that sentence, and the viral post shortened it to "env vars decrypted".

It was one of ten items in a post titled "the internet broke today". Three of the ten (Railway, OpenCode, LiteLLM) were about leaked credentials. Behind the ten sit 16 source pages.

The question I had was smaller: **which of these hit my machine, and what do I do before breakfast?** The shortcut was to paste my lockfiles and `.env` names into a cloud chatbot. In a week about keys leaking from someone else's cloud, that meant sending a list of my keys to someone else's cloud.

So first I checked the list:

| # | Viral claim | Verdict | What the sources say |
| --- | --- | --- | --- |
| 1 | eMudhra: 8 keys, 60M+ certs at risk | Inflated | Keys trivially recoverable; about 30,000 certs need migration; 60M appears in no source; no forged certs reported |
| 2 | SBI: 3,897 customers' data on the dark web | Confirmed | Regulation 30 filing, Oct 21 |
| 3 | Rajasthan Police, 70,000 records | Unverified | Only a forum claim. **Deliberately not in TwoToe's pack** |
| 4 | PHP "php2shell", CVSS 9.2, patch or go offline | Partly | Two CVEs, CVSS v4.0 9.2; CISA's offline advice is for 8.1 and older or systems that can't update; not in KEV |
| 5 | GitLab CVSS 10.0 unauthenticated RCE | Confirmed | CVE-2026-110264, fixed in 7 branches on Oct 21 |
| 6 | Node.js Brotli RCE + TLS bypass, 10 CVEs | Confirmed | 10 CVEs, 4 High; fixed in 22.23.4, 24.22.1, 26.12.1 |
| 7 | Railway breached, env vars decrypted | Confirmed (wording) | "may have" accessed, "some" decrypted, a subset of users |
| 8 | OpenCode provider keys exposed | Confirmed, wrong date | Disclosed Oct 17, not Oct 21; 1.4% of Console users |
| 9 | LiteLLM 1.107.0 on PyPI was malware | Confirmed | 1.106.2 is the last safe release |
| 10 | Plex2Shell exploited, KEV deadline Oct 23 | Partly | In KEV since Oct 20; two CVEs due Oct 23, two due Nov 3 |

"About 2,000x": 60,000,000 / 30,000. Every fact in TwoToe's advisory pack links to the page it came from and carries the date it was last checked. All of them were re-fetched on Oct 23.

{% details Sources (all fetched Oct 23) %}

- Railway: https://blog.railway.com/p/security-disclosure-wednesday-october-21st
- Node.js: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- PHP: https://www.php.net/ and https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching
- GitLab: https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/ and https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-4-2-released/
- Plex: https://forums.plex.tv/t/important-security-update-for-plex-media-server-v1-43-2-and-earlier/942319 and https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- LiteLLM: https://docs.litellm.ai/blog/security-incident-oct-21-2026 and https://www.wiz.io/blog/litellm-compromised-steals-credentials
- eMudhra: https://bugzilla.mozilla.org/show_bug.cgi?id=2083449, https://scotthelme.co.uk/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds/ and https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2
- OpenCode: https://thehackernews.com/2026/10/opencode-console-breach-may-have.html and https://www.infosecurity-magazine.com/news/opencode-breach-openai-anthropic/
- SBI: https://internetfreedom.in/sbi-told-investors-its-data-breach-doesnt-matter-what-about-the-3-897-customers-it-affected/
- CISA KEV feed: https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

{% enddetails %}

## What's new here

| Existing option | What it gives you | What it can't tell you |
| --- | --- | --- |
| Reading every advisory | Every fact, in full | Which ones apply to *this* machine, and which key to rotate first |
| osv-scanner, npm audit, pip-audit | Known-bad versions in a lockfile | Breaches with no package to scan (Railway env vars, OpenCode console keys), CA trust (eMudhra), installed apps (Plex). Most of them also send your package list to an online database by default |
| gitleaks, trufflehog | Secret values found in files | They read the values. In a credential-leak week, the triage tool shouldn't hold your secrets |
| Asking a cloud chatbot | A decent summary | Whether its version numbers are right, and it needs your key names in someone else's cloud |
| **TwoToe** | Two lines and a checklist, made on your machine, with every version, CVE and number checked by code | It checks tokens, not meaning. The pack covers one week's incidents plus CISA KEV |

## What I Built

**TwoToe** turns breach week into two lines you can read before coffee. You install it once. At 3 a.m. a Temporal schedule scans your project folders and machine (lockfiles, Python envs, runtimes, installed apps, trust stores, `.env` key names, indicator files), matches the result against this week's advisory pack, and has a local Gemma write the brief. This is a real run on the kitchen-sink fixture, where Plex, LiteLLM, Railway and Node are all vulnerable:

```text
PS twotoe> pnpm twotoe brief --fixture eval/fixtures/f22-kitchen-sink
  twotoe  Fri Oct 23, 07:00

  4 things need you today: update plex to 1.43.3.10861; rebuild your litellm env on 1.106.2; +2 more in the checklist.
  Everything else: you are doing great. Checked 14 things in 32.8s, 0 secrets left this machine.

  [ ] 1  Update Plex Media Server to 1.43.3.10861 or...   definite  Plex Media Server
  [ ] 2  Rebuild the env with litellm 1.106.2 and ro...   definite  .venv
  [ ] 3  Roll every env var, API key, and registry c...   likely    railway.toml, .env (RAILWAY_TOKEN)
  [ ] 4  Upgrade Node from 24.22.0 to 24.22.1             definite  node --version

  card: twotoe card   model: gemma4:e4b (llm)   validator: 0 rejections
```

Line 1 is what to do. Line 2 is everything else. Its numbers ("Checked 14 things", "0 secrets left this machine") are computed by code from the scan and the network ledger, never written by the model. Each checklist item says what to do, why, where it was found, how sure TwoToe is (`definite`, `likely`, `possible`), and links the vendor advisory. A `possible` item has to start with "Confirm", and the validator enforces that.

You read it, you fix two things, and you close the terminal. There's no feed, no streak, and no dashboard asking you to come back. The number I care about is minutes *not* spent reading breach threads.

![The morning card at phone width: Friday, October 23, a sleeping sloth, "Good morning.", line 1 in large red type, then the checklist, most urgent first](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/card-phone-light.png)

The morning card (`twotoe card`) serves the same brief on 127.0.0.1 only, with the evidence rows, the network ledger and run stats. It remembers your ticks in the browser and nothing else. Lighthouse accessibility is 100 in light and dark mode.

![The full morning card in dark mode for the kitchen-sink fixture: four checklist items with evidence and vendor links, a network ledger with one 7.8 KB POST to 127.0.0.1 under "0 secrets left this machine.", and run stats: 15 checks, 40.9 s, 0 validator rejections](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/card-kitchen-sink-dark.png)

## Demo

Everything runs locally. There's no `.env`, no API key and no account. You need Node 24.22.1 or newer (pnpm refuses anything older), [Ollama](https://ollama.com), and the Temporal CLI only for the nightly run and the crash test.

```powershell
git clone https://github.com/T-RexBytes/twotoe; cd twotoe
corepack enable --install-directory (npm config get prefix) pnpm
pnpm install
ollama pull gemma4:e4b

pnpm twotoe brief --no-llm --fixture eval/fixtures/f22-kitchen-sink   # no model: the template writes it
pnpm twotoe brief --fixture eval/fixtures/f22-kitchen-sink            # Gemma writes it, the validator checks it
pnpm twotoe ask "why does the Node one matter?" --fixture eval/fixtures/f22-kitchen-sink
pnpm --filter @twotoe/card build; pnpm twotoe card                    # morning card on 127.0.0.1:4777
pnpm tsx packages/worker/scripts/crash-test.ts                        # kills the worker mid-run, shows it resume
pnpm twotoe brief --save                                              # your own machine
```

![The brief command typed in Windows PowerShell, the model wait sped up and captioned, then the real two lines and checklist](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/terminal-brief.gif)

There's no hosted demo on purpose: the real card never leaves 127.0.0.1. The card ships with three example briefs, each a real run on a synthetic fixture. Here are the other two, a Railway user and a clean night:

![Morning card for the Railway user fixture: one thing needs you today, roll the env vars and keys stored in Railway](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/card-railway-light.png)

![Morning card for the clean machine fixture: "Nothing needs you today."](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/card-clean-night-light.png)

## Code

{% github T-RexBytes/twotoe %}

`packages/core` holds the scanners, the matcher, the advisory pack and the egress guard. `packages/writer` holds the prompt, the validator and the template. `packages/worker` is the Temporal workflow, `packages/cli` the commands, `apps/card` the morning card, and `eval/` the 24 fixtures and the harness. Every number in this post comes from `eval/RESULTS*.md`, `docs/post/build-log.md` or a screenshot in `docs/post/images/`. 422 tests pass locally and on GitHub CI, with 94% line coverage in core and 98% in writer. MIT licensed.

## How I Built It

```text
 03:00  Temporal schedule (catch-up 18 h, overlap skip)
   |
 collectInventory          scanners: lockfiles, Python envs, runtimes, apps, trust stores,
   |                       .env key NAMES, indicator files (SHA-256 only)
 loadPack                  this week's advisories, each with source URLs and verifiedAt
   |
 matchAdvisories           pure functions, no AI  ->  findings + allowedTokens
   |
 writeBriefWithValidation  Gemma 4 E4B (Ollama, 127.0.0.1) writes JSON
   |                       validator (no AI) checks every version, CVE, number, vendor name
   |                       rejected -> one retry with the reasons -> still rejected -> template
 assembleBrief             line-2 numbers and the network ledger, computed by code
   |
 persistAndNotify          brief saved; card on 127.0.0.1:4777
```

The rule behind all of it: **code owns the facts, the model only phrases them, and code checks what the model said.**

### The first wall: code decides what's true

The scanners collect facts and nothing else. Each one is built around what it must never do:

| Scanner | What it reads | What it never does |
| --- | --- | --- |
| `.env` files, compose `environment:` | Key names, like `RAILWAY_TOKEN` | Hold a value. The parser is a character state machine that only remembers which quote is open, so `KEY=` lines inside a quoted PEM are never reported |
| Indicator files (`cook.pth`, `cook.py`, `sitecustomize.py`) | Size and SHA-256 of the raw bytes | Open them as text, import them, or run them. A test spies on every file-reading function to prove it |
| Python envs, Node lockfiles, Dockerfiles | Package versions, like `litellm 1.107.0` | Run pip, npm or pnpm |
| Runtimes and installed apps | `node --version`, Plex's version | Use a shell. `execFile` only, 5 s timeout, empty environment, empty temp folder |
| Trust stores | Whether the eMudhra root is still trusted | Change anything |

The matcher turns that inventory into findings. Each finding carries its evidence and an `allowedTokens` list: the exact versions, CVE IDs, vendor names and numbers the model may say about *that* finding. This is the Node finding from the run above, trimmed:

```json
{
  "id": "nodejs-2026-10-21:22619b27",
  "confidence": "definite",
  "severity": "high",
  "evidence": [{ "detector": "runtimeVersion", "location": "node --version", "detail": "node 24.22.0 installed" }],
  "allowedTokens": ["Node.js", "Node", "Brotli", "TLS", "24.22.0", "24.22.1", "CVE-2026-111497", "..."],
  "vars": { "found": "24.22.0", "fixed": "24.22.1" }
}
```

The model isn't needed to decide anything. `brief --no-llm` writes the full brief from templates. Priority is plain arithmetic: severity, minus KEV and due-date bonuses, minus confidence. Ties go to leaked credentials, because a leaked key is being used now and a patch gap is only being scanned for.

![The same kitchen-sink brief written by templates alone, with no model call](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/terminal-brief-no-llm.png)

### The second wall: a validator with no AI in it

Gemma 4 E4B gets the findings, not the scan, and returns JSON: the line-1 actions, a short line-2 tail, one checklist item per finding, and FYI lines. The validator pulls every risky token out of that text and checks it against the allowed set *for that finding only*, so a real version borrowed from another finding fails too. This is the per-item check from `packages/writer/src/validate.ts`, trimmed:

```ts
for (const item of draft.checklist) {
  const f = byId.get(item.findingId);
  if (!f || !expectedIds.has(f.id)) continue;
  const action = item.action.trim();
  const why = item.why.trim();
  const allowed = allowedSet([f]);                                   // this finding's tokens, nobody else's
  for (const tok of ungrounded(`${action} ${why}`, allowed)) reasons.push(`ungrounded token "${tok}" in ${f.id}`);
  for (const w of badHype(`${action} ${why}`, [f], kevOf)) reasons.push(`hype word "${w}" not allowed in ${f.id}`);
  if (f.confidence === "possible" && !/^Confirm\b/.test(action)) reasons.push(`possible finding ${f.id} must start with "Confirm"`);
  if (why.length > MAX_WHY) reasons.push(`why over ${MAX_WHY} characters in ${f.id}`);
}
```

**The rest of the rules:**
- **Hype words are earned.** "critical" passes only when a finding's severity is critical, and "actively exploited" only when CISA KEV lists it.
- **The line-2 tail claims nothing.** No digits, no versions, no vendor names, 60 characters at most.
- **Rejected once:** the model gets one retry with the reasons. **Rejected twice:** the template writes the failing parts, and the brief says so (`llm-fallback`).
- **Cloud model tags are refused.** Ollama has `gemma4:cloud`, so a typo in the config could otherwise send findings off the machine.

A round-1 draft from qwen3:4b shows why this matters. The fixture's only finding is OpenCode, a `possible`, so line 1 should have no action at all:

```text
DRAFT      line1Actions: ["bump Node to 24.22.1"]
VALIDATOR  line1Actions has 1 item(s), expected 0
           ungrounded token "24.22.1" in line1Actions
           ungrounded token "Node" in line1Actions
           why over 140 characters in opencode-console-2026-10-17:fb74fe33
FINAL      line 1: "Nothing needs you today."  The OpenCode "Confirm..." item kept, its why from the template
```

"Bump Node to 24.22.1" came from my own prompt's few-shot example. The model read a brief about OpenCode and told me to upgrade Node, because my example did.

Follow-up questions go through the same wall. `twotoe ask` answers only from tonight's findings:

![twotoe ask "why does the Node one matter?" on the kitchen-sink fixture: a two-sentence answer about the Brotli and TLS fixes and the upgrade from 24.22.0 to 24.22.1, based on finding nodejs-2026-10-21, validator passed](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/terminal-ask.png)

### Results

![Line chart, "How often the validator said no": share of model drafts rejected per eval round. gemma4:e2b falls from 96% to 25%, gemma4:e4b from 43% to 0%, qwen3:4b sits near 60% for three rounds, then drops to 0% in v4. Ungrounded tokens in any final brief: 0 in every round](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/eval-rejections-by-round.png)

| Writer (round 4) | Drafts rejected | Ungrounded tokens before the validator | **Ungrounded tokens in final briefs** | Briefs needing the template | Median / p90 writer time | Tokens/s |
| --- | --- | --- | --- | --- | --- | --- |
| Template only (no model) | 0 of 24 | 0 | **0** | n/a | about 0 s | n/a |
| **gemma4:e4b (default)** | **0 of 80** | 0 | **0** | **0 of 80** | **9.0 s / 13.4 s** | 19.0 |
| gemma4:e2b | 23 of 94 (24.5%) | 0 | **0** | 9 of 80 | 2.9 s / 6.5 s | 65.0 |
| qwen3:4b | 0 of 80 | 0 | **0** | 0 of 80 | 12.6 s / 22.7 s | 12.5 |

<sub>24 synthetic fixtures, 16 with findings, 5 runs per model, so 80 briefs per model. Prompt version 2026-10-22.3, RTX 3050 Laptop GPU (4 GB). The kitchen-sink fixture end to end with e4b: 26.9 s median for 4 findings.</sub>

**Did the fixes work, or did I loosen the check?** Same fixtures, same validator, four rounds:

| Round | What changed | Drafts with an ungrounded token (before the validator) | gemma4:e4b drafts rejected | e4b briefs needing the template |
| --- | --- | --- | --- | --- |
| v1 | First prompt | **141 of 405** | 43% (56 of 129) | 7 of 80 |
| v2 | Exact counts in the prompt, a fake few-shot example | 0 of 384 | 48% | 14 of 80 (worse) |
| v3 | The model sees only a summary that fits 140 characters | 0 | 26% | 10 of 80 |
| v4 | Allowed-token leak fixed | 0 | **0% (0 of 80)** | **0 of 80** |

That first row is the whole project in one line. **141 drafts contained a version, CVE, number or product name that code had not established for that spot. Not one reached a brief.** Some were inventions, like fake finding ids or a Node version in an OpenCode brief. Most of gemma4:e2b's were real facts in the wrong section. The matcher, which has no model in it, found **20 of 20** expected findings with **0** false positives and **0** misses, and put the kitchen-sink items in the right order.

**Read the tables with these in mind:**

- **0% rejected is mostly copying, not writing.** gemma4:e4b kept the template's action word for word in 79 of 95 checklist items and reworded the "why" in about two thirds. qwen3:4b copied more: 85 of 95 actions, 63 of 95 "why" lines, and "go back to sleep." in 51 of 80 briefs. The validator didn't get looser; the models got closer to the facts they were handed. Whether that reads better than the template is still open: a blind A/B kit is in `eval/blind/`, and I haven't run it with readers yet.
- **gemma4:e2b is 3x faster and still the only model rejected.** Its 23 rejected drafts are all formatting: line-1 actions over 60 characters, FYI items in the checklist, FYI lines over 160.
- **The validator checks tokens, not meaning.** A grounded version used in the wrong direction, a negation ("you are not affected") or a confident tone on a `possible` finding would all pass. That's listed in the repo as a known gap.
- **I wrote the matcher and the ground truth.** So 20 of 20 is weaker evidence than it looks. `kev-recent` has no fixture: 0 / 0 / 0 there means "not exercised", not "perfect".
- **Five runs with one seed are one sample.** Seed 42 at temperature 0.2 gave byte-identical briefs, so the eval varies the seed per run.

{% details Evaluation protocol, definitions and numbers %}

| Quantity | Definition |
| --- | --- |
| **Fixture** | A synthetic home folder with hand-written ground truth in `expected.json`. 24 of them, 16 with findings. Every one has a canary value in a real `.env` |
| **Draft** | One model response. A brief takes one draft, or two when the validator rejects the first |
| **Ungrounded token** | A version, CVE, number or vendor name in the model's text that isn't in that finding's `allowedTokens` |
| **Drafts rejected** | Drafts with at least one validator reason: grounding, hype word, the Confirm rule, counts or length caps |
| **Briefs needing the template** | The second draft was rejected too, so the template wrote the failing parts (`llm-fallback`) |
| **Matcher true positive** | Both the advisory and the confidence tier match the ground truth |
| **Runs** | 5 per model. Run r uses seed 41 + r (run 1 is the production seed, 42). Temperature 0.2, thinking off, model warmed up before timing |
| **Hardware** | AMD Ryzen 7 7445HS, 15.3 GB RAM, NVIDIA RTX 3050 Laptop GPU (4 GB), Windows 11, Ollama 0.40.8 |
| **Wall time** | v1 64.7 min, v2 56.1 min, v4 39.1 min. v3 was stopped for low memory at 239 of 240 briefs and rebuilt from the per-brief artifacts; the report names the missing brief |
| **Canary and egress** | 0 canary hits in every round. Egress during every eval: 127.0.0.1 only |

Ground truth in `eval/fixtures/*/expected.json` was never edited to make a number pass.

{% enddetails %}

### Making the nightly run survive with Temporal

A 3 a.m. job on a laptop has two enemies: the laptop being asleep, and the job dying halfway through a model call (42 s in the Sentry trace below).

**Each step is a Temporal activity:**
- **The schedule lives in Temporal**: 03:00 local, overlap SKIP, catch-up window **18 h**. My spec said 6 h. With 6 h, opening the laptop after 9 a.m. silently skips the night's brief. 18 h still runs it the same day and can never overlap the next night.
- **Temporal can't wake a laptop, and I don't pretend it can.** The catch-up window runs the missed brief a minute after you log on. A Task Scheduler mode (`sleep --no-temporal`) sets `WakeToRun`, for machines with wake timers allowed.
- **The inventory and pack move between activities as on-disk cache references**, so env key names never enter Temporal's history.
- **Model responses are cached per request inside the activity.** A retry after a crash reuses a finished answer. A validator retry is a new request, so it doesn't count as a duplicate.
- **A model that's down gets no second draft.** If Ollama refuses the connection, the brief skips the validator retry, falls back to the template right away and records why. Retrying a refused connection would only add 90 s.

**Crash run, with the real model.** Real Temporal dev server, real gemma4:e4b, then `taskkill /T /F` on the worker after the model had answered. The test holds the activity in a 20 s pause after the answer arrives, so the kill lands while that answer exists only in the activity's cache.

| Time | What happened |
| --- | --- |
| t+0 s | Workflow `twotoe-crash-2026-10-23T14-49-43-674Z` starts on worker 1 |
| t+53.2 s | The model has answered. The activity enters the 20 s pause |
| t+61.2 s | `taskkill /PID 16884 /T /F`: worker 1 killed 8 s into the pause, with 3 activities already done |
| next | Worker 2 (pid 23388) starts as a fresh process and waits out the 30 s heartbeat timeout |
| t+89.9 s | Workflow **completed**: `llm` mode, 4 checklist items. `writeBriefWithValidation` ran attempt 2 and took the model's answer from cache |

Afterwards: **0** activities executed twice, **1** model call and **1** reuse from cache, **0** model requests computed twice, and **0** canary hits in the cache, logs or briefs.

![Crash test summary in PowerShell: workflow completed in llm mode with 4 checklist items in 89.9 s; worker 1 killed 8 s into a 20 s delay inside writeBriefWithValidation; 3 activities completed before the crash; 1 retried; 0 executed twice; model calls and reuses 1 and 1; 0 model requests computed twice; 0 canary hits](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/terminal-crash-test.png)

Here's Temporal's own timeline of another crash run that afternoon. collectInventory, loadPack and matchAdvisories finished before the kill. The long `2 • writeBriefWithValidation` bar is the killed activity waiting out the dead worker and finishing on attempt 2:

![Temporal Web UI, workflow twotoe-crash-2026-10-23T14-41-35-547Z completed in 1 m 6 s: collectInventory, loadPack and matchAdvisories finish early, a long "2 • writeBriefWithValidation" retry bar spans the gap, then assembleBrief and persistAndNotify. The workflow input shows a relative .twotoe-demo config path](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/temporal-crash-test-timeline.png)

![The same timeline during a real crash run, sped up about 8x](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/crash-test-timeline.gif)

Look at the workflow input in that screenshot: a relative `.twotoe-demo` path. Until Oct 23 that box showed my real user folder. That story is the second item in the next section.

### Watching the agent with Sentry

Telemetry is off by default, and the Sentry SDK isn't even loaded unless you turn it on. When you do, each run is one trace: `twotoe.brief` -> scan -> match -> `invoke_agent TwoToe` -> `chat gemma4:e4b` -> `execute_tool groundingValidator`, and again for each retry. In this trace the first validator call is red and says why:

![Sentry Agent Activity for TwoToe on gemma4:e4b, 1.12 min: the first groundingValidator call is red, 2.51 ms, and its output reads "forced rejection for the demo trace (draft was otherwise checked as usual)"; the second chat call and the second validator call pass](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/sentry-agent-activity-rejected.png)

What the trace showed me is that the check is free. The validator took **2.51 ms**. The model call it guards took **42.43 s** (2.9K tokens in, 472 out), and the retry took 24.88 s. The whole run is 9 spans and 1.12 minutes. The rejection is data on the span (`twotoe.validator.rejections: 1`), next to the model's token counts:

![Validator span attributes in Sentry: twotoe.attempt 1, twotoe.validator.rejections 1](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/sentry-validator-attributes.png)

![The chat gemma4:e4b span in Sentry: model name, 2.9K input tokens, 472 output tokens, and the draft itself (demo mode on a fixture only)](https://raw.githubusercontent.com/T-RexBytes/twotoe/main/docs/post/images/sentry-chat-output.png)

*Honesty note: the first rejection in this trace was forced (`--force-reject-first`, fixtures only) so the retry would show, and the validator's output on that span says so. Sentry didn't find a bug for me; the bugs below came from Temporal UI screenshots and tests. Prompts and responses are attached only in demo mode on fixtures. The trace upload is the only request besides loopback, and it shows up in the brief's own network ledger.*

## What went wrong

- **My model warm-up didn't warm anything.** `twotoe doctor` loaded Gemma with Ollama's default context size. The brief asks for 8,192, so Ollama reloaded the model on the first brief: 45 s before the fix, 29.5 s after. A screenshot said 45 s next to an eval median of 26.9 s, and that's how I noticed.
- **Temporal's history held my home path and my PC's name.** The schedule passed the absolute config path as input, activity results carried absolute evidence paths, and the worker identity was `pid@hostname`. All of it shows in the Temporal UI and stays in `temporal.db`. The test meant to catch this could never fail: it searched `JSON.stringify(history)`, but payloads are bytes. The fixed test decodes every payload, and it's what found the config path.
- **The crash test failed once, and the bug was in the test.** It required exactly one model call. That run legitimately needed two, because the validator rejected the first draft. It now checks that no model *request* is computed twice.
- **Three crash runs, three kill times, one finish time.** All three first runs finished at 88.4 s, despite kills at 52.5, 64.9 and 63.7 s. It looked like a bug. It was the SDK throttling heartbeats to every 24 s (0.8 x the 30 s timeout), so recovery is "last heartbeat that got through + 30 s + 10 s backoff". My code says "heartbeat every 10 s". The server sees 24.
- **My "hidden" nightly tasks weren't hidden.** Windows Terminal ignores `-WindowStyle Hidden`, so two windows opened at log on. And the launcher died on the worker's first stderr line, because PowerShell 5.1 turns redirected stderr into errors. Fixed with OS-level redirection and `conhost.exe --headless`.
- **Nested egress guards left the process unguarded.** Installing a second guard replaced the first, and uninstalling it removed both. No shipped command nests guards, but one of my screenshot scripts did, and its ledger came back empty. Guards now stack, and an inner guard can only narrow the allowlist.
- **My spec's own mockup said "Thu Oct 23".** Oct 23, 2026 is a Friday. The test caught it because the code computes the weekday.

## Why Does Open Innovation Matter?

**A triage tool that needs your credentials in someone else's cloud is incident number eleven.** Railway, OpenCode and LiteLLM were all credential incidents. TwoToe's model runs on 127.0.0.1, and the brief proves it with a network ledger built from every request.

**Open weights let me measure instead of hope.** Each eval round is 240 briefs, and the timed rounds took 39 to 65 minutes on a laptop GPU, with no API bill and no rate limit. Four rounds is how I found the leak in my own allowed-token list. I could afford the fourth.

**It works when everything else is down.** No account, no key. `--offline` skips even the KEV refresh. If your cloud keys get revoked in the middle of an incident, triage still runs.

**Swapping models is one setting.** `TWOTOE_MODEL`, the only env var TwoToe reads, switches between any Ollama model. Tags containing `cloud` or `-remote` are refused.

**The facts are open too.** Every advisory in the pack has its source links and a `verifiedAt` date. Anything I couldn't confirm is listed in `docs/VERIFY.md` instead of shipped.

**The honest caveat:** the advisory pack is hand-curated for one week. CISA KEV refreshes itself; next week's Railway won't. And if you turn Sentry on, that part is a cloud service: it gets span names, timings and token counts, never paths, key names or prompts outside demo mode.

## My Agent Session

I built TwoToe with **Claude Code**, running natively on Windows (PowerShell, not WSL), from Oct 22 to Oct 23: 41 of my messages and 1,099 tool calls. It worked one phase at a time from `docs/SPEC.md`, with a hard stop at every gate for my "go", under a `CLAUDE.md` of hard rules: never read env values, never open indicator files, never run package managers, nothing on the network outside the allowlist, and never edit `expected.json` to make a metric pass. My first message ended: "never invent advisory facts, never weaken a hard rule to make a test pass, and tell me plainly when something failed."

The whole session is in the repo, redacted (home paths, user and host names, emails, Sentry DSN fragments, keys): [the conversation](https://github.com/T-RexBytes/twotoe/blob/main/docs/blog/agent-session.md) and [every tool call](https://github.com/T-RexBytes/twotoe/blob/main/docs/blog/agent-session-full.md). Three moments worth opening:

- **Gate 0, before any code:** it re-fetched every advisory and checked my own spec against the sources. 9 items were wrong, unsupported or still marked VERIFY, from GitLab's fix versions to the eMudhra "60M". The pack has the corrected facts. The two primary sources it couldn't read (SBI's filing returned HTTP 403) are named, with the secondary sources used instead.
- **Gate 6c, the third eval:** free RAM dropped to 2.3 GB of 15.3 GB, with Ollama holding about 6 GB, so the run was stopped at 239 of 240 briefs. The report was rebuilt from the per-brief artifacts and names the one missing brief instead of hiding it.
- **Phase 8, `ask`:** my spec suggested Mastra for the follow-up command. The agent found that the Mastra package sends usage data to PostHog by default, which breaks the network rule, so `ask` runs on the same local model and validator instead.

## The Lazy Payoff

Here's the breach week I didn't have to do by hand: open sixteen source pages, find the fixed versions, run `node -v`, check every Python venv for litellm, grep every `.env` for Railway keys, look up whether my CA bundles still trust a root I'd never heard of, and do it all again next week.

TwoToe's nightly scan of my real machine covers **9,246 files in 1.3 seconds** and runs **49 checks** before I've opened a terminal. Then I read two lines. The first real run found an unpatched Node and an eMudhra root still trusted by Node, by Git for Windows' CA bundle and by certifi in 1 of 3 Python environments. After the Node upgrade, the same scan shows Node no longer trusts the root, and the other two are next on the checklist.

And when I killed it mid-thought, it finished anyway, without asking the model twice.

## Prize Categories

- **Best Use of Gemma:** Gemma 4 E4B (`gemma4:e4b`, Ollama, 100% on a 4 GB RTX 3050 laptop GPU) is the writer. I ran a bake-off against `gemma4:e2b` and `qwen3:4b` over four eval rounds, 24 fixtures, 5 runs each: e4b went from 43% of drafts rejected to **0 of 80**, at a 9.0 s median, with **0** ungrounded tokens in any final brief. e2b is 3x faster but still 24.5% rejected, and qwen3:4b is 40% slower. I've shown where the 0% flatters it.
- **Best Use of Temporal:** a Temporal Schedule (03:00, 18 h catch-up, overlap skip) and a six-activity workflow, with the model's answer cached per request inside the activity. I killed the worker with `taskkill /F` after the model had answered: 3 activities kept, 1 retried, **0 executed twice**, and the answer came from cache, all visible in Temporal's own timeline. Temporal's UI is also how I found my home path in the history, and that's fixed.
- **Best Use of Sentry Agent Tracing:** one trace per run, with `invoke_agent`, `chat` and `execute_tool` spans carrying `gen_ai.*` model names, token counts and tokens/s, and every validator verdict as its own span with the rejection reasons as data. The trace shows a 2.51 ms check guarding a 42.43 s model call. It's opt-in only and scrubbed of paths, key names and the canary, and the forced demo rejection is labelled on the span.

Built by [@soumyadeepdey](https://dev.to/soumyadeepdey) with Claude Code.

What's the scariest "patch NOW" post you read this month that turned out to be about software you don't even run? Leave it in the comments. If it involves a CA you'd never heard of, I may need it for next week's pack.
