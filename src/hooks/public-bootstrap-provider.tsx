import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  asPublicBootstrapCurrentUser,
  asPublicBootstrapPayload,
  asPublicRoutePayload,
  readWindowPublicBootstrap,
  readWindowPublicBootstrapCurrentUser,
  readWindowPublicRoutePayload,
  type PublicBootstrapCurrentUser,
} from "@/lib/public-bootstrap-global";
import { primePublicBootstrapCache } from "@/hooks/use-public-bootstrap";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";

type PublicBootstrapContextValue = {
  currentUser: PublicBootstrapCurrentUser | null;
  publicBootstrap: PublicBootstrapPayload | null;
  publicRoutePayload: PublicRoutePayload | null;
  publishCurrentUser: (value: unknown) => void;
  publishPublicBootstrap: (value: unknown) => void;
  publishPublicRoutePayload: (value: unknown) => void;
};

const PublicBootstrapContext = createContext<PublicBootstrapContextValue | null>(null);

const normalizeInitialBootstrap = (value: unknown) =>
  asPublicBootstrapPayload(value) || readWindowPublicBootstrap();

const normalizeInitialRoutePayload = (value: unknown) =>
  asPublicRoutePayload(value) || readWindowPublicRoutePayload();

const normalizeInitialCurrentUser = (value: unknown) =>
  asPublicBootstrapCurrentUser(value) || readWindowPublicBootstrapCurrentUser();

const buildInitialContextValue = ({
  initialCurrentUser,
  initialPublicBootstrap,
  initialPublicRoutePayload,
}: {
  initialCurrentUser?: unknown;
  initialPublicBootstrap?: unknown;
  initialPublicRoutePayload?: unknown;
}) => ({
  currentUser: normalizeInitialCurrentUser(initialCurrentUser),
  publicBootstrap: normalizeInitialBootstrap(initialPublicBootstrap),
  publicRoutePayload: normalizeInitialRoutePayload(initialPublicRoutePayload),
});

export const PublicBootstrapProvider = ({
  children,
  initialCurrentUser,
  initialPublicBootstrap,
  initialPublicRoutePayload,
}: {
  children: ReactNode;
  initialCurrentUser?: unknown;
  initialPublicBootstrap?: unknown;
  initialPublicRoutePayload?: unknown;
}) => {
  const [state, setState] = useState(() =>
    buildInitialContextValue({
      initialCurrentUser,
      initialPublicBootstrap,
      initialPublicRoutePayload,
    }),
  );

  useEffect(() => {
    const initialBootstrap = normalizeInitialBootstrap(initialPublicBootstrap);
    if (initialBootstrap) {
      primePublicBootstrapCache(initialBootstrap);
    }
    setState((current) => ({
      currentUser: normalizeInitialCurrentUser(initialCurrentUser) || current.currentUser,
      publicBootstrap: initialBootstrap || current.publicBootstrap,
      publicRoutePayload:
        normalizeInitialRoutePayload(initialPublicRoutePayload) || current.publicRoutePayload,
    }));
  }, [initialCurrentUser, initialPublicBootstrap, initialPublicRoutePayload]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const syncFromWindow = () => {
      const windowBootstrap = readWindowPublicBootstrap();
      const windowRoutePayload = readWindowPublicRoutePayload();
      const windowCurrentUser = readWindowPublicBootstrapCurrentUser();
      setState((current) => ({
        currentUser: windowCurrentUser || current.currentUser,
        publicBootstrap: windowBootstrap || current.publicBootstrap,
        publicRoutePayload: windowRoutePayload || current.publicRoutePayload,
      }));
    };

    window.addEventListener("pageshow", syncFromWindow);
    window.addEventListener("popstate", syncFromWindow);
    return () => {
      window.removeEventListener("pageshow", syncFromWindow);
      window.removeEventListener("popstate", syncFromWindow);
    };
  }, []);

  const publishCurrentUser = useCallback((value: unknown) => {
    const nextValue = asPublicBootstrapCurrentUser(value);
    if (!nextValue) {
      return;
    }
    setState((current) => ({ ...current, currentUser: nextValue }));
  }, []);

  const publishPublicBootstrap = useCallback((value: unknown) => {
    const nextValue = asPublicBootstrapPayload(value);
    if (!nextValue) {
      return;
    }
    primePublicBootstrapCache(nextValue);
    setState((current) => ({ ...current, publicBootstrap: nextValue }));
  }, []);

  const publishPublicRoutePayload = useCallback((value: unknown) => {
    const nextValue = asPublicRoutePayload(value);
    if (!nextValue) {
      return;
    }
    setState((current) => ({ ...current, publicRoutePayload: nextValue }));
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      publishCurrentUser,
      publishPublicBootstrap,
      publishPublicRoutePayload,
    }),
    [publishCurrentUser, publishPublicBootstrap, publishPublicRoutePayload, state],
  );

  return (
    <PublicBootstrapContext.Provider value={value}>{children}</PublicBootstrapContext.Provider>
  );
};

export const useResolvedPublicBootstrap = () => {
  const context = useContext(PublicBootstrapContext);
  return context?.publicBootstrap || readWindowPublicBootstrap();
};

export const useResolvedPublicRoutePayload = () => {
  const context = useContext(PublicBootstrapContext);
  return context?.publicRoutePayload || readWindowPublicRoutePayload();
};

export const useResolvedPublicBootstrapCurrentUser = () => {
  const context = useContext(PublicBootstrapContext);
  return context?.currentUser || readWindowPublicBootstrapCurrentUser();
};

export const usePublishResolvedPublicSnapshots = () => {
  const context = useContext(PublicBootstrapContext);

  return useMemo(
    () => ({
      publishCurrentUser: context?.publishCurrentUser || (() => undefined),
      publishPublicBootstrap: context?.publishPublicBootstrap || (() => undefined),
      publishPublicRoutePayload: context?.publishPublicRoutePayload || (() => undefined),
    }),
    [context],
  );
};
