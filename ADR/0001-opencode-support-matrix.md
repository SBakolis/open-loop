# ADR 0001: OpenCode Support Matrix

Status: accepted, 2026-09-02.

Target OpenCode 1.x from 1.18.19 and isolate generated SDK calls in `V1Adapter`. The installed host is 1.18.19 and package types were verified at 1.18.26. `session.promptAsync` is the non-blocking acceptance API. OpenCode 2 requires a separate adapter rather than compatibility casts throughout the scheduler.
