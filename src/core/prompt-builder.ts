import type { LoopRecord } from "./types.js";

const MARKER = "open-loop:system-reminder:v1";

function escapeTagged(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function buildIterationPrompt(loop: LoopRecord): string {
  const subject = loop.objective ?? loop.prompt;
  const scheduling =
    loop.mode === "dynamic"
      ? "Before ending, call schedule_next_run with a delay and reason, or stop_loop."
      : loop.mode === "interval"
        ? "Perform exactly one iteration, then end this turn."
        : "When complete call complete_loop with evidence; when blocked call block_loop.";
  const notes = loop.steeringNotes
    .slice(-5)
    .map((note) => `- ${escapeTagged(note)}`)
    .join("\n");

  return (
    `<opencode_loop_iteration loop_id="${loop.id}" mode="${loop.mode}" iteration="${loop.runCount + 1}" source="open-loop">\n\n` +
    `${loop.mode === "goal" ? "Continue working toward this objective" : "Run this instruction"}:\n<loop_objective>\n${escapeTagged(subject)}\n</loop_objective>\n` +
    (loop.lastResult
      ? `\nLatest result: ${escapeTagged(loop.lastResult)}\n`
      : "") +
    (notes ? `\nSteering notes:\n${notes}\n` : "") +
    `\nRules:\n- Continue from current repository and conversation state.\n- Use tools and perform concrete work.\n- Do not sleep or poll inside this turn.\n- ${scheduling}\n</opencode_loop_iteration>`
  );
}

export function buildSystemReminder(loop: LoopRecord): string {
  const remaining =
    loop.maxRuns === null
      ? "unlimited"
      : String(Math.max(0, loop.maxRuns - loop.runCount));

  return (
    `<!-- ${MARKER} -->\nActive open-loop ${loop.id} (${loop.mode}), status ${loop.status}. ` +
    `Iteration ${loop.runCount}; remaining runs: ${remaining}. Objective: ${escapeTagged(loop.objective ?? loop.prompt).slice(0, 1_000)}. ` +
    `Do not sleep or poll in a turn. Stop or block explicitly when appropriate.` +
    (loop.mode === "dynamic"
      ? " Call schedule_next_run or stop_loop before ending each iteration."
      : "")
  );
}

export function buildCompactionContext(loops: LoopRecord[]): string {
  return loops
    .map((loop) =>
      [
        `Open-loop ${loop.id}: mode=${loop.mode}, status=${loop.status}, runs=${loop.runCount}/${loop.maxRuns ?? "unlimited"}.`,
        `Objective: ${(loop.objective ?? loop.prompt).slice(0, 2_000)}`,
        loop.lastResult ? `Latest result: ${loop.lastResult}` : "",
        loop.steeringNotes.length
          ? `Latest steering: ${loop.steeringNotes.slice(-3).join(" | ")}`
          : "",
        loop.mode === "dynamic"
          ? "Next action: explicitly schedule or stop."
          : "Next action: continue only at a safe idle boundary.",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

export function hasReminder(system: string[]): boolean {
  return system.some((entry) => entry.includes(MARKER));
}
