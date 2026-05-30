import { normalizePublicPagesConfig } from "@/lib/public-pages";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import {
  emptyPublicBootstrapPayload,
  type PublicBootstrapHomeHero,
  type PublicBootstrapHomeHeroSlide,
  type PublicBootstrapPayload,
  type PublicBootstrapPayloadMode,
  type PublicBootstrapPostDetail,
  type PublicRouteDonationsPayload,
  type PublicRoutePayload,
  type PublicRoutePayloadProjectLookup,
  type PublicRouteProjectDetailPayload,
  type PublicRouteProjectReadingPayload,
  type PublicRouteProjectsListPayload,
  type PublicRouteTeamPayload,
} from "@/types/public-bootstrap";
import type { PublicTeamLinkType, PublicTeamMember } from "@/types/public-team";

export type PublicBootstrapCurrentUser = {
  id: string;
  name: string;
  username: string;
  email?: string | null;
  avatarUrl?: string | null;
  revision?: string | null;
  accessRole?: string;
  permissions?: string[];
  ownerIds?: string[];
  primaryOwnerId?: string | null;
  grants?: Partial<Record<string, boolean>>;
};

const normalizePublicBootstrapPayloadMode = (value: unknown): PublicBootstrapPayloadMode =>
  String(value || "").trim() === "critical-home"
    ? "critical-home"
    : String(value || "").trim() === "shell"
      ? "shell"
      : "full";

const normalizePublicTagTranslations = (
  value: unknown,
): PublicBootstrapPayload["tagTranslations"] => {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<PublicBootstrapPayload["tagTranslations"]>)
      : {};
  return {
    tags:
      candidate.tags && typeof candidate.tags === "object" && !Array.isArray(candidate.tags)
        ? candidate.tags
        : {},
    genres:
      candidate.genres && typeof candidate.genres === "object" && !Array.isArray(candidate.genres)
        ? candidate.genres
        : {},
    staffRoles:
      candidate.staffRoles &&
      typeof candidate.staffRoles === "object" &&
      !Array.isArray(candidate.staffRoles)
        ? candidate.staffRoles
        : {},
  };
};

const normalizePublicBootstrapPostDetail = (value: unknown): PublicBootstrapPostDetail | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PublicBootstrapPostDetail>;
  const id = String(candidate.id || "").trim();
  const slug = String(candidate.slug || "").trim();
  if (!id || !slug) {
    return null;
  }
  return {
    id,
    slug,
    title: String(candidate.title || ""),
    excerpt: String(candidate.excerpt || ""),
    author: String(candidate.author || ""),
    publishedAt: String(candidate.publishedAt || ""),
    coverImageUrl: String(candidate.coverImageUrl || ""),
    coverAlt: String(candidate.coverAlt || ""),
    projectId: String(candidate.projectId || ""),
    tags: Array.isArray(candidate.tags)
      ? candidate.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [],
    views: Number.isFinite(Number(candidate.views)) ? Number(candidate.views) : 0,
    commentsCount: Number.isFinite(Number(candidate.commentsCount))
      ? Number(candidate.commentsCount)
      : 0,
    content: String(candidate.content || ""),
    contentFormat: candidate.contentFormat === "lexical" ? "lexical" : undefined,
    seoTitle: candidate.seoTitle ? String(candidate.seoTitle) : null,
    seoDescription: candidate.seoDescription ? String(candidate.seoDescription) : null,
  };
};

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
  const initialSlideId = String(candidate.initialSlideId || fallbackSlideId).trim();
  const latestSlideId = String(candidate.latestSlideId || fallbackSlideId).trim();
  return {
    initialSlideId: initialSlideId || fallbackSlideId,
    latestSlideId: latestSlideId || fallbackSlideId,
    hasMultipleSlides:
      candidate.hasMultipleSlides === true || (Array.isArray(slides) && slides.length > 1),
    slides: normalizedSlides,
  };
};

export const asPublicBootstrapPayload = (value: unknown): PublicBootstrapPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PublicBootstrapPayload>;
  if (!Array.isArray(candidate.projects) || !Array.isArray(candidate.posts)) {
    return null;
  }
  return {
    ...emptyPublicBootstrapPayload,
    ...candidate,
    settings: candidate.settings || emptyPublicBootstrapPayload.settings,
    pages: normalizePublicPagesConfig(candidate.pages),
    projects: Array.isArray(candidate.projects) ? candidate.projects : [],
    inProgressItems: Array.isArray(candidate.inProgressItems) ? candidate.inProgressItems : [],
    posts: Array.isArray(candidate.posts) ? candidate.posts : [],
    updates: Array.isArray(candidate.updates) ? candidate.updates : [],
    teamMembers: Array.isArray(candidate.teamMembers)
      ? (candidate.teamMembers as PublicTeamMember[])
      : [],
    teamLinkTypes: Array.isArray(candidate.teamLinkTypes)
      ? (candidate.teamLinkTypes as PublicTeamLinkType[])
      : [],
    mediaVariants:
      candidate.mediaVariants && typeof candidate.mediaVariants === "object"
        ? (candidate.mediaVariants as UploadMediaVariantsMap)
        : {},
    tagTranslations: normalizePublicTagTranslations(candidate.tagTranslations),
    homeHero: normalizePublicBootstrapHomeHero(candidate.homeHero),
    currentPostDetail: normalizePublicBootstrapPostDetail(candidate.currentPostDetail),
    generatedAt: String(candidate.generatedAt || ""),
    payloadMode: normalizePublicBootstrapPayloadMode(candidate.payloadMode),
  };
};

const normalizeRouteProjectLookup = (value: unknown): PublicRoutePayloadProjectLookup => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce<PublicRoutePayloadProjectLookup>(
    (result, [key, rawValue]) => {
      const normalizedKey = String(key || "").trim();
      const normalizedValue = String(rawValue || "").trim();
      if (!normalizedKey || !normalizedValue) {
        return result;
      }
      result[normalizedKey] = normalizedValue;
      return result;
    },
    {},
  );
};

const normalizePublicRouteProjectsListPayload = (
  candidate: Partial<PublicRouteProjectsListPayload>,
): PublicRouteProjectsListPayload => ({
  kind: "projects-list",
  generatedAt: String(candidate.generatedAt || ""),
  projects: Array.isArray(candidate.projects) ? candidate.projects : [],
  mediaVariants:
    candidate.mediaVariants && typeof candidate.mediaVariants === "object"
      ? (candidate.mediaVariants as UploadMediaVariantsMap)
      : {},
  tagTranslations: normalizePublicTagTranslations(candidate.tagTranslations),
});

const normalizePublicRouteProjectDetailPayload = (
  candidate: Partial<PublicRouteProjectDetailPayload>,
): PublicRouteProjectDetailPayload => ({
  kind: "project-detail",
  generatedAt: String(candidate.generatedAt || ""),
  project:
    candidate.project && typeof candidate.project === "object"
      ? (candidate.project as PublicRouteProjectDetailPayload["project"])
      : null,
  revision: String(candidate.revision || ""),
  mediaVariants:
    candidate.mediaVariants && typeof candidate.mediaVariants === "object"
      ? (candidate.mediaVariants as UploadMediaVariantsMap)
      : {},
  relationProjectLookup: normalizeRouteProjectLookup(candidate.relationProjectLookup),
  tagTranslations: normalizePublicTagTranslations(candidate.tagTranslations),
});

const normalizePublicRouteProjectReadingPayload = (
  candidate: Partial<PublicRouteProjectReadingPayload>,
): PublicRouteProjectReadingPayload => ({
  kind: "project-reading",
  generatedAt: String(candidate.generatedAt || ""),
  project:
    candidate.project && typeof candidate.project === "object"
      ? (candidate.project as PublicRouteProjectReadingPayload["project"])
      : null,
  chapter:
    candidate.chapter && typeof candidate.chapter === "object"
      ? (candidate.chapter as PublicRouteProjectReadingPayload["chapter"])
      : null,
  readerConfig:
    candidate.readerConfig && typeof candidate.readerConfig === "object"
      ? candidate.readerConfig
      : null,
  mediaVariants:
    candidate.mediaVariants && typeof candidate.mediaVariants === "object"
      ? (candidate.mediaVariants as UploadMediaVariantsMap)
      : {},
  tagTranslations: normalizePublicTagTranslations(candidate.tagTranslations),
});

const normalizePublicRouteTeamPayload = (
  candidate: Partial<PublicRouteTeamPayload>,
): PublicRouteTeamPayload => ({
  kind: "team",
  generatedAt: String(candidate.generatedAt || ""),
  teamMembers: Array.isArray(candidate.teamMembers)
    ? (candidate.teamMembers as PublicTeamMember[])
    : [],
  teamLinkTypes: Array.isArray(candidate.teamLinkTypes)
    ? (candidate.teamLinkTypes as PublicTeamLinkType[])
    : [],
  mediaVariants:
    candidate.mediaVariants && typeof candidate.mediaVariants === "object"
      ? (candidate.mediaVariants as UploadMediaVariantsMap)
      : {},
});

const normalizePublicRouteDonationsPayload = (
  candidate: Partial<PublicRouteDonationsPayload>,
): PublicRouteDonationsPayload => ({
  kind: "donations",
  generatedAt: String(candidate.generatedAt || ""),
  pixQrCodeUrl: String(candidate.pixQrCodeUrl || ""),
  cryptoQrCodeUrls:
    candidate.cryptoQrCodeUrls &&
    typeof candidate.cryptoQrCodeUrls === "object" &&
    !Array.isArray(candidate.cryptoQrCodeUrls)
      ? Object.entries(candidate.cryptoQrCodeUrls).reduce<Record<string, string>>(
          (result, [key, value]) => {
            const normalizedKey = String(key || "").trim();
            const normalizedValue = String(value || "").trim();
            if (!normalizedKey || !normalizedValue) {
              return result;
            }
            result[normalizedKey] = normalizedValue;
            return result;
          },
          {},
        )
      : {},
});

export const asPublicRoutePayload = (value: unknown): PublicRoutePayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Partial<PublicRoutePayload> & { kind?: unknown };
  switch (String(candidate.kind || "").trim()) {
    case "projects-list":
      return normalizePublicRouteProjectsListPayload(
        candidate as Partial<PublicRouteProjectsListPayload>,
      );
    case "project-detail":
      return normalizePublicRouteProjectDetailPayload(
        candidate as Partial<PublicRouteProjectDetailPayload>,
      );
    case "project-reading":
      return normalizePublicRouteProjectReadingPayload(
        candidate as Partial<PublicRouteProjectReadingPayload>,
      );
    case "team":
      return normalizePublicRouteTeamPayload(candidate as Partial<PublicRouteTeamPayload>);
    case "donations":
      return normalizePublicRouteDonationsPayload(
        candidate as Partial<PublicRouteDonationsPayload>,
      );
    default:
      return null;
  }
};

export const asPublicBootstrapCurrentUser = (value: unknown): PublicBootstrapCurrentUser | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = value as Partial<PublicBootstrapCurrentUser>;
  const id = String(candidate.id || "").trim();
  if (!id) {
    return null;
  }
  const permissions = Array.isArray(candidate.permissions)
    ? candidate.permissions.map((permission) => String(permission || "").trim()).filter(Boolean)
    : [];
  const ownerIds = Array.isArray(candidate.ownerIds)
    ? candidate.ownerIds.map((ownerId) => String(ownerId || "").trim()).filter(Boolean)
    : [];
  return {
    id,
    name: String(candidate.name || ""),
    username: String(candidate.username || ""),
    email: candidate.email ? String(candidate.email) : null,
    avatarUrl: candidate.avatarUrl ? String(candidate.avatarUrl) : null,
    revision: candidate.revision ? String(candidate.revision) : null,
    accessRole: candidate.accessRole ? String(candidate.accessRole) : undefined,
    permissions,
    ownerIds,
    primaryOwnerId: candidate.primaryOwnerId ? String(candidate.primaryOwnerId) : null,
    grants:
      candidate.grants && typeof candidate.grants === "object"
        ? (candidate.grants as Partial<Record<string, boolean>>)
        : undefined,
  };
};

export const readWindowPublicBootstrap = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const globalWindow = window as Window & {
    __BOOTSTRAP_PUBLIC__?: unknown;
  };
  return asPublicBootstrapPayload(globalWindow.__BOOTSTRAP_PUBLIC__);
};

export const readWindowPublicBootstrapCurrentUser = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const globalWindow = window as Window & {
    __BOOTSTRAP_PUBLIC_ME__?: unknown;
  };
  return asPublicBootstrapCurrentUser(globalWindow.__BOOTSTRAP_PUBLIC_ME__);
};

export const readWindowPublicRoutePayload = () => {
  if (typeof window === "undefined") {
    return null;
  }
  const globalWindow = window as Window & {
    __BOOTSTRAP_ROUTE__?: unknown;
  };
  return asPublicRoutePayload(globalWindow.__BOOTSTRAP_ROUTE__);
};
