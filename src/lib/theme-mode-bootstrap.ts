import type { SiteSettings } from "@/types/site-settings";

type ThemeMode = "light" | "dark";

const normalizeMode = (value: unknown): ThemeMode => (value === "light" ? "light" : "dark");

const normalizeAccent = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "#9667e0";

export const getThemeModeDocumentAttributes = (settings?: Partial<SiteSettings> | null) => {
  const mode = normalizeMode(settings?.theme?.mode);
  const accent = normalizeAccent(settings?.theme?.accent);

  return {
    accent,
    className: mode === "dark" ? "dark" : undefined,
    mode,
    style: `color-scheme: ${mode}`,
  };
};

const THEME_MODE_BOOTSTRAP_SCRIPT = `(function(){var STORAGE_KEY="nekomata:theme-mode-preference";var SYNC_EVENT="nekomata:theme-mode-sync";var STATE_KEY="__NEKOMATA_THEME_MODE_STATE__";var BOOTSTRAP_KEY="__NEKOMATA_ASTRO_THEME_MODE_BOOTSTRAP__";var DEFAULT_ACCENT="#9667e0";function normalizeMode(value){return value==="light"?"light":"dark"}function normalizePreference(value){return value==="light"||value==="dark"||value==="global"?value:"global"}function readGlobalMode(doc){var root=doc&&doc.documentElement;return normalizeMode(root&&root.dataset&&(root.dataset.globalThemeMode||root.dataset.themeMode))}function readAccent(doc){var root=doc&&doc.documentElement;var accent=root&&root.dataset&&root.dataset.themeAccent;if(accent&&String(accent).trim())return String(accent).trim();var meta=doc&&doc.querySelector('meta[name="theme-color"]');var metaContent=meta&&meta.getAttribute("content");return metaContent&&String(metaContent).trim()?String(metaContent).trim():DEFAULT_ACCENT}function readStatePreference(){var state=window[STATE_KEY];return state&&typeof state==="object"?normalizePreference(state.preference):"global"}function readPreference(){var synced=readStatePreference();if(synced!=="global")return synced;try{return normalizePreference(window.localStorage.getItem(STORAGE_KEY))}catch(error){return "global"}}function resolveMode(preference,globalMode){return preference==="global"?globalMode:normalizeMode(preference)}function applyRoot(root,mode){if(!root)return;root.dataset.themeMode=mode;root.style.colorScheme=mode;root.classList.toggle("dark",mode==="dark")}function applyMeta(doc,accent){var meta=doc.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",accent)}function publish(preference,mode,globalMode,accent){window[STATE_KEY]={accent:accent,effectiveMode:mode,globalMode:globalMode,preference:preference};try{window.dispatchEvent(new CustomEvent(SYNC_EVENT,{detail:window[STATE_KEY]}))}catch(error){}}function applyDocument(doc){var globalMode=readGlobalMode(doc);var accent=readAccent(doc);var preference=readPreference();var mode=resolveMode(preference,globalMode);applyRoot(doc.documentElement,mode);applyMeta(doc,accent);publish(preference,mode,globalMode,accent)}applyDocument(document);if(!window[BOOTSTRAP_KEY]){window[BOOTSTRAP_KEY]=true;document.addEventListener("astro:before-swap",function(event){if(event&&event.newDocument)applyDocument(event.newDocument)});document.addEventListener("astro:after-swap",function(){applyDocument(document)});window.addEventListener("storage",function(event){if(event&&event.key===STORAGE_KEY)applyDocument(document)})}})();`;

export const buildThemeModeBootstrapScript = (_settings?: Partial<SiteSettings> | null) =>
  THEME_MODE_BOOTSTRAP_SCRIPT;
