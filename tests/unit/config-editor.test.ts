import { describe, expect, it } from "vitest";
import {
  countPluginEntries,
  installPluginInConfig,
  uninstallPluginFromConfig,
} from "../../src/installer/config-editor.js";

describe("config editor", () => {
  it("installs idempotently while preserving comments", () => {
    const initial = `{\n  // keep me\n  "$schema": "https://opencode.ai/config.json"\n}\n`;
    const once = installPluginInConfig(initial);
    const twice = installPluginInConfig(once.content);
    expect(once.content).toContain("// keep me");
    expect(twice.changed).toBe(false);
    expect(countPluginEntries(twice.content)).toBe(1);
    expect(
      countPluginEntries(uninstallPluginFromConfig(twice.content).content),
    ).toBe(0);
  });
});
