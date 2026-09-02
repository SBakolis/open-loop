import { applyEdits, modify, parse } from "jsonc-parser";

export function installPluginInConfig(
  content: string,
  packageName = "open-loop",
): { content: string; changed: boolean } {
  const root = parse(content || "{}") as Record<string, unknown>;
  const plugins = Array.isArray(root.plugin) ? root.plugin : [];
  if (
    plugins.some(
      (entry) =>
        entry === packageName ||
        (Array.isArray(entry) && entry[0] === packageName),
    )
  ) {
    return { content, changed: false };
  }
  const updated = applyEdits(
    content || "{}",
    modify(content || "{}", ["plugin"], [...plugins, packageName], {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  );

  return {
    content: updated.endsWith("\n") ? updated : `${updated}\n`,
    changed: true,
  };
}

export function uninstallPluginFromConfig(
  content: string,
  packageName = "open-loop",
): { content: string; changed: boolean } {
  const root = parse(content) as Record<string, unknown>;
  const plugins = Array.isArray(root.plugin) ? root.plugin : [];
  const filtered = plugins.filter(
    (entry) =>
      entry !== packageName &&
      !(Array.isArray(entry) && entry[0] === packageName),
  );
  if (filtered.length === plugins.length) {
    return { content, changed: false };
  }
  const updated = applyEdits(
    content,
    modify(content, ["plugin"], filtered, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    }),
  );

  return {
    content: updated.endsWith("\n") ? updated : `${updated}\n`,
    changed: true,
  };
}

export function countPluginEntries(
  content: string,
  packageName = "open-loop",
): number {
  const root = parse(content || "{}") as Record<string, unknown>;
  const plugins = Array.isArray(root.plugin) ? root.plugin : [];

  return plugins.filter(
    (entry) =>
      entry === packageName ||
      (Array.isArray(entry) && entry[0] === packageName),
  ).length;
}
