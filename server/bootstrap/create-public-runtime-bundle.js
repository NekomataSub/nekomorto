import { createPublicSiteRuntime } from "../lib/public-site-runtime.js";
import { createPublicVisibilityRuntime } from "../lib/public-visibility-runtime.js";
import { assertRequiredDependencies } from "./assert-required-dependencies.js";

const PUBLIC_RUNTIME_DEPENDENCY_KEYS = [
  "buildProjectOgRevision",
  "buildPublicBootstrapPayload",
  "buildPublicRoutePayload",
  "buildPublicMediaVariants",
  "buildPublicPostDetail",
  "buildPublicReadableProjects",
  "buildPublicTeamMembers",
  "buildPublicVisibleProjects",
  "buildUserPayload",
  "createGuid",
  "createSlug",
  "extractLocalStylesheetHrefs",
  "injectBootstrapGlobals",
  "injectHomeHeroShell",
  "injectPreloadLinks",
  "isEpisodePublic",
  "loadLinkTypes",
  "loadPages",
  "loadPosts",
  "loadProjects",
  "loadSiteSettings",
  "loadTagTranslations",
  "loadUpdates",
  "normalizePosts",
  "normalizeProjects",
  "primaryAppOrigin",
  "resolveEpisodeLookup",
  "resolveHomeHeroPreloadFromSlide",
  "resolveMetaImageVariantUrl",
  "resolvePublicDonationsRoutePayload",
  "resolvePostCover",
  "resolvePublicPostCoverPreload",
  "resolveProjectPosterPreload",
  "resolvePublicProjectsListPreloads",
  "resolvePublicReaderHeroPreload",
  "resolvePublicRouteModulePreloads",
  "resolvePublicTeamAvatarPreload",
  "sitemapStaticPublicPaths",
  "stripHtml",
];

export const createPublicRuntimeBundle = (dependencies = {}) => {
  assertRequiredDependencies(
    "createPublicRuntimeBundle",
    dependencies,
    PUBLIC_RUNTIME_DEPENDENCY_KEYS,
  );
  if (
    dependencies.bootstrapPwaEnabled === undefined &&
    typeof dependencies.resolveBootstrapPwaEnabled !== "function"
  ) {
    throw new Error(
      "[createPublicRuntimeBundle] missing required dependencies: bootstrapPwaEnabled or resolveBootstrapPwaEnabled",
    );
  }

  const publicVisibilityRuntime = createPublicVisibilityRuntime({
    buildPublicReadableProjects: dependencies.buildPublicReadableProjects,
    buildPublicVisibleProjects: dependencies.buildPublicVisibleProjects,
    isEpisodePublic: dependencies.isEpisodePublic,
    loadPosts: dependencies.loadPosts,
    loadProjects: dependencies.loadProjects,
    loadUpdates: dependencies.loadUpdates,
    normalizePosts: dependencies.normalizePosts,
    normalizeProjects: dependencies.normalizeProjects,
    resolveEpisodeLookup: dependencies.resolveEpisodeLookup,
  });

  const publicSiteRuntime = createPublicSiteRuntime({
    bootstrapPwaEnabled: dependencies.bootstrapPwaEnabled,
    buildProjectOgRevision: dependencies.buildProjectOgRevision,
    buildPublicBootstrapPayload: dependencies.buildPublicBootstrapPayload,
    buildPublicRoutePayload: dependencies.buildPublicRoutePayload,
    buildPublicMediaVariants: dependencies.buildPublicMediaVariants,
    buildPublicPostDetail: dependencies.buildPublicPostDetail,
    buildPublicTeamMembers: dependencies.buildPublicTeamMembers,
    buildUserPayload: dependencies.buildUserPayload,
    createGuid: dependencies.createGuid,
    createSlug: dependencies.createSlug,
    extractLocalStylesheetHrefs: dependencies.extractLocalStylesheetHrefs,
    getPublicInProgressItems: publicVisibilityRuntime.getPublicInProgressItems,
    getPublicReadableProjects: publicVisibilityRuntime.getPublicReadableProjects,
    getPublicVisiblePosts: publicVisibilityRuntime.getPublicVisiblePosts,
    getPublicVisibleProjects: publicVisibilityRuntime.getPublicVisibleProjects,
    getPublicVisibleUpdates: publicVisibilityRuntime.getPublicVisibleUpdates,
    injectBootstrapGlobals: dependencies.injectBootstrapGlobals,
    injectHomeHeroShell: dependencies.injectHomeHeroShell,
    injectPreloadLinks: dependencies.injectPreloadLinks,
    loadLinkTypes: dependencies.loadLinkTypes,
    loadPages: dependencies.loadPages,
    loadSiteSettings: dependencies.loadSiteSettings,
    loadTagTranslations: dependencies.loadTagTranslations,
    primaryAppOrigin: dependencies.primaryAppOrigin,
    resolveBootstrapPwaEnabled: dependencies.resolveBootstrapPwaEnabled,
    resolveHomeHeroPreloadFromSlide: dependencies.resolveHomeHeroPreloadFromSlide,
    resolveMetaImageVariantUrl: dependencies.resolveMetaImageVariantUrl,
    resolvePublicDonationsRoutePayload: dependencies.resolvePublicDonationsRoutePayload,
    resolvePostCover: dependencies.resolvePostCover,
    resolvePublicPostCoverPreload: dependencies.resolvePublicPostCoverPreload,
    resolveProjectPosterPreload: dependencies.resolveProjectPosterPreload,
    resolvePublicProjectsListPreloads: dependencies.resolvePublicProjectsListPreloads,
    resolvePublicReaderHeroPreload: dependencies.resolvePublicReaderHeroPreload,
    resolvePublicRouteModulePreloads: dependencies.resolvePublicRouteModulePreloads,
    resolvePublicTeamAvatarPreload: dependencies.resolvePublicTeamAvatarPreload,
    sitemapStaticPublicPaths: dependencies.sitemapStaticPublicPaths,
    stripHtml: dependencies.stripHtml,
  });

  return {
    ...publicVisibilityRuntime,
    ...publicSiteRuntime,
  };
};

export default createPublicRuntimeBundle;
