export function advanceCadence(
  anchorAt: number,
  intervalMs: number,
  dispatchAt: number,
): { nextRunAt: number; missedTicks: number } {
  const elapsed = Math.max(0, dispatchAt - anchorAt);
  const elapsedTicks = Math.floor(elapsed / intervalMs);

  return {
    nextRunAt: anchorAt + (elapsedTicks + 1) * intervalMs,
    missedTicks: Math.max(0, elapsedTicks - 1),
  };
}

export function deterministicJitter(id: string, baseMs: number): number {
  let hash = 2166136261;
  for (const character of id) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }

  return Math.round(baseMs * (0.9 + ((hash >>> 0) % 201) / 1_000));
}
