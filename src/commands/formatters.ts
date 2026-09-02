import type { LoopRecord } from "../core/types.js";
import { safePreview } from "../verification/output-sanitizer.js";

function relative(milliseconds: number): string {
  const seconds = Math.round(Math.abs(milliseconds) / 1_000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3_600) {
    return `${Math.round(seconds / 60)}m`;
  }
  if (seconds < 86_400) {
    return `${Math.round(seconds / 3_600)}h`;
  }

  return `${Math.round(seconds / 86_400)}d`;
}

export function formatList(loops: LoopRecord[], now = Date.now()): string {
  if (!loops.length) {
    return "No loops in this session.";
  }
  const rows = loops.map((loop) =>
    [
      loop.id,
      loop.mode,
      loop.status,
      `${loop.runCount}/${loop.maxRuns ?? "∞"}`,
      loop.nextRunAt
        ? `${new Date(loop.nextRunAt).toISOString()} (${relative(loop.nextRunAt - now)})`
        : "-",
      relative(now - loop.createdAt),
      safePreview(loop.lastResult ?? "-", 60),
    ].join(" | "),
  );

  return [
    "ID | Mode | Status | Runs | Cadence/Next Run | Age | Last Result",
    "---|---|---|---|---|---|---",
    ...rows,
  ].join("\n");
}

export function formatDetail(loop: LoopRecord, now = Date.now()): string {
  return [
    `Loop: ${loop.id}${loop.persistent ? "" : " (ephemeral)"}`,
    `Mode/status: ${loop.mode} / ${loop.status}`,
    `Objective: ${(loop.objective ?? loop.prompt).slice(0, 4_000)}`,
    `Runs: ${loop.runCount}/${loop.maxRuns ?? "unlimited"}; age: ${relative(now - loop.createdAt)}`,
    `Completion: ${loop.completion?.type ?? "not applicable"}`,
    `Agent/model: ${loop.agent ?? "default"} / ${loop.providerId && loop.modelId ? `${loop.providerId}/${loop.modelId}` : "default"}`,
    `Created: ${new Date(loop.createdAt).toISOString()}; updated: ${new Date(loop.updatedAt).toISOString()}`,
    `Last run: ${loop.lastRunStartedAt ? new Date(loop.lastRunStartedAt).toISOString() : "-"}; next: ${loop.nextRunAt ? new Date(loop.nextRunAt).toISOString() : "-"}`,
    `Last result: ${safePreview(loop.lastResult ?? "-", 1_000)}`,
    `Evidence/blocker: ${safePreview(loop.completionEvidence ?? loop.blocker ?? "-", 1_000)}`,
    `Last error: ${safePreview(loop.lastError ?? "-", 1_000)}`,
    "Recent events:",
    ...loop.history
      .slice(-10)
      .map(
        (event) =>
          `- ${new Date(event.at).toISOString()} ${event.from ?? "new"} -> ${event.to}: ${event.reason}`,
      ),
  ].join("\n");
}
