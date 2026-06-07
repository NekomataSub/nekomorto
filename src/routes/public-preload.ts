import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { scheduleOnBrowserLoadIdle } from "@/lib/browser-idle";
import {
  clearPreloadedPublicPostDetailsForTests,
  storePreloadedPublicPostDetail,
} from "@/lib/public-post-preload";
import { readWindowPublicBootstrap } from "@/lib/public-bootstrap-global";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import type {
  PublicRoutePayload,
  PublicRoutePayloadRelationProjectCards,
  PublicRouteProjectDetailPayload,
} from "@/types/public-bootstrap";
import {
  PUBLIC_ROUTE_KIND_ABOUT,
  PUBLIC_ROUTE_KIND_DONATIONS,
  PUBLIC_ROUTE_KIND_FAQ,
  PUBLIC_ROUTE_KIND_HOME,
  PUBLIC_ROUTE_KIND_LOGIN,
  PUBLIC_ROUTE_KIND_NOT_FOUND,
  PUBLIC_ROUTE_KIND_POST,
  PUBLIC_ROUTE_KIND_PRIVACY,
  PUBLIC_ROUTE_KIND_PROJECT_DETAIL,
  PUBLIC_ROUTE_KIND_PROJECT_READING,
  PUBLIC_ROUTE_KIND_PROJECTS_LIST,
  PUBLIC_ROUTE_KIND_RECRUITMENT,
  PUBLIC_ROUTE_KIND_TEAM,
  PUBLIC_ROUTE_KIND_TERMS,
  resolvePublicRouteKind,
} from "../../shared/public-route-registry.js";

const normalizePublicPrefetchPath = (value: string) => {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("/")) {
    return "";
  }
  return normalized;
};

const preloadedPublicRouteKinds = new Set<string>();
const preloadedPublicRoutePayloads = new Map<string, PublicRoutePayload | null>();
const inflightPublicRoutePayloads = new Map<string, Promise<PublicRoutePayload | null>>();
const inflightPublicPostPayloads = new Map<string, Promise<unknown | null>>();
const prewarmedImageUrls = new Set<string>();
const idleScheduledPublicPaths = new Set<string>();

type PreloadPublicRouteOptions = {
  includeCode?: boolean;
};

const normalizePathname = (value: string) => {
  const normalized = normalizePublicPrefetchPath(value);
  if (!normalized) {
    return "";
  }
  try {
    const url = new URL(normalized, "https://nekomata.moe");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return normalized.replace(/\/+$/, "") || "/";
  }
};

const resolvePreloadCacheKey = (path: string) => normalizePathname(path);

const normalizeProjectRouteKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const resolveProjectSlugFromPath = (path: string) => {
  const pathname = normalizePathname(path);
  const match = pathname.match(/^\/projeto(?:s)?\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
};

const resolveBootstrapProjectForSlug = (slug: string) => {
  const routeKey = normalizeProjectRouteKey(slug);
  if (!routeKey) {
    return null;
  }
  const bootstrap = readWindowPublicBootstrap();
  return (
    bootstrap?.projects.find((candidate) => {
      const candidateId = String(candidate.id || "").trim();
      return (
        candidateId === slug ||
        normalizeProjectRouteKey(candidateId) === routeKey ||
        normalizeProjectRouteKey(candidate.title) === routeKey
      );
    }) || null
  );
};

const buildRelationProjectLookup = ({
  project,
  projects,
}: {
  project: {
    relations?: Array<{ projectId?: string | null; anilistId?: number | null }>;
  } | null;
  projects: Array<{ id?: string | null; anilistId?: number | null }>;
}) => {
  if (!project?.relations?.length) {
    return {};
  }
  const relationKeys = new Set<string>();
  project.relations.forEach((relation) => {
    const relationProjectId = String(relation?.projectId || "").trim();
    const relationAniListId = String(relation?.anilistId || "").trim();
    if (relationProjectId) {
      relationKeys.add(relationProjectId);
    }
    if (relationAniListId) {
      relationKeys.add(relationAniListId);
    }
  });
  return projects.reduce<Record<string, string>>((result, entry) => {
    const projectId = String(entry.id || "").trim();
    const anilistId = String(entry.anilistId || "").trim();
    if (projectId && relationKeys.has(projectId)) {
      result[projectId] = projectId;
    }
    if (anilistId && relationKeys.has(anilistId)) {
      result[anilistId] = projectId;
    }
    return result;
  }, {});
};

const buildRelationProjectCards = ({
  project,
  projects,
}: {
  project: {
    relations?: Array<{ projectId?: string | null; anilistId?: number | null }>;
  } | null;
  projects: Array<{
    id?: string | null;
    anilistId?: number | null;
    title?: string | null;
    cover?: string | null;
    coverAlt?: string | null;
  }>;
}): PublicRoutePayloadRelationProjectCards => {
  if (!project?.relations?.length) {
    return {};
  }
  const relationKeys = new Set<string>();
  project.relations.forEach((relation) => {
    const relationProjectId = String(relation?.projectId || "").trim();
    const relationAniListId = String(relation?.anilistId || "").trim();
    if (relationProjectId) {
      relationKeys.add(relationProjectId);
    }
    if (relationAniListId) {
      relationKeys.add(relationAniListId);
    }
  });
  return projects.reduce<PublicRoutePayloadRelationProjectCards>((result, entry) => {
    const projectId = String(entry.id || "").trim();
    const anilistId = String(entry.anilistId || "").trim();
    if (!projectId) {
      return result;
    }
    const card = {
      id: projectId,
      title: String(entry.title || ""),
      cover: String(entry.cover || ""),
      coverAlt: String(entry.coverAlt || ""),
    };
    if (relationKeys.has(projectId)) {
      result[projectId] = card;
    }
    if (anilistId && relationKeys.has(anilistId)) {
      result[anilistId] = card;
    }
    return result;
  }, {});
};

const prewarmImage = (value: string) => {
  if (typeof window === "undefined" || typeof Image === "undefined") {
    return;
  }
  const src = String(value || "").trim();
  if (!src || prewarmedImageUrls.has(src)) {
    return;
  }
  prewarmedImageUrls.add(src);
  const image = new Image();
  image.decoding = "async";
  image.src = src;
};

const buildProjectDetailRoutePayload = ({
  generatedAt,
  project,
  response,
}: {
  generatedAt: string;
  project: Record<string, unknown> | null;
  response: Record<string, unknown>;
}): PublicRouteProjectDetailPayload => {
  const bootstrap = readWindowPublicBootstrap();
  const tagTranslations =
    response?.translations && typeof response.translations === "object"
      ? (response.translations as PublicRouteProjectDetailPayload["tagTranslations"])
      : bootstrap?.tagTranslations || { tags: {}, genres: {}, staffRoles: {} };
  const mediaVariants =
    response?.mediaVariants && typeof response.mediaVariants === "object"
      ? (response.mediaVariants as PublicRouteProjectDetailPayload["mediaVariants"])
      : {};
  return {
    kind: "project-detail",
    generatedAt,
    project: project as PublicRouteProjectDetailPayload["project"],
    revision: String(response?.revision || "").trim(),
    mediaVariants,
    relationProjectLookup: buildRelationProjectLookup({
      project: project as {
        relations?: Array<{ projectId?: string | null; anilistId?: number | null }>;
      } | null,
      projects: bootstrap?.projects || [],
    }),
    relationProjectCards:
      response?.relationProjectCards && typeof response.relationProjectCards === "object"
        ? (response.relationProjectCards as PublicRoutePayloadRelationProjectCards)
        : buildRelationProjectCards({
            project: project as {
              relations?: Array<{ projectId?: string | null; anilistId?: number | null }>;
            } | null,
            projects: bootstrap?.projects || [],
          }),
    tagTranslations,
  };
};

const buildTeamRoutePayload = ({
  generatedAt,
  linkTypes,
  mediaVariants,
  teamMembers,
}: {
  generatedAt: string;
  linkTypes: unknown;
  mediaVariants: unknown;
  teamMembers: unknown;
}): PublicRoutePayload => ({
  kind: "team",
  generatedAt,
  mediaVariants:
    mediaVariants && typeof mediaVariants === "object"
      ? (mediaVariants as UploadMediaVariantsMap)
      : {},
  teamLinkTypes: Array.isArray(linkTypes) ? linkTypes : [],
  teamMembers: Array.isArray(teamMembers) ? teamMembers : [],
});

const preloadProjectDetailPayload = async (path: string): Promise<PublicRoutePayload | null> => {
  const cacheKey = resolvePreloadCacheKey(path);
  if (!cacheKey) {
    return null;
  }
  if (preloadedPublicRoutePayloads.has(cacheKey)) {
    return preloadedPublicRoutePayloads.get(cacheKey) || null;
  }
  const inflight = inflightPublicRoutePayloads.get(cacheKey);
  if (inflight) {
    return await inflight;
  }
  const slug = resolveProjectSlugFromPath(cacheKey);
  if (!slug) {
    return null;
  }
  const requestPromise = (async () => {
    try {
      const bootstrap = readWindowPublicBootstrap();
      const bootstrapProject = resolveBootstrapProjectForSlug(slug);
      const projectId = String(bootstrapProject?.id || slug).trim();
      if (!projectId) {
        return null;
      }
      const response = await apiFetch(
        getApiBase(),
        `/api/public/projects/${encodeURIComponent(projectId)}`,
        {
          cache: "force-cache",
        },
      );
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as Record<string, unknown>;
      const project =
        data?.project && typeof data.project === "object"
          ? (data.project as Record<string, unknown>)
          : null;
      const payload = buildProjectDetailRoutePayload({
        generatedAt: String(bootstrap?.generatedAt || ""),
        project,
        response: data,
      });
      prewarmImage(String(project?.banner || ""));
      prewarmImage(String(project?.heroImageUrl || ""));
      prewarmImage(String(project?.cover || ""));
      return payload;
    } catch {
      return null;
    } finally {
      inflightPublicRoutePayloads.delete(cacheKey);
    }
  })();
  inflightPublicRoutePayloads.set(cacheKey, requestPromise);
  const payload = await requestPromise;
  preloadedPublicRoutePayloads.set(cacheKey, payload);
  return payload;
};

const preloadTeamRoutePayload = async (path: string): Promise<PublicRoutePayload | null> => {
  const cacheKey = resolvePreloadCacheKey(path);
  if (!cacheKey) {
    return null;
  }
  if (preloadedPublicRoutePayloads.has(cacheKey)) {
    return preloadedPublicRoutePayloads.get(cacheKey) || null;
  }
  const inflight = inflightPublicRoutePayloads.get(cacheKey);
  if (inflight) {
    return await inflight;
  }
  const requestPromise = (async () => {
    try {
      const bootstrap = readWindowPublicBootstrap();
      const [usersResponse, linkTypesResponse] = await Promise.all([
        apiFetch(getApiBase(), "/api/public/users", { cache: "force-cache" }),
        apiFetch(getApiBase(), "/api/link-types", { cache: "force-cache" }),
      ]);
      const [usersData, linkTypesData] = await Promise.all([
        usersResponse.ok ? usersResponse.json() : Promise.resolve({}),
        linkTypesResponse.ok ? linkTypesResponse.json() : Promise.resolve({}),
      ]);
      return buildTeamRoutePayload({
        generatedAt: String(bootstrap?.generatedAt || ""),
        linkTypes: linkTypesData?.items,
        mediaVariants: usersData?.mediaVariants,
        teamMembers: usersData?.users,
      });
    } catch {
      return null;
    } finally {
      inflightPublicRoutePayloads.delete(cacheKey);
    }
  })();
  inflightPublicRoutePayloads.set(cacheKey, requestPromise);
  const payload = await requestPromise;
  preloadedPublicRoutePayloads.set(cacheKey, payload);
  return payload;
};

const preloadPostDetailPayload = async (path: string) => {
  const cacheKey = resolvePreloadCacheKey(path);
  if (!cacheKey) {
    return null;
  }
  const inflight = inflightPublicPostPayloads.get(cacheKey);
  if (inflight) {
    return await inflight;
  }
  const slugMatch = cacheKey.match(/^\/postagem\/([^/]+)$/);
  const slug = slugMatch?.[1] ? decodeURIComponent(slugMatch[1]) : "";
  if (!slug) {
    return null;
  }
  const requestPromise = (async () => {
    try {
      const response = await apiFetch(
        getApiBase(),
        `/api/public/posts/${encodeURIComponent(slug)}`,
        {
          cache: "force-cache",
        },
      );
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      const post =
        data?.post && typeof data.post === "object"
          ? storePreloadedPublicPostDetail(data.post)
          : null;
      if (post?.coverImageUrl) {
        prewarmImage(String(post.coverImageUrl));
      }
      return post;
    } catch {
      return null;
    } finally {
      inflightPublicPostPayloads.delete(cacheKey);
    }
  })();
  inflightPublicPostPayloads.set(cacheKey, requestPromise);
  return await requestPromise;
};

const loadPublicRouteModule = (routeKind: string) => {
  switch (routeKind) {
    case PUBLIC_ROUTE_KIND_HOME:
      return import("@/pages/Index");
    case PUBLIC_ROUTE_KIND_POST:
      return import("@/pages/Post");
    case PUBLIC_ROUTE_KIND_TEAM:
      return import("@/pages/Team");
    case PUBLIC_ROUTE_KIND_ABOUT:
      return import("@/pages/About");
    case PUBLIC_ROUTE_KIND_DONATIONS:
      return import("@/pages/Donations");
    case PUBLIC_ROUTE_KIND_FAQ:
      return import("@/pages/FAQ");
    case PUBLIC_ROUTE_KIND_PROJECTS_LIST:
      return import("@/pages/Projects");
    case PUBLIC_ROUTE_KIND_PROJECT_DETAIL:
      return import("@/pages/Project");
    case PUBLIC_ROUTE_KIND_PROJECT_READING:
      return import("@/pages/ProjectReading");
    case PUBLIC_ROUTE_KIND_RECRUITMENT:
      return import("@/pages/Recruitment");
    case PUBLIC_ROUTE_KIND_TERMS:
      return import("@/pages/TermsOfService");
    case PUBLIC_ROUTE_KIND_PRIVACY:
      return import("@/pages/PrivacyPolicy");
    case PUBLIC_ROUTE_KIND_LOGIN:
      return import("@/pages/Login");
    default:
      return null;
  }
};

export const preloadPublicRoute = async (path: string, options: PreloadPublicRouteOptions = {}) => {
  const normalizedPath = normalizePublicPrefetchPath(path);
  if (!normalizedPath) {
    return null;
  }
  const includeCode = options.includeCode !== false;
  const routeKind = resolvePublicRouteKind(normalizedPath);
  if (routeKind === PUBLIC_ROUTE_KIND_NOT_FOUND) {
    return null;
  }
  if (includeCode && preloadedPublicRouteKinds.has(routeKind)) {
    return routeKind === PUBLIC_ROUTE_KIND_PROJECT_DETAIL
      ? preloadProjectDetailPayload(normalizedPath)
      : preloadedPublicRoutePayloads.get(resolvePreloadCacheKey(normalizedPath)) || null;
  }
  const loadRoute = includeCode ? loadPublicRouteModule(routeKind) : null;
  const codePreloadPromise = loadRoute
    ? (() => {
        preloadedPublicRouteKinds.add(routeKind);
        return loadRoute.catch(() => {
          preloadedPublicRouteKinds.delete(routeKind);
          return null;
        });
      })()
    : Promise.resolve(null);
  const payloadPreloadPromise =
    routeKind === PUBLIC_ROUTE_KIND_PROJECT_DETAIL
      ? preloadProjectDetailPayload(normalizedPath)
      : routeKind === PUBLIC_ROUTE_KIND_TEAM
        ? preloadTeamRoutePayload(normalizedPath)
        : routeKind === PUBLIC_ROUTE_KIND_POST
          ? preloadPostDetailPayload(normalizedPath).then(() => null)
          : Promise.resolve(null);
  const [, payload] = await Promise.all([codePreloadPromise, payloadPreloadPromise]);
  return payload;
};

export const preloadPublicRoutePayload = async (path: string) => {
  const normalizedPath = normalizePublicPrefetchPath(path);
  if (!normalizedPath) {
    return null;
  }
  const routeKind = resolvePublicRouteKind(normalizedPath);
  if (routeKind !== PUBLIC_ROUTE_KIND_PROJECT_DETAIL) {
    return null;
  }
  return await preloadProjectDetailPayload(normalizedPath);
};

export const peekPreloadedPublicRoutePayload = (path: string) => {
  const cacheKey = resolvePreloadCacheKey(path);
  if (!cacheKey) {
    return null;
  }
  return preloadedPublicRoutePayloads.get(cacheKey) || null;
};

export const getPublicRoutePreloadHandlers = (path: string) => {
  const runPreload = () => {
    void preloadPublicRoute(path);
  };
  return {
    onFocus: runPreload,
    onMouseEnter: runPreload,
    onTouchStart: runPreload,
  };
};

export const schedulePublicRouteIdlePreload = (paths: string[], options?: { delayMs?: number }) => {
  const normalizedPaths = paths
    .map((path) => normalizePathname(path))
    .filter(Boolean)
    .filter((path, index, list) => list.indexOf(path) === index)
    .filter((path) => !idleScheduledPublicPaths.has(path));

  if (normalizedPaths.length === 0) {
    return () => undefined;
  }

  normalizedPaths.forEach((path) => {
    idleScheduledPublicPaths.add(path);
  });

  let isCancelled = false;
  const cancelIdle = scheduleOnBrowserLoadIdle(() => {
    if (isCancelled) {
      return;
    }
    normalizedPaths.forEach((path) => {
      void preloadPublicRoute(path, { includeCode: false });
    });
  }, options);

  return () => {
    isCancelled = true;
    cancelIdle();
  };
};

export const clearPublicRoutePreloadCacheForTests = () => {
  preloadedPublicRouteKinds.clear();
  preloadedPublicRoutePayloads.clear();
  inflightPublicRoutePayloads.clear();
  inflightPublicPostPayloads.clear();
  prewarmedImageUrls.clear();
  idleScheduledPublicPaths.clear();
  clearPreloadedPublicPostDetailsForTests();
};
