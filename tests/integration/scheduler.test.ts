import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolContext } from "@opencode-ai/plugin";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import type {
  NormalizedMessage,
  OpenCodeAdapter,
  StartCommand,
} from "../../src/core/types.js";
import { LoopService } from "../../src/commands/service.js";
import { JsonStore } from "../../src/storage/json-store.js";
import { LoopScheduler } from "../../src/scheduler/scheduler.js";

class FakeAdapter implements OpenCodeAdapter {
  activity: "idle" | "busy" | "unknown" = "idle";
  injections: string[] = [];
  messages: NormalizedMessage[] = [
    {
      id: "a1",
      sessionId: "s1",
      role: "assistant",
      createdAt: 2,
      text: "I inspected the project and made concrete progress toward the requested objective.",
      synthetic: false,
      toolCallCount: 1,
    },
  ];
  async injectPrompt(input: {
    text: string;
  }): Promise<{ accepted: boolean; messageId?: string }> {
    this.injections.push(input.text);

    return { accepted: true, messageId: `generated-${this.injections.length}` };
  }
  async abortSession(): Promise<boolean> {
    return true;
  }
  async getSessionActivity(): Promise<"idle" | "busy" | "unknown"> {
    return this.activity;
  }
  async getSessionMessages(): Promise<NormalizedMessage[]> {
    return this.messages;
  }
  async log(): Promise<void> {}
  async notify(): Promise<void> {}
}

const context: ToolContext = {
  sessionID: "s1",
  messageID: "m1",
  agent: "build",
  directory: process.cwd(),
  worktree: process.cwd(),
  abort: new AbortController().signal,
  metadata: () => undefined,
  ask: async () => undefined,
};

const goal: StartCommand = {
  kind: "start",
  mode: "goal",
  prompt: "finish the objective",
  intervalMs: null,
  maxRuns: 3,
  maxAgeMs: null,
  minDelayMs: null,
  verifyCommand: null,
  completionType: null,
  once: false,
  persistent: true,
  allowOverlap: false,
};

describe("scheduler integration", () => {
  it("serializes duplicate busy/idle events into one autonomous dispatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-loop-scheduler-"));
    const service = new LoopService(
      new JsonStore(join(directory, "state.json")),
      { ...DEFAULT_CONFIG, minGoalDelayMs: 60_000 },
      "p1",
    );
    const adapter = new FakeAdapter();
    const scheduler = new LoopScheduler(service, adapter);
    await scheduler.start();
    const loop = await service.create(goal, context);
    scheduler.observe("s1");
    await scheduler.onIdle("s1");
    await scheduler.runNow("s1", loop.id);
    expect(adapter.injections).toHaveLength(1);
    await scheduler.onBusy("s1");
    await scheduler.onBusy("s1");
    expect((await service.getOwned("s1", loop.id)).runCount).toBe(2);
    await scheduler.dispose();
  });

  it("does not inject while busy and pauses on human interruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-loop-busy-"));
    const service = new LoopService(
      new JsonStore(join(directory, "state.json")),
      DEFAULT_CONFIG,
      "p1",
    );
    const adapter = new FakeAdapter();
    adapter.activity = "busy";
    const scheduler = new LoopScheduler(service, adapter);
    const loop = await service.create(goal, context);
    scheduler.observe("s1");
    await scheduler.onIdle("s1");
    await scheduler.onHumanMessage("s1", "human", Date.now());
    expect((await service.getOwned("s1", loop.id)).status).toBe("paused");
    expect(adapter.injections).toHaveLength(0);
    await scheduler.dispose();
  });
});
