import type { LoopRecord } from "../core/types.js";

export function selectDueLoop(
  loops: LoopRecord[],
  now: number,
): LoopRecord | null {
  return (
    loops
      .filter((loop) => loop.status === "due")
      .sort((left, right) => {
        const leftDue = left.nextRunAt ?? left.updatedAt;
        const rightDue = right.nextRunAt ?? right.updatedAt;
        const leftPriority =
          leftDue - Math.floor(Math.max(0, now - leftDue) / 60_000) * 1_000;
        const rightPriority =
          rightDue - Math.floor(Math.max(0, now - rightDue) / 60_000) * 1_000;

        return (
          leftPriority - rightPriority ||
          left.createdAt - right.createdAt ||
          left.id.localeCompare(right.id)
        );
      })[0] ?? null
  );
}
