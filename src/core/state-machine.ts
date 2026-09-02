import { LoopError } from "./errors.js";
import type { LoopRecord, LoopStatus } from "./types.js";

const TRANSITIONS: Record<LoopStatus, readonly LoopStatus[]> = {
  active: [
    "due",
    "paused",
    "blocked",
    "completed",
    "stopped",
    "expired",
    "failed",
  ],
  due: ["dispatching", "paused", "stopped", "expired"],
  dispatching: ["running", "due", "failed", "paused", "stopped"],
  running: [
    "active",
    "due",
    "completed",
    "blocked",
    "paused",
    "stopped",
    "failed",
    "expired",
  ],
  paused: ["active", "stopped", "expired"],
  blocked: ["active", "stopped", "expired"],
  completed: [],
  stopped: [],
  expired: [],
  failed: [],
};

export function transition(
  record: LoopRecord,
  to: LoopStatus,
  reason: string,
  now = Date.now(),
  maxHistory = 100,
): LoopRecord {
  if (!reason.trim()) {
    throw new LoopError("missing_reason", "A transition reason is required");
  }
  if (!TRANSITIONS[record.status].includes(to)) {
    throw new LoopError(
      "invalid_transition",
      `Cannot transition loop ${record.id} from ${record.status} to ${to}`,
    );
  }
  const history = [
    ...record.history,
    { at: now, from: record.status, to, reason },
  ].slice(-maxHistory);

  return { ...record, status: to, updatedAt: now, history };
}
