# TwoToe: working agreement for Claude Code

Spec: docs/SPEC.md (authoritative). If code and spec disagree, ask before changing the spec.

## Product in one line
Local overnight breach-week triage. Code owns facts, the local model only phrases them,
a validator rejects anything the model said that code did not establish.

## Hard rules (never break, never "temporarily" break)
1. Never read, store, log, trace, or print env VALUES. Key names only. Canary
   TWOTOE_CANARY_9f3a must never appear in any output.
2. Never open IOC files (cook.pth, cook.py, sitecustomize.py) as text, never import or
   execute them, never run Python with user site-packages. stat + sha256 only.
3. Never run pip/npm/pnpm install or any command that executes user project code
   during a scan. execFile only, no shell strings, 5s timeouts.
4. All network goes through the egress guard. Allowed: loopback, www.cisa.gov, and the
   Sentry host only when telemetry is opted in. Add nothing else without asking me.
5. No exploit code, no PoCs, no probing hosts. Defensive only.
6. Demo material and eval use fixtures only. Never commit real paths from my machine.
   Redact C:\Users\<name> (and /Users/, /home/) to ~ in every output.
7. Never change eval/fixtures/*/expected.json to make metrics pass. Fix the code.
8. Facts in packages/core/src/pack/advisories.json must come from a source URL you
   actually fetched. Set verifiedAt. If unsure, write VERIFY and list it in docs/VERIFY.md.

## Platform: Windows first
- I develop and demo on Windows (PowerShell / Windows Terminal), not WSL.
- No bash scripts. All scripts are TypeScript run with tsx.
- path.join everywhere; fast-glob with forward-slash patterns; CRLF-tolerant parsers.
- execFile for .exe, cross-spawn for .cmd shims (pnpm, npm, railway, opencode). Arg arrays only.
- PowerShell: -NoProfile -NonInteractive, user values via env vars, never interpolated.
- Scanners skip EBUSY/EPERM/EACCES files and count them instead of crashing.
- CI must pass on windows-latest.

## Style
- TypeScript strict, zod at boundaries, pure functions in core/match and writer/validate.
- Vitest for everything. Run `pnpm -r test` before saying a phase is done.
- No em dashes in user-facing strings or docs.
- User-facing copy is calm and short. No hype words unless severity rules allow them.

## Workflow
- Work in the phases from SPEC section 16. Stop at each gate and summarize:
  what changed, test results, open questions, anything you could not verify.
- Prefer small commits with clear messages. Never push after tag v1.0-submission.
