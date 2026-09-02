import { describe, expect, it } from "vitest";
import { parseCommand, tokenize } from "../../src/core/parser.js";

describe("command parser", () => {
  it("parses goal options and preserves prompt text after the delimiter", () => {
    const command = parseCommand(
      '/loop until --max-runs 20 --verify "npm test" -- fix  all\n tests --max-runs 2',
    );
    expect(command).toMatchObject({
      kind: "start",
      mode: "goal",
      maxRuns: 20,
      verifyCommand: "npm test",
    });
    expect(command.kind === "start" && command.prompt).toBe(
      "fix  all\n tests --max-runs 2",
    );
  });

  it.each([
    ["every 5m -- check CI", 300_000],
    ["30s --once -- remind me", 30_000],
    ["every 2 hours -- check", 7_200_000],
  ])("parses interval alias %s", (input, intervalMs) => {
    expect(parseCommand(input)).toMatchObject({
      kind: "start",
      mode: "interval",
      intervalMs,
    });
  });

  it("uses configured bare mode and rejects ambiguity when requested", () => {
    expect(parseCommand("monitor deployment", "dynamic")).toMatchObject({
      kind: "start",
      mode: "dynamic",
    });
    expect(() => parseCommand("monitor deployment", "error")).toThrow(/until/);
  });

  it("does not parse flag-like prompt text as options", () => {
    const command = parseCommand("until fix --max-runs whatever");
    expect(command.kind === "start" && command.prompt).toBe(
      "fix --max-runs whatever",
    );
  });

  it("handles quoting and rejects unterminated quotes", () => {
    expect(tokenize(`until --verify 'npm test' -- goal`)[2]?.value).toBe(
      "npm test",
    );
    expect(() => tokenize(`until 'broken`)).toThrow(/Unterminated/);
  });

  it("parses management commands", () => {
    expect(parseCommand("stop --all --abort")).toEqual({
      kind: "management",
      action: "stop",
      loopId: null,
      all: true,
      abort: true,
      prompt: null,
    });
    expect(parseCommand("steer loop_123 -- use  this approach")).toMatchObject({
      action: "steer",
      loopId: "loop_123",
      prompt: "use  this approach",
    });
  });
});
