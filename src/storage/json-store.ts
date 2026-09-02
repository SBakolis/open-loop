import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import type { LoopRecord, StateFile } from "../core/types.js";
import { EMPTY_STATE, migrateState } from "./migrations.js";
import { stateFileSchema } from "./schema.js";
import { withFileLock } from "./locking.js";

export class JsonStore {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(public readonly path: string) {}

  async load(): Promise<StateFile> {
    return this.serial(() => this.readValidated());
  }

  async update(
    mutator: (loops: LoopRecord[]) => LoopRecord[] | Promise<LoopRecord[]>,
  ): Promise<StateFile> {
    return this.serial(async () =>
      withFileLock(this.path, async () => {
        const current = await this.readValidated();
        const next: StateFile = {
          schemaVersion: 1,
          revision: current.revision + 1,
          loops: await mutator(structuredClone(current.loops)),
        };
        const validated = stateFileSchema.parse(next);
        await this.writeAtomic(validated);

        return validated;
      }),
    );
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );

    return result;
  }

  private async readValidated(): Promise<StateFile> {
    try {
      const content = await readFile(this.path, "utf8");

      return stateFileSchema.parse(migrateState(JSON.parse(content)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY_STATE);
      }
      await this.quarantine();

      return structuredClone(EMPTY_STATE);
    }
  }

  private async quarantine(): Promise<void> {
    await rename(this.path, `${this.path}.corrupt.${Date.now()}`).catch(
      () => undefined,
    );
  }

  private async writeAtomic(state: StateFile): Promise<void> {
    const directory = dirname(this.path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, this.path);
  }
}
