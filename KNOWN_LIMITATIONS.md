# Known Limitations

- OpenCode 2 preview is not supported; this release targets stable OpenCode 1.x.
- Loops run only while an OpenCode process is active. This is not a daemon.
- Reliable host token-budget data is not currently exposed to the plugin, so run, age, failure, and conservative no-progress budgets are enforced instead.
- `permission.updated` is the current typed 1.x equivalent of permission creation; duplicate permission events are deduplicated by permission ID.
- Desktop and web command discovery follows OpenCode's shared command configuration but has not been independently exercised in this environment.
