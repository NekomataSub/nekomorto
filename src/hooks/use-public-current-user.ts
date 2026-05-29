import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { scheduleOnBrowserLoadIdle } from "@/lib/browser-idle";
import {
  useHasPublicBootstrapProvider,
  useResolvedPublicBootstrapCurrentUser,
} from "@/hooks/public-bootstrap-provider";
import {
  asPublicBootstrapCurrentUser,
  type PublicBootstrapCurrentUser,
  readWindowPublicBootstrapCurrentUser,
} from "@/lib/public-bootstrap-global";
import { useCallback, useEffect, useState } from "react";

type PublicCurrentUserStatus = "idle" | "loading" | "success" | "error";

type PublicCurrentUserSnapshot = {
  currentUser: PublicBootstrapCurrentUser | null;
  error: Error | null;
  hasResolved: boolean;
  isRefreshing: boolean;
  status: PublicCurrentUserStatus;
};

type PublicCurrentUserCache = {
  currentUser: PublicBootstrapCurrentUser | null;
  error: Error | null;
  hasFetched: boolean;
  inFlightPromise: Promise<PublicBootstrapCurrentUser | null> | null;
  status: PublicCurrentUserStatus;
  lastFetchedAt: number;
};

const listeners = new Set<() => void>();

const PUBLIC_CURRENT_USER_STALE_TIME_MS = 60_000;

const createPublicCurrentUserCache = (
  bootstrapUser: PublicBootstrapCurrentUser | null = null,
): PublicCurrentUserCache => {
  return {
    currentUser: bootstrapUser,
    error: null,
    hasFetched: false,
    inFlightPromise: null,
    status: bootstrapUser ? "success" : "idle",
    lastFetchedAt: bootstrapUser ? Date.now() : 0,
  };
};

let publicCurrentUserCache = createPublicCurrentUserCache();

const toError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value || "public_current_user_error"));

const emitSnapshot = () => {
  listeners.forEach((listener) => {
    listener();
  });
};

const primePublicCurrentUserCache = (value: PublicBootstrapCurrentUser | null) => {
  if (!value) {
    return false;
  }
  publicCurrentUserCache.currentUser = value;
  publicCurrentUserCache.error = null;
  publicCurrentUserCache.status = "success";
  publicCurrentUserCache.lastFetchedAt = Date.now();
  return true;
};

const resetPublicCurrentUserCache = () => {
  const inFlightPromise = publicCurrentUserCache.inFlightPromise;
  publicCurrentUserCache = createPublicCurrentUserCache();
  publicCurrentUserCache.inFlightPromise = inFlightPromise;
  if (inFlightPromise) {
    publicCurrentUserCache.status = "loading";
  }
};

const syncCacheFromBootstrapWhenIdle = () => {
  if (listeners.size > 0 || publicCurrentUserCache.inFlightPromise) {
    return;
  }
  publicCurrentUserCache = createPublicCurrentUserCache(readWindowPublicBootstrapCurrentUser());
};

const buildSnapshot = (
  bootstrapUser: PublicBootstrapCurrentUser | null = null,
  options: { allowCache?: boolean } = {},
): PublicCurrentUserSnapshot => {
  const currentUser =
    bootstrapUser || (options.allowCache === false ? null : publicCurrentUserCache.currentUser);
  return {
    currentUser,
    error: publicCurrentUserCache.error,
    hasResolved: Boolean(currentUser) || publicCurrentUserCache.hasFetched,
    isRefreshing: publicCurrentUserCache.status === "loading",
    status:
      currentUser && publicCurrentUserCache.status === "idle"
        ? "success"
        : publicCurrentUserCache.status,
  };
};

const subscribeSnapshot = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const fetchPublicCurrentUser = async (apiBase: string) => {
  const response = await apiFetch(apiBase, "/api/public/me", {
    auth: true,
    cache: "no-store",
  });
  if (!response.ok) {
    return null;
  }
  const payload = await response.json();
  return asPublicBootstrapCurrentUser(payload?.user ?? payload);
};

const shouldFetchPublicCurrentUser = (force = false) => {
  if (force) {
    return true;
  }
  if (publicCurrentUserCache.inFlightPromise) {
    return false;
  }
  if (!publicCurrentUserCache.hasFetched) {
    return true;
  }
  return Date.now() - publicCurrentUserCache.lastFetchedAt > PUBLIC_CURRENT_USER_STALE_TIME_MS;
};

const requestPublicCurrentUser = async (apiBase: string, options: { force?: boolean } = {}) => {
  const force = options.force === true;
  if (publicCurrentUserCache.inFlightPromise) {
    return publicCurrentUserCache.inFlightPromise;
  }
  if (!shouldFetchPublicCurrentUser(force)) {
    return publicCurrentUserCache.currentUser;
  }

  publicCurrentUserCache.status = "loading";
  publicCurrentUserCache.error = null;
  emitSnapshot();

  const requestPromise = fetchPublicCurrentUser(apiBase)
    .then((currentUser) => {
      publicCurrentUserCache.currentUser = currentUser;
      publicCurrentUserCache.error = null;
      publicCurrentUserCache.status = "success";
      publicCurrentUserCache.hasFetched = true;
      publicCurrentUserCache.lastFetchedAt = Date.now();
      emitSnapshot();
      return currentUser;
    })
    .catch((error) => {
      publicCurrentUserCache.error = toError(error);
      publicCurrentUserCache.status = "error";
      publicCurrentUserCache.hasFetched = true;
      emitSnapshot();
      return publicCurrentUserCache.currentUser;
    })
    .finally(() => {
      publicCurrentUserCache.inFlightPromise = null;
    });

  publicCurrentUserCache.inFlightPromise = requestPromise;
  return requestPromise;
};

export const usePublicCurrentUser = () => {
  const apiBase = getApiBase();
  const hasBootstrapProvider = useHasPublicBootstrapProvider();
  const bootstrapCurrentUser = useResolvedPublicBootstrapCurrentUser();
  const [snapshot, setSnapshot] = useState<PublicCurrentUserSnapshot>(() =>
    buildSnapshot(bootstrapCurrentUser, {
      allowCache: Boolean(bootstrapCurrentUser),
    }),
  );

  useEffect(
    () =>
      subscribeSnapshot(() =>
        setSnapshot(
          buildSnapshot(bootstrapCurrentUser, {
            allowCache: true,
          }),
        ),
      ),
    [bootstrapCurrentUser],
  );

  useEffect(() => {
    const didPrimeFromProvider = primePublicCurrentUserCache(bootstrapCurrentUser);
    if (!didPrimeFromProvider && hasBootstrapProvider) {
      resetPublicCurrentUserCache();
      setSnapshot(buildSnapshot(null, { allowCache: false }));
      return;
    }
    if (!didPrimeFromProvider) {
      const windowBootstrapUser = readWindowPublicBootstrapCurrentUser();
      const didPrimeFromWindow = primePublicCurrentUserCache(windowBootstrapUser);
      if (!didPrimeFromWindow) {
        resetPublicCurrentUserCache();
        syncCacheFromBootstrapWhenIdle();
        setSnapshot(buildSnapshot(null, { allowCache: false }));
        return;
      }
    }
    setSnapshot(buildSnapshot(bootstrapCurrentUser, { allowCache: true }));
  }, [bootstrapCurrentUser, hasBootstrapProvider]);

  useEffect(() => {
    if (!shouldFetchPublicCurrentUser()) {
      return;
    }
    if (!publicCurrentUserCache.currentUser) {
      void requestPublicCurrentUser(apiBase);
      return;
    }
    const cancelIdle = scheduleOnBrowserLoadIdle(
      () => {
        void requestPublicCurrentUser(apiBase);
      },
      { delayMs: 2500 },
    );
    return cancelIdle;
  }, [apiBase]);

  const refresh = useCallback(
    async (options?: { force?: boolean }) =>
      await requestPublicCurrentUser(apiBase, { force: options?.force === true }),
    [apiBase],
  );

  return {
    ...snapshot,
    refresh,
  };
};
