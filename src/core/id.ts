import { randomBytes } from "node:crypto";

export function createLoopId(
  existing: ReadonlySet<string> = new Set(),
): string {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = `loop_${randomBytes(5).toString("hex")}`;
    if (!existing.has(id)) {
      return id;
    }
  }
  throw new Error("Unable to allocate a unique loop ID");
}
