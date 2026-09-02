# ADR 0004: Completion Verification

Status: accepted.

Agent completion requires meaningful explicit evidence. User-authorized command verification is host-executed, timed out, output-capped, and secret-redacted. Hybrid completion requires both signals. Strict final-line markers are a fallback and never bypass a command verifier.
