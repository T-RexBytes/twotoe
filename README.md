# TwoToe

[![ci](https://github.com/T-RexBytes/twotoe/actions/workflows/ci.yml/badge.svg)](https://github.com/T-RexBytes/twotoe/actions/workflows/ci.yml)

Local overnight breach-week triage. TwoToe scans your machine while you sleep and at 7 a.m. hands you two lines and a short rotate or patch checklist.

Code owns the facts. A local open-weight model (Gemma via Ollama) only phrases them. A validator throws out anything the model said that code did not establish. No secret value is read, and nothing leaves your machine except the CISA KEV feed request (and Sentry, only if you opt in).

> Built for the DEV Hacktoberfest Open-Source AI Challenge, Week 3: "Slow and Steady". The repo was started on Oct 22, 2026, inside the challenge window.

## Status

Phases 0 to 7 of the build plan in [docs/SPEC.md](docs/SPEC.md) are built: scanners, matcher, local-model writer with a grounding validator, egress guard, Temporal nightly workflow, morning card, eval harness ([eval/RESULTS.md](eval/RESULTS.md)) and opt-in Sentry tracing. Also built: every SPEC 12 command (`doctor`, `explain`, `pack`, `eval`, `ask`), a local read-aloud (`brief --speak`) and macOS LaunchAgents (`sleep --launchd`, untested on a Mac).

Not built, on purpose: the Mastra version of `ask` (Mastra sends usage telemetry to PostHog by default, which this tool's network rules do not allow; `ask` uses the same local model and validator instead), the ElevenLabs voice (needs a cloud API key), and the Arduino desk sloth (needs hardware).

## Running TwoToe

No `.env` and no API keys are needed. Everything TwoToe talks to runs on your machine:

| Part | How it is reached | Configuration |
|---|---|---|
| Local model | Ollama on `127.0.0.1:11434` | none; optional `TWOTOE_MODEL` (default `gemma4:e4b`), the only env var TwoToe reads |
| Temporal (nightly workflow only) | dev server on `127.0.0.1:7233` | none; no account, no key |
| Sentry (optional) | your project's ingest host | `telemetry` in `~/.twotoe/config.json`, off by default |

Install once:

1. Node 24.22.1 or newer (or 22.23.4 / 26.12.1), then `corepack enable --install-directory (npm config get prefix) pnpm`
2. [Ollama](https://ollama.com), then `ollama pull gemma4:e4b`
3. Only for the nightly run and the crash test: `winget install Temporal.TemporalCLI`

Then in the repo:

```powershell
pnpm install
pnpm tsx packages/cli/src/index.ts brief --no-llm --fixture eval/fixtures/f22-kitchen-sink   # no model needed
pnpm tsx packages/cli/src/index.ts brief --fixture eval/fixtures/f22-kitchen-sink            # with the local model
pnpm tsx packages/cli/src/index.ts brief --save                                              # your machine, saved for the card
```

Optional `~/.twotoe/config.json`:

```json
{
  "roots": ["~/code", "D:/projects"],
  "exclude": ["D:/projects/some-repo-with-test-data"],
  "region": "IN"
}
```

`roots` are the folders to scan (default: `~\code`, `~\projects`, `~\dev`, `~\Documents\GitHub`, `~\source\repos`, `~\Desktop`, whichever exist). Any folder holding a `.twotoe-ignore` file is skipped; TwoToe's own `eval/fixtures` has one, so its planted test findings never count on a real scan.

## The nightly run, honestly

TwoToe cannot wake a computer that is off, and neither can Temporal.

- **PC asleep or off at 3 a.m. (Temporal):** the schedule's 18-hour catch-up window runs the missed brief as soon as the Temporal dev server is back, which `twotoe sleep --taskscheduler` arranges at your next log on. You get the brief a minute after you log in, not at 7 a.m.
- **PC asleep at 3 a.m. (Task Scheduler, `twotoe sleep --no-temporal`):** the task has `WakeToRun`, so Windows wakes the laptop from sleep if wake timers are allowed in your power plan, and `StartWhenAvailable`, so a missed run starts at your next log on (the task runs as you, interactively).
- **PC shut down:** nothing runs until you turn it on and log on; then either option runs the missed brief.
- **Simplest:** run `twotoe brief --save` when you sit down, then `twotoe card`.

## Commands

```powershell
pnpm tsx packages/cli/src/index.ts doctor --fix        # is everything in place? prints fixes, runs nothing
pnpm tsx packages/cli/src/index.ts scan --json          # facts only: what is on this machine
pnpm tsx packages/cli/src/index.ts brief --no-llm       # the two lines + checklist, no model
pnpm tsx packages/cli/src/index.ts brief --save         # local model (Ollama), saved for the card
pnpm tsx packages/cli/src/index.ts brief --open         # same, then opens the card
pnpm tsx packages/cli/src/index.ts brief --speak        # reads the two lines aloud (Windows speech, offline)
pnpm tsx packages/cli/src/index.ts explain nodejs       # evidence, advisory and sources for one finding
pnpm tsx packages/cli/src/index.ts ask "why does the Node one matter?"   # answered only from the findings, validated
pnpm tsx packages/cli/src/index.ts card                 # the morning card on http://127.0.0.1:4777
pnpm tsx packages/cli/src/index.ts pack --refresh       # pack version, verifiedAt dates, fresh CISA KEV
pnpm tsx packages/cli/src/index.ts sleep --dry-run      # what the nightly install would register
pnpm tsx packages/cli/src/index.ts sleep --uninstall    # remove the nightly tasks
pnpm tsx packages/cli/src/index.ts eval --no-llm        # eval harness on the 24 fixtures (add --models to run models)
pnpm tsx packages/worker/scripts/crash-test.ts          # kill the worker mid-run, prove nothing ran twice
```

On macOS, `sleep --launchd` installs LaunchAgents instead of scheduled tasks. It is built from the same plans as the Windows tasks but has not been run on a real Mac.

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
pnpm coverage        # line coverage for core and writer, fails under 90%
pnpm tsx packages/cli/src/index.ts scan $HOME\code --json
```

Note: winget's Node LTS package may lag behind security releases. Check `node -v` after installing.

## Credits

No third-party code reused so far. This section lists anything reused later.

## License

MIT
