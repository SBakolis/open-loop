import { randomUUID } from "node:crypto";
import { advanceCadence, deterministicJitter } from "../core/cadence.js";
import { parseCompletionMarkers } from "../core/completion.js";
import { errorMessage } from "../core/errors.js";
import { buildIterationPrompt } from "../core/prompt-builder.js";
import { transition } from "../core/state-machine.js";
import {
  OPEN_STATUSES,
  type LoopRecord,
  type OpenCodeAdapter,
} from "../core/types.js";
import { LoopService } from "../commands/service.js";
import { selectDueLoop } from "./due-queue.js";
import { DispatchGuard } from "./dispatch-guard.js";
import { systemClock, type Clock } from "./clock.js";

type SessionState = {
  activity: "idle" | "busy" | "unknown";
  permissionIds: Set<string>;
};

export class LoopScheduler {
  readonly instanceId = randomUUID();
  private readonly observed = new Map<string, SessionState>();
  private readonly generatedMessageIds = new Set<string>();
  private readonly guard = new DispatchGuard();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly service: LoopService,
    private readonly adapter: OpenCodeAdapter,
    private readonly clock: Clock = systemClock,
  ) {}

  async start(): Promise<void> {
    await this.adapter.log({
      name: "state.rehydrated",
      level: "info",
      details: { loops: (await this.service.all()).length },
    });
    await this.scheduleTimer();
  }

  observe(sessionId: string): void {
    if (!this.observed.has(sessionId)) {
      this.observed.set(sessionId, {
        activity: "unknown",
        permissionIds: new Set(),
      });
    }
  }

  isGeneratedMessage(messageId: string): boolean {
    return this.generatedMessageIds.has(messageId);
  }

  trackGeneratedMessage(messageId: string): void {
    this.generatedMessageIds.add(messageId);
  }

  async onBusy(sessionId: string): Promise<void> {
    this.observe(sessionId);
    this.observed.get(sessionId)!.activity = "busy";
    const loops = await this.service.forSession(sessionId);
    const dispatching = loops.find(
      (loop) =>
        loop.status === "dispatching" &&
        loop.inflightLease?.ownerInstanceId === this.instanceId,
    );
    if (dispatching) {
      await this.service.update(dispatching.id, (loop) => ({
        ...transition(loop, "running", "session_became_busy"),
        runCount: loop.runCount + 1,
        lastRunStartedAt: this.clock.now(),
        consecutiveFailureCount: 0,
      }));
    }
  }

  async onIdle(sessionId: string): Promise<void> {
    this.observe(sessionId);
    this.observed.get(sessionId)!.activity = "idle";
    const loops = await this.service.forSession(sessionId);
    for (const loop of loops.filter(
      (candidate) =>
        candidate.status === "running" ||
        candidate.status === "dispatching" ||
        (candidate.status === "active" && candidate.runCount === 1),
    )) {
      await this.finishIteration(loop);
    }
    await this.markDue(sessionId);
    await this.dispatchNext(sessionId);
    await this.scheduleTimer();
  }

  async onHumanMessage(
    sessionId: string,
    messageId: string,
    createdAt: number,
  ): Promise<void> {
    if (this.generatedMessageIds.has(messageId)) {
      return;
    }
    this.observe(sessionId);
    for (const loop of await this.service.forSession(sessionId)) {
      if (!OPEN_STATUSES.has(loop.status)) {
        continue;
      }
      if (
        loop.mode === "goal" &&
        (loop.status === "active" || loop.status === "due")
      ) {
        await this.service.update(loop.id, (current) => ({
          ...transition(current, "paused", "human_interruption"),
          userInterruptedAt: createdAt,
          nextRunAt: null,
        }));
      } else if (loop.mode === "goal") {
        await this.service.update(loop.id, (current) => ({
          ...current,
          userInterruptedAt: createdAt,
          updatedAt: this.clock.now(),
        }));
      }
    }
  }

  async onPermissionAsked(
    sessionId: string,
    permissionId: string,
  ): Promise<void> {
    this.observe(sessionId);
    this.observed.get(sessionId)!.permissionIds.add(permissionId);
    for (const loop of await this.service.forSession(sessionId)) {
      if (OPEN_STATUSES.has(loop.status)) {
        await this.service.update(loop.id, (current) => ({
          ...current,
          permissionBlocked: true,
          updatedAt: this.clock.now(),
        }));
      }
    }
  }

  async onPermissionReplied(
    sessionId: string,
    permissionId: string,
    allowed: boolean,
  ): Promise<void> {
    this.observe(sessionId);
    const state = this.observed.get(sessionId)!;
    state.permissionIds.delete(permissionId);
    for (const loop of await this.service.forSession(sessionId)) {
      if (!OPEN_STATUSES.has(loop.status)) {
        continue;
      }
      await this.service.update(loop.id, (current) => ({
        ...current,
        permissionBlocked: state.permissionIds.size > 0,
        updatedAt: this.clock.now(),
      }));
      if (
        !allowed &&
        loop.mode === "goal" &&
        loop.status !== "paused" &&
        loop.status !== "blocked"
      ) {
        const latest = await this.service.getOwned(sessionId, loop.id);
        if (
          latest.status === "active" ||
          latest.status === "due" ||
          latest.status === "running" ||
          latest.status === "dispatching"
        ) {
          await this.service.update(loop.id, (current) => ({
            ...transition(current, "paused", "permission_denied"),
            blocker: "A required permission was denied",
            nextRunAt: null,
          }));
        }
      }
    }
  }

  async onSessionDeleted(sessionId: string): Promise<void> {
    for (const loop of await this.service.forSession(sessionId)) {
      if (OPEN_STATUSES.has(loop.status)) {
        await this.service.stop(sessionId, loop.id, "session_deleted");
      }
    }
    this.observed.delete(sessionId);
    this.guard.release(sessionId);
  }

  async onSessionError(sessionId: string, message: string): Promise<void> {
    const fatal = /auth|credential|quota|rate.?limit/i.test(message);
    for (const loop of await this.service.forSession(sessionId)) {
      if (!OPEN_STATUSES.has(loop.status)) {
        continue;
      }
      await this.service.update(loop.id, (current) => ({
        ...current,
        lastError: message.slice(0, 8_000),
        updatedAt: this.clock.now(),
      }));
      if (
        fatal &&
        (loop.status === "active" ||
          loop.status === "due" ||
          loop.status === "dispatching" ||
          loop.status === "running")
      ) {
        await this.service.update(loop.id, (current) => ({
          ...transition(
            current,
            "paused",
            "provider_error_requires_user_action",
          ),
          nextRunAt: null,
          inflightLease: null,
        }));
      }
    }
  }

  async runNow(sessionId: string, id: string): Promise<LoopRecord> {
    const loop = await this.service.getOwned(sessionId, id);
    if (loop.status === "active") {
      await this.service.update(id, (current) => ({
        ...transition(current, "due", "manual_run"),
        nextRunAt: this.clock.now(),
      }));
    } else if (loop.status === "due") {
      await this.service.update(id, (current) => ({
        ...current,
        nextRunAt: this.clock.now(),
        updatedAt: this.clock.now(),
      }));
    } else {
      throw new Error(`Loop ${id} cannot run while ${loop.status}`);
    }
    await this.dispatchNext(sessionId);

    return this.service.getOwned(sessionId, id);
  }

  async abortSession(sessionId: string): Promise<boolean> {
    return this.adapter.abortSession(sessionId);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
    }
    this.guard.clear();
    await this.service.dispose();
  }

  private async finishIteration(input: LoopRecord): Promise<void> {
    let loop = await this.service.getOwned(input.sessionId, input.id);
    if (loop.status === "dispatching") {
      loop = await this.service.update(loop.id, (current) => ({
        ...transition(current, "running", "idle_confirmed_accepted_turn"),
        runCount: current.runCount + 1,
        lastRunStartedAt: current.lastRunStartedAt ?? this.clock.now(),
      }));
    }
    if (
      loop.status !== "running" &&
      !(loop.status === "active" && loop.runCount === 1)
    ) {
      return;
    }
    const now = this.clock.now();
    if (loop.mode === "goal") {
      const messages = await this.adapter
        .getSessionMessages(loop.sessionId)
        .catch(() => []);
      const latest = messages
        .filter((message) => message.role === "assistant")
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      const marker = latest ? parseCompletionMarkers(latest.text) : null;
      if (marker?.type === "complete") {
        await this.service.complete(loop.sessionId, loop.id, marker.evidence);

        return;
      }
      if (marker?.type === "blocked") {
        await this.service.block(loop.sessionId, loop.id, marker.blocker);

        return;
      }
      const noProgress =
        latest &&
        (latest.toolCallCount ?? 0) === 0 &&
        latest.text.trim().length < 80;
      if (noProgress) {
        loop = await this.service.update(loop.id, (current) => ({
          ...current,
          consecutiveNoProgressCount: current.consecutiveNoProgressCount + 1,
          updatedAt: now,
        }));
        if (
          loop.consecutiveNoProgressCount >=
          this.service.config.noProgressIterations
        ) {
          await this.service.update(loop.id, (current) => ({
            ...transition(current, "paused", "no_progress"),
            lastRunFinishedAt: now,
            inflightLease: null,
            nextRunAt: null,
          }));
          await this.adapter.notify({
            title: "open-loop paused",
            message: `${loop.id} made no observable progress`,
            variant: "warning",
          });

          return;
        }
      } else if (loop.consecutiveNoProgressCount > 0) {
        loop = await this.service.update(loop.id, (current) => ({
          ...current,
          consecutiveNoProgressCount: 0,
          updatedAt: now,
        }));
      }
      loop = await this.service.verifyAtBoundary(loop.sessionId, loop.id);
      if (loop.status === "completed") {
        return;
      }
      if (
        loop.userInterruptedAt &&
        loop.userInterruptedAt >= (loop.lastRunStartedAt ?? 0)
      ) {
        await this.service.update(loop.id, (current) => ({
          ...transition(current, "paused", "human_interruption"),
          lastRunFinishedAt: now,
          inflightLease: null,
          nextRunAt: null,
        }));

        return;
      }
      if (loop.maxRuns !== null && loop.runCount >= loop.maxRuns) {
        await this.service.update(loop.id, (current) => ({
          ...transition(current, "expired", "max_runs_reached"),
          lastRunFinishedAt: now,
          inflightLease: null,
          nextRunAt: null,
        }));

        return;
      }
      const currentStatus =
        loop.status === "running"
          ? "due"
          : loop.status === "active"
            ? "due"
            : null;
      if (currentStatus) {
        await this.service.update(loop.id, (current) => ({
          ...transition(current, "due", "goal_iteration_finished"),
          lastRunFinishedAt: now,
          inflightLease: null,
          nextRunAt: now + this.service.config.minGoalDelayMs,
        }));
      }

      return;
    }
    if (loop.maxRuns !== null && loop.runCount >= loop.maxRuns) {
      await this.service.update(loop.id, (current) => ({
        ...transition(current, "stopped", "max_runs_reached"),
        lastRunFinishedAt: now,
        inflightLease: null,
        nextRunAt: null,
        stopReason: "max_runs_reached",
      }));

      return;
    }
    if (loop.mode === "dynamic" && loop.nextRunAt === null) {
      await this.service.update(loop.id, (current) => ({
        ...transition(current, "stopped", "iteration_ended_without_reschedule"),
        lastRunFinishedAt: now,
        inflightLease: null,
        stopReason: "iteration_ended_without_reschedule",
      }));

      return;
    }
    if (loop.status === "running") {
      await this.service.update(loop.id, (current) => ({
        ...transition(current, "active", "iteration_finished"),
        lastRunFinishedAt: now,
        inflightLease: null,
      }));
    } else {
      await this.service.update(loop.id, (current) => ({
        ...current,
        lastRunFinishedAt: now,
        inflightLease: null,
        updatedAt: now,
      }));
    }
  }

  private async markDue(sessionId?: string): Promise<void> {
    const now = this.clock.now();
    for (const loop of await this.service.all()) {
      if (sessionId && loop.sessionId !== sessionId) {
        continue;
      }
      if (!this.observed.has(loop.sessionId) || loop.status !== "active") {
        continue;
      }
      if (loop.expiresAt !== null && loop.expiresAt <= now) {
        await this.service.update(loop.id, (current) =>
          transition(current, "expired", "max_age_reached", now),
        );
      } else if (loop.nextRunAt !== null && loop.nextRunAt <= now) {
        await this.service.update(loop.id, (current) =>
          transition(current, "due", "schedule_due", now),
        );
      }
    }
  }

  private async dispatchNext(sessionId: string): Promise<void> {
    if (this.disposed || !this.guard.tryAcquire(sessionId)) {
      return;
    }
    try {
      const state = this.observed.get(sessionId);
      if (!state || state.activity !== "idle" || state.permissionIds.size > 0) {
        return;
      }
      const candidate = selectDueLoop(
        await this.service.forSession(sessionId),
        this.clock.now(),
      );
      if (!candidate) {
        return;
      }
      const now = this.clock.now();
      if (candidate.nextRunAt !== null && candidate.nextRunAt > now) {
        return;
      }
      if (candidate.expiresAt !== null && candidate.expiresAt <= now) {
        await this.service.update(candidate.id, (loop) =>
          transition(loop, "expired", "max_age_reached", now),
        );

        return;
      }
      const claimed = await this.service.update(candidate.id, (loop) => {
        if (loop.status !== "due") {
          return loop;
        }
        if (
          loop.inflightLease &&
          loop.inflightLease.expiresAt > now &&
          loop.inflightLease.ownerInstanceId !== this.instanceId
        ) {
          return loop;
        }

        return {
          ...transition(loop, "dispatching", "dispatch_claimed", now),
          inflightLease: {
            ownerInstanceId: this.instanceId,
            claimedAt: now,
            expiresAt: now + this.service.config.leaseMs,
          },
        };
      });
      if (
        claimed.status !== "dispatching" ||
        claimed.inflightLease?.ownerInstanceId !== this.instanceId
      ) {
        return;
      }
      const activity = await this.adapter.getSessionActivity(sessionId);
      if (
        activity !== "idle" ||
        this.observed.get(sessionId)?.permissionIds.size
      ) {
        await this.defer(
          claimed,
          activity === "busy" ? "session_busy" : "session_not_confirmed_idle",
          this.service.config.busyBackoffMs,
        );

        return;
      }
      const result = await this.adapter.injectPrompt({
        sessionId,
        text: buildIterationPrompt(claimed),
        agent: claimed.agent,
        providerId: claimed.providerId,
        modelId: claimed.modelId,
        variant: claimed.variant,
      });
      if (!result.accepted) {
        throw new Error("OpenCode rejected the prompt");
      }
      if (result.messageId) {
        this.generatedMessageIds.add(result.messageId);
      }
      if (
        claimed.mode === "interval" &&
        claimed.cadenceAnchorAt !== null &&
        claimed.intervalMs !== null
      ) {
        const cadence = advanceCadence(
          claimed.cadenceAnchorAt,
          claimed.intervalMs,
          now,
        );
        await this.service.update(claimed.id, (loop) => ({
          ...loop,
          nextRunAt: cadence.nextRunAt,
          missedRunCount: loop.missedRunCount + cadence.missedTicks,
          updatedAt: now,
        }));
      }
      await this.adapter.log({
        name: "loop.dispatch.accepted",
        level: "info",
        loopId: claimed.id,
        sessionId,
      });
    } catch (error) {
      const current = (await this.service.forSession(sessionId)).find(
        (loop) =>
          loop.status === "dispatching" &&
          loop.inflightLease?.ownerInstanceId === this.instanceId,
      );
      if (current) {
        await this.failDispatch(current, errorMessage(error));
      }
    } finally {
      this.guard.release(sessionId);
    }
  }

  private async defer(
    loop: LoopRecord,
    reason: string,
    backoffMs: number,
  ): Promise<void> {
    const now = this.clock.now();
    await this.service.update(loop.id, (current) => ({
      ...transition(current, "due", reason, now),
      inflightLease: null,
      nextRunAt: now + deterministicJitter(loop.id, backoffMs),
    }));
  }

  private async failDispatch(loop: LoopRecord, message: string): Promise<void> {
    const failures = loop.consecutiveFailureCount + 1;
    const now = this.clock.now();
    await this.service.update(loop.id, (current) =>
      failures >= this.service.config.maxConsecutiveFailures
        ? {
            ...transition(
              current,
              "failed",
              "injection_failure_budget_exhausted",
              now,
            ),
            consecutiveFailureCount: failures,
            lastError: message.slice(0, 8_000),
            inflightLease: null,
          }
        : {
            ...transition(current, "due", "injection_failed", now),
            consecutiveFailureCount: failures,
            lastError: message.slice(0, 8_000),
            inflightLease: null,
            nextRunAt:
              now +
              deterministicJitter(
                loop.id,
                this.service.config.failureBackoffMs,
              ),
          },
    );
  }

  private async scheduleTimer(): Promise<void> {
    if (this.disposed) {
      return;
    }
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
    }
    const observed = new Set(this.observed.keys());
    const next = (await this.service.all())
      .filter(
        (loop) =>
          observed.has(loop.sessionId) &&
          (loop.status === "active" || loop.status === "due") &&
          loop.nextRunAt !== null,
      )
      .reduce<number | null>(
        (earliest, loop) =>
          earliest === null
            ? loop.nextRunAt
            : Math.min(earliest, loop.nextRunAt!),
        null,
      );
    if (next === null) {
      return;
    }
    this.timer = this.clock.setTimeout(
      () => {
        void this.onTimer();
      },
      Math.max(0, next - this.clock.now()),
    );
  }

  private async onTimer(): Promise<void> {
    await this.markDue();
    for (const [sessionId, state] of this.observed) {
      if (state.activity === "idle") {
        await this.dispatchNext(sessionId);
      }
    }
    await this.scheduleTimer();
  }
}
