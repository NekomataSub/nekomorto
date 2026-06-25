const ASTRO_ASSET_PATH_PATTERN = /(?:https?:\/\/[^\s"'<>]+)?\/_astro\/[^\s"'<>]+?\.(?:css|js)/gi;
const MODULE_IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["']([^"']+)["']/g;

const toAstroAssetUrl = (value, baseUrl) => {
  try {
    const base = new URL(baseUrl);
    const resolved = new URL(String(value || ""), baseUrl);
    return resolved.origin === base.origin && resolved.pathname.startsWith("/_astro/")
      ? resolved.toString()
      : "";
  } catch {
    return "";
  }
};

export const extractAstroAssetUrls = (source, baseUrl) =>
  Array.from(String(source || "").matchAll(ASTRO_ASSET_PATH_PATTERN))
    .map((match) => toAstroAssetUrl(match[0], baseUrl))
    .filter(Boolean);

export const extractAstroModuleImportUrls = (source, moduleUrl) =>
  Array.from(String(source || "").matchAll(MODULE_IMPORT_PATTERN))
    .filter((match) => /^(?:\.{1,2}\/|\/_astro\/|https?:\/\/)/i.test(match[1]))
    .map((match) => toAstroAssetUrl(match[1], moduleUrl))
    .filter(Boolean);
