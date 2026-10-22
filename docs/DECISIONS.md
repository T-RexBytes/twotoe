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
| 2026-10-22 | Call Ollama with `think: false` (Phase 3, to verify) | gemma4:e4b thinks by default: a tiny structured-output test used 391 output tokens for about 30 visible ones. |
