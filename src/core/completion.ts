export type CompletionMarkers =
  | { type: "complete"; evidence: string }
  | { type: "blocked"; blocker: string }
  | null;

export function parseCompletionMarkers(text: string): CompletionMarkers {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const outside: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const marker = line.match(/^\s*(```+|~~~+)/)?.[1] ?? null;
    if (marker) {
      if (!fence) {
        fence = marker[0]!;
      } else if (marker[0] === fence) {
        fence = null;
      }
      outside.push("");
    } else {
      outside.push(fence ? "" : line);
    }
  }
  while (outside.at(-1)?.trim() === "") {
    outside.pop();
  }
  const last = outside.at(-1)?.trim();
  if (last === "[loop:complete]") {
    const evidenceLine = outside.at(-2)?.trim() ?? "";
    const match = evidenceLine.match(/^\[loop:evidence\]\s+(.+)$/);

    return match?.[1]?.trim()
      ? { type: "complete", evidence: match[1].trim() }
      : null;
  }
  if (last === "[loop:blocked]") {
    const blocker = outside.at(-2)?.trim();

    return blocker ? { type: "blocked", blocker } : null;
  }

  return null;
}

export function validateEvidence(evidence: string, maxLength = 4_000): string {
  const value = evidence.trim();
  if (value.length < 10) {
    throw new Error(
      "Completion evidence must be meaningful (at least 10 characters)",
    );
  }

  return value.slice(0, maxLength);
}
