# Decisions log

Choices made where the spec was silent, ambiguous, or in tension with CLAUDE.md. Newest last.

| Date | Decision | Why |
|---|---|---|
| 2026-10-22 | zod 3.25.76, not zod 4 | SPEC 6 uses `z.record(z.any())`, which is zod 3 syntax; keeps the schemas verbatim. |
| 2026-10-22 | pnpm 11.28.7 via a corepack shim in the user npm folder | pnpm 12 failed under corepack 0.34; the shim needs no admin rights. |
| 2026-10-22 | esbuild install script declined (`allowBuilds: { esbuild: false }`) | No dependency install scripts run; esbuild works from its platform binary. |
| 2026-10-22 | No rule-1 carve-out for PATH / APPDATA / USERPROFILE | Paths come from `os.homedir()` and fixed defaults; `where.exe` reads PATH in its own process; every spawned tool gets an empty env from an empty temp dir. |
| 2026-10-22 | .env parser tracks open quotes; base64-looking "keys" are dropped and counted | Stops PEM or JSON fragments inside multi-line values from being reported as key names. |
| 2026-10-22 | Skip counts live in `ScanResult.stats`, not `brief.meta` | SPEC 5.4 says brief.meta, but the Brief schema has no field for it. Revisit in Phase 3/4. |
| 2026-10-22 | Optional `Finding.vars` (found, fixed, variant) and `Advisory.shortAction` | SPEC 10.6 needs {found}/{fixed} per finding and asks for shortAction; section 6 had no field for either. |
| 2026-10-22 | `line2Tail` fills "Everything else: {tail}." | SPEC 10.7's line-2 code does not use it; this lets the writer phrase it while code owns the numbers. |
| 2026-10-22 | `twotoe brief` without `--no-llm` exits 2 until the writer exists | Never pretend a model ran. |
| 2026-10-22 | **TwoToe reads exactly one of its own env vars: `TWOTOE_MODEL`** | SPEC 10.1 and 5.3 specify it. Allowlisted by name; no other env value is read. Precedence: `--model` > `TWOTOE_MODEL` > `config.json` `model` > `gemma4:e4b`. Model tags containing `cloud` or `-remote` are refused (Ollama has `gemma4:cloud`), so a config typo cannot send findings off the machine. Everything else (region, roots) stays in `config.json` and flags. |
| 2026-10-22 | Call Ollama with `think: false` | Measured: same request 2.1 s / 21 output tokens with `think: false` vs 14.9 s / 272 tokens with thinking on. |
| 2026-10-22 | Egress guard allowlist is per install, and also guards `http`/`https` request+get and `net`/`tls` connect | The 15.1 sketch mutates a module-level Set (extra hosts would leak into later installs) and only wraps fetch. Pipes (local IPC) are allowed. |
| 2026-10-22 | CVE regex in risky-token extraction is `CVE-\d{4}-\d+` instead of `\d{4,}` | Stricter: an invented "CVE-2026-1" slipped past the spec regex in a test. |
| 2026-10-22 | `allowedTokens` include the advisory's `disclosedAt` date parts | The SPEC 10.4 few-shot says "The Oct 21 Node release"; without this the validator would reject the spec's own example. |
| 2026-10-22 | The model-facing finding includes `kev` | SPEC 10.2 rule 4 refers to kev, but the SPEC 6 field list omits it. |
| 2026-10-22 | Code reorders the model checklist to priority order and lowercases a line-1 action's first word (unless a product name); it does not reject for these | Formatting, not facts. Rejecting would burn a 20 s retry on casing. |
| 2026-10-22 | No model call when there are zero findings (mode `template`) | Nothing to phrase; RESEARCH P10. |
| 2026-10-22 | Model call errors (Ollama down, timeout, blocked) skip the retry and fall back to the template | Retrying a refused connection only adds 90 s. The reason is recorded. |
| 2026-10-22 | The line-2 tail must contain no risky token at all (digits, CVEs, versions, vendor names) | SPEC 10.5 item 8 checks digits only; a tail like "Plex is fine now" would be an unverified claim. |
