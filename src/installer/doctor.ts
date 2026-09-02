import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { countPluginEntries } from "./config-editor.js";
import { defaultStatePath } from "../storage/paths.js";

const execFileAsync = promisify(execFile);

export async function doctor(
  configPath: string,
  commandPath: string,
): Promise<string> {
  const config = await readFile(configPath, "utf8").catch(() => "{}");
  const version = await execFileAsync("opencode", ["--version"])
    .then(({ stdout }) => stdout.trim())
    .catch(() => "not found");
  const statePath = defaultStatePath();
  const stateReadable = await access(statePath, constants.R_OK | constants.W_OK)
    .then(() => "read/write")
    .catch(() => "not created or inaccessible");
  const commandInstalled = await access(commandPath, constants.R_OK)
    .then(() => true)
    .catch(() => false);
  const count = countPluginEntries(config);

  return [
    `OpenCode version: ${version}`,
    "Tested plugin/SDK versions: 1.18.19 through 1.18.26",
    `Config: ${configPath}`,
    `Plugin registrations: ${count}${count > 1 ? " (duplicate)" : ""}`,
    `/loop discoverable: ${commandInstalled || count === 1 ? "yes" : "no"}`,
    `Command file: ${commandPath} (${commandInstalled ? "installed" : "missing"})`,
    `State: ${statePath} (${stateReadable})`,
    version !== "not found" && !/^1\./.test(version)
      ? "Compatibility warning: this release targets OpenCode 1.x."
      : "Compatibility: supported OpenCode 1.x host detected.",
  ].join("\n");
}
