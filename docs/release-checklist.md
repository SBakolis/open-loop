# Release Checklist

1. Run lint, typecheck, tests, build, and package dry-run.
2. Run `npm pack` and install the tarball into a clean OpenCode config.
3. Complete the live scenarios in `docs/smoke-test-report.md` on minimum and latest stable hosts.
4. Confirm the npm name and package contents.
5. Publish with provenance through the release workflow.
