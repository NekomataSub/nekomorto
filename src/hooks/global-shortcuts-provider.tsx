import { GlobalShortcutsContext } from "@/hooks/global-shortcuts-context";
import { isEditableShortcutTarget, isSearchShortcutBlockedTarget } from "@/lib/keyboard-shortcuts";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

const DASHBOARD_CHORD_TIMEOUT_MS = 800;

type GlobalShortcutsProviderProps = {
  children: ReactNode;
  navigateToHref?: (href: string) => void;
};

const navigateWithDocument = (href: string) => {
  if (typeof window === "undefined") {
    return;
  }
  window.location.assign(href);
};

export const GlobalShortcutsProvider = ({
  children,
  navigateToHref = navigateWithDocument,
}: GlobalShortcutsProviderProps) => {
  const navigateToHrefRef = useRef(navigateToHref);
  const openSearchActionRef = useRef<(() => void) | null>(null);
  const dashboardHrefResolverRef = useRef<(() => string) | null>(null);
  const isDashboardChordArmedRef = useRef(false);
  const dashboardChordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    navigateToHrefRef.current = navigateToHref;
  }, [navigateToHref]);

  const clearDashboardChord = useCallback(() => {
    isDashboardChordArmedRef.current = false;
    if (dashboardChordTimerRef.current !== null) {
      window.clearTimeout(dashboardChordTimerRef.current);
      dashboardChordTimerRef.current = null;
    }
  }, []);

  const armDashboardChord = useCallback(() => {
    clearDashboardChord();
    isDashboardChordArmedRef.current = true;
    dashboardChordTimerRef.current = window.setTimeout(() => {
      clearDashboardChord();
    }, DASHBOARD_CHORD_TIMEOUT_MS);
  }, [clearDashboardChord]);

  const setOpenSearchAction = useCallback((action: (() => void) | null) => {
    openSearchActionRef.current = action;
  }, []);

  const setDashboardHrefResolver = useCallback((resolver: (() => string) | null) => {
    dashboardHrefResolverRef.current = resolver;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      const key = String(event.key || "").toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey;

      if (!hasModifier && key === "/") {
        if (!openSearchActionRef.current || isSearchShortcutBlockedTarget(event.target)) {
          return;
        }
        event.preventDefault();
        clearDashboardChord();
        openSearchActionRef.current();
        return;
      }

      if (isEditableShortcutTarget(event.target)) {
        if (isDashboardChordArmedRef.current && key !== "g") {
          clearDashboardChord();
        }
        return;
      }

      if (hasModifier || event.shiftKey) {
        if (isDashboardChordArmedRef.current && key !== "g") {
          clearDashboardChord();
        }
        return;
      }

      if (key === "g") {
        armDashboardChord();
        return;
      }

      if (key === "d" && isDashboardChordArmedRef.current) {
        event.preventDefault();
        const href = dashboardHrefResolverRef.current?.() || "/dashboard";
        clearDashboardChord();
        navigateToHrefRef.current(href);
        return;
      }

      if (isDashboardChordArmedRef.current) {
        clearDashboardChord();
      }
    };

    const handleWindowBlur = () => {
      clearDashboardChord();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
      clearDashboardChord();
    };
  }, [armDashboardChord, clearDashboardChord]);

  const value = useMemo(
    () => ({
      setDashboardHrefResolver,
      setOpenSearchAction,
    }),
    [setDashboardHrefResolver, setOpenSearchAction],
  );

  return (
    <GlobalShortcutsContext.Provider value={value}>{children}</GlobalShortcutsContext.Provider>
  );
};

export const RoutedGlobalShortcutsProvider = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const navigateToHref = useCallback(
    (href: string) => {
      navigate(href);
    },
    [navigate],
  );

  return (
    <GlobalShortcutsProvider navigateToHref={navigateToHref}>{children}</GlobalShortcutsProvider>
  );
};

export default GlobalShortcutsProvider;
