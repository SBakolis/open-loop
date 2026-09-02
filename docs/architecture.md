# Architecture

The package separates OpenCode APIs from host-independent behavior:

- `core`: command grammar, lifecycle types, transitions, cadence, completion markers, prompts, and configuration.
- `storage`: versioned Zod schema, migrations, lock-file coordination, corruption quarantine, and atomic JSON writes.
- `scheduler`: observed-session ownership, timers, due ordering, per-session guards, persistent leases, and authoritative pre-dispatch checks.
- `verification`: trusted command execution, timeout/process-group termination, bounded output, redaction, and fingerprints.
- `commands`: lifecycle service, deterministic dispatcher, and status formatting.
- `opencode`: current 1.x adapter, event normalization, hooks, tools, system reminders, and compaction.
- `installer`: JSONC-preserving registration, command installation, uninstall, and read-only doctor.

Core, scheduler, storage, and verification do not import OpenCode SDK types. `V1Adapter` is the only module that calls generated SDK methods.

The process observes a session through a command, tool, or event before scheduling it. A due record is selected deterministically, claimed under the cross-process state lock, checked against session activity and permissions, then sent through `session.promptAsync`. Busy and later idle events establish turn start and completion.
