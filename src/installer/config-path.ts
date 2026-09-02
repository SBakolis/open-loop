import { access } from "node:fs/promises";
import { join } from "node:path";

export async function resolveConfigPath(
  directory: string,
  exists: (path: string) => Promise<boolean> = (path) =>
    access(path).then(
      () => true,
      () => false,
    ),
): Promise<string> {
  const jsonc = join(directory, "opencode.jsonc");
  const json = join(directory, "opencode.json");

  if (await exists(jsonc)) {
    return jsonc;
  }
  if (await exists(json)) {
    return json;
  }

  return jsonc;
}
