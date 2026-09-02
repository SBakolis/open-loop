# Security

## Trust Boundaries

Loop IDs and calling session IDs are separate trust domains. Tool context supplies the session ID; model arguments never select another session. The scheduler will not drive persisted sessions that this process has not observed.

Timers establish due time only. Immediately before injection, the scheduler verifies persisted state, ownership lease, process observation, session idleness, permission state, expiry, and per-session serialization.

## Verifier Commands

Only explicit user command arguments or trusted configuration can create verifier commands. Commands run via the platform shell in the captured project directory. This intentionally supports shell syntax and means verifier text must be treated as trusted code. Output and persisted errors are bounded and probable credentials are redacted. Environment values are never persisted.

## State

State can contain prompts and command strings. The data directory and files are created owner-only where supported. Delete the state file shown by `open-loop doctor` to remove all persisted loop data. Corrupt or schema-invalid state is quarantined rather than executed.

Report vulnerabilities according to `SECURITY.md` and do not include secrets or sensitive state in reports.
