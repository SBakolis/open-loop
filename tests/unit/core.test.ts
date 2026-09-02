import { describe, expect, it } from "vitest";
import { parseDuration } from "../../src/core/durations.js";
import { advanceCadence } from "../../src/core/cadence.js";
import { parseCompletionMarkers } from "../../src/core/completion.js";
import { transition } from "../../src/core/state-machine.js";
import { makeLoop } from "../fixtures/loop.js";

describe("core domain", () => {
  it("parses supported durations and enforces limits", () => {
    expect(parseDuration("5 minutes")).toBe(300_000);
    expect(parseDuration("1d")).toBe(86_400_000);
    expect(() => parseDuration("0s")).toThrow();
    expect(() => parseDuration("1 month")).toThrow();
    expect(() => parseDuration("2h", 3_600_000)).toThrow();
  });

  it("advances fixed cadence without drift and coalesces missed ticks", () => {
    expect(advanceCadence(1_000, 1_000, 5_500)).toEqual({
      nextRunAt: 6_000,
      missedTicks: 3,
    });
  });

  it("validates lifecycle transitions and bounds history", () => {
    const due = transition(makeLoop(), "due", "timer", 2, 2);
    expect(due.status).toBe("due");
    expect(() => transition(due, "completed", "invalid")).toThrow(
      /Cannot transition/,
    );
  });

  it("recognizes strict completion and blocked markers outside fences", () => {
    expect(
      parseCompletionMarkers(
        "work done\n[loop:evidence] Tests and typecheck pass\n[loop:complete]",
      ),
    ).toEqual({ type: "complete", evidence: "Tests and typecheck pass" });
    expect(
      parseCompletionMarkers("```\n[loop:evidence] fake\n[loop:complete]\n```"),
    ).toBeNull();
    expect(parseCompletionMarkers("Need an API key\n[loop:blocked]")).toEqual({
      type: "blocked",
      blocker: "Need an API key",
    });
    expect(parseCompletionMarkers("the loop is complete")).toBeNull();
  });
});
