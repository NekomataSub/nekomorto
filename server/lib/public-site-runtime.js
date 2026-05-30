import {
  getProjectEpisodePageCount,
  hasProjectEpisodePages,
  normalizeProjectEpisodePages,
  resolveProjectEpisodeContentFormat,
  resolveProjectReaderConfig,
} from "../../shared/project-reader.js";
import { deriveChapterSynopsis } from "./chapter-synopsis.js";
import {
  PUBLIC_ROUTE_KIND_DONATIONS,
  PUBLIC_ROUTE_KIND_POST,
  PUBLIC_ROUTE_KIND_PROJECT_DETAIL,
  PUBLIC_ROUTE_KIND_PROJECT_READING,
  PUBLIC_ROUTE_KIND_PROJECTS_LIST,
  PUBLIC_ROUTE_KIND_TEAM,
  resolvePublicRouteKind,
} from "../../shared/public-route-registry.js";
import { resolvePublicPathIndexability } from "./public-indexability.js";
import { buildPublicSeoSnapshot } from "./public-seo-snapshot.js";

export const PUBLIC_BOOTSTRAP_MODE_FULL = "full";
export const PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME = "critical-home";
export const PUBLIC_BOOTSTRAP_MODE_SHELL = "shell";

const REQUIRED_DEPENDENCY_KEYS = [
  "buildProjectOgRevision",
  "buildPublicBootstrapPayload",
  "buildPublicRoutePayload",
  "buildPublicMediaVariants",
  "buildPublicPostDetail",
  "buildPublicTeamMembers",
  "buildUserPayload",
  "createGuid",
  "createSlug",
  "extractLocalStylesheetHrefs",
  "getPublicInProgressItems",
  "getPublicVisiblePosts",
  "getPublicVisibleProjects",
  "getPublicVisibleUpdates",
  "injectBootstrapGlobals",
  "injectHomeHeroShell",
  "injectPreloadLinks",
  "loadLinkTypes",
  "loadPages",
  "loadSiteSettings",
  "loadTagTranslations",
  "primaryAppOrigin",
  "resolveHomeHeroPreloadFromSlide",
  "resolveMetaImageVariantUrl",
  "resolvePublicDonationsRoutePayload",
  "resolvePublicRouteModulePreloads",
  "resolvePostCover",
  "resolvePublicPostCoverPreload",
  "resolveProjectPosterPreload",
  "resolvePublicProjectsListPreloads",
  "resolvePublicReaderHeroPreload",
  "resolvePublicTeamAvatarPreload",
  "sitemapStaticPublicPaths",
  "stripHtml",
];

const assertRequiredDependencies = (dependencies = {}) => {
  const missing = REQUIRED_DEPENDENCY_KEYS.filter((key) => dependencies[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `[public-site-runtime] missing required dependencies: ${missing.sort().join(", ")}`,
    );
  }
};

export const createPublicSiteRuntime = (dependencies = {}) => {
  assertRequiredDependencies(dependencies);

  const {
    buildPublicBootstrapPayload,
    buildProjectOgRevision,
    buildPublicRoutePayload,
    buildPublicMediaVariants,
    buildPublicPostDetail,
    buildPublicTeamMembers,
    buildUserPayload,
    createGuid,
    createSlug,
    extractLocalStylesheetHrefs,
    getPublicInProgressItems,
    getPublicReadableProjects = dependencies.getPublicVisibleProjects,
    getPublicVisiblePosts,
    getPublicVisibleProjects,
    getPublicVisibleUpdates,
    injectBootstrapGlobals,
    injectHomeHeroShell,
    injectPreloadLinks,
    loadLinkTypes,
    loadPages,
    loadSiteSettings,
    loadTagTranslations,
    primaryAppOrigin,
    resolveHomeHeroPreloadFromSlide,
    resolveMetaImageVariantUrl,
    resolvePublicDonationsRoutePayload,
    resolvePublicRouteModulePreloads,
    resolvePostCover,
    resolvePublicPostCoverPreload,
    resolveProjectPosterPreload,
    resolvePublicProjectsListPreloads,
    resolvePublicReaderHeroPreload,
    resolvePublicTeamAvatarPreload,
    sitemapStaticPublicPaths,
    stripHtml,
  } = dependencies;

  const stripAndTruncateRssText = (value, max = 280) => {
    const text = stripHtml(String(value || ""))
      .replace(/\s+/g, " ")
      .trim();
    if (!text) {
      return "";
    }
    if (text.length <= max) {
      return text;
    }
    return `${text.slice(0, Math.max(0, max - 3)).trim()}...`;
  };

  const buildPublicSitemapEntries = () => {
    const settings = loadSiteSettings();
    const pages = resolvePublicPathIndexability({
      pathname: "/",
      pages: loadPages(),
    }).pages;
    const siteUpdatedAt = String(settings?.updatedAt || "").trim();
    const entries = [
      ...sitemapStaticPublicPaths
        .filter(
          (pathname) =>
            resolvePublicPathIndexability({
              pathname,
              pages,
            }).shouldIndex,
        )
        .map((pathname) => ({
          loc: `${primaryAppOrigin}${pathname}`,
          lastmod: siteUpdatedAt || null,
          changefreq: pathname === "/" ? "daily" : pathname === "/projetos" ? "weekly" : "monthly",
          priority: pathname === "/" ? 1 : pathname === "/projetos" ? 0.9 : 0.7,
        })),
      ...getPublicVisibleProjects().map((project) => ({
        loc: `${primaryAppOrigin}/projeto/${project.id}`,
        lastmod: project.updatedAt || project.createdAt || null,
        changefreq: "weekly",
        priority: 0.8,
      })),
      ...getPublicVisiblePosts().map((post) => ({
        loc: `${primaryAppOrigin}/postagem/${post.slug}`,
        lastmod: post.updatedAt || post.publishedAt || null,
        changefreq: "monthly",
        priority: 0.7,
      })),
    ];
    const seen = new Set();
    return entries.filter((entry) => {
      if (!entry.loc || seen.has(entry.loc)) {
        return false;
      }
      seen.add(entry.loc);
      return true;
    });
  };

  const buildPostsRssItems = () =>
    getPublicVisiblePosts()
      .slice(0, 50)
      .map((post) => {
        const link = `${primaryAppOrigin}/postagem/${post.slug}`;
        return {
          title: post.title || "Postagem",
          link,
          guid: link,
          pubDate: post.publishedAt,
          description: stripAndTruncateRssText(
            post.seoDescription || post.excerpt || post.content || "",
          ),
          categories: Array.isArray(post.tags) ? post.tags.slice(0, 5) : [],
        };
      });

  const buildLaunchesRssItems = () => {
    const publicProjects = new Map(
      getPublicVisibleProjects().map((project) => [String(project.id), project]),
    );
    return getPublicVisibleUpdates()
      .filter((update) => {
        const kind = String(update?.kind || "")
          .trim()
          .toLowerCase();
        return kind.startsWith("lan") || kind === "ajuste";
      })
      .slice(0, 50)
      .map((update) => {
        const projectId = String(update?.projectId || "").trim();
        const project = publicProjects.get(projectId);
        const projectTitle = String(update?.projectTitle || project?.title || "Projeto");
        const unit = String(update?.unit || "Capítulo").trim() || "Capítulo";
        const isExtraUnit = unit.toLowerCase() === "extra";
        const episodeNumber = Number.isFinite(Number(update?.episodeNumber))
          ? Number(update.episodeNumber)
          : null;
        const kind = String(update?.kind || "Atualização").trim() || "Atualização";
        const link = project ? `${primaryAppOrigin}/projeto/${project.id}` : primaryAppOrigin;
        return {
          title: `${kind}: ${projectTitle}${episodeNumber !== null ? ` - ${unit}${isExtraUnit ? "" : ` ${episodeNumber}`}` : ""}`,
          link,
          guid: `${link}#update-${String(update?.id || createGuid())}`,
          pubDate: String(update?.updatedAt || new Date().toISOString()),
          description: stripAndTruncateRssText(
            String(update?.reason || `${kind} em ${projectTitle}`),
            320,
          ),
          categories: [kind],
        };
      });
  };

  const sendXmlResponse = (res, xml, contentType) => {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return res.status(200).send(xml);
  };

  const sortPublicLaunchUpdates = (updates) =>
    [...(Array.isArray(updates) ? updates : [])]
      .filter((update) => {
        const kind = String(update?.kind || "")
          .trim()
          .toLowerCase();
        return kind === "lançamento" || kind === "lancamento";
      })
      .sort(
        (a, b) => new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime(),
      );

  const buildPublicHeroSlides = (projects, updates) => {
    const projectList = Array.isArray(projects) ? projects : [];
    const launchUpdates = sortPublicLaunchUpdates(updates);
    const latestLaunchByProject = new Map();
    launchUpdates.forEach((update) => {
      const projectId = String(update?.projectId || "").trim();
      if (!projectId || latestLaunchByProject.has(projectId)) {
        return;
      }
      latestLaunchByProject.set(projectId, String(update?.updatedAt || ""));
    });

    const projectsById = new Map(
      projectList.map((project) => [String(project?.id || ""), project]),
    );
    const resultIds = new Set();
    const slides = [];
    const maxSlides = 5;
    const epoch = "1970-01-01T00:00:00.000Z";
    const createSlide = (project, updatedAt) => {
      const projectId = String(project?.id || "");
      if (!projectId || resultIds.has(projectId)) {
        return null;
      }
      const image =
        String(project?.heroImageUrl || "").trim() ||
        String(project?.banner || "").trim() ||
        String(project?.cover || "").trim() ||
        "";
      if (!image) {
        return null;
      }
      return {
        id: projectId,
        title: String(project?.title || "").trim(),
        description: String(project?.synopsis || project?.description || ""),
        image,
        projectId,
        trailerUrl: String(project?.trailerUrl || "").trim(),
        format: String(project?.type || "").trim(),
        status: String(project?.status || "").trim(),
        heroLogoUrl: String(project?.heroLogoUrl || "").trim(),
        heroLogoAlt: String(project?.heroLogoAlt || "").trim(),
        updatedAt: updatedAt || epoch,
      };
    };

    const orderedProjects = projectList
      .map((project, index) => {
        const projectId = String(project?.id || "");
        const updatedAt = latestLaunchByProject.get(projectId) || "";
        const time = updatedAt ? new Date(updatedAt).getTime() : 0;
        return { project, index, updatedAt, time };
      })
      .sort((a, b) => {
        if (b.time !== a.time) {
          return b.time - a.time;
        }
        return a.index - b.index;
      });

    orderedProjects.forEach((item) => {
      const slide = createSlide(item.project, item.updatedAt);
      if (!slide) {
        return;
      }
      if (slides.length < maxSlides) {
        slides.push(slide);
        resultIds.add(slide.id);
        return;
      }
      if (item.project?.forceHero !== true) {
        return;
      }
      slides.push(slide);
      resultIds.add(slide.id);
      const removeIndexFromEnd = [...slides]
        .reverse()
        .findIndex((candidate) => projectsById.get(candidate.id)?.forceHero !== true);
      if (removeIndexFromEnd === -1) {
        const removed = slides.shift();
        if (removed) {
          resultIds.delete(removed.id);
        }
        return;
      }
      const removeIndex = slides.length - 1 - removeIndexFromEnd;
      const [removed] = slides.splice(removeIndex, 1);
      if (removed) {
        resultIds.delete(removed.id);
      }
    });

    return slides;
  };

  const buildPublicHomeHeroPayload = (projects, updates) => {
    const slides = buildPublicHeroSlides(projects, updates);
    if (slides.length === 0) {
      return null;
    }
    const latestSlide = slides.reduce((latest, current) => {
      if (!latest) {
        return current;
      }
      return new Date(current.updatedAt || 0).getTime() > new Date(latest.updatedAt || 0).getTime()
        ? current
        : latest;
    }, slides[0]);
    return {
      initialSlideId: String(slides[0]?.id || "").trim(),
      latestSlideId: String(latestSlide?.id || slides[0]?.id || "").trim(),
      hasMultipleSlides: slides.length > 1,
      slides: slides.map((slide) => ({
        id: String(slide?.id || "").trim(),
        title: String(slide?.title || "").trim(),
        description: String(slide?.description || ""),
        updatedAt: String(slide?.updatedAt || ""),
        image: String(slide?.image || "").trim(),
        projectId: String(slide?.projectId || slide?.id || "").trim(),
        trailerUrl: String(slide?.trailerUrl || "").trim(),
        format: String(slide?.format || "").trim(),
        status: String(slide?.status || "").trim(),
        heroLogoUrl: String(slide?.heroLogoUrl || "").trim(),
        heroLogoAlt: String(slide?.heroLogoAlt || "").trim(),
      })),
    };
  };

  const resolveBootstrapHomeHero = (publicBootstrap) => {
    const candidate = publicBootstrap?.homeHero;
    if (candidate && Array.isArray(candidate.slides) && candidate.slides.length > 0) {
      return candidate;
    }
    return buildPublicHomeHeroPayload(publicBootstrap?.projects, publicBootstrap?.updates);
  };

  const toCriticalHomeProjectPayload = (project) => ({
    id: String(project?.id || "").trim(),
    title: String(project?.title || "").trim(),
    synopsis: String(project?.synopsis || ""),
    description: String(project?.description || ""),
    type: String(project?.type || ""),
    status: String(project?.status || ""),
    tags: Array.isArray(project?.tags) ? project.tags : [],
    cover: String(project?.cover || ""),
    coverAlt: String(project?.coverAlt || ""),
    banner: String(project?.banner || ""),
    bannerAlt: String(project?.bannerAlt || ""),
    heroImageUrl: String(project?.heroImageUrl || ""),
    heroImageAlt: String(project?.heroImageAlt || ""),
    heroLogoUrl: String(project?.heroLogoUrl || ""),
    heroLogoAlt: String(project?.heroLogoAlt || ""),
    forceHero: project?.forceHero === true,
    trailerUrl: String(project?.trailerUrl || ""),
    volumeEntries: [],
    volumeCovers: [],
    episodeDownloads: [],
    views: Number.isFinite(Number(project?.views)) ? Math.max(0, Number(project.views)) : 0,
    viewsDaily:
      project?.viewsDaily && typeof project.viewsDaily === "object" ? project.viewsDaily : {},
  });

  const toCriticalHomeUpdatePayload = (update) => ({
    id: String(update?.id || "").trim(),
    projectId: String(update?.projectId || "").trim(),
    projectTitle: String(update?.projectTitle || ""),
    episodeNumber: Number.isFinite(Number(update?.episodeNumber))
      ? Number(update.episodeNumber)
      : 0,
    volume: Number.isFinite(Number(update?.volume)) ? Number(update.volume) : undefined,
    kind: String(update?.kind || ""),
    reason: String(update?.reason || ""),
    updatedAt: String(update?.updatedAt || ""),
    image: String(update?.image || ""),
    unit: String(update?.unit || ""),
  });

  const toCriticalHomePagesPayload = (pages) => ({
    home:
      pages?.home && typeof pages.home === "object"
        ? {
            shareImage: String(pages.home.shareImage || ""),
            shareImageAlt: String(pages.home.shareImageAlt || ""),
          }
        : { shareImage: "", shareImageAlt: "" },
  });

  const buildCriticalHomeBootstrapPayload = ({
    settings,
    pages,
    projects,
    inProgressItems,
    updates,
    generatedAt,
  }) => {
    const heroSlides = buildPublicHeroSlides(projects, updates);
    const homeHero = buildPublicHomeHeroPayload(projects, updates);
    const heroProjectIds = new Set(heroSlides.map((slide) => String(slide?.id || "").trim()));
    const criticalProjects = projects
      .filter((project) => heroProjectIds.has(String(project?.id || "").trim()))
      .map((project) => toCriticalHomeProjectPayload(project));
    const criticalUpdates = sortPublicLaunchUpdates(updates)
      .filter((update) => heroProjectIds.has(String(update?.projectId || "").trim()))
      .slice(0, Math.max(1, heroProjectIds.size))
      .map((update) => toCriticalHomeUpdatePayload(update));

    const payload = buildPublicBootstrapPayload({
      settings,
      pages: toCriticalHomePagesPayload(pages),
      projects: criticalProjects,
      inProgressItems,
      posts: [],
      updates: criticalUpdates,
      tagTranslations: {
        tags: {},
        genres: {},
        staffRoles: {},
      },
      generatedAt,
      payloadMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });
    payload.mediaVariants = buildPublicMediaVariants([
      payload.projects,
      payload.updates,
      payload.pages,
      { image: settings?.site?.defaultShareImage || "" },
    ]);
    payload.homeHero = homeHero;
    return payload;
  };

  const buildPublicBootstrapResponsePayload = ({
    settings = loadSiteSettings(),
    pages = loadPages(),
    generatedAt = new Date().toISOString(),
    payloadMode = PUBLIC_BOOTSTRAP_MODE_FULL,
    currentPostDetail = null,
  } = {}) => {
    const normalizedPages = resolvePublicPathIndexability({
      pathname: "/",
      pages,
    }).pages;
    const projects = getPublicVisibleProjects();
    const inProgressItems = getPublicInProgressItems();
    const posts = getPublicVisiblePosts().map((post) => {
      const resolvedCover = resolvePostCover(post);
      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        coverImageUrl: resolvedCover.coverImageUrl,
        coverAlt: resolvedCover.coverAlt,
        excerpt: post.excerpt,
        author: post.author,
        publishedAt: post.publishedAt,
        projectId: post.projectId || "",
        tags: Array.isArray(post.tags) ? post.tags : [],
      };
    });
    const updates = getPublicVisibleUpdates().slice(0, 10);
    const safePayloadMode =
      payloadMode === PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME
        ? PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME
        : PUBLIC_BOOTSTRAP_MODE_FULL;

    if (safePayloadMode === PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME) {
      return buildCriticalHomeBootstrapPayload({
        settings,
        pages,
        projects,
        inProgressItems,
        updates,
        generatedAt,
      });
    }

    const teamMembers = buildPublicTeamMembers();
    const teamLinkTypes = loadLinkTypes();
    const payload = buildPublicBootstrapPayload({
      settings,
      pages: normalizedPages,
      projects,
      inProgressItems,
      posts,
      updates,
      teamMembers,
      teamLinkTypes,
      tagTranslations: loadTagTranslations(),
      currentPostDetail,
      generatedAt,
      payloadMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });
    payload.mediaVariants = buildPublicMediaVariants(
      [
        payload.projects,
        payload.posts,
        payload.updates,
        payload.teamMembers,
        payload.teamLinkTypes,
        payload.pages,
        { image: settings?.site?.defaultShareImage || "" },
      ],
      {
        allowPrivateUrls: payload.teamMembers.map((member) => member?.avatarUrl).filter(Boolean),
      },
    );
    payload.homeHero = buildPublicHomeHeroPayload(payload.projects, payload.updates);
    return payload;
  };

  const buildShellPublicBootstrapPayload = ({
    settings = loadSiteSettings(),
    pages = loadPages(),
    generatedAt = new Date().toISOString(),
  } = {}) => {
    const normalizedPages = resolvePublicPathIndexability({
      pathname: "/",
      pages,
    }).pages;
    const payload = buildPublicBootstrapPayload({
      settings,
      pages: normalizedPages,
      projects: [],
      inProgressItems: [],
      posts: [],
      updates: [],
      teamMembers: [],
      teamLinkTypes: [],
      tagTranslations: {
        tags: {},
        genres: {},
        staffRoles: {},
      },
      generatedAt,
      payloadMode: PUBLIC_BOOTSTRAP_MODE_SHELL,
    });
    payload.mediaVariants = buildPublicMediaVariants([
      payload.pages,
      { image: settings?.site?.defaultShareImage || "" },
    ]);
    payload.homeHero = null;
    return payload;
  };

  const buildRelationProjectLookup = (projects, relations) => {
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
      if (projectId && relationKeys.has(projectId)) {
        result[projectId] = projectId;
      }
      if (anilistId && relationKeys.has(anilistId)) {
        result[anilistId] = projectId;
      }
      return result;
    }, {});
  };

  const serializeReadingRouteChapter = ({ chapter, project, settings }) => {
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
      number: Number.isFinite(Number(chapter?.number)) ? Number(chapter.number) : 0,
      volume: Number.isFinite(Number(chapter?.volume)) ? Number(chapter.volume) : undefined,
      title: String(chapter?.title || ""),
      entryKind:
        String(chapter?.entryKind || "")
          .trim()
          .toLowerCase() === "extra"
          ? "extra"
          : "main",
      entrySubtype: String(chapter?.entrySubtype || "").trim(),
      readingOrder: Number.isFinite(Number(chapter?.readingOrder))
        ? Number(chapter.readingOrder)
        : undefined,
      displayLabel: String(chapter?.displayLabel || "").trim(),
      synopsis: deriveChapterSynopsis(chapter),
      releaseDate: String(chapter?.releaseDate || ""),
      duration: String(chapter?.duration || ""),
      coverImageUrl: String(chapter?.coverImageUrl || normalizedPages[0]?.imageUrl || ""),
      coverImageAlt: String(chapter?.coverImageAlt || ""),
      sourceType: String(chapter?.sourceType || ""),
      sources: Array.isArray(chapter?.sources) ? chapter.sources : [],
      progressStage: String(chapter?.progressStage || ""),
      completedStages: Array.isArray(chapter?.completedStages) ? chapter.completedStages : [],
      chapterUpdatedAt: String(chapter?.chapterUpdatedAt || chapter?.updatedAt || ""),
      content: contentFormat === "lexical" ? String(chapter?.content || "") : "",
      contentFormat,
      pages: normalizedPages,
      pageCount,
      hasPages: hasProjectEpisodePages({
        ...chapter,
        contentFormat,
        pages: normalizedPages,
        pageCount,
      }),
      hasContent:
        contentFormat === "lexical"
          ? String(chapter?.content || "").trim().length > 0
          : normalizedPages.length > 0,
      readerConfig: resolveProjectReaderConfig({
        projectType: project?.type,
        siteSettings: settings,
        projectReaderConfig: project?.readerConfig,
      }),
    };
  };

  const resolveProjectReadingRoutePayload = ({
    generatedAt,
    routeParams,
    routeQuery,
    settings,
  }) => {
    const projects = getPublicReadableProjects();
    const project = findBootstrapProjectByRouteSlug(projects, routeParams?.id);
    const chapterNumber = Number(routeParams?.chapter);
    if (!project || !Number.isFinite(chapterNumber)) {
      return null;
    }
    const routeVolume = Number(routeQuery?.volume);
    const volume = Number.isFinite(routeVolume) ? routeVolume : undefined;
    const chapter =
      (Array.isArray(project?.episodeDownloads) ? project.episodeDownloads : []).find((entry) => {
        if (Number(entry?.number) !== chapterNumber) {
          return false;
        }
        if (volume === undefined) {
          return true;
        }
        return Number(entry?.volume) === volume;
      }) || null;
    if (!chapter) {
      return null;
    }
    const tagTranslations = loadTagTranslations();
    const chapterPayload = serializeReadingRouteChapter({ chapter, project, settings });
    const projectPayload = {
      ...project,
      readerConfig: chapterPayload.readerConfig,
    };
    return buildPublicRoutePayload({
      kind: "project-reading",
      generatedAt,
      project: projectPayload,
      chapter: chapterPayload,
      readerConfig: chapterPayload.readerConfig,
      tagTranslations,
      mediaVariants: buildPublicMediaVariants([projectPayload, chapterPayload]),
    });
  };

  const buildPublicRouteResponsePayload = async ({
    generatedAt = new Date().toISOString(),
    pages = loadPages(),
    routeQuery = {},
    routeKind,
    routeParams = {},
    settings = loadSiteSettings(),
  } = {}) => {
    switch (routeKind) {
      case PUBLIC_ROUTE_KIND_PROJECTS_LIST: {
        const projects = getPublicVisibleProjects();
        const tagTranslations = loadTagTranslations();
        return buildPublicRoutePayload({
          kind: "projects-list",
          generatedAt,
          projects,
          tagTranslations,
          mediaVariants: buildPublicMediaVariants([projects]),
        });
      }
      case PUBLIC_ROUTE_KIND_PROJECT_DETAIL: {
        const projects = getPublicVisibleProjects();
        const project = findBootstrapProjectByRouteSlug(projects, routeParams?.id);
        if (!project) {
          return null;
        }
        const tagTranslations = loadTagTranslations();
        const projectPayload = { ...project };
        return buildPublicRoutePayload({
          kind: "project-detail",
          generatedAt,
          project: projectPayload,
          revision: buildProjectOgRevision({
            project: projectPayload,
            settings,
            translations: tagTranslations,
            origin: primaryAppOrigin,
            resolveVariantUrl: resolveMetaImageVariantUrl,
          }),
          relationProjectLookup: buildRelationProjectLookup(projects, project?.relations),
          tagTranslations,
          mediaVariants: buildPublicMediaVariants([
            projectPayload,
            projectPayload?.relations || [],
          ]),
        });
      }
      case PUBLIC_ROUTE_KIND_PROJECT_READING:
        return resolveProjectReadingRoutePayload({
          generatedAt,
          routeParams,
          routeQuery,
          settings,
        });
      case PUBLIC_ROUTE_KIND_TEAM: {
        const teamMembers = buildPublicTeamMembers();
        const teamLinkTypes = loadLinkTypes();
        return buildPublicRoutePayload({
          kind: "team",
          generatedAt,
          teamMembers,
          teamLinkTypes,
          mediaVariants: buildPublicMediaVariants([teamMembers, teamLinkTypes], {
            allowPrivateUrls: teamMembers.map((member) => member?.avatarUrl).filter(Boolean),
          }),
        });
      }
      case PUBLIC_ROUTE_KIND_DONATIONS: {
        const normalizedPages = resolvePublicPathIndexability({
          pathname: "/doacoes",
          pages,
        }).pages;
        const merchantName =
          String(settings?.site?.name || settings?.footer?.brandName || "Nekomata").trim() ||
          "Nekomata";
        const donationsRoutePayload = await resolvePublicDonationsRoutePayload({
          donationsPage: normalizedPages?.donations,
          merchantName,
        });
        return buildPublicRoutePayload({
          kind: "donations",
          generatedAt,
          pixQrCodeUrl: donationsRoutePayload?.pixQrCodeUrl || "",
          cryptoQrCodeUrls: donationsRoutePayload?.cryptoQrCodeUrls || {},
        });
      }
      default:
        return null;
    }
  };

  const injectSeoSnapshotMarkup = ({ html, snapshotHtml }) => {
    const snippet = String(snapshotHtml || "").trim();
    const source = String(html || "");
    if (!snippet || source.includes('id="seo-snapshot"')) {
      return source;
    }
    return source.replace('<div id="root"></div>', `${snippet}\n<div id="root"></div>`);
  };

  const isCompleteTeamRoutePayload = (payload) =>
    payload?.kind === "team" &&
    Array.isArray(payload.teamMembers) &&
    Array.isArray(payload.teamLinkTypes) &&
    payload.mediaVariants &&
    typeof payload.mediaVariants === "object";

  const isCompleteDonationsRoutePayload = (payload) =>
    payload?.kind === "donations" &&
    typeof payload.pixQrCodeUrl === "string" &&
    payload.cryptoQrCodeUrls &&
    typeof payload.cryptoQrCodeUrls === "object" &&
    !Array.isArray(payload.cryptoQrCodeUrls);

  const resolveCompleteInstitutionalRoutePayload = async ({
    pathname,
    pages,
    publicRoutePayload,
    settings,
  }) => {
    if (pathname === "/equipe" && !isCompleteTeamRoutePayload(publicRoutePayload)) {
      return buildPublicRouteResponsePayload({
        pages,
        routeKind: PUBLIC_ROUTE_KIND_TEAM,
        settings,
      });
    }
    if (pathname === "/doacoes" && !isCompleteDonationsRoutePayload(publicRoutePayload)) {
      return buildPublicRouteResponsePayload({
        pages,
        routeKind: PUBLIC_ROUTE_KIND_DONATIONS,
        settings,
      });
    }
    return publicRoutePayload ?? null;
  };

  const resolveHomeHeroPreload = (publicBootstrap) => {
    const homeHero = resolveBootstrapHomeHero(publicBootstrap);
    const firstSlide = homeHero?.slides?.[0];
    return resolveHomeHeroPreloadFromSlide({
      imageUrl: firstSlide?.image || "",
      mediaVariants: publicBootstrap?.mediaVariants,
      resolveVariantUrl: resolveMetaImageVariantUrl,
    });
  };

  const findBootstrapProjectByRouteSlug = (projects, routeSlug) => {
    const rawRouteSlug = String(routeSlug || "").trim();
    if (!rawRouteSlug) {
      return null;
    }
    const normalizedRouteSlug = createSlug(rawRouteSlug);
    return (
      (Array.isArray(projects) ? projects : []).find((candidate) => {
        const candidateId = String(candidate?.id || "").trim();
        return (
          candidateId === rawRouteSlug ||
          createSlug(candidateId) === normalizedRouteSlug ||
          createSlug(candidate?.title || "") === normalizedRouteSlug
        );
      }) || null
    );
  };

  const resolveBootstrapReadingHeroImageUrl = ({ project, chapterNumber, volume }) => {
    if (!project || !Number.isFinite(chapterNumber)) {
      return "";
    }
    const episodes = Array.isArray(project?.episodeDownloads) ? project.episodeDownloads : [];
    const matchingEpisode =
      episodes.find((episode) => {
        if (Number(episode?.number) !== chapterNumber) {
          return false;
        }
        if (!Number.isFinite(volume)) {
          return true;
        }
        return Number(episode?.volume) === volume;
      }) || null;
    const resolvedVolume = Number.isFinite(volume)
      ? volume
      : Number.isFinite(Number(matchingEpisode?.volume))
        ? Number(matchingEpisode.volume)
        : undefined;
    const volumeEntry =
      Number.isFinite(resolvedVolume) && Array.isArray(project?.volumeEntries)
        ? project.volumeEntries.find((entry) => Number(entry?.volume) === resolvedVolume) || null
        : null;
    const volumeCover =
      Number.isFinite(resolvedVolume) && Array.isArray(project?.volumeCovers)
        ? project.volumeCovers.find((entry) => Number(entry?.volume) === resolvedVolume) || null
        : null;

    return (
      String(matchingEpisode?.coverImageUrl || "").trim() ||
      String(volumeEntry?.coverImageUrl || "").trim() ||
      String(volumeCover?.coverImageUrl || "").trim() ||
      String(project?.cover || "").trim() ||
      String(project?.heroImageUrl || "").trim() ||
      String(project?.banner || "").trim()
    );
  };

  const escapeHtmlAttribute = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const buildHomeHeroShellCriticalCss = ({ focalObjectPosition } = {}) => `
:root {
  --public-home-hero-height: 100vh;
}
@supports (height: 1svh) {
  :root {
    --public-home-hero-height: 100svh;
  }
}
@supports (height: 1dvh) {
  :root {
    --public-home-hero-height: 100dvh;
  }
}
.public-home-hero-shell.public-home-hero-viewport {
  height: var(--public-home-hero-height);
  min-height: var(--public-home-hero-height);
  max-height: var(--public-home-hero-height);
}
.public-home-hero-shell {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  height: var(--public-home-hero-height);
  min-height: var(--public-home-hero-height);
  overflow: hidden;
  pointer-events: none;
  z-index: 70;
  opacity: 1;
  transition: opacity 180ms ease-out;
  will-change: opacity;
  background: hsl(220 12% 7%);
  isolation: isolate;
}
:root[data-theme-mode="light"] .public-home-hero-shell {
  background: hsl(210 33% 98%);
}
.public-home-hero-shell--exiting {
  opacity: 0;
}
.public-home-hero-shell__image {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: ${focalObjectPosition || "center"};
  z-index: 1;
  opacity: 0;
}
.public-home-hero-shell__overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.public-home-hero-shell__overlay--highlight {
  background: radial-gradient(circle at 82% 18%, rgba(255,255,255,0.16), transparent 36%);
}
.public-home-hero-shell__overlay--directional {
  background: linear-gradient(
    112deg,
    rgba(6,8,14,0.96) 0%,
    rgba(6,8,14,0.88) 34%,
    rgba(6,8,14,0.56) 61%,
    rgba(6,8,14,0.22) 100%
  );
}
.public-home-hero-shell__overlay--bottom {
  background: linear-gradient(
    0deg,
    hsl(220 12% 7%) 0%,
    hsl(220 12% 7% / 0.96) 22%,
    hsl(220 12% 7% / 0.74) 44%,
    hsl(220 12% 7% / 0.34) 68%,
    hsl(220 12% 7% / 0.08) 82%,
    hsl(220 12% 7% / 0) 90%
  );
}
.public-home-hero-shell__navbar-overlay {
  position: absolute;
  inset: 0 0 auto;
  height: 5rem;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    hsl(210 33% 98% / 0.72) 0%,
    hsl(210 33% 98% / 0.18) 58%,
    transparent 100%
  );
  opacity: 0;
  z-index: 3;
}
@media (min-width: 768px) {
  .public-home-hero-shell__navbar-overlay {
    height: 6rem;
  }
}
:root[data-theme-mode="light"] .public-home-hero-shell__overlay--highlight {
  background: radial-gradient(circle at 82% 18%, rgba(255,255,255,0.22), transparent 36%);
}
:root[data-theme-mode="light"] .public-home-hero-shell__overlay--directional {
  background: linear-gradient(
    112deg,
    rgba(255,255,255,0.84) 0%,
    rgba(255,255,255,0.68) 36%,
    rgba(255,255,255,0.24) 63%,
    rgba(255,255,255,0.04) 100%
  );
}
:root[data-theme-mode="light"] .public-home-hero-shell__overlay--bottom {
  background: linear-gradient(
    0deg,
    hsl(210 33% 98%) 0%,
    hsl(210 33% 98% / 0.88) 24%,
    hsl(210 33% 98% / 0.56) 46%,
    hsl(210 33% 98% / 0.2) 70%,
    hsl(210 33% 98% / 0.04) 84%,
    hsl(210 33% 98% / 0) 91%
  );
}
:root[data-theme-mode="light"] .public-home-hero-shell__navbar-overlay {
  opacity: 1;
}
`;

  const resolveHeroFocalObjectPosition = (publicBootstrap, imageUrl) => {
    const mediaVariants = publicBootstrap?.mediaVariants;
    if (!mediaVariants || typeof mediaVariants !== "object") {
      return null;
    }
    const rawUrl = String(imageUrl || "").trim();
    if (!rawUrl) {
      return null;
    }
    // Normalize to /uploads/... pathname key (matching the client-side logic).
    let key = "";
    if (rawUrl.startsWith("/uploads/")) {
      key = rawUrl.split("?")[0].split("#")[0];
    } else {
      try {
        const parsed = new URL(rawUrl, "https://placeholder.local");
        if (parsed.pathname.startsWith("/uploads/")) {
          key = parsed.pathname;
        }
      } catch {
        // Ignore.
      }
    }
    if (!key) {
      return null;
    }
    const entry = mediaVariants[key];
    if (!entry || typeof entry !== "object") {
      return null;
    }
    // Check hero-specific focal point, then generic focalPoint.
    const focalPoints =
      entry.focalPoints && typeof entry.focalPoints === "object" ? entry.focalPoints : null;
    const heroFocal = focalPoints?.hero || null;
    const genericFocal = entry.focalPoint || null;
    const focal = heroFocal || genericFocal;
    if (!focal || typeof focal !== "object") {
      return null;
    }
    const x = Number(focal.x);
    const y = Number(focal.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    const clamp = (v) => Math.min(1, Math.max(0, v));
    return `${(clamp(x) * 100).toFixed(1)}% ${(clamp(y) * 100).toFixed(1)}%`;
  };

  const buildHomeHeroShellMarkup = (publicBootstrap) => {
    const homeHero = resolveBootstrapHomeHero(publicBootstrap);
    const firstSlide = homeHero?.slides?.[0] || null;
    if (!firstSlide) {
      return {
        markup: "",
        criticalCss: "",
      };
    }
    const heroPreload = resolveHomeHeroPreload(publicBootstrap);
    const heroSrc = String(heroPreload?.href || "").trim();
    if (!heroSrc) {
      return {
        markup: "",
        criticalCss: "",
      };
    }
    const heroSrcSet = String(heroPreload?.imagesrcset || "").trim();
    const heroSizes = String(heroPreload?.imagesizes || "100vw").trim() || "100vw";

    const focalObjectPosition = resolveHeroFocalObjectPosition(
      publicBootstrap,
      firstSlide?.image || heroSrc,
    );

    const attrs = [
      `src="${escapeHtmlAttribute(heroSrc)}"`,
      'alt=""',
      'aria-hidden="true"',
      'fetchpriority="high"',
    ];
    if (heroSrcSet) {
      attrs.push(`srcset="${escapeHtmlAttribute(heroSrcSet)}"`);
      attrs.push(`sizes="${escapeHtmlAttribute(heroSizes)}"`);
    }

    const shellMarkup = [
      '<div id="home-hero-shell" class="public-home-hero-shell public-home-hero-viewport" aria-hidden="true">',
      `  <img class="public-home-hero-shell__image" ${attrs.join(" ")} />`,
      '  <div class="public-home-hero-shell__overlay public-home-hero-shell__overlay--highlight"></div>',
      '  <div class="public-home-hero-shell__overlay public-home-hero-shell__overlay--directional"></div>',
      '  <div class="public-home-hero-shell__overlay public-home-hero-shell__overlay--bottom"></div>',
      '  <div class="public-home-hero-shell__navbar-overlay"></div>',
      "</div>",
    ]
      .filter(Boolean)
      .join("\n");

    return {
      markup: shellMarkup,
      criticalCss: buildHomeHeroShellCriticalCss({ focalObjectPosition }),
    };
  };

  const injectResolvedPublicDocumentHtml = async ({
    html,
    includeHeroImagePreload = false,
    includeHomeHeroShell = false,
    includeProjectsImagePreloads = false,
    pages = loadPages(),
    pathname = "/",
    publicBootstrap = null,
    publicMe = null,
    publicRoutePayload = null,
    routeParams = {},
    routeQuery = {},
    settings = loadSiteSettings(),
  }) => {
    const normalizedPathname = String(pathname || "").trim() || "/";
    const normalizedPages = resolvePublicPathIndexability({
      pathname: normalizedPathname,
      pages,
    }).pages;
    const resolvedRoutePayload = await resolveCompleteInstitutionalRoutePayload({
      pathname: normalizedPathname,
      pages: normalizedPages,
      publicRoutePayload,
      settings,
    });
    let nextHtml = injectBootstrapGlobals({
      html,
      publicBootstrap,
      publicRoutePayload: resolvedRoutePayload,
      settings,
      publicMe,
      pwaEnabled: false,
    });
    const preloads = extractLocalStylesheetHrefs(nextHtml).map((href) => ({
      href,
      as: "style",
      crossorigin: "anonymous",
    }));
    if (includeHeroImagePreload && !includeHomeHeroShell) {
      const heroPreload = resolveHomeHeroPreload(publicBootstrap);
      if (heroPreload) {
        preloads.push(heroPreload);
      }
    }
    preloads.push(...resolvePublicRouteModulePreloads(normalizedPathname));
    if (includeProjectsImagePreloads) {
      const routeProjects =
        resolvedRoutePayload?.kind === "projects-list"
          ? resolvedRoutePayload.projects
          : publicBootstrap?.projects;
      const routeMediaVariants =
        resolvedRoutePayload?.kind === "projects-list"
          ? resolvedRoutePayload.mediaVariants
          : publicBootstrap?.mediaVariants;
      preloads.push(
        ...resolvePublicProjectsListPreloads({
          projects: routeProjects,
          mediaVariants: routeMediaVariants,
          resolveVariantUrl: resolveMetaImageVariantUrl,
        }),
      );
    }
    if (normalizedPathname === "/equipe") {
      const teamAvatarPreload = resolvePublicTeamAvatarPreload({
        teamMembers:
          resolvedRoutePayload?.kind === "team"
            ? resolvedRoutePayload.teamMembers
            : publicBootstrap?.teamMembers,
        mediaVariants:
          resolvedRoutePayload?.kind === "team"
            ? resolvedRoutePayload.mediaVariants
            : publicBootstrap?.mediaVariants,
        resolveVariantUrl: resolveMetaImageVariantUrl,
      });
      if (teamAvatarPreload) {
        preloads.push(teamAvatarPreload);
      }
    }
    if (normalizedPathname.startsWith("/postagem/")) {
      const routeSlug = String(routeParams?.slug || "").trim();
      const bootstrapPost =
        (Array.isArray(publicBootstrap?.posts) ? publicBootstrap.posts : []).find(
          (candidate) => String(candidate?.slug || "").trim() === routeSlug,
        ) || null;
      const postCoverPreload = resolvePublicPostCoverPreload({
        coverUrl: bootstrapPost?.coverImageUrl || "",
        mediaVariants: publicBootstrap?.mediaVariants,
        resolveVariantUrl: resolveMetaImageVariantUrl,
      });
      if (postCoverPreload) {
        preloads.push(postCoverPreload);
      }
    }
    const routeKind = resolvePublicRouteKind(normalizedPathname);
    const routeProjectId = String(routeParams?.id || "").trim();
    const routeProject =
      routeKind === PUBLIC_ROUTE_KIND_PROJECT_DETAIL ||
      routeKind === PUBLIC_ROUTE_KIND_PROJECT_READING ||
      normalizedPathname.startsWith("/projetos/")
        ? findBootstrapProjectByRouteSlug(publicBootstrap?.projects, routeProjectId)
        : null;
    if (routeKind === PUBLIC_ROUTE_KIND_PROJECT_DETAIL && routeProject) {
      const heroSrc = String(
        routeProject.banner || routeProject.heroImageUrl || routeProject.cover || "",
      ).trim();
      const coverSrc = String(routeProject.cover || routeProject.banner || "").trim();
      const bannerPreload = resolvePublicReaderHeroPreload({
        imageUrl: heroSrc,
        mediaVariants: publicBootstrap?.mediaVariants,
        resolveVariantUrl: resolveMetaImageVariantUrl,
      });
      if (bannerPreload) {
        preloads.push(bannerPreload);
      }
      const coverPreload = resolveProjectPosterPreload({
        coverUrl: coverSrc,
        mediaVariants: publicBootstrap?.mediaVariants,
        resolveVariantUrl: resolveMetaImageVariantUrl,
        imagesizes: "(max-width: 767px) 256px, (max-width: 1023px) 320px, 340px",
      });
      if (coverPreload) {
        preloads.push(coverPreload);
      }
    }
    if (/^\/projeto(?:s)?\/.+\/leitura\/.+/.test(normalizedPathname)) {
      const chapterNumber = Number(routeParams?.chapter);
      const routeVolume = Number(routeQuery?.volume);
      const readingHeroImageUrl = resolveBootstrapReadingHeroImageUrl({
        project:
          routeProject ||
          findBootstrapProjectByRouteSlug(publicBootstrap?.projects, routeProjectId),
        chapterNumber,
        volume: Number.isFinite(routeVolume) ? routeVolume : undefined,
      });
      const readerHeroPreload = resolvePublicReaderHeroPreload({
        imageUrl: readingHeroImageUrl,
        mediaVariants: publicBootstrap?.mediaVariants,
        resolveVariantUrl: resolveMetaImageVariantUrl,
      });
      if (readerHeroPreload) {
        preloads.push(readerHeroPreload);
      }
    }
    if (preloads.length > 0) {
      nextHtml = injectPreloadLinks({
        html: nextHtml,
        preloads,
      });
    }
    if (includeHomeHeroShell && normalizedPathname === "/") {
      const shellSnapshot = buildHomeHeroShellMarkup(publicBootstrap);
      nextHtml = injectHomeHeroShell({
        html: nextHtml,
        shellMarkup: shellSnapshot.markup,
        criticalCss: shellSnapshot.criticalCss,
      });
    }
    return {
      html: nextHtml,
      publicRoutePayload: resolvedRoutePayload,
    };
  };

  const injectPublicBootstrapHtml = async ({
    html,
    req,
    settings,
    pages,
    includeHeroImagePreload = false,
    includeProjectsImagePreloads = false,
    bootstrapMode = PUBLIC_BOOTSTRAP_MODE_FULL,
    includeHomeHeroShell = false,
  }) => {
    const normalizedPages = resolvePublicPathIndexability({
      pathname: req?.path,
      pages,
    }).pages;
    const routeKind = resolvePublicRouteKind(req?.path);
    const routeCurrentPostDetail =
      routeKind === PUBLIC_ROUTE_KIND_POST && bootstrapMode === PUBLIC_BOOTSTRAP_MODE_FULL
        ? (() => {
            const routeSlug = String(req?.params?.slug || "").trim();
            if (!routeSlug) {
              return null;
            }
            const routePost = getPublicVisiblePosts().find(
              (candidate) => String(candidate?.slug || "").trim() === routeSlug,
            );
            return routePost ? buildPublicPostDetail({ post: routePost, resolvePostCover }) : null;
          })()
        : null;
    const publicBootstrap =
      bootstrapMode === PUBLIC_BOOTSTRAP_MODE_SHELL
        ? buildShellPublicBootstrapPayload({
            settings,
            pages: normalizedPages,
          })
        : buildPublicBootstrapResponsePayload({
            settings,
            pages: normalizedPages,
            payloadMode: bootstrapMode,
            currentPostDetail: routeCurrentPostDetail,
          });
    const publicRoutePayload =
      bootstrapMode === PUBLIC_BOOTSTRAP_MODE_SHELL
        ? await buildPublicRouteResponsePayload({
            settings,
            pages: normalizedPages,
            routeKind,
            routeParams: req?.params,
            routeQuery: req?.query,
          })
        : null;
    const routeProject =
      routeKind === PUBLIC_ROUTE_KIND_PROJECT_DETAIL ||
      routeKind === PUBLIC_ROUTE_KIND_PROJECT_READING ||
      req?.path?.startsWith("/projetos/")
        ? findBootstrapProjectByRouteSlug(getPublicVisibleProjects(), req?.params?.id)
        : null;
    const routePost =
      routeKind === PUBLIC_ROUTE_KIND_POST && routeCurrentPostDetail
        ? getPublicVisiblePosts().find(
            (candidate) => String(candidate?.slug || "").trim() === String(req?.params?.slug || ""),
          ) || null
        : null;
    const indexability = resolvePublicPathIndexability({
      pathname: req?.path,
      pages: normalizedPages,
      project: routeProject,
      post: routePost,
      isReadingRoute: /^\/projeto(?:s)?\/.+\/leitura\/.+/.test(String(req?.path || "")),
    });
    const publicMe = req?.session?.user ? buildUserPayload(req.session.user) : null;
    const resolvedDocument = await injectResolvedPublicDocumentHtml({
      html,
      includeHeroImagePreload,
      includeHomeHeroShell,
      includeProjectsImagePreloads,
      pages: normalizedPages,
      pathname: req?.path,
      publicBootstrap,
      publicMe,
      publicRoutePayload,
      routeParams: req?.params,
      routeQuery: req?.query,
      settings,
    });
    let nextHtml = resolvedDocument.html;
    const resolvedRoutePayload = resolvedDocument.publicRoutePayload;
    if (indexability.shouldRenderSeoSnapshot) {
      nextHtml = injectSeoSnapshotMarkup({
        html: nextHtml,
        snapshotHtml: buildPublicSeoSnapshot({
          pathname: req?.path,
          pages: indexability.pages,
          settings,
          publicBootstrap:
            resolvedRoutePayload?.kind === "project-detail" && resolvedRoutePayload.project
              ? {
                  ...publicBootstrap,
                  projects: [resolvedRoutePayload.project],
                  mediaVariants:
                    resolvedRoutePayload.mediaVariants || publicBootstrap?.mediaVariants,
                }
              : resolvedRoutePayload?.kind === "team"
                ? {
                    ...publicBootstrap,
                    teamMembers: resolvedRoutePayload.teamMembers,
                    mediaVariants:
                      resolvedRoutePayload.mediaVariants || publicBootstrap?.mediaVariants,
                  }
                : publicBootstrap,
          project: routeProject,
          post: routePost,
          stripHtml,
        }),
      });
    }
    return nextHtml;
  };

  const injectDashboardBootstrapHtml = ({ html, req, settings }) => {
    const publicMe = req?.session?.user ? buildUserPayload(req.session.user) : null;
    let nextHtml = injectBootstrapGlobals({
      html,
      publicBootstrap: null,
      settings,
      publicMe,
      pwaEnabled: false,
      skipPublicFetch: true,
    });
    const preloads = extractLocalStylesheetHrefs(nextHtml).map((href) => ({
      href,
      as: "style",
      crossorigin: "anonymous",
    }));
    if (preloads.length > 0) {
      nextHtml = injectPreloadLinks({
        html: nextHtml,
        preloads,
      });
    }
    return nextHtml;
  };

  return {
    buildLaunchesRssItems,
    buildPostsRssItems,
    buildPublicBootstrapResponsePayload,
    buildPublicSitemapEntries,
    injectDashboardBootstrapHtml,
    injectResolvedPublicDocumentHtml,
    injectPublicBootstrapHtml,
    sendXmlResponse,
  };
};

export default createPublicSiteRuntime;
