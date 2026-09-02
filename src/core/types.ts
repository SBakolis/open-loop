export const LOOP_STATUSES = [
  "active",
  "due",
  "dispatching",
  "running",
  "paused",
  "blocked",
  "completed",
  "stopped",
  "expired",
  "failed",
] as const;

export type LoopStatus = (typeof LOOP_STATUSES)[number];
export type LoopMode = "goal" | "interval" | "dynamic";
export type CompletionPolicy =
  | { type: "agent" }
  | { type: "command"; command: string; timeoutMs: number }
  | { type: "hybrid"; command: string; timeoutMs: number };

export type LoopHistoryEvent = {
  at: number;
  from: LoopStatus | null;
  to: LoopStatus;
  reason: string;
};

export type LoopRecord = {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  projectKey: string;
  directory: string;
  mode: LoopMode;
  status: LoopStatus;
  prompt: string;
  objective: string | null;
  steeringNotes: string[];
  agent: string | null;
  providerId: string | null;
  modelId: string | null;
  variant: string | null;
  completion: CompletionPolicy | null;
  intervalMs: number | null;
  cadenceAnchorAt: number | null;
  nextRunAt: number | null;
  lastRunStartedAt: number | null;
  lastRunFinishedAt: number | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  runCount: number;
  maxRuns: number | null;
  missedRunCount: number;
  consecutiveFailureCount: number;
  consecutiveNoProgressCount: number;
  permissionBlocked: boolean;
  userInterruptedAt: number | null;
  inflightLease: {
    ownerInstanceId: string;
    claimedAt: number;
    expiresAt: number;
  } | null;
  lastResult: string | null;
  lastError: string | null;
  completionEvidence: string | null;
  blocker: string | null;
  stopReason: string | null;
  history: LoopHistoryEvent[];
  persistent: boolean;
  allowOverlap: boolean;
  pendingAgentCompletion: boolean;
};

export type StateFile = {
  schemaVersion: 1;
  revision: number;
  loops: LoopRecord[];
};

export type NormalizedMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant";
  createdAt: number;
  text: string;
  synthetic: boolean;
  toolCallCount?: number;
};

export type StructuredLogEvent = {
  name: string;
  level: "debug" | "info" | "warn" | "error";
  loopId?: string;
  sessionId?: string;
  reason?: string;
  details?: Record<string, string | number | boolean | null>;
};

export interface OpenCodeAdapter {
  injectPrompt(input: {
    sessionId: string;
    text: string;
    agent?: string | null;
    providerId?: string | null;
    modelId?: string | null;
    variant?: string | null;
  }): Promise<{ accepted: boolean; messageId?: string }>;
  abortSession(sessionId: string): Promise<boolean>;
  getSessionActivity(sessionId: string): Promise<"idle" | "busy" | "unknown">;
  getSessionMessages(sessionId: string): Promise<NormalizedMessage[]>;
  log(event: StructuredLogEvent): Promise<void>;
  notify(input: {
    title: string;
    message: string;
    variant: "info" | "success" | "warning" | "error";
  }): Promise<void>;
}

export type BareMode = "goal" | "dynamic" | "error";

export type LoopConfig = {
  bareMode: BareMode;
  registerCommand: boolean;
  commandName: string;
  minGoalDelayMs: number;
  minIntervalMs: number;
  minDynamicDelayMs: number;
  maxDynamicDelayMs: number;
  maxDurationMs: number;
  maxScheduledLoopsPerSession: number;
  defaultGoalMaxRuns: number;
  defaultGoalMaxAgeMs: number;
  defaultScheduledMaxAgeMs: number;
  busyBackoffMs: number;
  failureBackoffMs: number;
  maxConsecutiveFailures: number;
  noProgressIterations: number;
  restrictedAgents: string[];
  allowGoalScheduleOverlap: boolean;
  persistByDefault: boolean;
  verifierTimeoutMs: number;
  verifierOutputLimitBytes: number;
  leaseMs: number;
  maxHistoryEvents: number;
  maxTerminalRecordsPerSession: number;
};

export type StartCommand = {
  kind: "start";
  mode: LoopMode;
  prompt: string;
  intervalMs: number | null;
  maxRuns: number | null;
  maxAgeMs: number | null;
  minDelayMs: number | null;
  verifyCommand: string | null;
  completionType: "agent" | "command" | "hybrid" | null;
  once: boolean;
  persistent: boolean;
  allowOverlap: boolean;
};

export type ManagementCommand = {
  kind: "management";
  action:
    | "help"
    | "list"
    | "status"
    | "pause"
    | "resume"
    | "run"
    | "stop"
    | "clear"
    | "steer";
  loopId: string | null;
  all: boolean;
  abort: boolean;
  prompt: string | null;
};

export type ParsedCommand = StartCommand | ManagementCommand;

export const TERMINAL_STATUSES = new Set<LoopStatus>([
  "completed",
  "stopped",
  "expired",
  "failed",
]);
export const OPEN_STATUSES = new Set<LoopStatus>([
  "active",
  "due",
  "dispatching",
  "running",
  "paused",
  "blocked",
]);
