# State Machine

States are `active`, `due`, `dispatching`, `running`, `paused`, `blocked`, `completed`, `stopped`, `expired`, and `failed`. Terminal states are `completed`, `stopped`, `expired`, and `failed`.

Every status change uses `core/state-machine.ts`, validates its source, records a reason-coded event, updates `updatedAt`, and retains at most 100 events. Creation records an explicit initial event. Non-status fields are updated in the same atomic store mutation.

`paused` and `blocked` can resume to `active`. Terminal records cannot resume. At most 50 terminal records per session are retained by default.
