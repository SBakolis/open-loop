import { z } from "zod";
import { LOOP_STATUSES } from "../core/types.js";

const historySchema = z.object({
  at: z.number().int().nonnegative(),
  from: z.enum(LOOP_STATUSES).nullable(),
  to: z.enum(LOOP_STATUSES),
  reason: z.string().min(1).max(500),
});

const completionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent") }),
  z.object({
    type: z.literal("command"),
    command: z.string().min(1),
    timeoutMs: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("hybrid"),
    command: z.string().min(1),
    timeoutMs: z.number().int().positive(),
  }),
]);

export const loopRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().regex(/^loop_[a-f0-9]{10}$/),
  sessionId: z.string().min(1),
  projectKey: z.string().min(1),
  directory: z.string().min(1),
  mode: z.enum(["goal", "interval", "dynamic"]),
  status: z.enum(LOOP_STATUSES),
  prompt: z.string().min(1),
  objective: z.string().nullable(),
  steeringNotes: z.array(z.string().max(4_000)).max(100),
  agent: z.string().nullable(),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  variant: z.string().nullable(),
  completion: completionSchema.nullable(),
  intervalMs: z.number().int().positive().nullable(),
  cadenceAnchorAt: z.number().int().nonnegative().nullable(),
  nextRunAt: z.number().int().nonnegative().nullable(),
  lastRunStartedAt: z.number().int().nonnegative().nullable(),
  lastRunFinishedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative().nullable(),
  runCount: z.number().int().nonnegative(),
  maxRuns: z.number().int().positive().nullable(),
  missedRunCount: z.number().int().nonnegative(),
  consecutiveFailureCount: z.number().int().nonnegative(),
  consecutiveNoProgressCount: z.number().int().nonnegative(),
  permissionBlocked: z.boolean(),
  userInterruptedAt: z.number().int().nonnegative().nullable(),
  inflightLease: z
    .object({
      ownerInstanceId: z.string().min(1),
      claimedAt: z.number().int(),
      expiresAt: z.number().int(),
    })
    .nullable(),
  lastResult: z.string().max(8_000).nullable(),
  lastError: z.string().max(8_000).nullable(),
  completionEvidence: z.string().max(4_000).nullable(),
  blocker: z.string().max(4_000).nullable(),
  stopReason: z.string().max(500).nullable(),
  history: z.array(historySchema).max(100),
  persistent: z.boolean(),
  allowOverlap: z.boolean(),
  pendingAgentCompletion: z.boolean(),
});

export const stateFileSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative(),
  loops: z.array(loopRecordSchema),
});
