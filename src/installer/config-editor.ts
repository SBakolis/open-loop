import { applyEdits, modify, parse } from "jsonc-parser";

export const PACKAGE_NAME = "@sbakolis/open-loop";
const LEGACY_PACKAGE_NAME = "open-loop";

export function installPluginInConfig(
  content: string,
  packageName = PACKAGE_NAME,
): { content: string; changed: boolean } {
  const root = parse(content || "{}") as Record<string, unknown>;
  const plugins = Array.isArray(root.plugin) ? root.plugin : [];
  const hasPackage = plugins.some((entry) => matchesPackage(entry, packageName));
  const withoutLegacy = plugins.filter(
    (entry) => !matchesPackage(entry, LEGACY_PACKAGE_NAME),
  );
  if (hasPackage && withoutLegacy.length === plugins.length) {
    return { content, changed: false };
  }
  const updatedPlugins = hasPackage
    ? withoutLegacy
    : [...withoutLegacy, packageName];
  const updated = applyEdits(
    content || "{}",
    modify(content || "{}", ["plugin"], updatedPlugins, {
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
  packageName = PACKAGE_NAME,
): { content: string; changed: boolean } {
  const root = parse(content) as Record<string, unknown>;
  const plugins = Array.isArray(root.plugin) ? root.plugin : [];
  const packageNames = new Set(
    packageName === PACKAGE_NAME
      ? [PACKAGE_NAME, LEGACY_PACKAGE_NAME]
      : [packageName],
  );
  const filtered = plugins.filter(
    (entry) => ![...packageNames].some((name) => matchesPackage(entry, name)),
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
  packageName = PACKAGE_NAME,
): number {
  const root = parse(content || "{}") as Record<string, unknown>;
  const plugins = Array.isArray(root.plugin) ? root.plugin : [];

  const packageNames =
    packageName === PACKAGE_NAME
      ? [PACKAGE_NAME, LEGACY_PACKAGE_NAME]
      : [packageName];

  return plugins.filter((entry) =>
    packageNames.some((name) => matchesPackage(entry, name)),
  ).length;
}

function matchesPackage(entry: unknown, packageName: string): boolean {
  return (
    entry === packageName ||
    (Array.isArray(entry) && entry[0] === packageName)
  );
}
