# open-loop

`open-loop` is an OpenCode 1.x plugin for safe goal-oriented and scheduled autonomous work. One scheduler, persisted state store, session dispatch guard, and management interface support goal, fixed-interval, and agent-selected dynamic loops.

## Install

```sh
opencode plugin open-loop --global
npx open-loop install
```

The second command idempotently registers the plugin and installs the `/loop` command in `~/.config/opencode`. Restart OpenCode after installation because configuration and plugins are loaded at startup. Use `npx open-loop install --project` for project-local installation, `npx open-loop uninstall`, or `npx open-loop doctor`.

## Usage

```text
/loop until make all tests pass
/loop until --max-runs 20 --verify "npm test" -- make all tests pass
/loop 5m check CI and fix failures
/loop every 5m -- check CI and fix failures
/loop dynamic -- monitor deployment and choose the next useful check time
/loop status
/loop pause <loop-id>
/loop resume <loop-id>
/loop run <loop-id>
/loop steer <loop-id> -- focus on the API tests
/loop stop <loop-id>
/loop stop --all
/loop clear
```

Canonical syntax uses `until`, `every`, or `dynamic` and a `--` prompt delimiter. Bare prompts default to goal mode. Text after the delimiter is preserved, including newlines, repeated whitespace, quotes, code, and flag-like text.

Creation is iteration one: after `create_loop` succeeds, the same agent turn starts the work. Later iterations run only when the owning session has been observed by this process and is confirmed idle.

## Modes

- `goal`: continues at safe idle boundaries until completion evidence, a blocker, a stop, expiry, or a safety budget.
- `interval`: runs once immediately and then at a fixed-rate cadence. Busy ticks coalesce into one due run.
- `dynamic`: runs immediately and must call `schedule_next_run` or `stop_loop` before each turn ends.

One goal and up to five scheduled loops are allowed per session by default. Goal/scheduled overlap is blocked unless explicitly allowed, and autonomous prompts are always serialized per session.

## Completion

Without `--verify`, goal completion requires `complete_loop` with meaningful evidence. With `--verify`, the default is hybrid: agent evidence and a successful host verifier command are both required. `--completion command` makes the user-supplied command authoritative.

Verifier commands are trusted user input, execute with `shell: true` in the recorded project directory, time out after 120 seconds by default, cap output, kill the process group where supported, and redact probable secrets. Model text cannot silently replace the command.

The strict fallback is accepted only on final standalone lines outside code fences:

```text
[loop:evidence] Tests and typecheck pass
[loop:complete]
```

## Configuration

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [["open-loop", {
    "bare_mode": "goal",
    "register_command": true,
    "min_goal_delay_seconds": 2,
    "min_interval_seconds": 30,
    "max_dynamic_delay_seconds": 86400,
    "default_goal_max_runs": 25,
    "restricted_agents": ["plan"]
  }]]
}
```

Invalid plugin options fall back to safe defaults and emit structured warnings. Plan/restricted agents are never changed automatically.

## State And Safety

State defaults to `$XDG_DATA_HOME/open-loop/state.json`, `~/.local/share/open-loop/state.json`, or `%APPDATA%\open-loop\state.json`. Override it with `OPEN_LOOP_STATE_PATH`. Writes use owner-only permissions, a lock file, fsync, and atomic rename. Invalid files are quarantined as `state.json.corrupt.<timestamp>`.

Persistent leases prevent duplicate dispatch across plugin instances. Human messages outrank queued work, permission requests block dispatch, deleted sessions stop their loops, and restored loops never dispatch until their owning session is observed. `--no-persist` loops stay in memory and stop on disposal.

Run `open-loop doctor` for registration, command discovery, compatibility, and state-path diagnostics. See [security](docs/security.md), [architecture](docs/architecture.md), and [known limitations](KNOWN_LIMITATIONS.md).

## Development

```sh
npm install
npm run lint
npm run typecheck
npm test
npm run build
npm pack
```

## License

MIT
