# Breach-week fact check (Oct 20-22, 2026)

Checked: 2026-10-22. Defensive research only. No exploit code or PoCs were fetched.

Source key:
- **[F]** = fetched directly with WebFetch on 2026-10-22 (primary page read in full or in large part).
- **[S]** = page text read through You.com search extraction on 2026-10-22 (real page content, but only highlighted passages, not the full page).

---

## Summary table

| # | Viral claim | Verdict | Short correction |
|---|---|---|---|
| 1 | eMudhra key was "4", 8 keys forged any website for 17 months, 60M+ certs at risk | **Inflated** | The key values (4, 56, 115 and others) and the roughly 17-month window are real. There is no evidence of any forged certificate, and Chrome found none in CT. About 30,000 certs need migration. No source says 60M. |
| 2 | SBI confirmed 3,897 customers' data on dark web | **Confirmed** | Regulation 30 filing dated Oct 21. The 3,897 PII records come from about 3.75 lakh records found online. |
| 3 | Rajasthan Police hack, 70,000 identity records | **Unverified** (and the post says so) | This is only a "Scarlettgroup" claim on BreachForums. Police had not confirmed as of Oct 21 reports. |
| 4 | php2shell CVSS 9.2 unauth RCE, CISA "patch or go offline" | **Confirmed (partly)** | Two CVEs. CISA's offline advice covers systems that cannot update now, or that run 8.1 or older. **Not in KEV.** |
| 5 | GitLab CVSS 10.0 unauth RCE | **Confirmed** | CVE-2026-110264, fixed Oct 21 in 7 branches. Vendor scores it PR:N. |
| 6 | Node.js CVE-2026-111497 Brotli RCE + TLS bypass, 10 CVEs | **Confirmed** | 10 CVEs, highest severity High, no CVSS published. Three TLS hostname issues. Releases for 22/24/26 only. |
| 7 | Railway breached, env vars decrypted | **Confirmed (wording)** | Railway said encrypted env vars "may have" been accessed and that "some" were decrypted. Scope is a subset of users. |
| 8 | OpenCode breached, provider keys exposed | **Confirmed, wrong date** | Disclosed **Oct 17**, not Oct 21. Affects 1.4% of Console users. |
| 9 | LiteLLM PyPI 1.107.0 malware | **Confirmed** | Oct 21, 11:39 UTC, all 7 wheels plus Docker tags. Safe pin is 1.106.2. |
| 10 | Plex2Shell exploited, KEV, deadline Oct 23 | **Partly** | KEV since Oct 20. Two CVEs are due Oct 23 and two are due **Nov 3**. |

---

## 1. LiteLLM 1.107.0 (spec claim: malicious, stealer + hourly backdoor, quarantined same day, last safe 1.106.2, IOCs cook.pth / cook.py / sitecustomize.py; sources Wiz, SafeDep, Socket)

**Verdict: Confirmed.** All spec facts hold, with the additions below.

- Malicious release: `litellm==1.107.0`, all seven wheels (macOS x86_64/arm64, manylinux/musllinux x86_64/aarch64, win_amd64). The sdist has a tampered `pyproject.toml` (`data = "cook"`) but carries no payload (StepSecurity).
- PyPI window (per the vendor): 2026-10-21 11:39:51 to 13:23 UTC. Wiz gives the quarantine time as 13:20 UTC. The release was later removed entirely.
- Docker: `v1.107.0`, `latest`, `main-latest` and `main-stable` on GHCR and Docker Hub were also compromised. Docker Hub was exposed until 14:20 UTC and GHCR until 13:51 UTC (vendor). **The spec does not mention the Docker exposure. Add it.**
- Safe pin: 1.106.2. Per StepSecurity and SafeDep, 1.107.0rc1 and rc2 are also clean.
- IOC files: `cook.pth`, `cook.py`, `sitecustomize.py` at the site-packages root, plus `litellm-1.107.0.dist-info` and cached `cook*.pyc` / `sitecustomize*.pyc`. Markers: `/tmp/.pc_once_72129118c59f5636c0bb` and `/tmp/remote_code_loader.lock`. The vendor says a missing marker does not prove a host is clean.
- Behavior: `cook.pth` imports `cook` on every interpreter start, so the stealer runs on any Python start, including pip. `sitecustomize.py` starts a detached loader with an hourly loop that pulls a C2 domain from a GitHub dead drop (`letters9813/pythonclient-test`, since deleted). Exfiltration goes to `www.litellm[.]dev`.
- **Windows nuance (relevant for TwoToe):** Wiz says the `sitecustomize.py` backdoor loop is Linux/macOS only, and the stealer's run-once marker write fails on Windows. The Windows wheel still installs all three files, which differ only in CRLF line endings (StepSecurity). The stealer half does run on Windows.
- Wiz publishes SHA-256 hashes for each IOC file, with separate Windows and Linux/macOS variants because of CRLF. These are usable for stat-plus-sha256 matching.
- No CVE or GHSA has been assigned.
- Root cause (vendor, still being confirmed): GitHub CLI OAuth tokens belonging to three BerriAI engineers were abused, and the release workflow was pointed at the lookalike repo `Berri-AI/litellm`.

Sources:
- [F] https://docs.litellm.ai/blog/security-incident-oct-21-2026 (last updated 2026-10-21 20:30 UTC at fetch)
- [F] https://www.wiz.io/blog/litellm-compromised-steals-credentials
- [S] https://socket.dev/blog/litellm-compromise
- [S] https://www.stepsecurity.io/blog/litellm-1-107-0-compromised-pypi-backdoored-wheels-credential-stealer
- [S] SafeDep analysis was cited via https://dev.to/frankchu/litellm-11070-stole-credentials-from-every-python-process-i-checked-pypi-and-reproduced-the-e9g and https://ai-tldr.dev/releases/litellm-1-107-0-pypi-compromise/. **The safedep.io page itself was not fetched (VERIFY URL).**

## 2. Railway (spec claim: blog.railway.com/p/security-disclosure-wednesday-october-21st, encrypted env vars accessed, some decrypted)

**Verdict: Confirmed.** The URL resolves and matches.

- Exact wording: an unauthorized third party "may have accessed encrypted environment variables and, for some of them, obtained the decrypted contents." The post also says "initial analysis suggests the impact may be limited to a subset of users."
- Actions: rotate all env vars, API keys and private registry credentials, and review logs. Railway says it notified upstream AI inference providers to revoke keys. **All deployments were paused.**
- Railway frames the incident as part of "a series of attacks recently targeting platform companies with the aim of compromising AI inference providers."
- Follow-ups (secondary sources): Railway rotated storage bucket credentials and reset GitHub connection tokens. Enterprise builds began returning at 03:32 UTC on Oct 22. The post does not give a count of affected accounts or the access method.
- Correction for the viral post: "env variables decrypted" overstates it. Railway said only some were decrypted, and hedged with "may have."

Sources:
- [F] https://blog.railway.com/p/security-disclosure-wednesday-october-21st
- [S] https://cybersecuritynews.com/railway-security-incident/amp/
- [S] https://cyberupdates365.com/railway-security-incident/

## 3. OpenCode Console (spec claim: legacy system accessed, disclosed Oct 17, not Oct 21)

**Verdict: Spec is correct. The viral post has the date wrong.**

- Breach occurred overnight Oct 16-17. A follow-up email to affected users gives the earliest possible exposure as 2026-10-17 00:30 UTC. The public statement on X came on Oct 17.
- Scope: 1.4% of OpenCode Console users, specifically those with external provider keys (OpenAI, Anthropic, Google) saved in a Console workspace. The OpenCode CLI and desktop app store keys locally and are not affected (Dax Raad).
- OpenCode says the incident is "related to a large scale distillation attack" but gave no technical root cause. Anthropic revoked affected keys, and OpenAI refunded credits.
- The primary source is an X post, which was **not fetched**, because X requires login. Press coverage is consistent.

Sources:
- [S] https://thehackernews.com/2026/10/opencode-console-breach-may-have.html
- [S] https://techcrunch.com/2026/10/19/hackers-hit-ai-coding-tool-opencode-running-up-charges-on-users-ai-accounts/ (seen in search results only)
- [S] https://vibeincidents.com/incidents/opencode-provider-key-exposure-2026-10/

## 4. PHP / php2shell (spec claim: CVE-2026-109618, -109619, CVSS v4 9.2, fixed 8.5.12 / 8.4.27 / 8.3.36 / 8.2.35, CISA says take 8.1 and older offline; is it in KEV?)

**Verdict: Confirmed. KEV: NO.**

- CVE-2026-109618 is RCE via out-of-memory corruption (GHSA-w8hw-w9fx-j79w). CVE-2026-109619 is RCE via stale global state (GHSA-6wmf-4rv5-p3rp). Both are CVSS v4.0 9.2 per PHP. NVD separately lists **CVSS 3.1 9.8** (Brandefense, not fetched from NVD).
- Fixed: 8.5.12, 8.4.27, 8.3.36 and 8.2.35, released 2026-10-21 around 14:00 UTC. PHP 8.6.0 RC4 also includes the fixes. **Spec should add:** PHP published minimal source backport branches for 7.4, 8.0 and 8.1 (`PHP-<ver>-CVE-2026-109618-109619`), but made no official releases for them.
- Affected per php.net: "all PHP installations serving web requests" (FPM, mod_php, php-cgi, FrankenPHP, LiteSpeed). Risk is highest on mod_php.
- CISA wording, precisely: update immediately. Organizations that cannot update immediately, **or** that run PHP 8.1 or earlier unsupported versions, should take PHP-based systems offline until patched. CISA had **not observed exploitation** at publication.
- **KEV status:** neither CVE is in the KEV catalog (catalogVersion 2026.10.21, released 2026-10-21 14:04 UTC; newest entries are dated 2026-10-20).
- Exploitation reports are vendor-level only. Cloudflare reports early attacks, watchTowr reports in-the-wild attempts, and Amazon reports attempts from Oct 17. Huntress saw none as of Oct 21 16:30 ET.
- Workarounds are partial only: `memory_limit=-1` with a low `post_max_size`, and `session.upload_progress.enabled=0`. PHP says these do not make an installation safe.

Sources:
- [F] https://www.php.net/ (news items for Oct 20 and Oct 21, 2026)
- [F] https://www.cisa.gov/news-events/alerts/2026/10/21/critical-vulnerabilities-php-require-immediate-patching
- [F] https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json (catalog 2026.10.21; first 100k chars read, sorted newest first)
- [S] https://watchtowr.com/intelligence/php-cve-2026-109618-faq/
- [S] https://www.tenable.com/blog/php2shell-cve-2026-109618-cve-2026-109619-frequently-asked-questions-about-critical-php-remote

## 5. Node.js October 2026 security release (spec claim: 10 fixes incl. CVE-2026-111497 Brotli OOB write (High) + TLS hostname validation bypass; fixed in 22.23.4, 24.22.1, 26.12.1; other lines? did Node "block eMudhra"?)

**Verdict: Confirmed.**

- Released Wednesday 2026-10-21: **v22.23.4, v24.22.1, v26.12.1. No other line received a release.** 20.x is not mentioned; per Node it is EOL, and "End-of-Life versions are always affected."
- No CVSS scores were published. Only severity labels are given.
- The 10 CVEs (4 High, 3 Medium, 3 Low):

  | CVE | Severity | Lines | Issue |
  |---|---|---|---|
  | CVE-2026-111497 | High | 26, 24, 22 | Brotli decoder out-of-bounds write permits RCE |
  | CVE-2026-105482 | High | 26, 24, 22 | dns.resolve truncates names at NUL |
  | CVE-2026-105483 | High | 26, 24 | TLS hostname bypass via fullwidth-digit IP |
  | CVE-2026-106069 | High | 26, 24, 22 | TLS hostname bypass when host loosely resolves to IP |
  | CVE-2026-105481 | Medium | 26, 24, 22 | Keep-alive response before request |
  | CVE-2026-106072 | Medium | 26, 24, 22 | Non-canonical IPv4 lets DNS SANs authenticate IP endpoints |
  | CVE-2026-106074 | Medium | 26, 24, 22 | randomUUID/randomInt entropy caches baked into snapshots/SEAs |
  | CVE-2026-106070 | Low | 26 | ZipFile prefix bytes after failed header validation |
  | CVE-2026-106071 | Low | 26 | Permission Model wildcard over-grant |
  | CVE-2026-106073 | Low | 26, 24, 22 | Permission Model bypass via fs.realpathSync |

- "TLS bypass" in the spec should be plural: there are three TLS hostname issues (two High, one Medium), and one of the Highs does not affect 22.x.
- **eMudhra: yes, Node blocks it.** The advisory lists "ca-cert (eMudhra Intermediate CA Compromise) on 26.x, 24.x, 22.x". The v24.22.1 changelog includes `tls: reject chains containing blocked public keys` (#66871) and `crypto: update root certificates to NSS 3.131.1` (#66877). That NSS version drops emSign ECC Root CA - G3.
- Dependency updates: c-ares on all lines, OpenSSL on 24 and 22, SQLite on 22, and undici on all lines.
- No exploitation has been reported. Nothing is in KEV.

Sources:
- [F] https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- [F] https://nodejs.org/en/blog/release/v24.22.1

## 6. GitLab (spec claim: CVE-2026-110264 CVSS 10.0 regex compiler integer overflow, CE/EE back to 7.0, exact fixed versions? Also CVE-2026-97229 CVSS 10.0 patched Oct 12. Really unauthenticated?)

**Verdict: Confirmed.**

- **CVE-2026-110264** was released 2026-10-21 and scored CVSS 3.1 **10.0** (`AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H`). It is an integer overflow during regex compilation that "could have allowed an unauthenticated user to execute arbitrary code on the GitLab server", "under certain conditions."
  - Affected: CE/EE from 7.0 before 18.11.13, 19.0 before 19.0.10, 19.1 before 19.1.9, 19.2 before 19.2.9, 19.3 before 19.3.6, 19.4 before 19.4.3, and 19.5 before 19.5.1.
  - **Fixed: 19.5.1, 19.4.3, 19.3.6, 19.2.9, 19.1.9, 19.0.10, 18.11.13.** GitLab.com is already patched. Dedicated tenants are safe on 19.3.5-internal0 or 19.4.2-internal0 or later.
  - No workaround. GitLab ships two detections: "Onigmo native worker crash" and "Org mode render error burst." Third-party write-ups tie the bug to org-ruby `#+TODO:` keywords passed to Ruby's Regexp (Onigmo). The advisory itself does not say this.
  - Same release, 11 other CVEs: 2 High (CVE-2026-15723 at 8.2, CVE-2026-112212 at 7.5), 5 Medium and 4 Low. Per secondary reports, the 18.11 to 19.2 backports carry only the critical fix.
  - Unauthenticated? Vendor text and the PR:N vector say yes. The exact preconditions are undisclosed.
  - No exploitation reported. Not in KEV (catalog 2026.10.21).
- **CVE-2026-97229** was released 2026-10-12 and scored CVSS 3.1 **10.0** with the same vector. It is an integer overflow in the CI/CD regex compiler, triggered by a crafted regex in CI/CD config. Affected: 19.2 before 19.2.8, 19.3 before 19.3.5, and 19.4 before 19.4.2. **Fixed: 19.4.2, 19.3.5, 19.2.8.** The release title lists 19.3.4, but the 19.3 fix is 19.3.5 because 19.3.4 had a regression. The vendor says unauthenticated (PR:N). Note that the vector requires a crafted CI config, so treat "unauth" as the vendor's claim.
  - Instances patched on Oct 12 are **still vulnerable** to CVE-2026-110264.

Sources:
- [F] https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-5-1-released/
- [F] https://docs.gitlab.com/releases/patches/patch-release-gitlab-19-4-2-released/
- [S] https://lilting.ch/en/articles/gitlab-cve-2026-110264-org-mode-rce

## 7. Plex2Shell (spec claim: CVE-2026-96652, -96654, -96655, -96656, fixed in PMS 1.43.3.10861, KEV due dates Oct 23 and Nov 3)

**Verdict: Spec is correct. The viral post is partly wrong ("deadline Oct 23" applies to only two of the four).**

- KEV entries (catalog 2026.10.21), all added 2026-10-20:
  - CVE-2026-96652: due **2026-11-03**
  - CVE-2026-96654: due **2026-10-23**
  - CVE-2026-96655: due **2026-11-03**
  - CVE-2026-96656: due **2026-10-23**
- Individual CVSS 4.0 scores (press, from CVE records): 5.3, 6.9, 5.3 and 8.6. Chained, they give unauthenticated RCE (Plex).
- Fixed in Plex Media Server **1.43.3.10861 or newer**. Plex's advisory title says "v1.43.2 and earlier." Builds such as 1.43.3.10828 are not fixed. The fixed build was released around Aug 3-4, 2026. Plex announced it Sep 1, the PoC went public Oct 16, exploitation began Oct 17, and Plex confirmed "actively and widely exploited" on Oct 19.
- Plex also shipped security fixes in Plex Desktop 1.115.0.

Sources:
- [F] https://forums.plex.tv/t/important-security-update-for-plex-media-server-v1-43-2-and-earlier/942319
- [F] CISA KEV JSON (above)
- [S] https://www.bleepingcomputer.com/news/security/cisa-hackers-chain-plex-flaws-in-plex2shell-attacks-to-breach-servers/

## 8. eMudhra (spec claims: Mozilla bug 2083449, Scott Helme "Eight Bits of Trust", ~30,000 certs needing migration vs "60M", affected root "emSign ECC Root CA - G3"? Which roots/intermediates exactly, what did browsers / certifi / OS stores do?)

**Verdict on the viral post: Inflated.** The spec's numbers are right, but its root naming needs a caveat.

- **Key values:** Scott Helme lists the eight recovered P-384 private keys as 156, 230, 115, 56, 155, **4**, 66 and 237, all below 256. Mozilla independently recovered them.
- **17 months:** Helme describes a "17 month window." The keys were generated 2025-04-30 and reported 2026-10-17. eMudhra says about 18 months.
- **"Forged any website for 17 months": not supported.** That was the theoretical exposure. Chrome found no TLS certificate chaining to the six TLS intermediates in CT before its block. eMudhra says none of the intermediates issued an end-entity certificate (only one was in production). Nobody has shown evidence of misuse before disclosure. Since disclosure, multiple people have recovered the keys, and keys are published online.
- **"60M+ certs": wrong.** "60 million" appears nowhere in the bug or in Helme's post. In bug comment 19, eMudhra estimated **about 30,000 certs need migration (about 97% via ACME)**. Comment 30 counts about 30,800 unexpired precerts chaining to emSign ECC Root CA - G3, 99.9% from two InCommon subordinate CAs. eMudhra says the impact is one US customer ecosystem.
- **The eight intermediates** (bug 2083449, comment 0):
  - TLS (6): EM EV/OV/DV TLS CA - G3B (eMudhra BV) and EM EV/OV/DV TLS CA - G3C (eMudhra Inc). The bug lists the issuer as "emSign Root TLS CA - G3".
  - Code signing (2): EM OV CS CA - G3B and G3C. The bug lists the issuer as "emSign Root CS CA - G3". These are trusted by Microsoft only.
  - Each intermediate also had a **Sectigo cross-sign under "AAA Certificate Services"**, 16 certs in total. Sectigo has revoked these.
- **Root naming caveat (VERIFY):** Mozilla, Chrome, CERT-In and eMudhra name the distrusted root **"emSign ECC Root CA - G3"**. Bug comment 0 labels the TLS issuer "emSign Root TLS CA - G3". Treat "emSign ECC Root CA - G3" as the root-store name, and confirm the subject DN against crt.sh before hardcoding a match. **emSign Root CA - G1 is NOT distrusted.**
- **Actions taken:**
  - Chrome: CRLSet block on 2026-10-17 at 19:45 UTC. Root removal in Chrome Root Store v43, expected in Stable on 2026-10-27.
  - Mozilla: OneCRL block completed 2026-10-17 at 22:59 UTC. Firefox 158.0.1, ESR 115.43.1 and ESR 153.5.1 followed, then 158.0.2 for Android on Oct 21. NSS 3.131.1 removes the root that signed the intermediates. Secondary sources say NSS 3.131.1 also drops emSign Root CA - C1 and emSign ECC Root CA - C3; eMudhra calls that a planned removal unrelated to the incident.
  - Apple blocked on Oct 19 and Microsoft on Oct 20 (secondary sources: Helme, incident site).
  - eMudhra revoked all eight intermediates on Oct 18 (caCompromise).
  - **certifi:** GHSA-6q48-6c7w-9gw2, published Oct 20, rated Critical, no CVE. It removes the emSign roots, lists affected versions as >=2019.03.09, and gives the fixed version as **2026.10.18**. PyPI shows 2026.10.18 (released Oct 18) and **2026.10.19 (released Oct 20)**, and secondary sources cite 2026.10.19. **VERIFY:** recommend >= 2026.10.19 to be safe.
  - Go: 1.27.3 and 1.26.10 (CVE-2026-111943) add an SPKI denylist in crypto/x509. Programs must be rebuilt.
  - Oracle Java SE / GraalVM: out-of-band alert CVE-2026-91403 (CVSS 9.1) in JSSE, released Oct 21.
  - Others (secondary): Rust webpki-roots 1.0.10, Debian DSA-6572-1, Ubuntu, Arch and Gentoo ca-certificates, Electron 44.9.1 / 43.8.1 / 42.11.16, uv 0.13.4, pip 26.2.2, Mozilla::CA 20261020, and Composer ca-bundle 1.6.0 / 1.4.16.
  - Helme's tests found that curl, Python and Node on Linux and macOS accepted a forged chain before these updates. Windows CryptoAPI accepted it unless revocation checking was on.

Sources:
- [F] https://bugzilla.mozilla.org/show_bug.cgi?id=2083449
- [F] https://scotthelme.co.uk/eight-bits-of-trust-emudhras-ca-keys-cracked-in-milliseconds/
- [F] https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2
- [F] https://pypi.org/project/certifi/#history
- [S] https://blog.mozilla.org/security/2026/10/20/protecting-firefox-users-following-the-compromise-of-emudhra-intermediate-certificates/
- [S] https://emudhra.com/en/post/certificate-security-incident
- [S] https://www.newindianexpress.com/business/2026/Oct/21/cert-in-warns-of-security-risk-in-eight-emudhra-digital-certificates (CERT-In advisory)

## 9. SBI (spec claim: Regulation 30 filing, 3,897 customers)

**Verdict: Confirmed.**

- SBI filed under SEBI LODR Regulation 30 on 2026-10-21, titled "Incident involving Data Loss."
- On Oct 16, SBI received alerts from its threat intelligence provider, the Defence Cyber Agency and CERT-In.
- Of about 3,75,000 records found on the dark web, **3,897 customer records contain PII**: mobile number, DOB, name, gender, email, address, branch and CIF IDs, lead IDs, and loan/lead metadata.
- A threat actor called "Siriusim" claims 3.75 lakh rows plus 2,722 PDFs. SBI's filing does not address the PDFs.
- The BSE/NSE filing PDF itself was **not fetched**. The details above are consistent across The Hindu, Indian Express, New Indian Express (PTI) and the IFF statement.

Sources:
- [S] https://www.thehindu.com/business/Economy/state-bank-of-india-investigates-exposure-customer-records-dark-web-october-21/article71606599.ece
- [S] https://internetfreedom.in/sbi-told-investors-its-data-breach-doesnt-matter-what-about-the-3-897-customers-it-affected/

## 10. Rajasthan Police (any confirmation?)

**Verdict: Unverified.**

- "Scarlettgroup" claims on BreachForums to hold about 70,000 identity records, 59,460 mobile numbers and 6.63 GB of attachments (FIRs, eKYC, witness statements). FalconFeedsio was the first to report it. Ransomware.live lists it with an estimated attack date of 2026-10-14.
- As of Oct 21 reporting (India Today, Business Today, The420.in), Rajasthan Police had not commented, and nobody had authenticated the data.

Sources:
- [S] https://www.indiatoday.in/amp/technology/news/story/rajasthan-govt-website-data-breach-reported-up-to-70000-identity-records-exposed-3022004-2026-10-21
- [S] https://www.ransomware.live/id/cG9saWNlLnJhamFzdGhhbi5nb3YuaW5AU2NhcmxldHRncm91cA

---

## Other developer-relevant incidents the post missed (Oct 17-22)

- **Go CVE-2026-111943** (Oct 19-20): Go 1.27.3 and 1.26.10 block the eMudhra SPKIs. Rebuild Go binaries to get the protection.
- **Oracle Java CVE-2026-91403** (Oct 21): CVSS 9.1, JSSE, eMudhra distrust for Java SE and GraalVM.
- **GhostAction GitHub Actions campaign** (Oct 8-12, reported through Oct 19): fake "Security Audit" workflows pushed to about 30,000 repos from about 1,900 hijacked accounts, scanning full git history for secrets. Exfiltration goes to 193.32.204[.]199. GitHub blocked the workflow on Oct 9. Rotating secrets found anywhere in git history is the recommended action. [S] https://diesec.com/2026/10/ghostaction-github-actions-attack-steals-secrets/
- OVHcloud GitHub release hijack and AOMEI update hijack (Oct 20, from search listings only, not verified).
- Google Cloud London outage on Oct 20 hit Revolut and UK banks. This was availability only, not security.
- CERT-In advisory CIAD-2026-0049, "AI Agents as Attack Vectors" (Oct 15).

---

## Corrections and flags for the spec

1. **LiteLLM:** add the Docker exposure (GHCR and Docker Hub tags `v1.107.0`, `latest`, `main-latest`, `main-stable`; windows until 13:51 and 14:20 UTC). Add the extra IOCs (`litellm-1.107.0.dist-info`, `/tmp/.pc_once_72129118c59f5636c0bb`, `/tmp/remote_code_loader.lock`). Note that the backdoor loop is Linux/macOS only, while the stealer runs on Windows. Wiz publishes per-OS SHA-256 hashes. The safedep.io URL was not fetched (VERIFY).
2. **PHP:** CISA's offline advice is conditional: it covers systems that cannot update immediately, or that run 8.1 or older. Not in KEV as of catalog 2026.10.21. NVD also lists CVSS 3.1 9.8. PHP published source backports for 7.4, 8.0 and 8.1.
3. **Node:** "TLS hostname validation bypass" is three CVEs (105483, 106069, 106072). No CVSS scores were published. Releases went to 22, 24 and 26 only. eMudhra is blocked via an SPKI blocklist plus NSS 3.131.1 roots.
4. **GitLab:** the CVE-2026-97229 fix on the 19.3 line is **19.3.5**, not 19.3.4. Oct 12 patches do not fix CVE-2026-110264. Neither CVE is in KEV.
5. **Plex:** only CVE-2026-96654 and -96656 are due Oct 23. CVE-2026-96652 and -96655 are due Nov 3.
6. **eMudhra:** "60M" is wrong; the figure is about 30,000 (eMudhra estimate) or about 30,800 precerts (CT). There is no evidence of forged certs. Confirm the root DN: "emSign ECC Root CA - G3" is the root-store name, but the bug labels the issuer "emSign Root TLS CA - G3". The code-signing intermediates sit under "emSign Root CS CA - G3". Sectigo AAA cross-signs also exist. emSign Root CA - G1 is not distrusted.
7. **certifi:** the GHSA says 2026.10.18 is fixed, while PyPI's latest is 2026.10.19 (Oct 20). VERIFY; recommend >= 2026.10.19.
8. **OpenCode:** the date of Oct 17 is correct. The primary X post could not be fetched; claims rest on consistent press coverage.
9. **SBI:** the primary BSE/NSE filing was not fetched. Press coverage is consistent.
10. **Rajasthan Police:** keep as unverified. There is no official confirmation.
