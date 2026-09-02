import { LoopError } from "./errors.js";

const UNITS: Record<string, number> = {
  s: 1_000,
  sec: 1_000,
  second: 1_000,
  seconds: 1_000,
  m: 60_000,
  min: 60_000,
  minute: 60_000,
  minutes: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  hour: 3_600_000,
  hours: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
  days: 86_400_000,
};

export function parseDuration(
  value: string,
  maxMs = Number.MAX_SAFE_INTEGER,
): number {
  const match = value
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?)\s*([a-z]+)$/);
  if (!match) {
    throw new LoopError("invalid_duration", `Invalid duration: ${value}`);
  }
  const amount = Number(match[1]);
  const multiplier = UNITS[match[2] ?? ""];
  const milliseconds = amount * (multiplier ?? 0);
  if (
    !multiplier ||
    !Number.isFinite(milliseconds) ||
    milliseconds <= 0 ||
    milliseconds > maxMs
  ) {
    throw new LoopError(
      "invalid_duration",
      `Duration is outside the supported range: ${value}`,
    );
  }

  return milliseconds;
}

export function isDurationToken(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?\s*(?:s|m|h|d|sec|second|seconds|min|minute|minutes|hr|hour|hours|day|days))$/i.test(
    value,
  );
}
