import { homedir } from "node:os";
import { join } from "node:path";

export function defaultStatePath(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string {
  if (env.OPEN_LOOP_STATE_PATH) {
    return env.OPEN_LOOP_STATE_PATH;
  }
  if (platform === "win32") {
    return join(
      env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "open-loop",
      "state.json",
    );
  }

  return join(
    env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "open-loop",
    "state.json",
  );
}
