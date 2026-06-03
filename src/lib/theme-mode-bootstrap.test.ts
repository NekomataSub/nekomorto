import {
  buildThemeModeBootstrapScript,
  getThemeModeDocumentAttributes,
} from "@/lib/theme-mode-bootstrap";
import { describe, expect, it, beforeEach } from "vitest";

const THEME_MODE_STORAGE_KEY = "nekomata:theme-mode-preference";
const THEME_MODE_GLOBAL_STATE_KEY = "__NEKOMATA_THEME_MODE_STATE__";

const runScript = (script: string) => {
  const scriptRunner = new Function(script);
  scriptRunner();
};

const assertDocumentMode = (documentNode: Document, mode: "light" | "dark") => {
  expect(documentNode.documentElement.dataset.themeMode).toBe(mode);
  expect(documentNode.documentElement.style.colorScheme).toBe(mode);
  expect(documentNode.documentElement.classList.contains("dark")).toBe(mode === "dark");
};

const applyDocumentAttributes = (
  documentNode: Document,
  settings: Parameters<typeof getThemeModeDocumentAttributes>[0],
) => {
  const attributes = getThemeModeDocumentAttributes(settings);
  documentNode.documentElement.dataset.globalThemeMode = attributes.mode;
  documentNode.documentElement.dataset.themeAccent = attributes.accent;
  documentNode.documentElement.dataset.themeMode = attributes.mode;
  documentNode.documentElement.style.colorScheme = attributes.mode;
  documentNode.documentElement.classList.toggle("dark", attributes.mode === "dark");
};

describe("theme mode bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete (
      window as Window &
        typeof globalThis & {
          [THEME_MODE_GLOBAL_STATE_KEY]?: unknown;
          __NEKOMATA_ASTRO_THEME_MODE_BOOTSTRAP__?: unknown;
        }
    )[THEME_MODE_GLOBAL_STATE_KEY];
    delete (
      window as Window &
        typeof globalThis & {
          [THEME_MODE_GLOBAL_STATE_KEY]?: unknown;
          __NEKOMATA_ASTRO_THEME_MODE_BOOTSTRAP__?: unknown;
        }
    ).__NEKOMATA_ASTRO_THEME_MODE_BOOTSTRAP__;
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-global-theme-mode");
    document.documentElement.removeAttribute("data-theme-accent");
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = '<meta name="theme-color" content="">';
  });

  it("returns document attributes for the global mode", () => {
    expect(getThemeModeDocumentAttributes({ theme: { accent: "#9667e0", mode: "light" } })).toEqual(
      {
        accent: "#9667e0",
        className: undefined,
        mode: "light",
        style: "color-scheme: light",
      },
    );
    expect(getThemeModeDocumentAttributes({ theme: { accent: "#9667e0", mode: "dark" } })).toEqual({
      accent: "#9667e0",
      className: "dark",
      mode: "dark",
      style: "color-scheme: dark",
    });
  });

  it("applies the global light mode before islands hydrate", () => {
    applyDocumentAttributes(document, { theme: { accent: "#34A853", mode: "light" } });

    runScript(buildThemeModeBootstrapScript({ theme: { accent: "#34A853", mode: "light" } }));

    assertDocumentMode(document, "light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#34A853",
    );
  });

  it("keeps a local dark override above a global light mode", () => {
    applyDocumentAttributes(document, { theme: { accent: "#9667e0", mode: "light" } });
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "dark");

    runScript(buildThemeModeBootstrapScript({ theme: { accent: "#9667e0", mode: "light" } }));

    assertDocumentMode(document, "dark");
    expect(
      (
        window as Window &
          typeof globalThis & {
            [THEME_MODE_GLOBAL_STATE_KEY]?: { preference?: unknown };
          }
      )[THEME_MODE_GLOBAL_STATE_KEY]?.preference,
    ).toBe("dark");
  });

  it("applies the current mode to the next Astro document before swap", () => {
    applyDocumentAttributes(document, { theme: { accent: "#9667e0", mode: "dark" } });
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, "light");
    runScript(buildThemeModeBootstrapScript({ theme: { accent: "#9667e0", mode: "dark" } }));
    const nextDocument = document.implementation.createHTMLDocument("Next page");
    nextDocument.head.innerHTML = '<meta name="theme-color" content="">';
    applyDocumentAttributes(nextDocument, { theme: { accent: "#9667e0", mode: "dark" } });
    const event = new CustomEvent("astro:before-swap");
    Object.defineProperty(event, "newDocument", {
      value: nextDocument,
    });

    document.dispatchEvent(event);

    assertDocumentMode(nextDocument, "light");
    expect(nextDocument.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      "#9667e0",
    );
  });
});
