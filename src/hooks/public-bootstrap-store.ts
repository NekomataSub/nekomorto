import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { asPublicBootstrapPayload } from "@/lib/public-bootstrap-global";
import { normalizePublicPagesConfig } from "@/lib/public-pages";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import {
  emptyPublicBootstrapPayload,
  type PublicBootstrapHomeHero,
  type PublicBootstrapHomeHeroSlide,
  type PublicBootstrapPayload,
} from "@/types/public-bootstrap";
import type { PublicTeamLinkType, PublicTeamMember } from "@/types/public-team";

export const PUBLIC_BOOTSTRAP_STALE_TIME_MS = 60_000;

export type PublicBootstrapStatus = "idle" | "loading" | "success" | "error";

export type PublicBootstrapSnapshot = {
  data: PublicBootstrapPayload | undefined;
  error: Error | null;
  isLoading: boolean;
  isFetched: boolean;
  status: PublicBootstrapStatus;
  isHydratingFullPayload: boolean;
  lastFetchedAt: number;
};

type PublicBootstrapWindow = Window &
  typeof globalThis & {
    __BOOTSTRAP_PUBLIC__?: unknown;
  };

const readWindowPublicBootstrapSource = () => {
  if (typeof window === "undefined") {
    return undefined;
  }
  return (window as PublicBootstrapWindow).__BOOTSTRAP_PUBLIC__;
};

const publishWindowPublicBootstrap = (payload: PublicBootstrapPayload) => {
  if (typeof window === "undefined") {
    return;
  }
  (window as PublicBootstrapWindow).__BOOTSTRAP_PUBLIC__ = payload;
};

const initialWindowBootstrapSource = readWindowPublicBootstrapSource();
const initialWindowBootstrap = asPublicBootstrapPayload(initialWindowBootstrapSource);
let syncedWindowBootstrapSource = initialWindowBootstrapSource;

const publicBootstrapCache = {
  data: initialWindowBootstrap,
  error: null as Error | null,
  status: (initialWindowBootstrap ? "success" : "idle") as PublicBootstrapStatus,
  hasFetched: !!initialWindowBootstrap,
  lastFetchedAt: initialWindowBootstrap ? Date.now() : 0,
  inFlightPromise: null as Promise<PublicBootstrapPayload> | null,
};

const listeners = new Set<() => void>();

export const isCriticalHomePayload = (value: PublicBootstrapPayload | null | undefined) =>
  value?.payloadMode === "critical-home";

export const isShellPublicBootstrapPayload = (value: PublicBootstrapPayload | null | undefined) =>
  value?.payloadMode === "shell";

export const isPartialPublicBootstrapPayload = (
  value: PublicBootstrapPayload | null | undefined,
) => isCriticalHomePayload(value) || isShellPublicBootstrapPayload(value);

const toError = (value: unknown) =>
  value instanceof Error ? value : new Error(String(value || "public_bootstrap_error"));

const normalizePublicBootstrapHomeHero = (value: unknown): PublicBootstrapHomeHero | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PublicBootstrapHomeHero>;
  const slides = Array.isArray(candidate.slides)
    ? candidate.slides
        .map((slide) => {
          if (!slide || typeof slide !== "object") {
            return null;
          }
          const safeSlide = slide as Partial<PublicBootstrapHomeHeroSlide>;
          const id = String(safeSlide.id || "").trim();
          const image = String(safeSlide.image || "").trim();
          const projectId = String(safeSlide.projectId || "").trim();
          if (!id || !image || !projectId) {
            return null;
          }
          return {
            id,
            title: String(safeSlide.title || ""),
            description: String(safeSlide.description || ""),
            updatedAt: String(safeSlide.updatedAt || ""),
            image,
            projectId,
            trailerUrl: String(safeSlide.trailerUrl || ""),
            format: String(safeSlide.format || ""),
            status: String(safeSlide.status || ""),
            heroLogoUrl: String(safeSlide.heroLogoUrl || ""),
            heroLogoAlt: String(safeSlide.heroLogoAlt || ""),
          } satisfies PublicBootstrapHomeHeroSlide;
        })
        .filter(Boolean)
    : [];
  if (slides.length === 0) {
    return null;
  }
  const normalizedSlides = slides as PublicBootstrapHomeHeroSlide[];
  const fallbackSlideId = normalizedSlides[0]?.id || "";
  return {
    initialSlideId: String(candidate.initialSlideId || fallbackSlideId).trim() || fallbackSlideId,
    latestSlideId: String(candidate.latestSlideId || fallbackSlideId).trim() || fallbackSlideId,
    hasMultipleSlides:
      candidate.hasMultipleSlides === true || (Array.isArray(slides) && slides.length > 1),
    slides: normalizedSlides,
  };
};

export const emitPublicBootstrapSnapshot = () => {
  listeners.forEach((listener) => {
    listener();
  });
};

export const syncPublicBootstrapCacheFromWindow = (options: { emit?: boolean } = {}) => {
  const source = readWindowPublicBootstrapSource();
  if (source === syncedWindowBootstrapSource && publicBootstrapCache.data) {
    return false;
  }
  const payload = asPublicBootstrapPayload(source);
  if (!payload) {
    return false;
  }

  syncedWindowBootstrapSource = source;
  publicBootstrapCache.data = payload;
  publicBootstrapCache.error = null;
  publicBootstrapCache.status = "success";
  publicBootstrapCache.hasFetched = true;
  publicBootstrapCache.lastFetchedAt = Date.now();
  if (options.emit ?? true) {
    emitPublicBootstrapSnapshot();
  }
  return true;
};

export const buildPublicBootstrapSnapshot = (
  overrideData?: PublicBootstrapPayload | null,
): PublicBootstrapSnapshot => {
  const cachedData = publicBootstrapCache.data;
  const shouldPromoteCachedFullPayload = Boolean(
    isPartialPublicBootstrapPayload(overrideData) &&
      cachedData &&
      !isPartialPublicBootstrapPayload(cachedData),
  );
  const data = shouldPromoteCachedFullPayload
    ? cachedData || undefined
    : overrideData || cachedData || undefined;
  const status =
    overrideData && publicBootstrapCache.status === "idle" ? "success" : publicBootstrapCache.status;
  const hasFetched = Boolean(overrideData) || publicBootstrapCache.hasFetched;
  return {
    data,
    error: publicBootstrapCache.error,
    isLoading: status === "loading" && !data,
    isFetched: hasFetched,
    status,
    isHydratingFullPayload: isPartialPublicBootstrapPayload(data),
    lastFetchedAt: publicBootstrapCache.lastFetchedAt,
  };
};

export const subscribePublicBootstrapSnapshot = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const normalizePublicBootstrapPayload = (value: unknown): PublicBootstrapPayload => {
  const normalized = asPublicBootstrapPayload(value);
  if (normalized) {
    return normalized;
  }
  const data = value && typeof value === "object" ? (value as Partial<PublicBootstrapPayload>) : {};
  return {
    ...emptyPublicBootstrapPayload,
    ...data,
    settings: data?.settings || emptyPublicBootstrapPayload.settings,
    pages: normalizePublicPagesConfig(data?.pages),
    projects: Array.isArray(data?.projects) ? data.projects : [],
    inProgressItems: Array.isArray(data?.inProgressItems) ? data.inProgressItems : [],
    posts: Array.isArray(data?.posts) ? data.posts : [],
    updates: Array.isArray(data?.updates) ? data.updates : [],
    teamMembers: Array.isArray(data?.teamMembers) ? (data.teamMembers as PublicTeamMember[]) : [],
    teamLinkTypes: Array.isArray(data?.teamLinkTypes)
      ? (data.teamLinkTypes as PublicTeamLinkType[])
      : [],
    mediaVariants:
      data?.mediaVariants && typeof data.mediaVariants === "object"
        ? (data.mediaVariants as UploadMediaVariantsMap)
        : {},
    tagTranslations: {
      tags: data?.tagTranslations?.tags || {},
      genres: data?.tagTranslations?.genres || {},
      staffRoles: data?.tagTranslations?.staffRoles || {},
    },
    homeHero: normalizePublicBootstrapHomeHero(data?.homeHero),
    currentPostDetail: data?.currentPostDetail || null,
    generatedAt: String(data?.generatedAt || ""),
    payloadMode:
      data?.payloadMode === "critical-home"
        ? "critical-home"
        : data?.payloadMode === "shell"
          ? "shell"
          : "full",
  };
};

const fetchPublicBootstrap = async (apiBase: string): Promise<PublicBootstrapPayload> => {
  const response = await apiFetch(apiBase, "/api/public/bootstrap");
  if (!response.ok) {
    throw new Error(`public_bootstrap_${response.status}`);
  }
  return normalizePublicBootstrapPayload(await response.json());
};

export const shouldFetchPublicBootstrap = (force = false) => {
  if (force) {
    return true;
  }
  if (publicBootstrapCache.inFlightPromise) {
    return false;
  }
  if (!publicBootstrapCache.data) {
    return true;
  }
  if (isPartialPublicBootstrapPayload(publicBootstrapCache.data)) {
    return true;
  }
  return Date.now() - publicBootstrapCache.lastFetchedAt > PUBLIC_BOOTSTRAP_STALE_TIME_MS;
};

export const requestPublicBootstrap = async (
  apiBase: string,
  options: { force?: boolean } = {},
) => {
  const force = options.force === true;
  if (publicBootstrapCache.inFlightPromise) {
    return publicBootstrapCache.inFlightPromise;
  }
  if (!shouldFetchPublicBootstrap(force)) {
    return publicBootstrapCache.data || emptyPublicBootstrapPayload;
  }

  publicBootstrapCache.status = "loading";
  publicBootstrapCache.error = null;
  emitPublicBootstrapSnapshot();

  const requestPromise = fetchPublicBootstrap(apiBase)
    .then((data) => {
      publicBootstrapCache.data = data;
      publicBootstrapCache.error = null;
      publicBootstrapCache.status = "success";
      publicBootstrapCache.hasFetched = true;
      publicBootstrapCache.lastFetchedAt = Date.now();
      publishWindowPublicBootstrap(data);
      syncedWindowBootstrapSource = data;
      emitPublicBootstrapSnapshot();
      return data;
    })
    .catch((error) => {
      const normalizedError = toError(error);
      publicBootstrapCache.error = normalizedError;
      publicBootstrapCache.status = "error";
      publicBootstrapCache.hasFetched = true;
      emitPublicBootstrapSnapshot();
      throw normalizedError;
    })
    .finally(() => {
      publicBootstrapCache.inFlightPromise = null;
    });

  publicBootstrapCache.inFlightPromise = requestPromise;
  return requestPromise;
};

export const primePublicBootstrapCache = (value: unknown) => {
  const payload = asPublicBootstrapPayload(value);
  if (!payload) {
    return false;
  }
  publicBootstrapCache.data = payload;
  publicBootstrapCache.error = null;
  publicBootstrapCache.status = "success";
  publicBootstrapCache.hasFetched = true;
  publicBootstrapCache.lastFetchedAt = Date.now();
  publishWindowPublicBootstrap(payload);
  syncedWindowBootstrapSource = payload;
  emitPublicBootstrapSnapshot();
  return true;
};

export const resetPublicBootstrapCache = () => {
  const payload = asPublicBootstrapPayload(readWindowPublicBootstrapSource());
  syncedWindowBootstrapSource = readWindowPublicBootstrapSource();
  publicBootstrapCache.data = payload;
  publicBootstrapCache.error = null;
  publicBootstrapCache.status = payload ? "success" : "idle";
  publicBootstrapCache.hasFetched = !!payload;
  publicBootstrapCache.lastFetchedAt = payload ? Date.now() : 0;
  publicBootstrapCache.inFlightPromise = null;
  emitPublicBootstrapSnapshot();
};

export const refetchPublicBootstrapCache = async (apiBase = getApiBase()) =>
  await requestPublicBootstrap(apiBase, { force: true });

export const getPublicBootstrapLastFetchedAt = () => publicBootstrapCache.lastFetchedAt;

export const refreshPublicBootstrapCacheIfStale = async ({
  apiBase = getApiBase(),
  minAgeMs = PUBLIC_BOOTSTRAP_STALE_TIME_MS,
}: {
  apiBase?: string;
  minAgeMs?: number;
} = {}) => {
  if (isPartialPublicBootstrapPayload(publicBootstrapCache.data)) {
    return await requestPublicBootstrap(apiBase, { force: true });
  }
  const lastFetchedAt = getPublicBootstrapLastFetchedAt();
  if (lastFetchedAt > 0 && Date.now() - lastFetchedAt < minAgeMs) {
    return publicBootstrapCache.data || emptyPublicBootstrapPayload;
  }
  return await requestPublicBootstrap(apiBase, { force: true });
};
