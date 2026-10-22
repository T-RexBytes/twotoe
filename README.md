# TwoToe

Local overnight breach-week triage. TwoToe scans your machine while you sleep and at 7 a.m. hands you two lines and a short rotate or patch checklist.

Code owns the facts. A local open-weight model (Gemma via Ollama) only phrases them. A validator throws out anything the model said that code did not establish. No secret value is read, and nothing leaves your machine except the CISA KEV feed request (and Sentry, only if you opt in).

> Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady". The repo was started on Oct 22, 2026, inside the challenge window.

## Status

Phase 0 of the build plan in [docs/SPEC.md](docs/SPEC.md): monorepo scaffold, data contracts, and the dated advisory pack. Nothing scans yet.

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
