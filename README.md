# TwoToe

Local overnight breach-week triage. TwoToe scans your machine while you sleep and at 7 a.m. hands you two lines and a short rotate or patch checklist.

Code owns the facts. A local open-weight model (Gemma via Ollama) only phrases them. A validator throws out anything the model said that code did not establish. No secret value is read, and nothing leaves your machine except the CISA KEV feed request (and Sentry, only if you opt in).

> Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady". The repo was started on Oct 22, 2026, inside the challenge window.

## Status

Phases 0 to 5 of the build plan in [docs/SPEC.md](docs/SPEC.md): scanners, matcher, local-model writer with a grounding validator, egress guard, Temporal nightly workflow, and the morning card. Eval and the write-up come next.

## Commands

```powershell
pnpm tsx packages/cli/src/index.ts scan --json          # facts only: what is on this machine
pnpm tsx packages/cli/src/index.ts brief --no-llm       # the two lines + checklist, no model
pnpm tsx packages/cli/src/index.ts brief --save         # local model (Ollama), saved for the card
pnpm tsx packages/cli/src/index.ts card                 # the morning card on http://127.0.0.1:4777
pnpm tsx packages/cli/src/index.ts sleep --dry-run      # what the nightly install would register
pnpm tsx packages/worker/scripts/crash-test.ts          # kill the worker mid-run, prove nothing ran twice
```

The demo card with example briefs from synthetic fixtures: see [docs/DEPLOY.md](docs/DEPLOY.md).

## Telemetry (off by default)

TwoToe can send one Sentry trace per run: scan, match, each model attempt with token counts, and each validator verdict. It is off unless you turn it on in `~/.twotoe/config.json`:

```json
{ "telemetry": { "sentry": true, "dsn": "https://<key>@o<org>.ingest.sentry.io/<project>" } }
```

What is sent: span names, timings, model name, token counts, validator rejection reasons. Not sent: prompts and responses (only with `--trace-content demo` on a `--fixture` run), file paths, env key names, your hostname. The trace upload is the only request besides loopback, and it appears in the brief's network ledger. The Sentry SDK is not even loaded when telemetry is off.

## What it checks

The bundled pack ([packages/core/src/pack/advisories.json](packages/core/src/pack/advisories.json)) covers the week of Oct 21, 2026: LiteLLM 1.107.0, Railway, OpenCode Console, PHP, Node.js, GitLab, Plex, eMudhra, SBI (FYI for India), plus recent CISA KEV entries. Every entry has source links and a `verifiedAt` date. Open questions are tracked in [docs/VERIFY.md](docs/VERIFY.md).

## Privacy rules

- Reads env key names, never values.
- Never opens or runs indicator files (`cook.pth`, `cook.py`, `sitecustomize.py`): size and SHA-256 only.
- Never runs package managers or user project code during a scan.
- All network goes through an allowlist: loopback, `www.cisa.gov`, and the Sentry host only if telemetry is on.

## Development (Windows first)

Requires a patched Node (22.23.4, 24.22.1, 26.12.1 or newer in that line; see `.nvmrc`). pnpm refuses to install on anything older. pnpm comes from corepack, pinned by `packageManager`.

```powershell
# once: put the pnpm shim in your user npm folder (no admin needed)
corepack enable --install-directory (npm config get prefix) pnpm

pnpm install
pnpm typecheck
pnpm -r test
pnpm tsx packages/cli/src/index.ts scan $HOME\code --json
```

Note: winget's Node LTS package may lag behind security releases. Check `node -v` after installing.

## Credits

No third-party code reused so far. This section lists anything reused later.

## License

MIT
