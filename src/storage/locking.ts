import { mkdir, open, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function withFileLock<T>(
  path: string,
  operation: () => Promise<T>,
  staleMs = 30_000,
): Promise<T> {
  const lockPath = `${path}.lock`;
  await mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(
          JSON.stringify({ pid: process.pid, createdAt: Date.now() }),
        );

        return await operation();
      } finally {
        await handle.close();
        await unlink(lockPath).catch(() => undefined);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const info = await stat(lockPath).catch(() => null);
      if (info && Date.now() - info.mtimeMs > staleMs) {
        await unlink(lockPath).catch(() => undefined);
      } else {
        await sleep(Math.min(100, 5 * (attempt + 1)));
      }
    }
  }
  throw new Error(`Timed out acquiring state lock: ${lockPath}`);
}
