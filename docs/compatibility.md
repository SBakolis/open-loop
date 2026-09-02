# Compatibility

## Support Matrix

| Component | Minimum supported | Tested latest |
|---|---:|---:|
| OpenCode | 1.18.19 | 1.18.19 locally |
| `@opencode-ai/plugin` | 1.18.19 | 1.18.26 |
| `@opencode-ai/sdk` | 1.18.19 | 1.18.26 |
| Node.js | 20 | 24 |

Research and type verification were performed on 2026-09-02. OpenCode `1.18.26` types expose `session.promptAsync`, `session.abort`, `session.messages`, structured app logging, TUI toast, config, event, message, permission, system transform, compaction, and disposal hooks.

The server adapter deliberately uses the generated 1.x method names. OpenCode 2 preview is not supported by this release; a future adapter can implement the host-independent `OpenCodeAdapter` interface.

The current host does not provide a reliable plugin-level token budget or an explicit restricted-agent activity signal for autonomous dispatch. The plugin preserves the initiating agent and refuses configured restricted names rather than switching agents.
