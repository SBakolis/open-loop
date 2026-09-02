# Smoke Test Report

Date: 2026-09-02

| Scenario | Host | Result |
|---|---|---|
| Compiled plugin import from packed artifact | OpenCode 1.18.19 / macOS | Pass |
| Host loads packed plugin and config hook registers `/loop` | OpenCode 1.18.19 / macOS | Pass |
| Installer idempotence and command discovery | OpenCode 1.18.19 / macOS | Pass |
| Automated unit/integration/race suite | SDK types 1.18.26 / Node 24 | Pass |

Provider-backed multi-turn scenarios require user credentials and are not claimed as complete until run in a configured host. See `KNOWN_LIMITATIONS.md`.
