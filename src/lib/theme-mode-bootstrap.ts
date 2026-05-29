import type { SiteSettings } from "@/types/site-settings";

type ThemeMode = "light" | "dark";

const THEME_MODE_STORAGE_KEY = "nekomata:theme-mode-preference";
const THEME_MODE_SYNC_EVENT = "nekomata:theme-mode-sync";
const THEME_MODE_GLOBAL_STATE_KEY = "__NEKOMATA_THEME_MODE_STATE__";
const THEME_MODE_ASTRO_BOOTSTRAP_KEY = "__NEKOMATA_ASTRO_THEME_MODE_BOOTSTRAP__";

const normalizeMode = (value: unknown): ThemeMode => (value === "light" ? "light" : "dark");

const normalizeAccent = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "#9667e0";

export const getThemeModeDocumentAttributes = (settings?: Partial<SiteSettings> | null) => {
  const mode = normalizeMode(settings?.theme?.mode);

  return {
    className: mode === "dark" ? "dark" : undefined,
    mode,
    style: `color-scheme: ${mode}`,
  };
};

export const buildThemeModeBootstrapScript = (settings?: Partial<SiteSettings> | null) => {
  const globalMode = normalizeMode(settings?.theme?.mode);
  const accent = normalizeAccent(settings?.theme?.accent);

  return `(function(){var STORAGE_KEY=${JSON.stringify(THEME_MODE_STORAGE_KEY)};var SYNC_EVENT=${JSON.stringify(THEME_MODE_SYNC_EVENT)};var STATE_KEY=${JSON.stringify(THEME_MODE_GLOBAL_STATE_KEY)};var BOOTSTRAP_KEY=${JSON.stringify(THEME_MODE_ASTRO_BOOTSTRAP_KEY)};var globalMode=${JSON.stringify(globalMode)};var accent=${JSON.stringify(accent)};function normalizeMode(value){return value==="light"?"light":"dark"}function normalizePreference(value){return value==="light"||value==="dark"||value==="global"?value:"global"}function readStatePreference(){var state=window[STATE_KEY];return state&&typeof state==="object"?normalizePreference(state.preference):"global"}function readPreference(){var synced=readStatePreference();if(synced!=="global")return synced;try{return normalizePreference(window.localStorage.getItem(STORAGE_KEY))}catch(error){return "global"}}function resolveMode(preference){return preference==="global"?globalMode:normalizeMode(preference)}function applyRoot(root,mode){if(!root)return;root.dataset.themeMode=mode;root.style.colorScheme=mode;root.classList.toggle("dark",mode==="dark")}function applyMeta(doc){var meta=doc.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute("content",accent)}function publish(preference,mode){window[STATE_KEY]={accent:accent,effectiveMode:mode,globalMode:globalMode,preference:preference};try{window.dispatchEvent(new CustomEvent(SYNC_EVENT,{detail:window[STATE_KEY]}))}catch(error){}}function applyDocument(doc){var preference=readPreference();var mode=resolveMode(preference);applyRoot(doc.documentElement,mode);applyMeta(doc);publish(preference,mode)}applyDocument(document);if(!window[BOOTSTRAP_KEY]){window[BOOTSTRAP_KEY]=true;document.addEventListener("astro:before-swap",function(event){if(event&&event.newDocument)applyDocument(event.newDocument)});document.addEventListener("astro:after-swap",function(){applyDocument(document)});window.addEventListener("storage",function(event){if(event&&event.key===STORAGE_KEY)applyDocument(document)})}})();`;
};
