# Contributing

Use Node.js 20 or later. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run pack:check` before opening a pull request. Add deterministic regression tests for scheduler races. Do not use sleeps in tests or introduce OpenCode SDK imports outside `src/opencode` and plugin/installer entrypoints.
