import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonStore } from "../../src/storage/json-store.js";
import { makeLoop } from "../fixtures/loop.js";

describe("JSON state store", () => {
  it("round trips and serializes concurrent updates", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-loop-"));
    const path = join(directory, "state.json");
    const store = new JsonStore(path);
    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.update((loops) => [
          ...loops,
          makeLoop({ id: `loop_${String(index).padStart(10, "0")}` }),
        ]),
      ),
    );
    expect((await store.load()).loops).toHaveLength(10);
    expect(JSON.parse(await readFile(path, "utf8")).revision).toBe(10);
  });

  it("quarantines corrupt data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "open-loop-corrupt-"));
    const path = join(directory, "state.json");
    await writeFile(path, "not json");
    expect((await new JsonStore(path).load()).loops).toEqual([]);
    expect(
      (await readdir(directory)).some((name) =>
        name.startsWith("state.json.corrupt."),
      ),
    ).toBe(true);
  });
});
