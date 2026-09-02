import { createHash } from "node:crypto";

const SECRET_PATTERNS = [
  /\b(?:sk|pk)_[a-zA-Z0-9_-]{16,}\b/g,
  /\b(?:ghp|github_pat|xox[baprs])_[a-zA-Z0-9_-]{12,}\b/g,
  /\b(?:api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+/gi,
  /\bBearer\s+[a-zA-Z0-9._~+/-]+=*/gi,
];

export function redact(value: string): string {
  return SECRET_PATTERNS.reduce(
    (output, pattern) => output.replace(pattern, "[REDACTED]"),
    value,
  );
}

export function truncateBytes(value: string, limit: number): string {
  const buffer = Buffer.from(value);
  if (buffer.length <= limit) {
    return value;
  }

  return `${buffer.subarray(0, limit).toString("utf8")}\n[truncated]`;
}

export function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function safePreview(value: string, limit = 120): string {
  return redact(value).replace(/\s+/g, " ").trim().slice(0, limit);
}
