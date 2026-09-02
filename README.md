# open-loop

`open-loop` is an OpenCode 1.x plugin for safe goal-oriented and scheduled autonomous work. One scheduler, persisted state store, session dispatch guard, and management interface support goal, fixed-interval, and agent-selected dynamic loops.

## Install

```sh
opencode plugin @sbakolis/open-loop --global
npx @sbakolis/open-loop install
```

The second command idempotently registers the plugin and installs the `/loop` command in `~/.config/opencode`. Restart OpenCode after installation because configuration and plugins are loaded at startup. Use `npx @sbakolis/open-loop install --project` for project-local installation, `npx @sbakolis/open-loop uninstall`, or `npx @sbakolis/open-loop doctor`.

## Command Structure

`/loop` has start commands, which create new work, and management commands, which inspect or change existing loops.

### Start Commands

```text
/loop until [options] -- <goal>
/loop every <duration> [options] -- <instruction>
/loop <duration> [options] -- <instruction>
/loop dynamic [options] -- <instruction>
/loop [options] -- <prompt>
```

The canonical forms use an explicit mode and `--` before the prompt. Options are recognized only before prompt text begins. After `--`, all remaining content is treated as prompt text, even if it contains quotes, newlines, repeated whitespace, code, or text such as `--max-runs`.

The delimiter can be omitted for simple commands. In that case, the first token that is not a recognized option starts the prompt, and everything after it is prompt text:

```text
/loop until make all tests pass
/loop 5m check CI and fix failures
```

A command without `until`, `every`, `dynamic`, or a leading duration is a bare command. Bare commands use goal mode by default. The `bare_mode` configuration can change this to dynamic mode or reject bare commands as ambiguous.

Creation is iteration one. The agent starts the requested work in the same turn that creates the loop; it does not wait for a timer or another idle event. Subsequent iterations run only after the owning session has been observed and confirmed idle.

### Goal Mode

```text
/loop until [options] -- <goal>
```

Goal mode repeatedly continues toward a finite objective at safe idle boundaries. It ends when completion is verified, the agent reports a concrete blocker, the user stops it, its age or run budget is exhausted, repeated failures occur, or no progress is detected.

```text
/loop until -- make all tests pass without weakening assertions
/loop until --max-runs 20 --verify "npm test" -- fix the failing tests
/loop until --max-age 45m -- complete the migration
```

Only one open goal loop is allowed per session. The default limit is 25 iterations and two hours.

### Interval Mode

```text
/loop every <duration> [options] -- <instruction>
/loop <duration> [options] -- <instruction>
```

Interval mode performs one iteration immediately and repeats the instruction on a fixed wall-clock cadence. The leading-duration form is an alias for `every`.

```text
/loop every 10m -- check CI and address actionable failures
/loop 30s --max-runs 2 -- append one timestamp to the report
/loop 1h --once -- inspect the deployment once now
```

The minimum interval is 30 seconds by default. If ticks occur while the session is busy, they are coalesced into one due run rather than queued or replayed individually. After dispatch, the schedule advances to the first cadence boundary in the future, preventing timer drift and catch-up storms.

### Dynamic Mode

```text
/loop dynamic [options] -- <instruction>
```

Dynamic mode performs one iteration immediately and lets the agent choose when another check is useful. Before each iteration ends, the agent must call `schedule_next_run` with a delay and reason, or call `stop_loop`.

```text
/loop dynamic -- monitor the deployment and choose the next useful check time
/loop dynamic --max-age 4h -- watch CI until the release completes
```

Dynamic delays are clamped to the configured minimum and maximum, which default to 30 seconds and 24 hours. If an iteration ends without scheduling or stopping, the loop stops with `iteration_ended_without_reschedule` rather than guessing a delay.

### Durations

Durations are a positive number followed by one of these units:

| Unit | Accepted forms | Examples |
|---|---|---|
| Seconds | `s`, `sec`, `second`, `seconds` | `30s`, `30 seconds` |
| Minutes | `m`, `min`, `minute`, `minutes` | `5m`, `5 minutes` |
| Hours | `h`, `hr`, `hour`, `hours` | `2h`, `2 hours` |
| Days | `d`, `day`, `days` | `1d`, `1 day` |

Months and calendar expressions are not supported. Zero, negative, non-numeric, overflowing, and excessively large durations are rejected.

## Start Options

Options must appear after the mode or interval and before the prompt begins.

| Option | Functionality |
|---|---|
| `--max-runs <number>` | Sets the maximum number of iterations, including the immediate creation iteration. The value must be a positive integer. Goal mode defaults to 25; scheduled modes otherwise run until their age limit or an explicit stop. |
| `--max-age <duration>` | Sets the maximum wall-clock lifetime measured from loop creation. Goal mode defaults to two hours; interval and dynamic modes default to seven days. |
| `--min-delay <duration>` | Sets the minimum delay before the first autonomous follow-up after creation. Mode-level configured minimums still apply, so this option cannot weaken the global safety floor. |
| `--verify "<command>"` | Adds a trusted, user-supplied shell command for goal verification. It runs in the recorded project directory. The command should be quoted when it contains spaces or shell syntax. |
| `--completion <agent\|command\|hybrid>` | Selects the goal completion policy. Without `--verify`, the default is `agent`. With `--verify`, the default is `hybrid`. `command` and `hybrid` require `--verify`. |
| `--once` | Limits the loop to its immediate creation iteration. This is equivalent to setting `--max-runs 1`. |
| `--no-persist` | Keeps the loop in memory only. It is labeled ephemeral in status output and stops when the plugin or OpenCode process exits. |
| `--allow-overlap` | Allows creation alongside a conflicting goal or scheduled loop. Dispatch is still serialized so only one autonomous turn runs in the session at a time. |

`--verify` is valid only for goal mode. Verifier commands are never accepted silently from model-generated text.

## Management Commands

```text
/loop help
/loop list
/loop status [<loop-id>]
/loop pause [<loop-id>]
/loop resume [<loop-id>]
/loop run [<loop-id>]
/loop stop [<loop-id>] [--abort]
/loop stop --all [--abort]
/loop steer <loop-id> -- <additional instruction>
/loop clear
```

| Command | Functionality |
|---|---|
| `help` | Displays compact command syntax and available options. |
| `list` | Lists all loop records belonging to the current session. |
| `status` | Without an ID, shows the session's loop table. With an ID, shows objective, lifecycle, schedule, budgets, verification result, errors, and recent events. |
| `pause` | Prevents future autonomous dispatch while keeping the loop resumable. It does not discard the objective or history. |
| `resume` | Returns a paused or blocked loop to active scheduling after overlap and safety checks pass. |
| `run` | Marks an open loop due immediately. Actual injection still waits for an authoritative idle and permission check. |
| `stop` | Permanently prevents future iterations. It does not abort a turn that is already running unless `--abort` is explicitly supplied. |
| `stop --all` | Stops every manageable loop in the current session. It cannot affect loops in another session. |
| `steer` | Appends a durable instruction consumed by the next iteration without replacing the original objective. An ID and non-empty instruction are required. |
| `clear` | Deletes terminal history records for the current session only. Active, due, running, paused, and blocked loops are retained. |

For `pause`, `resume`, `run`, and `stop`, the loop ID may be omitted when exactly one manageable loop exists in the session. If there are zero or multiple candidates, `open-loop` shows the candidates and requires an explicit ID rather than guessing.

The `--abort` option belongs to `stop`. It should be used only when the user explicitly wants to abort the current OpenCode turn in addition to preventing future iterations.

## Concurrency Rules

One goal and up to five scheduled loops are allowed per session by default. Goal/scheduled overlap is blocked unless `--allow-overlap` or the corresponding plugin configuration permits it. Even when overlap is allowed, autonomous turns are serialized: at most one loop can be dispatching or running in a session.

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
  "plugin": [["@sbakolis/open-loop", {
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

### Configuration Options

| Option | Default | Functionality |
|---|---:|---|
| `bare_mode` | `"goal"` | Controls ambiguous `/loop <prompt>` commands. Use `"goal"`, `"dynamic"`, or `"error"` to require explicit syntax. |
| `register_command` | `true` | Registers `/loop` through the plugin config hook. The installer command file remains available as a discovery fallback. |
| `command_name` | `"loop"` | Changes the slash-command name registered by the config hook. |
| `min_goal_delay_seconds` | `2` | Safety cooldown before goal continuations. |
| `min_interval_seconds` | `30` | Smallest accepted fixed interval. Shorter interval commands are rejected. |
| `min_dynamic_delay_seconds` | `30` | Lower bound applied to agent-selected dynamic delays. |
| `max_dynamic_delay_seconds` | `86400` | Upper bound applied to agent-selected dynamic delays. |
| `max_scheduled_loops_per_session` | `5` | Maximum combined interval and dynamic loops in one session. |
| `default_goal_max_runs` | `25` | Goal iteration budget when `--max-runs` is omitted. |
| `default_goal_max_age_minutes` | `120` | Goal lifetime when `--max-age` is omitted. |
| `default_scheduled_max_age_days` | `7` | Interval and dynamic lifetime when `--max-age` is omitted. |
| `busy_backoff_seconds` | `10` | Base retry delay when a due loop finds its session busy or not authoritatively idle. Deterministic jitter is added. |
| `failure_backoff_seconds` | `30` | Base retry delay after a recoverable prompt-injection failure. Deterministic jitter is added. |
| `max_consecutive_failures` | `3` | Injection-failure budget before a loop transitions to `failed`. |
| `no_progress_iterations` | `3` | Consecutive low-progress goal iterations allowed before the loop pauses. This check is disabled for scheduled modes. |
| `restricted_agents` | `["plan"]` | Agent names that may not autonomously continue. The plugin pauses instead of switching agents. |
| `allow_goal_schedule_overlap` | `false` | Globally permits goal and scheduled loops to coexist. Per-command `--allow-overlap` can opt in without changing this default. |
| `persist_by_default` | `true` | Controls whether newly created loops persist unless `--no-persist` is supplied. |
| `verifier_timeout_seconds` | `120` | Maximum runtime for a host verifier command. |
| `verifier_output_limit_bytes` | `65536` | Maximum captured bytes for each verifier output stream before truncation. |

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
