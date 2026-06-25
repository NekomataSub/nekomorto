import path from "path";

import { HTML_CACHE_CONTROL_NO_STORE } from "./html-cache-control.js";

export const STATIC_DEFAULT_CACHE_CONTROL = "public, max-age=0, must-revalidate";
export const STATIC_IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const PWA_MANIFEST_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=600";
export const PWA_THEME_COLOR_DARK = "#101114";
export const PWA_THEME_COLOR_LIGHT = "#f8fafc";

export const PWA_MANIFEST_BASE = Object.freeze({
  id: "/",
  name: "Nekomata Fansub",
  short_name: "Nekomata",
  description:
    "Fansub dedicada a trazer histórias inesquecíveis com o carinho que a comunidade merece.",
  start_url: "/",
  display: "standalone",
  lang: "pt-BR",
  scope: "/",
  categories: ["entertainment", "books"],
  screenshots: [
    {
      src: "/pwa/screenshots/home-mobile-1080x1920.png",
      sizes: "1080x1920",
      type: "image/png",
      form_factor: "narrow",
      label: "Pagina inicial mobile",
    },
    {
      src: "/pwa/screenshots/project-mobile-1080x1920.png",
      sizes: "1080x1920",
      type: "image/png",
      form_factor: "narrow",
      label: "Pagina de projeto mobile",
    },
    {
      src: "/pwa/screenshots/home-desktop-1920x1080.png",
      sizes: "1920x1080",
      type: "image/png",
      form_factor: "wide",
      label: "Pagina inicial desktop",
    },
  ],
  icons: [
    {
      src: "/pwa/icon-192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/pwa/icon-512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/pwa/icon-512-maskable.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
});

export const hasHashedAssetName = (filePath) => {
  const fileName = path.basename(String(filePath || ""));
  return /(?:-|\.)[A-Za-z0-9_-]{6,}\./.test(fileName);
};

export const setStaticCacheHeaders = (res, filePath) => {
  const normalizedPath = String(filePath || "");
  const fileName = path.basename(normalizedPath);

  if (fileName === "manifest.webmanifest") {
    res.setHeader("Cache-Control", PWA_MANIFEST_CACHE_CONTROL);
    return;
  }

  if (normalizedPath.endsWith(".html")) {
    res.setHeader("Cache-Control", HTML_CACHE_CONTROL_NO_STORE);
    return;
  }

  if (
    (normalizedPath.includes(`${path.sep}assets${path.sep}`) ||
      normalizedPath.includes(`${path.sep}_astro${path.sep}`)) &&
    hasHashedAssetName(normalizedPath)
  ) {
    res.setHeader("Cache-Control", STATIC_IMMUTABLE_CACHE_CONTROL);
    return;
  }

  res.setHeader("Cache-Control", STATIC_DEFAULT_CACHE_CONTROL);
};

export default {
  PWA_MANIFEST_BASE,
  PWA_MANIFEST_CACHE_CONTROL,
  PWA_THEME_COLOR_DARK,
  PWA_THEME_COLOR_LIGHT,
  STATIC_DEFAULT_CACHE_CONTROL,
  STATIC_IMMUTABLE_CACHE_CONTROL,
  hasHashedAssetName,
  setStaticCacheHeaders,
};
