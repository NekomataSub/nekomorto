import fs from "fs";
import path from "path";
import {
  PUBLIC_ROUTE_KIND_HOME,
  PUBLIC_ROUTE_MODULE_IDS,
  resolvePublicRouteKind,
} from "../../shared/public-route-registry.js";

const readJsonFile = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

export const readClientBuildManifest = ({
  clientRootDir = process.cwd(),
  clientDistDir = path.join(clientRootDir, "dist"),
} = {}) => {
  const manifestPath = path.join(clientDistDir, ".vite", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = readJsonFile(manifestPath);
  return manifest && typeof manifest === "object" && !Array.isArray(manifest) ? manifest : null;
};

const collectManifestImports = ({ entryKey, manifest, seenEntries, seenFiles, preloads }) => {
  if (!entryKey || seenEntries.has(entryKey)) {
    return;
  }
  seenEntries.add(entryKey);
  const entry = manifest?.[entryKey];
  if (!entry || typeof entry !== "object") {
    return;
  }
  const fileHref = String(entry.file || "").trim();
  if (fileHref && !seenFiles.has(fileHref)) {
    seenFiles.add(fileHref);
    preloads.push({
      rel: "modulepreload",
      href: fileHref.startsWith("/") ? fileHref : `/${fileHref}`,
      crossorigin: "anonymous",
    });
  }
  const imports = Array.isArray(entry.imports) ? entry.imports : [];
  imports.forEach((importKey) => {
    collectManifestImports({
      entryKey: String(importKey || "").trim(),
      manifest,
      seenEntries,
      seenFiles,
      preloads,
    });
  });
};

export const resolvePublicRouteModulePreloads = ({ manifest, pathname } = {}) => {
  if (!manifest || typeof manifest !== "object") {
    return [];
  }
  const routeKind = resolvePublicRouteKind(pathname);
  const moduleId = PUBLIC_ROUTE_MODULE_IDS[routeKind];
  if (!moduleId) {
    return [];
  }
  if (routeKind === PUBLIC_ROUTE_KIND_HOME) {
    const entry = manifest?.[moduleId];
    const fileHref = String(entry?.file || "").trim();
    return fileHref
      ? [
          {
            rel: "modulepreload",
            href: fileHref.startsWith("/") ? fileHref : `/${fileHref}`,
            crossorigin: "anonymous",
          },
        ]
      : [];
  }
  const preloads = [];
  collectManifestImports({
    entryKey: moduleId,
    manifest,
    seenEntries: new Set(),
    seenFiles: new Set(),
    preloads,
  });
  return preloads;
};
