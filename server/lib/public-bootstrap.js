import {
  getProjectEpisodePageCount,
  hasProjectEpisodePages,
  normalizeProjectEpisodeContentFormat,
} from "../../shared/project-reader.js";

const safeString = (value) => String(value || "");
const DAY_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const PUBLIC_BOOTSTRAP_PAYLOAD_MODES = new Set(["full", "critical-home", "shell"]);

const normalizePublicBootstrapPayloadMode = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return PUBLIC_BOOTSTRAP_PAYLOAD_MODES.has(normalized) ? normalized : "full";
};

const safeStringArray = (value) =>
  Array.isArray(value) ? value.map((item) => safeString(item).trim()).filter(Boolean) : [];

const toSafeNonNegativeInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const sanitizeViewsDaily = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((result, [rawDayKey, rawCount]) => {
    const dayKey = String(rawDayKey || "").trim();
    if (!DAY_KEY_REGEX.test(dayKey)) {
      return result;
    }
    const count = toSafeNonNegativeInt(rawCount);
    result[dayKey] = count;
    return result;
  }, {});
};

const safeSources = (value) =>
  Array.isArray(value)
    ? value
        .map((source) => ({
          label: safeString(source?.label).trim(),
          url: safeString(source?.url).trim(),
        }))
        .filter((source) => source.label || source.url)
    : [];

const safeTeamSocials = (value) =>
  Array.isArray(value)
    ? value
        .map((source) => ({
          label: safeString(source?.label).trim(),
          href: safeString(source?.href).trim(),
        }))
        .filter((source) => source.label || source.href)
    : [];

const sanitizeVolumeCovers = (covers) =>
  Array.isArray(covers)
    ? covers
        .map((cover) => ({
          volume: Number.isFinite(Number(cover?.volume)) ? Number(cover.volume) : undefined,
          coverImageUrl: safeString(cover?.coverImageUrl),
          coverImageAlt: safeString(cover?.coverImageAlt),
        }))
        .filter((cover) => cover.coverImageUrl)
    : [];

const sanitizeVolumeEntries = (entries) =>
  Array.isArray(entries)
    ? entries
        .map((entry) => {
          const volume = Number(entry?.volume);
          if (!Number.isFinite(volume)) {
            return null;
          }
          const coverImageUrl = safeString(entry?.coverImageUrl);
          return {
            volume,
            synopsis: safeString(entry?.synopsis),
            coverImageUrl,
            coverImageAlt: coverImageUrl ? safeString(entry?.coverImageAlt) : "",
          };
        })
        .filter(Boolean)
    : [];

const sanitizeEpisodeDownloads = (episodes) =>
  Array.isArray(episodes)
    ? episodes.map((episode) => {
        const hasPages = Boolean(episode?.hasPages) || hasProjectEpisodePages(episode);
        const pageCount = Number.isFinite(Number(episode?.pageCount))
          ? Math.max(0, Number(episode.pageCount))
          : getProjectEpisodePageCount(episode);
        const hasContent =
          Boolean(episode?.hasContent) ||
          (typeof episode?.content === "string" && episode.content.trim().length > 0);
        return {
          number: Number.isFinite(Number(episode?.number)) ? Number(episode.number) : 0,
          volume: Number.isFinite(Number(episode?.volume)) ? Number(episode.volume) : undefined,
          title: safeString(episode?.title),
          entryKind:
            String(episode?.entryKind || "")
              .trim()
              .toLowerCase() === "extra"
              ? "extra"
              : "main",
          entrySubtype: safeString(episode?.entrySubtype),
          readingOrder: Number.isFinite(Number(episode?.readingOrder))
            ? Number(episode.readingOrder)
            : undefined,
          displayLabel: safeString(episode?.displayLabel),
          releaseDate: safeString(episode?.releaseDate),
          duration: safeString(episode?.duration),
          coverImageUrl: safeString(episode?.coverImageUrl),
          coverImageAlt: safeString(episode?.coverImageAlt),
          sourceType: safeString(episode?.sourceType),
          hash: safeString(episode?.hash) || undefined,
          sizeBytes: Number.isFinite(Number(episode?.sizeBytes))
            ? Math.max(0, Number(episode.sizeBytes))
            : undefined,
          sources: safeSources(episode?.sources),
          progressStage: safeString(episode?.progressStage),
          completedStages: safeStringArray(episode?.completedStages),
          chapterUpdatedAt: safeString(episode?.chapterUpdatedAt),
          contentFormat: normalizeProjectEpisodeContentFormat(
            episode?.contentFormat,
            hasPages ? "images" : "lexical",
          ),
          pageCount: hasPages || pageCount > 0 ? pageCount : undefined,
          hasPages,
          hasContent,
        };
      })
    : [];

const sanitizeInProgressItems = (items) =>
  Array.isArray(items)
    ? items.map((item) => ({
        projectId: safeString(item?.projectId),
        projectTitle: safeString(item?.projectTitle),
        projectType: safeString(item?.projectType),
        number: Number.isFinite(Number(item?.number)) ? Number(item.number) : 0,
        volume: Number.isFinite(Number(item?.volume)) ? Number(item.volume) : undefined,
        entryKind:
          String(item?.entryKind || "")
            .trim()
            .toLowerCase() === "extra"
            ? "extra"
            : "main",
        displayLabel: safeString(item?.displayLabel),
        progressStage: safeString(item?.progressStage),
        completedStages: safeStringArray(item?.completedStages),
      }))
    : [];

const sanitizeStaffEntries = (items) => {
  const entries = Array.isArray(items)
    ? items
    : items && typeof items === "object"
      ? Object.entries(items).map(([role, members]) => ({ role, members }))
      : [];

  return entries
    .map((item) => {
      const role = safeString(item?.role);
      const members = Array.isArray(item?.members)
        ? safeStringArray(item.members)
        : String(item?.members || "")
            .split(",")
            .map((member) => safeString(member))
            .filter(Boolean);

      return role || members.length ? { role, members } : null;
    })
    .filter(Boolean);
};

const sanitizeProjectRelations = (relations) =>
  Array.isArray(relations)
    ? relations
        .map((relation) => ({
          relation: safeString(relation?.relation),
          title: safeString(relation?.title),
          format: safeString(relation?.format),
          status: safeString(relation?.status),
          image: safeString(relation?.image),
          anilistId: Number.isFinite(Number(relation?.anilistId))
            ? Number(relation.anilistId)
            : undefined,
          projectId: safeString(relation?.projectId) || undefined,
        }))
        .filter((relation) => relation.title || relation.image || relation.projectId)
    : [];

export const toPublicBootstrapProject = (project) => ({
  id: safeString(project?.id),
  anilistId: Number.isFinite(Number(project?.anilistId)) ? Number(project.anilistId) : null,
  title: safeString(project?.title),
  titleOriginal: safeString(project?.titleOriginal),
  titleEnglish: safeString(project?.titleEnglish),
  synopsis: safeString(project?.synopsis),
  description: safeString(project?.description),
  type: safeString(project?.type),
  status: safeString(project?.status),
  year: safeString(project?.year),
  tags: safeStringArray(project?.tags),
  genres: safeStringArray(project?.genres),
  cover: safeString(project?.cover),
  coverAlt: safeString(project?.coverAlt),
  banner: safeString(project?.banner),
  bannerAlt: safeString(project?.bannerAlt),
  season: safeString(project?.season),
  schedule: safeString(project?.schedule),
  rating: safeString(project?.rating),
  country: safeString(project?.country),
  source: safeString(project?.source),
  heroImageUrl: safeString(project?.heroImageUrl),
  heroImageAlt: safeString(project?.heroImageAlt),
  heroLogoUrl: safeString(project?.heroLogoUrl),
  heroLogoAlt: safeString(project?.heroLogoAlt),
  forceHero: Boolean(project?.forceHero),
  trailerUrl: safeString(project?.trailerUrl),
  studio: safeString(project?.studio),
  animationStudios: safeStringArray(project?.animationStudios),
  episodes: safeString(project?.episodes),
  producers: safeStringArray(project?.producers),
  score: Number.isFinite(Number(project?.score)) ? Number(project.score) : null,
  startDate: safeString(project?.startDate),
  endDate: safeString(project?.endDate),
  staff: sanitizeStaffEntries(project?.staff),
  animeStaff: sanitizeStaffEntries(project?.animeStaff),
  relations: sanitizeProjectRelations(project?.relations),
  readerConfig: project?.readerConfig,
  volumeEntries: sanitizeVolumeEntries(project?.volumeEntries),
  volumeCovers: sanitizeVolumeCovers(project?.volumeCovers),
  episodeDownloads: sanitizeEpisodeDownloads(project?.episodeDownloads),
  views: toSafeNonNegativeInt(project?.views),
  viewsDaily: sanitizeViewsDaily(project?.viewsDaily),
  commentsCount: toSafeNonNegativeInt(project?.commentsCount),
});

export const toPublicBootstrapPost = (post) => ({
  id: safeString(post?.id),
  slug: safeString(post?.slug),
  title: safeString(post?.title),
  excerpt: safeString(post?.excerpt),
  author: safeString(post?.author),
  publishedAt: safeString(post?.publishedAt),
  coverImageUrl: safeString(post?.coverImageUrl),
  coverAlt: safeString(post?.coverAlt),
  projectId: safeString(post?.projectId),
  tags: safeStringArray(post?.tags),
});

export const toPublicBootstrapPostDetail = (post) => ({
  ...toPublicBootstrapPost(post),
  views: toSafeNonNegativeInt(post?.views),
  commentsCount: toSafeNonNegativeInt(post?.commentsCount),
  content: safeString(post?.content),
  contentFormat: String(post?.contentFormat || "").trim() === "lexical" ? "lexical" : undefined,
  seoTitle: post?.seoTitle ? safeString(post?.seoTitle) : null,
  seoDescription: post?.seoDescription ? safeString(post?.seoDescription) : null,
});

export const toPublicBootstrapUpdate = (update) => ({
  id: safeString(update?.id),
  projectId: safeString(update?.projectId),
  projectTitle: safeString(update?.projectTitle),
  episodeNumber: Number.isFinite(Number(update?.episodeNumber)) ? Number(update.episodeNumber) : 0,
  volume: Number.isFinite(Number(update?.volume)) ? Number(update.volume) : undefined,
  kind: safeString(update?.kind),
  reason: safeString(update?.reason),
  updatedAt: safeString(update?.updatedAt),
  image: safeString(update?.image),
  unit: safeString(update?.unit),
});

const sanitizeFavoriteWorksByCategory = (favoriteWorks) => {
  if (!favoriteWorks || typeof favoriteWorks !== "object" || Array.isArray(favoriteWorks)) {
    return {};
  }
  return {
    manga: safeStringArray(favoriteWorks.manga),
    anime: safeStringArray(favoriteWorks.anime),
  };
};

export const toPublicBootstrapTeamMember = (member) => ({
  id: safeString(member?.id),
  name: safeString(member?.name),
  phrase: safeString(member?.phrase),
  bio: safeString(member?.bio),
  avatarUrl: safeString(member?.avatarUrl),
  avatarDisplay: safeString(member?.avatarDisplay),
  socials: safeTeamSocials(member?.socials),
  favoriteWorks: sanitizeFavoriteWorksByCategory(member?.favoriteWorks),
  permissions: safeStringArray(member?.permissions),
  roles: safeStringArray(member?.roles),
  isAdmin: Boolean(member?.isAdmin),
  status: safeString(member?.status),
  order: Number.isFinite(Number(member?.order)) ? Number(member.order) : undefined,
  accessRole: safeString(member?.accessRole),
});

export const toPublicBootstrapTeamLinkType = (item) => ({
  id: safeString(item?.id),
  label: safeString(item?.label),
  icon: safeString(item?.icon),
});

export const normalizePublicTagTranslations = (translations) => ({
  tags:
    translations?.tags && typeof translations.tags === "object" && !Array.isArray(translations.tags)
      ? translations.tags
      : {},
  genres:
    translations?.genres &&
    typeof translations.genres === "object" &&
    !Array.isArray(translations.genres)
      ? translations.genres
      : {},
  staffRoles:
    translations?.staffRoles &&
    typeof translations.staffRoles === "object" &&
    !Array.isArray(translations.staffRoles)
      ? translations.staffRoles
      : {},
});

export const buildPublicBootstrapPayload = ({
  settings,
  pages,
  projects,
  inProgressItems,
  posts,
  updates,
  teamMembers,
  teamLinkTypes,
  tagTranslations,
  currentPostDetail,
  generatedAt,
  payloadMode = "full",
}) => ({
  settings: settings && typeof settings === "object" ? settings : {},
  pages: pages && typeof pages === "object" && !Array.isArray(pages) ? pages : {},
  projects: Array.isArray(projects) ? projects.map(toPublicBootstrapProject) : [],
  inProgressItems: sanitizeInProgressItems(inProgressItems),
  posts: Array.isArray(posts) ? posts.map(toPublicBootstrapPost) : [],
  updates: Array.isArray(updates) ? updates.map(toPublicBootstrapUpdate) : [],
  teamMembers: Array.isArray(teamMembers) ? teamMembers.map(toPublicBootstrapTeamMember) : [],
  teamLinkTypes: Array.isArray(teamLinkTypes)
    ? teamLinkTypes.map(toPublicBootstrapTeamLinkType)
    : [],
  tagTranslations: normalizePublicTagTranslations(tagTranslations),
  currentPostDetail: currentPostDetail ? toPublicBootstrapPostDetail(currentPostDetail) : null,
  generatedAt: safeString(generatedAt || new Date().toISOString()),
  payloadMode: normalizePublicBootstrapPayloadMode(payloadMode),
});

const sanitizeRouteProjectLookup = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((result, [rawKey, rawValue]) => {
    const key = safeString(rawKey).trim();
    const lookupValue = safeString(rawValue).trim();
    if (!key || !lookupValue) {
      return result;
    }
    result[key] = lookupValue;
    return result;
  }, {});
};

const sanitizeRouteRelationProjectCards = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce((result, [rawKey, rawCard]) => {
    const key = safeString(rawKey).trim();
    if (!key || !rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) {
      return result;
    }
    const id = safeString(rawCard.id).trim();
    if (!id) {
      return result;
    }
    result[key] = {
      id,
      title: safeString(rawCard.title),
      cover: safeString(rawCard.cover),
      coverAlt: safeString(rawCard.coverAlt),
    };
    return result;
  }, {});
};

export const buildPublicRoutePayload = ({ kind, generatedAt, ...payload } = {}) => {
  const normalizedKind = safeString(kind).trim().toLowerCase();
  const resolvedGeneratedAt = safeString(generatedAt || new Date().toISOString());

  switch (normalizedKind) {
    case "projects-list":
      return {
        kind: "projects-list",
        generatedAt: resolvedGeneratedAt,
        projects: Array.isArray(payload.projects)
          ? payload.projects.map(toPublicBootstrapProject)
          : [],
        mediaVariants:
          payload.mediaVariants && typeof payload.mediaVariants === "object"
            ? payload.mediaVariants
            : {},
        tagTranslations: normalizePublicTagTranslations(payload.tagTranslations),
      };
    case "project-detail":
      return {
        kind: "project-detail",
        generatedAt: resolvedGeneratedAt,
        project: payload.project ? toPublicBootstrapProject(payload.project) : null,
        revision: safeString(payload.revision),
        mediaVariants:
          payload.mediaVariants && typeof payload.mediaVariants === "object"
            ? payload.mediaVariants
            : {},
        relationProjectLookup: sanitizeRouteProjectLookup(payload.relationProjectLookup),
        relationProjectCards: sanitizeRouteRelationProjectCards(payload.relationProjectCards),
        tagTranslations: normalizePublicTagTranslations(payload.tagTranslations),
      };
    case "project-reading":
      return {
        kind: "project-reading",
        generatedAt: resolvedGeneratedAt,
        project: payload.project ? toPublicBootstrapProject(payload.project) : null,
        chapter:
          payload.chapter && typeof payload.chapter === "object" && !Array.isArray(payload.chapter)
            ? payload.chapter
            : null,
        readerConfig:
          payload.readerConfig && typeof payload.readerConfig === "object"
            ? payload.readerConfig
            : null,
        mediaVariants:
          payload.mediaVariants && typeof payload.mediaVariants === "object"
            ? payload.mediaVariants
            : {},
        tagTranslations: normalizePublicTagTranslations(payload.tagTranslations),
      };
    case "team":
      return {
        kind: "team",
        generatedAt: resolvedGeneratedAt,
        teamMembers: Array.isArray(payload.teamMembers)
          ? payload.teamMembers.map(toPublicBootstrapTeamMember)
          : [],
        teamLinkTypes: Array.isArray(payload.teamLinkTypes)
          ? payload.teamLinkTypes.map(toPublicBootstrapTeamLinkType)
          : [],
        mediaVariants:
          payload.mediaVariants && typeof payload.mediaVariants === "object"
            ? payload.mediaVariants
            : {},
      };
    case "donations":
      return {
        kind: "donations",
        generatedAt: resolvedGeneratedAt,
        pixQrCodeUrl: safeString(payload.pixQrCodeUrl),
        cryptoQrCodeUrls:
          payload.cryptoQrCodeUrls &&
          typeof payload.cryptoQrCodeUrls === "object" &&
          !Array.isArray(payload.cryptoQrCodeUrls)
            ? Object.entries(payload.cryptoQrCodeUrls).reduce((result, [rawKey, rawValue]) => {
                const key = safeString(rawKey).trim();
                const value = safeString(rawValue).trim();
                if (!key || !value) {
                  return result;
                }
                result[key] = value;
                return result;
              }, {})
            : {},
      };
    default:
      return null;
  }
};
