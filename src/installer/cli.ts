#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { doctor } from "./doctor.js";
import {
  installPluginInConfig,
  uninstallPluginFromConfig,
} from "./config-editor.js";

const args = new Set(process.argv.slice(2));
const project = args.has("--project");
const configDirectory = project
  ? join(process.cwd(), ".opencode")
  : join(homedir(), ".config", "opencode");
const configPath = join(configDirectory, "opencode.jsonc");
const commandPath = join(configDirectory, "commands", "loop.md");
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const templatePath = join(packageRoot, "commands", "loop.md");

async function main(): Promise<void> {
  const action = process.argv[2] ?? "install";
  if (action === "doctor") {
    process.stdout.write(`${await doctor(configPath, commandPath)}\n`);

    return;
  }
  if (action === "install") {
    await mkdir(configDirectory, { recursive: true, mode: 0o700 });
    const existing = await readFile(configPath, "utf8").catch(
      () => '{\n  "$schema": "https://opencode.ai/config.json"\n}\n',
    );
    const edited = installPluginInConfig(existing);
    if (edited.changed) {
      await writeFile(configPath, edited.content, { mode: 0o600 });
      process.stdout.write(
        `Updated ${configPath}: added @sbakolis/open-loop plugin.\n`,
      );
    } else {
      process.stdout.write(
        `${configPath}: @sbakolis/open-loop plugin already registered.\n`,
      );
    }
    await mkdir(dirname(commandPath), { recursive: true, mode: 0o700 });
    const template = await readFile(templatePath, "utf8");
    const current = await readFile(commandPath, "utf8").catch(() => null);
    if (current !== template) {
      await writeFile(commandPath, template, { mode: 0o600 });
      process.stdout.write(`Installed ${commandPath}.\n`);
    } else {
      process.stdout.write(`${commandPath}: command already current.\n`);
    }

    return;
  }
  if (action === "uninstall" || args.has("--uninstall")) {
    const existing = await readFile(configPath, "utf8").catch(() => "{}");
    const edited = uninstallPluginFromConfig(existing);
    if (edited.changed) {
      await writeFile(configPath, edited.content, { mode: 0o600 });
      process.stdout.write(
        `Updated ${configPath}: removed @sbakolis/open-loop plugin.\n`,
      );
    }
    await rm(commandPath, { force: true });
    process.stdout.write(`Removed ${commandPath}. Loop state was preserved.\n`);

    return;
  }
  throw new Error(
    "Usage: open-loop install [--project] | uninstall [--project] | doctor [--project]",
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `open-loop: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
