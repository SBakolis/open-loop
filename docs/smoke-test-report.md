# Smoke Test Report

Date: 2026-09-03

| Scenario | Host | Result |
|---|---|---|
| Compiled plugin import from packed artifact | OpenCode 1.18.19 / macOS | Pass |
| Host loads packed plugin and config hook registers `/loop` | OpenCode 1.18.19 / macOS | Pass |
| Installer idempotence and command discovery | OpenCode 1.18.19 / macOS | Pass |
| Automated unit/integration/race suite | SDK types 1.18.26 / Node 24 | Pass |
| First state update with a missing parent directory | Node 26 / macOS | Pass |
| Install, doctor, and entrypoint imports from the `0.1.3` tarball | OpenCode 1.18.19 / Node 26 / macOS | Pass |

## Published Package Correction

The first public package, `@sbakolis/open-loop@0.1.0`, exposed only the root entrypoint. OpenCode's package installer requires `exports["./server"]` and therefore rejected that version. Version `0.1.1` adds the required server entrypoint; `0.1.0` should not be used.

Provider-backed multi-turn scenarios require user credentials and are not claimed as complete until run in a configured host. See `KNOWN_LIMITATIONS.md`.
