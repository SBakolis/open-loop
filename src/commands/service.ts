import type { ToolContext } from "@opencode-ai/plugin";
import { createLoopId } from "../core/id.js";
import { LoopError } from "../core/errors.js";
import { transition } from "../core/state-machine.js";
import {
  OPEN_STATUSES,
  TERMINAL_STATUSES,
  type LoopConfig,
  type LoopRecord,
  type StartCommand,
} from "../core/types.js";
import { JsonStore } from "../storage/json-store.js";
import { validateEvidence } from "../core/completion.js";
import { verifyCommand } from "../verification/command-verifier.js";

export class LoopService {
  private readonly ephemeral = new Map<string, LoopRecord>();

  constructor(
    private readonly store: JsonStore,
    readonly config: LoopConfig,
    readonly projectKey: string,
  ) {}

  async all(): Promise<LoopRecord[]> {
    return [...(await this.store.load()).loops, ...this.ephemeral.values()];
  }

  async forSession(sessionId: string): Promise<LoopRecord[]> {
    return (await this.all()).filter((loop) => loop.sessionId === sessionId);
  }

  async getOwned(sessionId: string, id: string): Promise<LoopRecord> {
    const loop = (await this.all()).find((candidate) => candidate.id === id);
    if (
      !loop ||
      loop.sessionId !== sessionId ||
      loop.projectKey !== this.projectKey
    ) {
      throw new LoopError(
        "loop_not_found",
        `Loop ${id} was not found in this session`,
      );
    }

    return loop;
  }

  async create(
    command: StartCommand,
    context: ToolContext,
    model?: { providerId: string; modelId: string; variant: string | null },
  ): Promise<LoopRecord> {
    const now = Date.now();
    if (
      command.mode === "interval" &&
      command.intervalMs! < this.config.minIntervalMs
    ) {
      throw new LoopError(
        "interval_too_short",
        `Interval must be at least ${this.config.minIntervalMs / 1_000} seconds`,
      );
    }
    const current = await this.forSession(context.sessionID);
    const open = current.filter((loop) => OPEN_STATUSES.has(loop.status));
    if (command.mode === "goal" && open.some((loop) => loop.mode === "goal")) {
      throw new LoopError(
        "goal_exists",
        "This session already has an open goal loop",
      );
    }
    const scheduledCount = open.filter((loop) => loop.mode !== "goal").length;
    if (
      command.mode !== "goal" &&
      scheduledCount >= this.config.maxScheduledLoopsPerSession
    ) {
      throw new LoopError(
        "scheduled_limit",
        "This session has reached its scheduled-loop limit",
      );
    }
    const conflict = open.some(
      (loop) =>
        loop.mode === (command.mode === "goal" ? "interval" : "goal") ||
        (command.mode === "goal" && loop.mode === "dynamic"),
    );
    if (
      conflict &&
      !command.allowOverlap &&
      !this.config.allowGoalScheduleOverlap
    ) {
      throw new LoopError(
        "overlap_blocked",
        "Goal and scheduled loops cannot overlap by default; stop/pause the existing loop or use --allow-overlap",
      );
    }
    const restricted = this.config.restrictedAgents.includes(
      context.agent.toLowerCase(),
    );
    const maxAge =
      command.maxAgeMs ??
      (command.mode === "goal"
        ? this.config.defaultGoalMaxAgeMs
        : this.config.defaultScheduledMaxAgeMs);
    const completionType =
      command.completionType ?? (command.verifyCommand ? "hybrid" : "agent");
    const completion =
      command.mode !== "goal"
        ? null
        : completionType === "agent"
          ? { type: "agent" as const }
          : {
              type: completionType,
              command: command.verifyCommand!,
              timeoutMs: this.config.verifierTimeoutMs,
            };
    const id = createLoopId(new Set((await this.all()).map((loop) => loop.id)));
    const configuredMinimum =
      command.mode === "goal"
        ? this.config.minGoalDelayMs
        : command.mode === "dynamic"
          ? this.config.minDynamicDelayMs
          : this.config.minIntervalMs;
    const minDelay = Math.max(
      configuredMinimum,
      command.minDelayMs ??
        (command.mode === "interval" ? command.intervalMs! : configuredMinimum),
    );
    const loop: LoopRecord = {
      schemaVersion: 1,
      id,
      sessionId: context.sessionID,
      projectKey: this.projectKey,
      directory: context.directory,
      mode: command.mode,
      status: restricted ? "paused" : "active",
      prompt: command.prompt,
      objective: command.mode === "goal" ? command.prompt : null,
      steeringNotes: [],
      agent: context.agent || null,
      providerId: model?.providerId ?? null,
      modelId: model?.modelId ?? null,
      variant: model?.variant ?? null,
      completion,
      intervalMs: command.intervalMs,
      cadenceAnchorAt: command.mode === "interval" ? now : null,
      nextRunAt:
        command.once || command.mode === "dynamic" ? null : now + minDelay,
      lastRunStartedAt: now,
      lastRunFinishedAt: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + maxAge,
      runCount: 1,
      maxRuns:
        command.maxRuns ??
        (command.mode === "goal" ? this.config.defaultGoalMaxRuns : null),
      missedRunCount: 0,
      consecutiveFailureCount: 0,
      consecutiveNoProgressCount: 0,
      permissionBlocked: false,
      userInterruptedAt: null,
      inflightLease: null,
      lastResult: null,
      lastError: null,
      completionEvidence: null,
      blocker: restricted ? `Restricted agent: ${context.agent}` : null,
      stopReason: null,
      history: [
        {
          at: now,
          from: null,
          to: restricted ? "paused" : "active",
          reason: restricted ? "restricted_agent" : "created_first_iteration",
        },
      ],
      persistent: command.persistent,
      allowOverlap: command.allowOverlap,
      pendingAgentCompletion: false,
    };
    await this.insert(loop);

    return loop;
  }

  async update(
    id: string,
    mutate: (loop: LoopRecord) => LoopRecord,
  ): Promise<LoopRecord> {
    const ephemeral = this.ephemeral.get(id);
    if (ephemeral) {
      const updated = mutate(structuredClone(ephemeral));
      this.ephemeral.set(id, updated);

      return updated;
    }
    let result: LoopRecord | null = null;
    await this.store.update((loops) =>
      pruneTerminal(
        loops.map((loop) => {
          if (loop.id !== id) {
            return loop;
          }
          result = mutate(loop);

          return result;
        }),
        this.config.maxTerminalRecordsPerSession,
      ),
    );
    if (!result) {
      throw new LoopError("loop_not_found", `Loop ${id} was not found`);
    }

    return result;
  }

  async pause(
    sessionId: string,
    id: string,
    reason = "user_paused",
  ): Promise<LoopRecord> {
    await this.getOwned(sessionId, id);

    return this.update(id, (loop) =>
      transition(
        loop,
        "paused",
        reason,
        Date.now(),
        this.config.maxHistoryEvents,
      ),
    );
  }

  async resume(sessionId: string, id: string): Promise<LoopRecord> {
    const owned = await this.getOwned(sessionId, id);
    if (owned.status !== "paused" && owned.status !== "blocked") {
      throw new LoopError(
        "not_resumable",
        `Loop ${id} is ${owned.status}, not paused or blocked`,
      );
    }
    const current = await this.forSession(sessionId);
    const conflicts = current.some(
      (loop) =>
        loop.id !== id &&
        OPEN_STATUSES.has(loop.status) &&
        loop.mode !== owned.mode &&
        !owned.allowOverlap,
    );
    if (conflicts && !this.config.allowGoalScheduleOverlap) {
      throw new LoopError(
        "overlap_blocked",
        "Resuming would overlap goal and scheduled work",
      );
    }

    return this.update(id, (loop) => ({
      ...transition(loop, "active", "user_resumed"),
      blocker: null,
      nextRunAt: Date.now(),
    }));
  }

  async stop(
    sessionId: string,
    id: string,
    reason = "user_stopped",
  ): Promise<LoopRecord> {
    await this.getOwned(sessionId, id);

    return this.update(id, (loop) => ({
      ...transition(loop, "stopped", reason),
      inflightLease: null,
      nextRunAt: null,
      stopReason: reason,
    }));
  }

  async steer(
    sessionId: string,
    id: string,
    note: string,
  ): Promise<LoopRecord> {
    await this.getOwned(sessionId, id);
    if (!note.trim()) {
      throw new LoopError("missing_prompt", "A steering note is required");
    }

    return this.update(id, (loop) => ({
      ...loop,
      steeringNotes: [...loop.steeringNotes, note.trim()].slice(-100),
      updatedAt: Date.now(),
    }));
  }

  async schedule(
    sessionId: string,
    id: string,
    delayMs: number,
    reason: string,
  ): Promise<LoopRecord> {
    const loop = await this.getOwned(sessionId, id);
    if (loop.mode !== "dynamic" || !OPEN_STATUSES.has(loop.status)) {
      throw new LoopError(
        "not_dynamic",
        "Only an open dynamic loop can schedule its next run",
      );
    }
    const clamped = Math.max(
      this.config.minDynamicDelayMs,
      Math.min(delayMs, this.config.maxDynamicDelayMs),
    );

    return this.update(id, (current) => ({
      ...current,
      nextRunAt: Date.now() + clamped,
      lastResult: reason.slice(0, 4_000),
      updatedAt: Date.now(),
    }));
  }

  async complete(
    sessionId: string,
    id: string,
    evidence: string,
  ): Promise<LoopRecord> {
    const loop = await this.getOwned(sessionId, id);
    if (loop.mode !== "goal") {
      throw new LoopError(
        "invalid_completion",
        "Scheduled loops should use stop_loop",
      );
    }
    const validated = validateEvidence(evidence);
    if (loop.completion?.type === "agent") {
      return this.update(id, (current) => ({
        ...transition(current, "completed", "agent_evidence_accepted"),
        completionEvidence: validated,
      }));
    }
    const verification = await verifyCommand({
      command: loop.completion!.command,
      directory: loop.directory,
      timeoutMs: loop.completion!.timeoutMs,
      outputLimitBytes: this.config.verifierOutputLimitBytes,
    });
    if (verification.passed) {
      return this.update(id, (current) => ({
        ...transition(current, "completed", "hybrid_verification_passed"),
        completionEvidence: validated,
        lastResult: verification.summary,
      }));
    }

    return this.update(id, (current) => ({
      ...current,
      pendingAgentCompletion: true,
      completionEvidence: validated,
      lastResult: verification.summary,
      updatedAt: Date.now(),
    }));
  }

  async block(
    sessionId: string,
    id: string,
    blocker: string,
  ): Promise<LoopRecord> {
    const loop = await this.getOwned(sessionId, id);
    if (loop.mode !== "goal" || !blocker.trim()) {
      throw new LoopError(
        "invalid_block",
        "Only goal loops can block, with a concrete blocker",
      );
    }

    return this.update(id, (current) => ({
      ...transition(current, "blocked", "agent_blocked"),
      blocker: blocker.trim().slice(0, 4_000),
      nextRunAt: null,
    }));
  }

  async verifyAtBoundary(sessionId: string, id: string): Promise<LoopRecord> {
    const loop = await this.getOwned(sessionId, id);
    if (
      loop.mode !== "goal" ||
      !loop.completion ||
      loop.completion.type === "agent"
    ) {
      return loop;
    }
    if (loop.completion.type === "hybrid" && !loop.pendingAgentCompletion) {
      return loop;
    }
    const verification = await verifyCommand({
      command: loop.completion.command,
      directory: loop.directory,
      timeoutMs: loop.completion.timeoutMs,
      outputLimitBytes: this.config.verifierOutputLimitBytes,
    });
    if (verification.passed) {
      return this.update(id, (current) => ({
        ...transition(current, "completed", "command_verification_passed"),
        lastResult: verification.summary,
      }));
    }

    return this.update(id, (current) => ({
      ...current,
      lastResult: verification.summary,
      updatedAt: Date.now(),
    }));
  }

  async clear(sessionId: string): Promise<number> {
    const ephemeralIds = [...this.ephemeral.values()]
      .filter(
        (loop) =>
          loop.sessionId === sessionId && TERMINAL_STATUSES.has(loop.status),
      )
      .map((loop) => loop.id);
    ephemeralIds.forEach((id) => this.ephemeral.delete(id));
    let count = ephemeralIds.length;
    await this.store.update((loops) =>
      loops.filter((loop) => {
        const remove =
          loop.sessionId === sessionId && TERMINAL_STATUSES.has(loop.status);
        if (remove) {
          count++;
        }

        return !remove;
      }),
    );

    return count;
  }

  async dispose(): Promise<void> {
    this.ephemeral.clear();
  }

  private async insert(loop: LoopRecord): Promise<void> {
    if (!loop.persistent) {
      this.ephemeral.set(loop.id, loop);
    } else {
      await this.store.update((loops) => [...loops, loop]);
    }
  }
}

function pruneTerminal(loops: LoopRecord[], limit: number): LoopRecord[] {
  const keep = new Set<string>();
  const bySession = new Map<string, LoopRecord[]>();
  for (const loop of loops) {
    if (TERMINAL_STATUSES.has(loop.status)) {
      bySession.set(loop.sessionId, [
        ...(bySession.get(loop.sessionId) ?? []),
        loop,
      ]);
    }
  }
  for (const terminal of bySession.values()) {
    terminal
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .forEach((loop) => keep.add(loop.id));
  }

  return loops.filter(
    (loop) => !TERMINAL_STATUSES.has(loop.status) || keep.has(loop.id),
  );
}
