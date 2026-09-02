import type { StateFile } from "../core/types.js";

export function migrateState(input: unknown): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }
  const value = input as Record<string, unknown>;
  if (value.schemaVersion === 1) {
    return value;
  }
  if (value.schemaVersion === 0 && Array.isArray(value.loops)) {
    return {
      schemaVersion: 1,
      revision: typeof value.revision === "number" ? value.revision : 0,
      loops: value.loops.map((entry) => {
        const loop = entry as Record<string, unknown>;

        return {
          ...loop,
          schemaVersion: 1,
          persistent: loop.persistent ?? true,
          allowOverlap: loop.allowOverlap ?? false,
          pendingAgentCompletion: loop.pendingAgentCompletion ?? false,
          steeringNotes: loop.steeringNotes ?? [],
          history: loop.history ?? [],
        };
      }),
    };
  }

  return input;
}

export const EMPTY_STATE: StateFile = {
  schemaVersion: 1,
  revision: 0,
  loops: [],
};
