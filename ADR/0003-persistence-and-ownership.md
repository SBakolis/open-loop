# ADR 0003: Persistence And Ownership

Status: accepted.

Use one OS-level JSON state file with a versioned schema, lock file, fsync, and atomic rename. Persist dispatch leases before injection. A process may dispatch only sessions it has observed, preventing shared state from granting ownership of foreign sessions. Missed fixed-rate ticks coalesce rather than replay.
