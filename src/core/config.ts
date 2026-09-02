import { z } from "zod";
import type { LoopConfig } from "./types.js";

export const DEFAULT_CONFIG: LoopConfig = {
  bareMode: "goal",
  registerCommand: true,
  commandName: "loop",
  minGoalDelayMs: 2_000,
  minIntervalMs: 30_000,
  minDynamicDelayMs: 30_000,
  maxDynamicDelayMs: 86_400_000,
  maxDurationMs: 365 * 86_400_000,
  maxScheduledLoopsPerSession: 5,
  defaultGoalMaxRuns: 25,
  defaultGoalMaxAgeMs: 2 * 3_600_000,
  defaultScheduledMaxAgeMs: 7 * 86_400_000,
  busyBackoffMs: 10_000,
  failureBackoffMs: 30_000,
  maxConsecutiveFailures: 3,
  noProgressIterations: 3,
  restrictedAgents: ["plan"],
  allowGoalScheduleOverlap: false,
  persistByDefault: true,
  verifierTimeoutMs: 120_000,
  verifierOutputLimitBytes: 65_536,
  leaseMs: 120_000,
  maxHistoryEvents: 100,
  maxTerminalRecordsPerSession: 50,
};

const rawConfigSchema = z
  .object({
    bare_mode: z.enum(["goal", "dynamic", "error"]).optional(),
    register_command: z.boolean().optional(),
    command_name: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/)
      .optional(),
    min_goal_delay_seconds: z.number().nonnegative().finite().optional(),
    min_interval_seconds: z.number().positive().finite().optional(),
    min_dynamic_delay_seconds: z.number().positive().finite().optional(),
    max_dynamic_delay_seconds: z.number().positive().finite().optional(),
    max_scheduled_loops_per_session: z
      .number()
      .int()
      .positive()
      .max(100)
      .optional(),
    default_goal_max_runs: z.number().int().positive().optional(),
    default_goal_max_age_minutes: z.number().positive().finite().optional(),
    default_scheduled_max_age_days: z.number().positive().finite().optional(),
    busy_backoff_seconds: z.number().positive().finite().optional(),
    failure_backoff_seconds: z.number().positive().finite().optional(),
    max_consecutive_failures: z.number().int().positive().optional(),
    no_progress_iterations: z.number().int().positive().optional(),
    restricted_agents: z.array(z.string().min(1)).optional(),
    allow_goal_schedule_overlap: z.boolean().optional(),
    persist_by_default: z.boolean().optional(),
    verifier_timeout_seconds: z.number().positive().finite().optional(),
    verifier_output_limit_bytes: z.number().int().positive().optional(),
  })
  .passthrough();

export function parseConfig(input: Record<string, unknown> | undefined): {
  config: LoopConfig;
  warnings: string[];
} {
  const result = rawConfigSchema.safeParse(input ?? {});
  if (!result.success) {
    return {
      config: { ...DEFAULT_CONFIG },
      warnings: result.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }
  const value = result.data;
  const config: LoopConfig = {
    ...DEFAULT_CONFIG,
    bareMode: value.bare_mode ?? DEFAULT_CONFIG.bareMode,
    registerCommand: value.register_command ?? DEFAULT_CONFIG.registerCommand,
    commandName: value.command_name ?? DEFAULT_CONFIG.commandName,
    minGoalDelayMs: (value.min_goal_delay_seconds ?? 2) * 1_000,
    minIntervalMs: (value.min_interval_seconds ?? 30) * 1_000,
    minDynamicDelayMs: (value.min_dynamic_delay_seconds ?? 30) * 1_000,
    maxDynamicDelayMs: (value.max_dynamic_delay_seconds ?? 86_400) * 1_000,
    maxScheduledLoopsPerSession: value.max_scheduled_loops_per_session ?? 5,
    defaultGoalMaxRuns: value.default_goal_max_runs ?? 25,
    defaultGoalMaxAgeMs: (value.default_goal_max_age_minutes ?? 120) * 60_000,
    defaultScheduledMaxAgeMs:
      (value.default_scheduled_max_age_days ?? 7) * 86_400_000,
    busyBackoffMs: (value.busy_backoff_seconds ?? 10) * 1_000,
    failureBackoffMs: (value.failure_backoff_seconds ?? 30) * 1_000,
    maxConsecutiveFailures: value.max_consecutive_failures ?? 3,
    noProgressIterations: value.no_progress_iterations ?? 3,
    restrictedAgents: value.restricted_agents ?? ["plan"],
    allowGoalScheduleOverlap: value.allow_goal_schedule_overlap ?? false,
    persistByDefault: value.persist_by_default ?? true,
    verifierTimeoutMs: (value.verifier_timeout_seconds ?? 120) * 1_000,
    verifierOutputLimitBytes: value.verifier_output_limit_bytes ?? 65_536,
  };
  const warnings: string[] = [];
  if (config.maxDynamicDelayMs < config.minDynamicDelayMs) {
    warnings.push(
      "max_dynamic_delay_seconds was below the minimum; using the minimum",
    );
    config.maxDynamicDelayMs = config.minDynamicDelayMs;
  }

  return { config, warnings };
}
