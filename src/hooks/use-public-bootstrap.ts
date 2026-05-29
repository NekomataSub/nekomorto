import {
  useHasPublicBootstrapProvider,
  useResolvedPublicBootstrap,
} from "@/hooks/public-bootstrap-provider";
import {
  buildPublicBootstrapSnapshot,
  getPublicBootstrapLastFetchedAt,
  isCriticalHomePayload,
  isPartialPublicBootstrapPayload,
  isShellPublicBootstrapPayload,
  primePublicBootstrapCache,
  refetchPublicBootstrapCache,
  refreshPublicBootstrapCacheIfStale,
  requestPublicBootstrap,
  resetPublicBootstrapCache,
  shouldFetchPublicBootstrap,
  subscribePublicBootstrapSnapshot,
  syncPublicBootstrapCacheFromWindow,
  type PublicBootstrapSnapshot,
} from "@/hooks/public-bootstrap-store";
import { getApiBase } from "@/lib/api-base";
import type { PublicBootstrapPayload } from "@/types/public-bootstrap";
import { useCallback, useEffect, useState } from "react";

export {
  getPublicBootstrapLastFetchedAt,
  isCriticalHomePayload,
  isPartialPublicBootstrapPayload,
  isShellPublicBootstrapPayload,
  primePublicBootstrapCache,
  refetchPublicBootstrapCache,
  refreshPublicBootstrapCacheIfStale,
  resetPublicBootstrapCache,
};

const buildProviderAwareSnapshot = (
  providerBootstrap: PublicBootstrapPayload | null,
): PublicBootstrapSnapshot => buildPublicBootstrapSnapshot(providerBootstrap);

export const usePublicBootstrap = () => {
  const apiBase = getApiBase();
  const hasPublicBootstrapProvider = useHasPublicBootstrapProvider();
  const resolvedPublicBootstrap = useResolvedPublicBootstrap();
  const providerBootstrap = hasPublicBootstrapProvider ? resolvedPublicBootstrap : null;
  const [snapshot, setSnapshot] = useState<PublicBootstrapSnapshot>(() => {
    if (!providerBootstrap) {
      syncPublicBootstrapCacheFromWindow({ emit: false });
    }
    return buildProviderAwareSnapshot(providerBootstrap);
  });

  useEffect(
    () =>
      subscribePublicBootstrapSnapshot(() =>
        setSnapshot(buildProviderAwareSnapshot(providerBootstrap)),
      ),
    [providerBootstrap],
  );

  useEffect(() => {
    setSnapshot(buildProviderAwareSnapshot(providerBootstrap));
    if (providerBootstrap) {
      primePublicBootstrapCache(providerBootstrap);
      return;
    }
    syncPublicBootstrapCacheFromWindow();
  }, [providerBootstrap]);

  useEffect(() => {
    if (!shouldFetchPublicBootstrap()) {
      return;
    }
    void requestPublicBootstrap(apiBase).catch(() => undefined);
  }, [apiBase, providerBootstrap]);

  const refetch = useCallback(() => requestPublicBootstrap(apiBase, { force: true }), [apiBase]);

  return {
    ...snapshot,
    refetch,
  };
};
