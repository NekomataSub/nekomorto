import { sanitizeLocalAssetHref } from "./url-safety.js";

const escapeHtmlAttribute = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const serializeInlineJson = (value) =>
  JSON.stringify(value ?? null)
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

const injectSnippet = (html, marker, snippet, fallbackPattern = "</head>") => {
  if (!snippet) {
    return String(html || "");
  }
  const input = String(html || "");
  if (input.includes(marker)) {
    return input.replace(marker, `${marker}\n${snippet}`);
  }
  return input.replace(fallbackPattern, `${snippet}\n${fallbackPattern}`);
};

const readHtmlAttributeValue = (tag, attributeName) => {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = String(tag || "").match(pattern);
  if (!match) {
    return "";
  }
  return String(match[1] || match[2] || match[3] || "").trim();
};

const isLocalStylesheetHref = (href) => {
  return Boolean(sanitizeLocalAssetHref(href, { allowedPrefixes: ["/assets/"] }));
};

export const extractLocalStylesheetHrefs = (html) => {
  const tags = String(html || "").match(/<link\b[^>]*>/gi) || [];
  const hrefs = [];
  const seen = new Set();

  tags.forEach((tag) => {
    const rel = readHtmlAttributeValue(tag, "rel").toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes("stylesheet")) {
      return;
    }
    const href = sanitizeLocalAssetHref(readHtmlAttributeValue(tag, "href"), {
      allowedPrefixes: ["/assets/"],
    });
    if (!href || !isLocalStylesheetHref(href) || seen.has(href)) {
      return;
    }
    seen.add(href);
    hrefs.push(href);
  });

  return hrefs;
};

const buildInlineBootstrapInitScript = () =>
  [
    "(function () {",
    '  var THEME_STORAGE_KEY = "nekomata:theme-mode-preference";',
    '  var THEME_SYNC_EVENT = "nekomata:theme-mode-sync";',
    '  var THEME_GLOBAL_STATE_KEY = "__NEKOMATA_THEME_MODE_STATE__";',
    '  var DEFAULT_THEME_COLOR = "#9667e0";',
    '  var DEFAULT_APP_LOADER_ACCENT_SOFT = "rgba(150, 103, 224, 0.2)";',
    "  var readSerializedBootstrapValue = function (id, fallback) {",
    "    var node = document.getElementById(id);",
    "    if (!node) return fallback;",
    "    try {",
    "      return JSON.parse(node.textContent || 'null');",
    "    } catch (_error) {",
    "      return fallback;",
    "    }",
    "  };",
    "  window.__BOOTSTRAP_PUBLIC__ = readSerializedBootstrapValue('nekomata-bootstrap-public', window.__BOOTSTRAP_PUBLIC__ || null);",
    "  window.__BOOTSTRAP_ROUTE__ = readSerializedBootstrapValue('nekomata-bootstrap-route', window.__BOOTSTRAP_ROUTE__ || null);",
    "  window.__BOOTSTRAP_SETTINGS__ = readSerializedBootstrapValue('nekomata-bootstrap-settings', window.__BOOTSTRAP_SETTINGS__ || null);",
    "  window.__BOOTSTRAP_PUBLIC_ME__ = readSerializedBootstrapValue('nekomata-bootstrap-public-me', window.__BOOTSTRAP_PUBLIC_ME__ || null);",
    "  window.__BOOTSTRAP_PWA_ENABLED__ = readSerializedBootstrapValue('nekomata-bootstrap-pwa-enabled', window.__BOOTSTRAP_PWA_ENABLED__ || false) === true;",
    "  window.__BOOTSTRAP_SKIP_PUBLIC_FETCH__ = readSerializedBootstrapValue('nekomata-bootstrap-skip-public-fetch', window.__BOOTSTRAP_SKIP_PUBLIC_FETCH__ || false) === true;",
    "  var isPlaceholderTitle = function (value) {",
    "    var normalized = String(value || '').trim().toLowerCase();",
    '    return !normalized || normalized === "carregando..." || normalized === "loading...";',
    "  };",
    "  var normalizeBootstrapPayload = function (value) {",
    "    if (!value || typeof value !== 'object') return null;",
    "    if (!Array.isArray(value.projects) || !Array.isArray(value.posts)) return null;",
    "    return value;",
    "  };",
    "  var normalizeThemeMode = function (value) {",
    "    return String(value || '').toLowerCase() === 'light' ? 'light' : 'dark';",
    "  };",
    "  var normalizeThemePreference = function (value) {",
    "    var normalized = String(value || '').toLowerCase();",
    "    if (normalized === 'light' || normalized === 'dark' || normalized === 'global') {",
    "      return normalized;",
    "    }",
    "    return 'global';",
    "  };",
    "  var normalizeThemeColor = function (value) {",
    "    var normalized = String(value || '').trim();",
    "    if (!/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(normalized)) {",
    "      return DEFAULT_THEME_COLOR;",
    "    }",
    "    var raw = normalized.slice(1);",
    "    if (raw.length === 3) {",
    "      raw = raw",
    "        .split('')",
    "        .map(function (entry) {",
    "          return entry + entry;",
    "        })",
    "        .join('');",
    "    }",
    "    return '#' + raw.toLowerCase();",
    "  };",
    "  var clamp = function (value, min, max) {",
    "    return Math.min(max, Math.max(min, value));",
    "  };",
    "  var hexToHsl = function (value) {",
    "    var normalized = normalizeThemeColor(value);",
    "    var raw = normalized.slice(1);",
    "    var r = parseInt(raw.slice(0, 2), 16) / 255;",
    "    var g = parseInt(raw.slice(2, 4), 16) / 255;",
    "    var b = parseInt(raw.slice(4, 6), 16) / 255;",
    "    var max = Math.max(r, g, b);",
    "    var min = Math.min(r, g, b);",
    "    var delta = max - min;",
    "    var h = 0;",
    "    if (delta !== 0) {",
    "      if (max === r) {",
    "        h = ((g - b) / delta) % 6;",
    "      } else if (max === g) {",
    "        h = (b - r) / delta + 2;",
    "      } else {",
    "        h = (r - g) / delta + 4;",
    "      }",
    "      h = Math.round(h * 60);",
    "      if (h < 0) h += 360;",
    "    }",
    "    var l = (max + min) / 2;",
    "    var s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));",
    "    return {",
    "      h: h,",
    "      s: Math.round(s * 100),",
    "      l: Math.round(l * 100),",
    "    };",
    "  };",
    "  var parseHslToken = function (value) {",
    "    var match = String(value || '').trim().match(/^(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%$/);",
    "    if (!match) return null;",
    "    return {",
    "      h: Number(match[1]),",
    "      s: Number(match[2]) / 100,",
    "      l: Number(match[3]) / 100,",
    "    };",
    "  };",
    "  var hslToRgb = function (value) {",
    "    var hue = (((value.h % 360) + 360) % 360) / 360;",
    "    if (value.s === 0) {",
    "      var gray = Math.round(value.l * 255);",
    "      return [gray, gray, gray];",
    "    }",
    "    var q = value.l < 0.5 ? value.l * (1 + value.s) : value.l + value.s - value.l * value.s;",
    "    var p = 2 * value.l - q;",
    "    var channel = function (offset) {",
    "      var t = hue + offset;",
    "      if (t < 0) t += 1;",
    "      if (t > 1) t -= 1;",
    "      if (t < 1 / 6) return p + (q - p) * 6 * t;",
    "      if (t < 1 / 2) return q;",
    "      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;",
    "      return p;",
    "    };",
    "    return [",
    "      Math.round(channel(1 / 3) * 255),",
    "      Math.round(channel(0) * 255),",
    "      Math.round(channel(-1 / 3) * 255),",
    "    ];",
    "  };",
    "  var relativeLuminance = function (rgb) {",
    "    var normalizeChannel = function (channel) {",
    "      var channelValue = channel / 255;",
    "      return channelValue <= 0.03928 ? channelValue / 12.92 : Math.pow((channelValue + 0.055) / 1.055, 2.4);",
    "    };",
    "    var r = normalizeChannel(rgb[0]);",
    "    var g = normalizeChannel(rgb[1]);",
    "    var b = normalizeChannel(rgb[2]);",
    "    return 0.2126 * r + 0.7152 * g + 0.0722 * b;",
    "  };",
    "  var contrastRatio = function (foreground, background) {",
    "    var foregroundHsl = parseHslToken(foreground);",
    "    var backgroundHsl = parseHslToken(background);",
    "    if (!foregroundHsl || !backgroundHsl) return 0;",
    "    var luminanceA = relativeLuminance(hslToRgb(foregroundHsl));",
    "    var luminanceB = relativeLuminance(hslToRgb(backgroundHsl));",
    "    var lighter = Math.max(luminanceA, luminanceB);",
    "    var darker = Math.min(luminanceA, luminanceB);",
    "    return (lighter + 0.05) / (darker + 0.05);",
    "  };",
    "  var pickReadableForeground = function (background) {",
    '    var darkForeground = "224 41% 12%";',
    '    var lightForeground = "0 0% 100%";',
    "    return contrastRatio(darkForeground, background) >= contrastRatio(lightForeground, background)",
    "      ? darkForeground",
    "      : lightForeground;",
    "  };",
    "  var removeSeoSnapshot = function () {",
    "    var snapshot = document.getElementById('seo-snapshot');",
    "    if (!snapshot || !snapshot.parentNode) return false;",
    "    snapshot.parentNode.removeChild(snapshot);",
    "    return true;",
    "  };",
    "  var armSeoSnapshotCleanup = function () {",
    "    var tryCleanup = function () {",
    "      var root = document.getElementById('root');",
    "      if (!root || root.childNodes.length === 0) return false;",
    "      return removeSeoSnapshot();",
    "    };",
    "    if (tryCleanup()) return;",
    "    var root = document.getElementById('root');",
    "    var observer = null;",
    "    var schedule = function () {",
    "      if (tryCleanup() && observer) observer.disconnect();",
    "    };",
    "    if (typeof window.requestAnimationFrame === 'function') {",
    "      window.requestAnimationFrame(schedule);",
    "    }",
    "    window.setTimeout(schedule, 0);",
    "    window.addEventListener('load', schedule, { once: true });",
    "    if (root && typeof MutationObserver !== 'undefined') {",
    "      observer = new MutationObserver(schedule);",
    "      observer.observe(root, { childList: true, subtree: true });",
    "    }",
    "  };",
    "  var applyThemeColor = function (accentHex) {",
    "    var meta = document.querySelector('meta[name=\"theme-color\"]');",
    "    if (!meta) return;",
    "    meta.setAttribute('content', normalizeThemeColor(accentHex));",
    "  };",
    "  var applyThemeAccentVariables = function (accentHex) {",
    "    var normalized = normalizeThemeColor(accentHex);",
    "    var accentHsl = hexToHsl(normalized);",
    "    var primaryValue = accentHsl.h + ' ' + accentHsl.s + '% ' + accentHsl.l + '%';",
    "    var accentValue = accentHsl.h + ' ' + clamp(accentHsl.s - 10, 0, 100) + '% ' + clamp(accentHsl.l + 6, 0, 100) + '%';",
    "    var softAccent = DEFAULT_APP_LOADER_ACCENT_SOFT;",
    "    var hexMatch = normalized.match(/^#([0-9a-f]{6})$/);",
    "    if (hexMatch) {",
    "      var raw = hexMatch[1];",
    "      var r = parseInt(raw.slice(0, 2), 16);",
    "      var g = parseInt(raw.slice(2, 4), 16);",
    "      var b = parseInt(raw.slice(4, 6), 16);",
    "      softAccent = 'rgba(' + r + ', ' + g + ', ' + b + ', 0.2)';",
    "    }",
    "    var root = document.documentElement;",
    "    root.style.setProperty('--primary', primaryValue);",
    "    root.style.setProperty('--primary-foreground', pickReadableForeground(primaryValue));",
    "    root.style.setProperty('--ring', primaryValue);",
    "    root.style.setProperty('--sidebar-primary', primaryValue);",
    "    root.style.setProperty('--sidebar-ring', primaryValue);",
    "    root.style.setProperty('--accent', accentValue);",
    "    root.style.setProperty('--accent-foreground', pickReadableForeground(accentValue));",
    "    root.style.setProperty('--app-loader-accent', normalized);",
    "    root.style.setProperty('--app-loader-accent-soft', softAccent);",
    "  };",
    "  var applyThemeMode = function (mode) {",
    "    var resolved = normalizeThemeMode(mode);",
    "    var root = document.documentElement;",
    "    root.dataset.themeMode = resolved;",
    "    root.style.colorScheme = resolved;",
    "    if (resolved === 'dark') {",
    "      root.classList.add('dark');",
    "      return;",
    "    }",
    "    root.classList.remove('dark');",
    "  };",
    "  var readLocalThemePreference = function () {",
    "    try {",
    "      var value = window.localStorage.getItem(THEME_STORAGE_KEY);",
    "      if (value === 'light' || value === 'dark' || value === 'global') {",
    "        return value;",
    "      }",
    "    } catch (_error) {",
    "      return 'global';",
    "    }",
    "    return 'global';",
    "  };",
    "  var readThemeSyncState = function () {",
    "    var candidate = window[THEME_GLOBAL_STATE_KEY];",
    "    if (!candidate || typeof candidate !== 'object') {",
    "      return null;",
    "    }",
    "    return {",
    "      preference: normalizeThemePreference(candidate.preference),",
    "      effectiveMode: normalizeThemeMode(candidate.effectiveMode),",
    "      globalMode: normalizeThemeMode(candidate.globalMode),",
    "      accent: normalizeThemeColor(candidate.accent),",
    "    };",
    "  };",
    "  var writeThemeSyncState = function (state) {",
    "    var normalizedState = {",
    "      preference: normalizeThemePreference(state && state.preference),",
    "      effectiveMode: normalizeThemeMode(state && state.effectiveMode),",
    "      globalMode: normalizeThemeMode(state && state.globalMode),",
    "      accent: normalizeThemeColor(state && state.accent),",
    "    };",
    "    window[THEME_GLOBAL_STATE_KEY] = normalizedState;",
    "    return normalizedState;",
    "  };",
    "  var dispatchThemeSync = function (state) {",
    "    try {",
    "      window.dispatchEvent(new CustomEvent(THEME_SYNC_EVENT, { detail: state }));",
    "    } catch (_error) {",
    "      window.dispatchEvent(new Event(THEME_SYNC_EVENT));",
    "    }",
    "  };",
    "  var localThemePreference = readLocalThemePreference();",
    "  var applyBootstrapSettings = function (settings) {",
    "    if (!settings || typeof settings !== 'object') return;",
    "    window.__BOOTSTRAP_SETTINGS__ = settings;",
    "    var name = (settings.site && settings.site.name) || '';",
    "    if (name && isPlaceholderTitle(document.title)) {",
    "      document.title = name;",
    "    }",
    "    var globalMode = settings && settings.theme ? settings.theme.mode : 'dark';",
    "    if (localThemePreference === 'global') {",
    "      applyThemeMode(globalMode);",
    "    }",
    "    applyThemeColor(settings.theme && settings.theme.accent);",
    "    applyThemeAccentVariables(settings.theme && settings.theme.accent);",
    "  };",
    "  var hydrateBootstrap = function (value) {",
    "    var bootstrap = normalizeBootstrapPayload(value);",
    "    if (!bootstrap) {",
    "      return null;",
    "    }",
    "    window.__BOOTSTRAP_PUBLIC__ = bootstrap;",
    "    applyBootstrapSettings(bootstrap.settings || null);",
    "    return bootstrap;",
    "  };",
    "  var existingBootstrap = normalizeBootstrapPayload(window.__BOOTSTRAP_PUBLIC__);",
    "  var existingSettings =",
    "    (existingBootstrap && existingBootstrap.settings) || window.__BOOTSTRAP_SETTINGS__ || null;",
    "  var shouldSkipPublicFetch = window.__BOOTSTRAP_SKIP_PUBLIC_FETCH__ === true;",
    "  var existingThemeState = readThemeSyncState();",
    "  if (existingThemeState && localThemePreference === 'global') {",
    "    localThemePreference = existingThemeState.preference;",
    "  }",
    "  var globalMode = normalizeThemeMode(existingSettings && existingSettings.theme && existingSettings.theme.mode);",
    "  var initialMode =",
    "    localThemePreference === 'light' || localThemePreference === 'dark'",
    "      ? localThemePreference",
    "      : globalMode;",
    "  var initialAccent =",
    "    (existingSettings && existingSettings.theme && existingSettings.theme.accent) || DEFAULT_THEME_COLOR;",
    "  applyThemeMode(initialMode);",
    "  applyThemeColor(initialAccent);",
    "  applyThemeAccentVariables(initialAccent);",
    "  var initialThemeState = writeThemeSyncState({",
    "    preference: localThemePreference,",
    "    effectiveMode: initialMode,",
    "    globalMode: globalMode,",
    "    accent: initialAccent,",
    "  });",
    "  dispatchThemeSync(initialThemeState);",
    "  armSeoSnapshotCleanup();",
    "  if (existingSettings) {",
    "    applyBootstrapSettings(existingSettings);",
    "  }",
    "  if (existingBootstrap) {",
    "    window.__BOOTSTRAP_PUBLIC_PROMISE__ =",
    "      window.__BOOTSTRAP_PUBLIC_PROMISE__ || Promise.resolve(existingBootstrap);",
    "    return;",
    "  }",
    "  var existingPromise = window.__BOOTSTRAP_PUBLIC_PROMISE__;",
    "  if (existingPromise && typeof existingPromise.then === 'function') {",
    "    window.__BOOTSTRAP_PUBLIC_PROMISE__ = existingPromise",
    "      .then(hydrateBootstrap)",
    "      .catch(function () {",
    "        return null;",
    "      });",
    "    return;",
    "  }",
    "  if (shouldSkipPublicFetch) {",
    "    return;",
    "  }",
    "  window.__BOOTSTRAP_PUBLIC_PROMISE__ = fetch('/api/public/bootstrap', {",
    "    credentials: 'same-origin',",
    "    cache: 'no-store',",
    "  })",
    "    .then(function (response) {",
    "      return response.ok ? response.json() : null;",
    "    })",
    "    .then(hydrateBootstrap)",
    "    .catch(function () {",
    "      return null;",
    "    });",
    "})();",
  ].join("\n");

export const injectBootstrapGlobals = ({
  html,
  publicBootstrap,
  publicRoutePayload = null,
  settings,
  publicMe = null,
  pwaEnabled = false,
  skipPublicFetch = false,
}) => {
  const bootstrapScript = [
    '<script type="application/json" id="nekomata-bootstrap-public">',
    serializeInlineJson(publicBootstrap),
    "</script>",
    '<script type="application/json" id="nekomata-bootstrap-route">',
    serializeInlineJson(publicRoutePayload),
    "</script>",
    '<script type="application/json" id="nekomata-bootstrap-settings">',
    serializeInlineJson(settings),
    "</script>",
    '<script type="application/json" id="nekomata-bootstrap-public-me">',
    serializeInlineJson(publicMe),
    "</script>",
    '<script type="application/json" id="nekomata-bootstrap-pwa-enabled">',
    pwaEnabled ? "true" : "false",
    "</script>",
    '<script type="application/json" id="nekomata-bootstrap-skip-public-fetch">',
    skipPublicFetch ? "true" : "false",
    "</script>",
    "<script>",
    buildInlineBootstrapInitScript(),
    "</script>",
  ].join("\n");
  return injectSnippet(String(html || ""), "<!-- APP_BOOTSTRAP -->", bootstrapScript);
};

export const injectPreloadLinks = ({ html, preloads = [] }) => {
  const uniquePreloads = [];
  const seen = new Set();
  preloads
    .filter((entry) => entry && entry.href)
    .forEach((entry) => {
      const href = String(entry.href || "").trim();
      const rel = String(entry.rel || "preload").trim() || "preload";
      const as = String(entry.as || "fetch").trim() || "fetch";
      const media = String(entry.media || "").trim();
      const key = `${rel}::${as}::${href}::${media}`;
      if (!href || seen.has(key)) {
        return;
      }
      seen.add(key);
      uniquePreloads.push({
        ...entry,
        rel,
        href,
        as,
      });
    });

  const tags = uniquePreloads.map((entry) => {
    const rel = String(entry.rel || "preload").trim() || "preload";
    const parts = [
      "  <link",
      `rel="${escapeHtmlAttribute(rel)}"`,
      `href="${escapeHtmlAttribute(entry.href)}"`,
    ];
    if (rel === "preload") {
      parts.push(`as="${escapeHtmlAttribute(entry.as || "fetch")}"`);
    }
    if (entry.crossorigin) {
      parts.push(`crossorigin="${escapeHtmlAttribute(entry.crossorigin)}"`);
    }
    if (entry.type) {
      parts.push(`type="${escapeHtmlAttribute(entry.type)}"`);
    }
    if (entry.imagesrcset) {
      parts.push(`imagesrcset="${escapeHtmlAttribute(entry.imagesrcset)}"`);
    }
    if (entry.imagesizes) {
      parts.push(`imagesizes="${escapeHtmlAttribute(entry.imagesizes)}"`);
    }
    if (entry.fetchpriority) {
      parts.push(`fetchpriority="${escapeHtmlAttribute(entry.fetchpriority)}"`);
    }
    if (entry.media) {
      parts.push(`media="${escapeHtmlAttribute(entry.media)}"`);
    }
    return `${parts.join(" ")} />`;
  });
  if (tags.length === 0) {
    return String(html || "");
  }
  return injectSnippet(String(html || ""), "<!-- APP_PRELOADS -->", tags.join("\n"));
};

export const injectHomeHeroShell = ({ html, shellMarkup = "", criticalCss = "" }) => {
  const snippet = String(shellMarkup || "").trim();
  const css = String(criticalCss || "").trim();
  let nextHtml = String(html || "");

  if (css) {
    nextHtml = injectSnippet(
      nextHtml,
      "<!-- APP_HOME_HERO_CRITICAL -->",
      `<style data-home-hero-shell-critical>\n${css}\n</style>`,
      "</head>",
    );
  }

  if (!snippet) {
    return nextHtml;
  }

  return injectSnippet(nextHtml, "<!-- APP_HOME_HERO_SHELL -->", snippet, '<div id="root"></div>');
};
