import { resolvePublishedEpisodeLookup } from "../../lib/project-episodes.js";
import { resolveProjectEpisodeContentFormat } from "../../../shared/project-reader.js";

const serializePublicProjectListItem = (project) => ({
  id: project.id,
  title: project.title,
  titleOriginal: project.titleOriginal,
  titleEnglish: project.titleEnglish,
  synopsis: project.synopsis,
  description: project.description,
  type: project.type,
  status: project.status,
  year: project.year,
  studio: project.studio,
  animationStudios: project.animationStudios,
  episodes: project.episodes,
  tags: project.tags,
  genres: project.genres,
  cover: project.cover,
  coverAlt: project.coverAlt,
  banner: project.banner,
  bannerAlt: project.bannerAlt,
  season: project.season,
  schedule: project.schedule,
  rating: project.rating,
  country: project.country,
  source: project.source,
  producers: project.producers,
  score: project.score,
  startDate: project.startDate,
  endDate: project.endDate,
  relations: project.relations,
  staff: project.staff,
  animeStaff: project.animeStaff,
  trailerUrl: project.trailerUrl,
  forceHero: project.forceHero,
  heroImageUrl: project.heroImageUrl,
  heroImageAlt: project.heroImageAlt,
  heroLogoUrl: project.heroLogoUrl,
  heroLogoAlt: project.heroLogoAlt,
  volumeEntries: project.volumeEntries,
  volumeCovers: project.volumeCovers,
  episodeDownloads: project.episodeDownloads,
  views: project.views,
  commentsCount: project.commentsCount,
});

const buildPublicProjectsPayload = ({
  buildPublicMediaVariants,
  limit,
  page,
  projects,
  usePagination,
} = {}) => {
  const serializedProjects = projects.map(serializePublicProjectListItem);
  const payload = !usePagination
    ? { projects: serializedProjects }
    : {
        projects: serializedProjects.slice((page - 1) * limit, (page - 1) * limit + limit),
        page,
        limit,
        total: serializedProjects.length,
      };

  return {
    ...payload,
    mediaVariants: buildPublicMediaVariants(payload.projects),
  };
};

const buildRelationProjectCards = (projects, relations) => {
  const relationKeys = new Set();
  (Array.isArray(relations) ? relations : []).forEach((relation) => {
    const projectId = String(relation?.projectId || "").trim();
    const anilistId = String(relation?.anilistId || "").trim();
    if (projectId) {
      relationKeys.add(projectId);
    }
    if (anilistId) {
      relationKeys.add(anilistId);
    }
  });
  if (relationKeys.size === 0) {
    return {};
  }
  return (Array.isArray(projects) ? projects : []).reduce((result, project) => {
    const projectId = String(project?.id || "").trim();
    const anilistId = String(project?.anilistId || "").trim();
    if (!projectId) {
      return result;
    }
    const card = {
      id: projectId,
      title: String(project?.title || ""),
      cover: String(project?.cover || ""),
      coverAlt: String(project?.coverAlt || ""),
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

const serializePublicProjectDetail = (
  project,
  { resolveProjectReaderConfig, siteSettings } = {},
) => {
  const { discordRoleId: _discordRoleId, ...projectWithoutDiscordRoleId } = project;
  return {
    ...projectWithoutDiscordRoleId,
    readerConfig: resolveProjectReaderConfig({
      projectType: project?.type,
      siteSettings,
      projectReaderConfig: project?.readerConfig,
    }),
  };
};

const serializePublicProjectChapter = ({
  chapter,
  contentFormat,
  deriveChapterSynopsis,
  hasProjectEpisodePages,
  normalizedPages,
  pageCount,
} = {}) => ({
  number: chapter.number,
  volume: chapter.volume,
  title: chapter.title,
  entryKind:
    String(chapter.entryKind || "")
      .trim()
      .toLowerCase() === "extra"
      ? "extra"
      : "main",
  entrySubtype: String(chapter.entrySubtype || "").trim(),
  readingOrder: Number.isFinite(Number(chapter.readingOrder))
    ? Number(chapter.readingOrder)
    : undefined,
  displayLabel: String(chapter.displayLabel || "").trim(),
  synopsis: deriveChapterSynopsis(chapter),
  releaseDate: chapter.releaseDate || "",
  updatedAt: chapter.chapterUpdatedAt || chapter.updatedAt || "",
  coverImageUrl: chapter.coverImageUrl || normalizedPages[0]?.imageUrl || "",
  coverImageAlt: chapter.coverImageAlt || "",
  content: contentFormat === "lexical" ? chapter.content || "" : "",
  contentFormat,
  pages: normalizedPages,
  pageCount,
  hasPages: hasProjectEpisodePages({
    ...chapter,
    contentFormat,
    pages: normalizedPages,
    pageCount,
  }),
});

const resolvePublishedPublicProjectChapter = ({
  chapterNumber,
  deriveChapterSynopsis,
  getProjectEpisodePageCount,
  hasProjectEpisodePages,
  normalizeProjectEpisodeContentFormat,
  normalizeProjectEpisodePages,
  project,
  volume,
} = {}) => {
  const chapterLookup = resolvePublishedEpisodeLookup(project, chapterNumber, volume);
  if (!chapterLookup.ok) {
    return chapterLookup;
  }

  const chapter = chapterLookup.episode;
  const normalizedPages = normalizeProjectEpisodePages(chapter?.pages);
  const contentFormat = resolveProjectEpisodeContentFormat({
    contentFormat: chapter?.contentFormat,
    episode: chapter,
    pages: normalizedPages,
    projectType: project?.type,
  });
  const pageCount = getProjectEpisodePageCount({
    ...chapter,
    contentFormat,
    pages: normalizedPages,
  });

  return {
    ...chapterLookup,
    chapter,
    chapterPayload: serializePublicProjectChapter({
      chapter,
      contentFormat,
      deriveChapterSynopsis,
      hasProjectEpisodePages,
      normalizedPages,
      pageCount,
    }),
    contentFormat,
    normalizedPages,
    pageCount,
  };
};

export const registerPublicProjectRoutes = ({
  PRIMARY_APP_ORIGIN,
  PUBLIC_READ_CACHE_TAGS,
  PUBLIC_READ_CACHE_TTL_MS,
  app,
  appendAnalyticsEvent,
  buildProjectOgRevision,
  buildPublicMediaVariants,
  canRegisterPollVote,
  canRegisterView,
  deriveChapterSynopsis,
  getRequestIp,
  getProjectEpisodePageCount,
  getPublicReadableProjects,
  getPublicVisibleProjects,
  hasProjectEpisodePages,
  incrementProjectViews,
  loadProjects,
  loadSiteSettings,
  loadTagTranslations,
  normalizeProjectEpisodeContentFormat,
  normalizeProjectEpisodePages,
  normalizeProjects,
  readPublicCachedJson,
  resolveMetaImageVariantUrl,
  resolveProjectReaderConfig,
  updateLexicalPollVotes,
  writeProjects,
  writePublicCachedJson,
} = {}) => {
  app.get("/api/public/projects", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const cached = readPublicCachedJson(req);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.status(cached.statusCode).json(cached.payload);
    }
    const limitRaw = Number(req.query.limit);
    const pageRaw = Number(req.query.page);
    const usePagination = Number.isFinite(limitRaw) || Number.isFinite(pageRaw);
    const limit = usePagination ? Math.min(Math.max(limitRaw || 20, 1), 200) : null;
    const page = usePagination ? Math.max(pageRaw || 1, 1) : null;
    const payload = buildPublicProjectsPayload({
      buildPublicMediaVariants,
      limit,
      page,
      projects: getPublicVisibleProjects(),
      usePagination,
    });
    writePublicCachedJson(req, payload, {
      ttlMs: PUBLIC_READ_CACHE_TTL_MS,
      tags: [PUBLIC_READ_CACHE_TAGS.PROJECTS],
    });
    res.setHeader("X-Cache", "MISS");
    return res.json(payload);
  });

  app.get("/api/public/projects/:id", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const id = String(req.params.id || "");
    const projects = getPublicVisibleProjects();
    const project = projects.find((item) => item.id === id);
    if (!project) {
      return res.status(404).json({ error: "not_found" });
    }
    const settings = loadSiteSettings();
    const projectPayload = serializePublicProjectDetail(project, {
      resolveProjectReaderConfig,
      siteSettings: settings,
    });
    const relationProjectCards = buildRelationProjectCards(projects, project?.relations);
    const translations = loadTagTranslations();
    return res.json({
      project: projectPayload,
      translations: {
        tags:
          translations?.tags &&
          typeof translations.tags === "object" &&
          !Array.isArray(translations.tags)
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
      },
      revision: buildProjectOgRevision({
        project: projectPayload,
        settings,
        translations,
        origin: PRIMARY_APP_ORIGIN,
        resolveVariantUrl: resolveMetaImageVariantUrl,
      }),
      relationProjectCards,
      mediaVariants: buildPublicMediaVariants([
        projectPayload,
        Object.values(relationProjectCards),
      ]),
    });
  });

  app.post("/api/public/projects/:id/view", async (req, res) => {
    const ip = typeof getRequestIp === "function" ? getRequestIp(req) : String(req?.ip || "");
    if (!(await canRegisterView(ip))) {
      return res.status(429).json({ error: "rate_limited" });
    }
    const id = String(req.params.id || "");
    const projects = normalizeProjects(loadProjects());
    const project = projects.find((item) => item.id === id);
    if (!project || project.deletedAt) {
      return res.status(404).json({ error: "not_found" });
    }
    const updated = incrementProjectViews(id);
    appendAnalyticsEvent(req, {
      eventType: "view",
      resourceType: "project",
      resourceId: project.id,
      meta: {
        action: "view",
        resourceType: "project",
        resourceId: project.id,
      },
    });
    return res.json({ views: updated?.views ?? project.views ?? 0 });
  });

  app.get("/api/public/projects/:id/chapters/:number", (req, res) => {
    const id = String(req.params.id || "");
    const chapterNumber = Number(req.params.number);
    const volume = req.query.volume ? Number(req.query.volume) : null;
    if (!Number.isFinite(chapterNumber)) {
      return res.status(400).json({ error: "invalid_chapter" });
    }
    const projects = getPublicReadableProjects();
    const project = projects.find((item) => item.id === id);
    if (!project) {
      return res.status(404).json({ error: "not_found" });
    }
    const chapterResult = resolvePublishedPublicProjectChapter({
      chapterNumber,
      deriveChapterSynopsis,
      getProjectEpisodePageCount,
      hasProjectEpisodePages,
      normalizeProjectEpisodeContentFormat,
      normalizeProjectEpisodePages,
      project,
      volume,
    });
    if (!chapterResult.ok) {
      return res.status(chapterResult.statusCode).json({
        error: chapterResult.error,
      });
    }
    const settings = loadSiteSettings();
    return res.json({
      chapter: chapterResult.chapterPayload,
      readerConfig: resolveProjectReaderConfig({
        projectType: project?.type,
        siteSettings: settings,
        projectReaderConfig: project?.readerConfig,
      }),
    });
  });

  app.post("/api/public/projects/:id/chapters/:number/polls/vote", async (req, res) => {
    const ip = typeof getRequestIp === "function" ? getRequestIp(req) : String(req?.ip || "");
    if (!(await canRegisterPollVote(ip))) {
      return res.status(429).json({ error: "rate_limited" });
    }
    const id = String(req.params.id || "");
    const chapterNumber = Number(req.params.number);
    const volume = req.query.volume ? Number(req.query.volume) : null;
    const { optionUid, voterId, checked, question } = req.body || {};
    if (!Number.isFinite(chapterNumber)) {
      return res.status(400).json({ error: "invalid_chapter" });
    }
    if (!optionUid || !voterId) {
      return res.status(400).json({ error: "invalid_payload" });
    }
    const projects = normalizeProjects(loadProjects());
    const projectIndex = projects.findIndex((item) => item.id === id);
    if (projectIndex === -1) {
      return res.status(404).json({ error: "not_found" });
    }
    const project = projects[projectIndex];
    const chapterResult = resolvePublishedPublicProjectChapter({
      chapterNumber,
      deriveChapterSynopsis,
      getProjectEpisodePageCount,
      hasProjectEpisodePages,
      normalizeProjectEpisodeContentFormat,
      normalizeProjectEpisodePages,
      project,
      volume,
    });
    if (!chapterResult.ok) {
      return res.status(chapterResult.statusCode).json({
        error: chapterResult.error,
      });
    }
    const chapterIndex = chapterResult.index;
    const chapter = chapterResult.chapter;
    const result = updateLexicalPollVotes(chapter.content, {
      question,
      optionUid,
      voterId,
      checked,
    });
    if (!result.updated || !result.content) {
      return res.status(404).json({ error: "poll_not_found" });
    }
    const updatedChapter = {
      ...chapter,
      content: result.content,
    };
    const updatedEpisodes = [...project.episodeDownloads];
    updatedEpisodes[chapterIndex] = updatedChapter;
    projects[projectIndex] = {
      ...project,
      episodeDownloads: updatedEpisodes,
    };
    writeProjects(projects);
    return res.json({ ok: true });
  });
};

export default registerPublicProjectRoutes;
