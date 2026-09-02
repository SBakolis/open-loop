# ADR 0002: Command Semantics

Status: accepted.

Canonical modes are explicit: `until`, `every`, and `dynamic`. Bare input defaults to goal mode and can be configured as dynamic or rejected. A tokenizer with source offsets, rather than a permissive regular expression, preserves prompt content. The `--` delimiter consumes itself and one separating whitespace character; all remaining text is prompt data.
