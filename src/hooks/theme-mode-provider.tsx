import {
  THEME_MODE_GLOBAL_STATE_KEY,
  THEME_MODE_PRESERVE_MOTION_ATTRIBUTE,
  THEME_MODE_STORAGE_KEY,
  THEME_MODE_SYNC_EVENT,
  type ThemeMode,
  ThemeModeContext,
  type ThemeModeContextValue,
  type ThemeModePreference,
} from "@/hooks/theme-mode-context";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveThemeColor } from "@/lib/theme-color";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const normalizeMode = (value: unknown): ThemeMode => (value === "light" ? "light" : "dark");
const normalizePreference = (value: unknown): ThemeModePreference => {
  if (value === "light" || value === "dark" || value === "global") {
    return value;
  }
  return "global";
};

type ThemeModeSyncState = {
  accent: string;
  effectiveMode: ThemeMode;
  globalMode: ThemeMode;
  preference: ThemeModePreference;
};

const isThemeModeSyncState = (value: unknown): value is Partial<ThemeModeSyncState> =>
  Boolean(value) && typeof value === "object";

const readWindowThemeSyncState = (): ThemeModeSyncState | null => {
  if (typeof window === "undefined") {
    return null;
  }
  const candidate = (
    window as Window &
      typeof globalThis & {
        [THEME_MODE_GLOBAL_STATE_KEY]?: unknown;
      }
  )[THEME_MODE_GLOBAL_STATE_KEY];
  if (!isThemeModeSyncState(candidate)) {
    return null;
  }
  return {
    accent: resolveThemeColor(candidate.accent),
    effectiveMode: normalizeMode(candidate.effectiveMode),
    globalMode: normalizeMode(candidate.globalMode),
    preference: normalizePreference(candidate.preference),
  };
};

const writeWindowThemeSyncState = (state: ThemeModeSyncState) => {
  if (typeof window === "undefined") {
    return state;
  }
  (
    window as Window &
      typeof globalThis & {
        [THEME_MODE_GLOBAL_STATE_KEY]?: ThemeModeSyncState;
      }
  )[THEME_MODE_GLOBAL_STATE_KEY] = state;
  return state;
};

const dispatchThemeSyncEvent = (state: ThemeModeSyncState) => {
  if (typeof window === "undefined") {
    return;
  }
  writeWindowThemeSyncState(state);
  window.dispatchEvent(
    new CustomEvent<ThemeModeSyncState>(THEME_MODE_SYNC_EVENT, {
      detail: state,
    }),
  );
};

const readStoredPreference = (): ThemeModePreference => {
  if (typeof window === "undefined") {
    return "global";
  }
  const syncedPreference = readWindowThemeSyncState()?.preference;
  if (syncedPreference) {
    return syncedPreference;
  }
  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return normalizePreference(raw);
  } catch {
    return "global";
  }
};

const THEME_MODE_TRANSITION_STYLE_ATTRIBUTE = "data-theme-mode-disable-transitions";
const THEME_MODE_TRANSITION_DISABLE_SELECTOR = [
  `*:not([${THEME_MODE_PRESERVE_MOTION_ATTRIBUTE}="true"], [${THEME_MODE_PRESERVE_MOTION_ATTRIBUTE}="true"] *)`,
  `*:not([${THEME_MODE_PRESERVE_MOTION_ATTRIBUTE}="true"], [${THEME_MODE_PRESERVE_MOTION_ATTRIBUTE}="true"] *)::before`,
  `*:not([${THEME_MODE_PRESERVE_MOTION_ATTRIBUTE}="true"], [${THEME_MODE_PRESERVE_MOTION_ATTRIBUTE}="true"] *)::after`,
].join(",");
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const applyThemeToDocument = (mode: ThemeMode, accentHex: unknown) => {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  root.style.colorScheme = mode;
  if (mode === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", resolveThemeColor(accentHex));
  }
};

const buildThemeDocumentSignature = (mode: ThemeMode, accentHex: unknown) =>
  `${mode}::${resolveThemeColor(accentHex)}`;

const disableThemeTransitionsTemporarily = () => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return () => undefined;
  }

  document.head
    .querySelectorAll(`style[${THEME_MODE_TRANSITION_STYLE_ATTRIBUTE}]`)
    .forEach((node) => node.remove());

  const style = document.createElement("style");
  style.setAttribute(THEME_MODE_TRANSITION_STYLE_ATTRIBUTE, "true");
  style.appendChild(
    document.createTextNode(
      `${THEME_MODE_TRANSITION_DISABLE_SELECTOR}{-webkit-transition:none !important;transition:none !important;}`,
    ),
  );
  document.head.appendChild(style);

  let firstFrame = 0;
  let secondFrame = 0;
  let isRemoved = false;

  const removeStyle = () => {
    if (isRemoved) {
      return;
    }
    isRemoved = true;
    if (firstFrame) {
      window.cancelAnimationFrame(firstFrame);
    }
    if (secondFrame) {
      window.cancelAnimationFrame(secondFrame);
    }
    style.remove();
  };

  firstFrame = window.requestAnimationFrame(() => {
    void window.getComputedStyle(document.body).opacity;
    secondFrame = window.requestAnimationFrame(() => {
      removeStyle();
    });
  });

  return removeStyle;
};

export const ThemeModeProvider = ({ children }: { children: ReactNode }) => {
  const { settings } = useSiteSettings();
  const [preference, setPreferenceState] = useState<ThemeModePreference>("global");
  const [hasSyncedStoredPreference, setHasSyncedStoredPreference] = useState(false);
  const previousModeRef = useRef<ThemeMode | null>(null);
  const previousDocumentThemeRef = useRef("");
  const transitionCleanupRef = useRef<(() => void) | null>(null);

  const globalMode = normalizeMode(settings.theme?.mode);
  const effectiveMode = preference === "global" ? globalMode : preference;
  const isOverridden = preference !== "global";
  const themeAccent = settings.theme?.accent;

  const setPreference = useCallback((next: ThemeModePreference) => {
    setPreferenceState(normalizePreference(next));
  }, []);

  useIsomorphicLayoutEffect(() => {
    const storedPreference = readStoredPreference();
    setPreferenceState((current) => (current === storedPreference ? current : storedPreference));
    setHasSyncedStoredPreference(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasSyncedStoredPreference) {
      return;
    }
    try {
      if (preference === "global") {
        window.localStorage.removeItem(THEME_MODE_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, preference);
    } catch {
      // ignore localStorage failures
    }
  }, [hasSyncedStoredPreference, preference]);

  useIsomorphicLayoutEffect(() => {
    if (typeof window !== "undefined" && !hasSyncedStoredPreference) {
      return;
    }
    const isFirstModeApplication = previousModeRef.current === null;
    const modeChanged = previousModeRef.current !== effectiveMode;
    previousModeRef.current = effectiveMode;

    if (!isFirstModeApplication && modeChanged) {
      transitionCleanupRef.current?.();
      transitionCleanupRef.current = disableThemeTransitionsTemporarily();
    } else if (!modeChanged) {
      transitionCleanupRef.current?.();
      transitionCleanupRef.current = null;
    }

    const nextDocumentThemeSignature = buildThemeDocumentSignature(effectiveMode, themeAccent);
    if (previousDocumentThemeRef.current === nextDocumentThemeSignature) {
      return;
    }
    previousDocumentThemeRef.current = nextDocumentThemeSignature;
    applyThemeToDocument(effectiveMode, themeAccent);
  }, [effectiveMode, hasSyncedStoredPreference, themeAccent]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasSyncedStoredPreference) {
      return;
    }
    const nextState = {
      accent: resolveThemeColor(themeAccent),
      effectiveMode,
      globalMode,
      preference,
    } satisfies ThemeModeSyncState;
    const currentState = readWindowThemeSyncState();
    if (
      currentState &&
      currentState.preference === nextState.preference &&
      currentState.effectiveMode === nextState.effectiveMode &&
      currentState.globalMode === nextState.globalMode &&
      currentState.accent === nextState.accent
    ) {
      return;
    }
    dispatchThemeSyncEvent(nextState);
  }, [effectiveMode, globalMode, hasSyncedStoredPreference, preference, themeAccent]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleThemeSync = (event: Event) => {
      const detail =
        event instanceof CustomEvent && isThemeModeSyncState(event.detail) ? event.detail : null;
      const nextPreference = detail
        ? normalizePreference(detail.preference)
        : (readWindowThemeSyncState()?.preference ?? "global");
      setPreferenceState((current) => (current === nextPreference ? current : nextPreference));
    };
    window.addEventListener(THEME_MODE_SYNC_EVENT, handleThemeSync);
    return () => {
      window.removeEventListener(THEME_MODE_SYNC_EVENT, handleThemeSync);
    };
  }, []);

  useEffect(
    () => () => {
      transitionCleanupRef.current?.();
      transitionCleanupRef.current = null;
    },
    [],
  );

  const value = useMemo<ThemeModeContextValue>(
    () => ({
      globalMode,
      effectiveMode,
      preference,
      isOverridden,
      setPreference,
    }),
    [effectiveMode, globalMode, isOverridden, preference, setPreference],
  );

  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
};
