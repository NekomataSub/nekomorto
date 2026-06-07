import { ChevronLeft, ChevronRight, PencilLine } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";

import CommentsSection from "@/components/CommentsSection";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import LexicalViewer from "@/components/lexical/LexicalViewer";
import LightNovelReadingHeader, {
  type LightNovelReadingHeaderChapterLink,
} from "@/components/project-reader/LightNovelReadingHeader";
import ProjectReadingInfoBar from "@/components/project-reader/ProjectReadingInfoBar";
import PublicProjectReader from "@/components/project-reader/PublicProjectReader";
import { useProjectReaderPreferences } from "@/components/project-reader/use-project-reader-preferences";
import AsyncState from "@/components/ui/async-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Project } from "@/data/projects";
import { useDeferredVisibility } from "@/hooks/use-deferred-visibility";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  useResolvedPublicBootstrap,
  useResolvedPublicRoutePayload,
} from "@/hooks/public-bootstrap-provider";
import { usePublicCurrentUser } from "@/hooks/use-public-current-user";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { canManageProjectsAccess } from "@/lib/access-control";
import { getApiBase } from "@/lib/api-base";
import { apiFetch, apiFetchBestEffort } from "@/lib/api-client";
import { normalizeAssetUrl } from "@/lib/asset-url";
import { resolveEpubInternalProjectReadingHref } from "@/lib/epub-internal-links";
import { createSlug } from "@/lib/post-content";
import {
  buildDashboardProjectChapterEditorHref,
  buildProjectPublicReadingHref,
} from "@/lib/project-editor-routes";
import { buildEpisodeKey, resolveCanonicalEpisodeRouteTarget } from "@/lib/project-episode-key";
import { isLightNovelType, isMangaType } from "@/lib/project-utils";
import { findVolumeCoverByVolume } from "@/lib/project-volume-cover-key";
import { normalizeProjectVolumeEntries } from "@/lib/project-volume-entries";
import { PUBLIC_ANALYTICS_INGEST_PATH } from "@/lib/public-analytics";
import { hasPublicEpisodeReadableContent } from "@/lib/public-project-episodes";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import { cn } from "@/lib/utils";
import "@/styles/project-reading.css";
import type {
  PublicBootstrapPayload,
  PublicBootstrapProject,
  PublicRouteProjectReadingPayload,
} from "@/types/public-bootstrap";
import {
  normalizeProjectEpisodePages,
  resolveProjectEpisodeContentFormat,
  resolveProjectReaderConfig,
} from "../../shared/project-reader.js";
import {
  buildProjectReadingOgImagePath,
  buildProjectReadingOgRevision,
  resolveProjectReadingOgSnapshot,
} from "../../shared/project-reading-og-seo.js";
import NotFound from "./NotFound";

const LexicalViewerFallback = () => (
  <AsyncState
    kind="loading"
    title="Carregando conteúdo"
    description="Estamos preparando o capítulo para leitura."
    className="min-h-80 bg-background/60"
  />
);

type ReaderContentStateProps = {
  kind: "empty" | "error";
  backHref: string;
};

const ReaderContentState = ({ kind, backHref }: ReaderContentStateProps) => {
  const isError = kind === "error";

  return (
    <AsyncState
      kind={kind}
      title={isError ? "Não foi possível carregar este capítulo" : "Conteúdo ainda não disponível"}
      description={
        isError
          ? "Tente recarregar a página. Se o problema continuar, volte para o projeto e escolha outro capítulo."
          : "Este capítulo já existe no catálogo, mas ainda não tem conteúdo de leitura publicado."
      }
      action={
        <Button asChild variant="outline" size="sm">
          <Link to={backHref}>Voltar ao projeto</Link>
        </Button>
      }
      className="min-h-64 bg-background/60"
    />
  );
};

type ReadingProject = Project | PublicBootstrapProject;

const normalizeProjectRouteKey = (value: unknown) =>
  String(createSlug(String(value || "").trim()) || "")
    .trim()
    .toLowerCase();

const resolveBootstrapProject = (
  bootstrapData: PublicBootstrapPayload | null,
  slug: string | undefined,
) => {
  const rawSlug = String(slug || "").trim();
  const routeKey = normalizeProjectRouteKey(rawSlug);
  if (!routeKey && !rawSlug) {
    return null;
  }

  return (
    bootstrapData?.projects.find((candidate) => {
      const candidateId = String(candidate.id || "").trim();
      return (
        candidateId === rawSlug ||
        normalizeProjectRouteKey(candidateId) === routeKey ||
        normalizeProjectRouteKey(candidate.title) === routeKey
      );
    }) || null
  );
};

const resolveProjectReadingRoutePayloadForSlug = (
  payload: PublicRouteProjectReadingPayload | null,
  slug: string | undefined,
  chapterNumber: number,
  volume: number | undefined,
) => {
  if (!payload?.project) {
    return null;
  }
  if (!payload.chapter || Number(payload.chapter.number) !== chapterNumber) {
    return null;
  }
  if (volume !== undefined && Number(payload.chapter.volume) !== volume) {
    return null;
  }
  const projectListBootstrap = {
    projects: [payload.project],
  } as PublicBootstrapPayload;
  return resolveBootstrapProject(projectListBootstrap, slug) ? payload : null;
};

const mergeMediaVariants = (base: UploadMediaVariantsMap, nextValue: unknown) => ({
  ...base,
  ...(nextValue && typeof nextValue === "object" ? (nextValue as UploadMediaVariantsMap) : {}),
});

const formatReadingChapterOptionLabel = (entry: {
  displayLabel?: string;
  volume?: number;
  number?: number;
  title?: string;
}) => {
  const explicitLabel = String(entry.displayLabel || "").trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const parts: string[] = [];
  if (Number.isFinite(Number(entry.volume))) {
    parts.push(`Vol. ${entry.volume}`);
  }
  if (Number.isFinite(Number(entry.number))) {
    parts.push(`Cap\u00edtulo ${entry.number}`);
  }

  const title = String(entry.title || "").trim();
  if (title) {
    parts.push(title);
  }

  return parts.join(" \u2022 ");
};

const hasExplicitZeroVolume = (value: unknown) => {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string" && value.trim() === "") {
    return false;
  }
  return Number(value) === 0;
};

const compareReaderChapterNavigationOrder = (
  left: { number?: number; volume?: number; readingOrder?: number },
  right: { number?: number; volume?: number; readingOrder?: number },
) => {
  const leftReadingOrder = Number(left.readingOrder);
  const rightReadingOrder = Number(right.readingOrder);
  const hasLeftReadingOrder = Number.isFinite(leftReadingOrder);
  const hasRightReadingOrder = Number.isFinite(rightReadingOrder);
  if (hasLeftReadingOrder || hasRightReadingOrder) {
    if (!hasLeftReadingOrder) {
      return 1;
    }
    if (!hasRightReadingOrder) {
      return -1;
    }
    if (leftReadingOrder !== rightReadingOrder) {
      return leftReadingOrder - rightReadingOrder;
    }
  }

  const leftHasExplicitZeroVolume = hasExplicitZeroVolume(left.volume);
  const rightHasExplicitZeroVolume = hasExplicitZeroVolume(right.volume);
  if (leftHasExplicitZeroVolume !== rightHasExplicitZeroVolume) {
    return leftHasExplicitZeroVolume ? -1 : 1;
  }

  const numberDelta = (Number(left.number) || 0) - (Number(right.number) || 0);
  if (numberDelta !== 0) {
    return numberDelta;
  }

  return (Number(left.volume) || 0) - (Number(right.volume) || 0);
};

const getReadableProjectEpisodes = (
  project: Pick<ReadingProject, "episodeDownloads"> | null | undefined,
) =>
  Array.isArray(project?.episodeDownloads)
    ? project.episodeDownloads.filter((entry) => hasPublicEpisodeReadableContent(entry))
    : [];

const hasProjectEpisodeForRoute = ({
  chapterNumber,
  episodes,
  volume,
}: {
  chapterNumber: number;
  episodes: Array<{ number?: number; volume?: number }>;
  volume?: number;
}) => {
  if (!Number.isFinite(chapterNumber)) {
    return false;
  }
  if (volume === undefined) {
    return episodes.some((entry) => Number(entry.number) === chapterNumber);
  }
  const targetKey = buildEpisodeKey(chapterNumber, volume);
  return episodes.some((entry) => buildEpisodeKey(entry.number, entry.volume) === targetKey);
};

const ProjectReading = () => {
  const { slug, chapter } = useParams<{ slug: string; chapter: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiBase = getApiBase();
  const { settings } = useSiteSettings();
  const resolvedBootstrap = useResolvedPublicBootstrap();
  const resolvedRoutePayload = useResolvedPublicRoutePayload();
  const [bootstrapData] = useState<PublicBootstrapPayload | null>(() => resolvedBootstrap);
  const [initialRoutePayload] = useState(() => resolvedRoutePayload);
  const { currentUser } = usePublicCurrentUser();
  const chapterNumber = Number(chapter);
  const volumeParamRaw = searchParams.get("volume");
  const parsedVolumeParam = Number(volumeParamRaw);
  const volumeParam =
    volumeParamRaw !== null && Number.isFinite(parsedVolumeParam) ? parsedVolumeParam : undefined;
  const readingRoutePayload = useMemo(
    () =>
      initialRoutePayload?.kind === "project-reading"
        ? resolveProjectReadingRoutePayloadForSlug(
            initialRoutePayload,
            slug,
            chapterNumber,
            volumeParam,
          )
        : null,
    [chapterNumber, initialRoutePayload, slug, volumeParam],
  );
  const bootstrapProject = useMemo(
    () => resolveBootstrapProject(bootstrapData, slug),
    [bootstrapData, slug],
  );
  const routeProject = readingRoutePayload?.project || null;
  const initialProject = routeProject || bootstrapProject;
  const [project, setProject] = useState<ReadingProject | null>(initialProject);
  const bootstrapChapterContent = useMemo(() => {
    if (!bootstrapProject || !Number.isFinite(chapterNumber)) {
      return null;
    }
    const lookupKey = buildEpisodeKey(chapterNumber, volumeParam);
    return (
      bootstrapProject.episodeDownloads.find((entry) => {
        if (volumeParam === undefined) {
          return entry.number === chapterNumber;
        }
        return buildEpisodeKey(entry.number, entry.volume) === lookupKey;
      }) || null
    );
  }, [bootstrapProject, chapterNumber, volumeParam]);
  const bootstrapHasChapterContent = Boolean(
    bootstrapChapterContent &&
      (String(bootstrapChapterContent.content || "").trim() ||
        normalizeProjectEpisodePages(bootstrapChapterContent.pages).length > 0),
  );
  const bootstrapReadableEpisodes = useMemo(
    () => getReadableProjectEpisodes(bootstrapProject),
    [bootstrapProject],
  );
  const bootstrapHasRequestedChapter = useMemo(
    () =>
      hasProjectEpisodeForRoute({
        chapterNumber,
        episodes: bootstrapReadableEpisodes,
        volume: volumeParam,
      }),
    [bootstrapReadableEpisodes, chapterNumber, volumeParam],
  );
  const routeChapterContent = readingRoutePayload?.chapter || null;
  const routeHasChapterContent = Boolean(
    routeChapterContent &&
      (String(routeChapterContent.content || "").trim() ||
        normalizeProjectEpisodePages(routeChapterContent.pages).length > 0),
  );
  const shouldHydrateProjectFromApi =
    Boolean(slug) &&
    (!initialProject ||
      bootstrapData?.payloadMode === "critical-home" ||
      (bootstrapReadableEpisodes.length === 0 && !routeProject) ||
      (!bootstrapHasRequestedChapter && !routeHasChapterContent));
  const shouldHydrateChapterFromApi = !routeHasChapterContent;
  const [chapterContent, setChapterContent] = useState<{
    number: number;
    volume?: number;
    title?: string;
    entryKind?: "main" | "extra";
    entrySubtype?: string;
    readingOrder?: number;
    displayLabel?: string;
    synopsis?: string;
    content?: string;
    contentFormat?: "lexical" | "images";
    pages?: Array<{
      position: number;
      imageUrl: string;
      spreadPairId?: string;
      width?: number;
      height?: number;
    }>;
    pageCount?: number;
    hasPages?: boolean;
    coverImageUrl?: string;
    coverImageAlt?: string;
  } | null>(
    routeHasChapterContent
      ? routeChapterContent
      : bootstrapHasChapterContent
        ? bootstrapChapterContent
        : null,
  );
  const [chapterReaderConfig, setChapterReaderConfig] = useState<Record<string, unknown> | null>(
    routeHasChapterContent
      ? readingRoutePayload?.readerConfig || project?.readerConfig || null
      : bootstrapHasChapterContent
        ? project?.readerConfig || null
        : null,
  );
  const [hasLoadedProject, setHasLoadedProject] = useState(Boolean(initialProject));
  const [hasLoadedChapter, setHasLoadedChapter] = useState(
    routeHasChapterContent || bootstrapHasChapterContent,
  );
  const [chapterLoadError, setChapterLoadError] = useState(false);
  const [mediaVariants, setMediaVariants] = useState<UploadMediaVariantsMap>(
    () => bootstrapData?.mediaVariants || {},
  );
  const trackedChapterViewsRef = useRef<Set<string>>(new Set());
  const imageReaderSiteHeaderContainerRef = useRef<HTMLDivElement | null>(null);
  const lastChapterNavigationScrollKeyRef = useRef<string | null>(null);
  const [measuredImageReaderHeaderHeight, setMeasuredImageReaderHeaderHeight] = useState(0);
  const { isVisible: isCommentsVisible, sentinelRef: commentsSentinelRef } = useDeferredVisibility({
    initialVisible: location.hash.startsWith("#comment-"),
    rootMargin: "400px 0px",
  });

  useEffect(() => {
    const nextProject = routeProject || bootstrapProject;
    setProject(nextProject);
    setHasLoadedProject(Boolean(nextProject));
    setMediaVariants({
      ...(bootstrapData?.mediaVariants || {}),
      ...(readingRoutePayload?.mediaVariants || {}),
    });
  }, [bootstrapData, bootstrapProject, readingRoutePayload?.mediaVariants, routeProject]);

  useEffect(() => {
    let isActive = true;

    const loadProject = async () => {
      if (!shouldHydrateProjectFromApi) {
        if (isActive) {
          setHasLoadedProject(Boolean(routeProject || bootstrapProject));
        }
        return;
      }

      const projectRequestId = String(
        routeProject?.id || bootstrapProject?.id || slug || "",
      ).trim();
      if (!projectRequestId) {
        if (isActive) {
          setHasLoadedProject(Boolean(routeProject || bootstrapProject));
        }
        return;
      }

      try {
        const response = await apiFetch(
          apiBase,
          `/api/public/projects/${encodeURIComponent(projectRequestId)}`,
        );
        if (!response.ok) {
          if (isActive) {
            if (!bootstrapProject) {
              setProject(null);
            }
          }
          return;
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        setProject(data.project || null);
        setMediaVariants((current) =>
          mergeMediaVariants(bootstrapData?.mediaVariants || current, data?.mediaVariants),
        );
      } catch {
        if (isActive) {
          if (!bootstrapProject) {
            setProject(null);
          }
        }
      } finally {
        if (isActive) {
          setHasLoadedProject(true);
        }
      }
    };

    void loadProject();
    return () => {
      isActive = false;
    };
  }, [
    apiBase,
    bootstrapData?.mediaVariants,
    bootstrapProject,
    routeProject,
    shouldHydrateProjectFromApi,
    slug,
  ]);
  const isLightNovel = isLightNovelType(project?.type || "");
  const isManga = isMangaType(project?.type || "");
  const isReaderProject = isLightNovel || isManga;

  const sortedChapters = useMemo(() => {
    if (!project) {
      return [];
    }
    return (project.episodeDownloads || [])
      .filter((entry) => hasPublicEpisodeReadableContent(entry))
      .sort(compareReaderChapterNavigationOrder);
  }, [project]);

  const chapterData = useMemo(() => {
    if (!project || !Number.isFinite(chapterNumber)) {
      return null;
    }
    const lookupKey = buildEpisodeKey(chapterNumber, volumeParam);
    return sortedChapters.find((entry) => {
      if (volumeParam === undefined) {
        return entry.number === chapterNumber;
      }
      return buildEpisodeKey(entry.number, entry.volume) === lookupKey;
    });
  }, [chapterNumber, project, sortedChapters, volumeParam]);

  const activeVolume = useMemo(() => {
    const contentVolume = Number(chapterContent?.volume);
    if (Number.isFinite(contentVolume)) {
      return contentVolume;
    }
    const listVolume = Number(chapterData?.volume);
    if (Number.isFinite(listVolume)) {
      return listVolume;
    }
    return volumeParam;
  }, [chapterContent?.volume, chapterData?.volume, volumeParam]);

  const normalizedVolumeEntries = useMemo(
    () =>
      normalizeProjectVolumeEntries(
        Array.isArray(project?.volumeEntries)
          ? project.volumeEntries
          : Array.isArray(project?.volumeCovers)
            ? project.volumeCovers
            : [],
      ),
    [project?.volumeCovers, project?.volumeEntries],
  );

  const volumeEntry = useMemo(
    () => findVolumeCoverByVolume(normalizedVolumeEntries, activeVolume),
    [activeVolume, normalizedVolumeEntries],
  );

  const volumeCover = useMemo(
    () => findVolumeCoverByVolume(project?.volumeCovers, activeVolume),
    [activeVolume, project?.volumeCovers],
  );

  const heroImage = useMemo(
    () =>
      normalizeProjectEpisodePages(chapterContent?.pages)[0]?.imageUrl ||
      chapterContent?.coverImageUrl ||
      chapterData?.coverImageUrl ||
      volumeEntry?.coverImageUrl ||
      volumeCover?.coverImageUrl ||
      project?.cover ||
      project?.heroImageUrl ||
      project?.banner ||
      "/placeholder.svg",
    [
      chapterContent?.coverImageUrl,
      chapterContent?.pages,
      chapterData?.coverImageUrl,
      project?.banner,
      project?.cover,
      project?.heroImageUrl,
      volumeCover?.coverImageUrl,
      volumeEntry?.coverImageUrl,
    ],
  );

  const heroImageAlt = useMemo(
    () =>
      chapterContent?.coverImageAlt ||
      chapterData?.coverImageAlt ||
      volumeEntry?.coverImageAlt ||
      volumeCover?.coverImageAlt ||
      project?.coverAlt ||
      project?.heroImageAlt ||
      `Banner do projeto ${project?.title || ""}`,
    [
      chapterContent?.coverImageAlt,
      chapterData?.coverImageAlt,
      project?.coverAlt,
      project?.heroImageAlt,
      project?.title,
      volumeCover?.coverImageAlt,
      volumeEntry?.coverImageAlt,
    ],
  );

  const resolvedChapterSynopsis = useMemo(() => {
    const explicitChapterSynopsis = String(
      chapterContent?.synopsis || chapterData?.synopsis || "",
    ).trim();
    if (explicitChapterSynopsis) {
      return explicitChapterSynopsis;
    }
    const explicitVolumeSynopsis = String(volumeEntry?.synopsis || "").trim();
    if (explicitVolumeSynopsis) {
      return explicitVolumeSynopsis;
    }
    return String(project?.synopsis || "").trim();
  }, [chapterContent?.synopsis, chapterData?.synopsis, project?.synopsis, volumeEntry?.synopsis]);

  const pageTitle = useMemo(() => {
    if (!project) {
      return "Leitura";
    }
    const entryKind =
      chapterContent?.entryKind === "extra" || chapterData?.entryKind === "extra"
        ? "extra"
        : "main";
    const chapterLabel =
      entryKind === "extra"
        ? String(chapterContent?.displayLabel || chapterData?.displayLabel || "Extra").trim() ||
          "Extra"
        : chapterContent?.number || chapterData?.number || chapterNumber
          ? `Capítulo ${chapterContent?.number || chapterData?.number || chapterNumber}`
          : "Capítulo";
    const chapterTitle = String(chapterContent?.title || chapterData?.title || "").trim();
    const titlePart =
      entryKind === "extra"
        ? chapterTitle || chapterLabel
        : chapterTitle
          ? `${chapterLabel} - ${chapterTitle}`
          : chapterLabel;
    return `${titlePart} - ${project.title}`;
  }, [
    chapterContent?.displayLabel,
    chapterContent?.entryKind,
    chapterContent?.number,
    chapterContent?.title,
    chapterData?.displayLabel,
    chapterData?.number,
    chapterData?.title,
    chapterNumber,
    project,
  ]);

  const readingOgSnapshot = useMemo(
    () =>
      resolveProjectReadingOgSnapshot({
        project,
        chapterNumber,
        volume: activeVolume,
        settings: bootstrapData?.settings,
        tagTranslations: bootstrapData?.tagTranslations?.tags,
        genreTranslations: bootstrapData?.tagTranslations?.genres,
      }),
    [
      activeVolume,
      bootstrapData?.settings,
      bootstrapData?.tagTranslations?.genres,
      bootstrapData?.tagTranslations?.tags,
      chapterNumber,
      project,
    ],
  );

  const readingOgRevision = useMemo(
    () =>
      buildProjectReadingOgRevision({
        project,
        chapterNumber,
        volume: activeVolume,
        settings: bootstrapData?.settings,
        tagTranslations: bootstrapData?.tagTranslations?.tags,
        genreTranslations: bootstrapData?.tagTranslations?.genres,
      }),
    [
      activeVolume,
      bootstrapData?.settings,
      bootstrapData?.tagTranslations?.genres,
      bootstrapData?.tagTranslations?.tags,
      chapterNumber,
      project,
    ],
  );

  const readingOgImage = useMemo(() => {
    if (!project?.id || !readingOgSnapshot || !readingOgRevision) {
      return "";
    }
    return normalizeAssetUrl(
      buildProjectReadingOgImagePath({
        projectId: project.id,
        chapterNumber: readingOgSnapshot.chapterNumberResolved ?? chapterNumber,
        volume: readingOgSnapshot.volumeResolved,
        revision: readingOgRevision,
      }),
    );
  }, [chapterNumber, project?.id, readingOgRevision, readingOgSnapshot]);

  const projectOgImage = useMemo(
    () =>
      project?.id ? normalizeAssetUrl(`/api/og/project/${encodeURIComponent(project.id)}`) : "",
    [project?.id],
  );

  const readingOgImageAlt = useMemo(
    () => String(readingOgSnapshot?.imageAlt || "").trim(),
    [readingOgSnapshot],
  );

  usePageMeta({
    title: pageTitle,
    description: resolvedChapterSynopsis,
    image: readingOgImage || projectOgImage || heroImage,
    imageAlt: readingOgImage
      ? readingOgImageAlt
      : projectOgImage
        ? `Card de compartilhamento do projeto ${project?.title || ""}`
        : heroImageAlt,
    mediaVariants,
    type: "article",
    noIndex: true,
  });

  const chapterBadgeLabel = useMemo(() => {
    const isExtra = chapterContent?.entryKind === "extra" || chapterData?.entryKind === "extra";
    if (isExtra) {
      return (
        String(chapterContent?.displayLabel || chapterData?.displayLabel || "Extra").trim() ||
        "Extra"
      );
    }
    return `Cap ${chapterData?.number ?? chapterNumber}`;
  }, [
    chapterContent?.displayLabel,
    chapterContent?.entryKind,
    chapterData?.displayLabel,
    chapterData?.entryKind,
    chapterData?.number,
    chapterNumber,
  ]);
  const currentChapterValue = buildEpisodeKey(
    chapterData?.number ?? chapterContent?.number ?? chapterNumber,
    chapterData?.volume ?? chapterContent?.volume ?? volumeParam,
  );
  const currentIndex = useMemo(
    () =>
      sortedChapters.findIndex(
        (entry) => buildEpisodeKey(entry.number, entry.volume) === currentChapterValue,
      ),
    [currentChapterValue, sortedChapters],
  );
  const previousChapter = currentIndex > 0 ? sortedChapters[currentIndex - 1] : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < sortedChapters.length - 1
      ? sortedChapters[currentIndex + 1]
      : null;

  const canEditChapter = useMemo(() => {
    return canManageProjectsAccess(currentUser);
  }, [currentUser]);

  const editChapterHref = useMemo(() => {
    if (!project?.id) {
      return "";
    }
    const chapterNumberValue = chapterData?.number ?? chapterContent?.number ?? chapterNumber;
    if (!Number.isFinite(chapterNumberValue)) {
      return "";
    }
    const canonicalChapter = resolveCanonicalEpisodeRouteTarget(
      sortedChapters,
      chapterNumberValue,
      [chapterContent?.volume, chapterData?.volume, volumeParam],
      { exactPreferredOnly: true },
    );
    if (!canonicalChapter) {
      return "";
    }
    return buildDashboardProjectChapterEditorHref(
      project.id,
      Number(canonicalChapter.number),
      canonicalChapter.volume,
    );
  }, [
    chapterContent?.number,
    chapterContent?.volume,
    chapterData?.number,
    chapterData?.volume,
    chapterNumber,
    project?.id,
    sortedChapters,
    volumeParam,
  ]);

  const handleInternalChapterLinkNavigate = useCallback(
    (href: string) => {
      if (!project?.id) {
        return;
      }
      const targetHref = resolveEpubInternalProjectReadingHref(href, project.id, sortedChapters);
      if (!targetHref) {
        return;
      }
      navigate(targetHref);
    },
    [navigate, project?.id, sortedChapters],
  );

  const navigateChapterToTop = useCallback(
    (href: string) => {
      navigate(href, { state: { preserveScroll: false } });
    },
    [navigate],
  );

  useEffect(() => {
    let isActive = true;

    const loadChapter = async () => {
      if (!shouldHydrateChapterFromApi) {
        if (isActive) {
          setHasLoadedChapter(true);
          setChapterLoadError(false);
        }
        return;
      }

      setHasLoadedChapter(false);
      setChapterLoadError(false);
      setChapterContent(null);
      setChapterReaderConfig(null);

      if (!project?.id || !Number.isFinite(chapterNumber)) {
        if (isActive) {
          setHasLoadedChapter(true);
        }
        return;
      }

      const volumeQuery = volumeParam !== undefined ? `?volume=${volumeParam}` : "";
      try {
        const response = await apiFetch(
          apiBase,
          `/api/public/projects/${project.id}/chapters/${chapterNumber}${volumeQuery}`,
        );
        if (!response.ok) {
          if (isActive) {
            setChapterContent(null);
            setChapterReaderConfig(null);
            setChapterLoadError(true);
          }
          return;
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        setChapterContent(data.chapter || null);
        setChapterReaderConfig(
          data?.readerConfig && typeof data.readerConfig === "object" ? data.readerConfig : null,
        );
        setChapterLoadError(false);
      } catch {
        if (isActive) {
          setChapterContent(null);
          setChapterReaderConfig(null);
          setChapterLoadError(true);
        }
      } finally {
        if (isActive) {
          setHasLoadedChapter(true);
        }
      }
    };

    void loadChapter();
    return () => {
      isActive = false;
    };
  }, [apiBase, chapterNumber, project?.id, shouldHydrateChapterFromApi, volumeParam]);

  useEffect(() => {
    if (!routeHasChapterContent || !routeChapterContent) {
      return;
    }
    setChapterContent(routeChapterContent);
    setChapterReaderConfig(readingRoutePayload?.readerConfig || project?.readerConfig || null);
    setHasLoadedChapter(true);
    setChapterLoadError(false);
  }, [
    project?.readerConfig,
    readingRoutePayload?.readerConfig,
    routeChapterContent,
    routeHasChapterContent,
  ]);

  useEffect(() => {
    if (routeHasChapterContent) {
      return;
    }
    if (!bootstrapHasChapterContent || !bootstrapChapterContent) {
      return;
    }
    setChapterContent(bootstrapChapterContent);
    setChapterReaderConfig(project?.readerConfig || null);
    setHasLoadedChapter(true);
    setChapterLoadError(false);
  }, [
    bootstrapChapterContent,
    bootstrapHasChapterContent,
    project?.readerConfig,
    routeHasChapterContent,
  ]);

  useEffect(() => {
    const currentChapterContent = chapterContent;
    if (!project?.id || !currentChapterContent || !Number.isFinite(currentChapterContent.number)) {
      return;
    }
    const chapterValue = Number(currentChapterContent.number);
    const volumeValue = Number(currentChapterContent.volume);
    const resourceId = `${project.id}:${chapterValue}:${Number.isFinite(volumeValue) ? volumeValue : 0}`;
    if (trackedChapterViewsRef.current.has(resourceId)) {
      return;
    }
    trackedChapterViewsRef.current.add(resourceId);
    const payload: {
      eventType: "chapter_view";
      resourceType: "chapter";
      resourceId: string;
      meta: {
        projectId: string;
        chapterNumber: number;
        volume?: number;
      };
    } = {
      eventType: "chapter_view",
      resourceType: "chapter",
      resourceId,
      meta: {
        projectId: project.id,
        chapterNumber: chapterValue,
      },
    };
    if (Number.isFinite(volumeValue)) {
      payload.meta.volume = volumeValue;
    }
    void apiFetchBestEffort(apiBase, PUBLIC_ANALYTICS_INGEST_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }, [apiBase, chapterContent?.number, chapterContent?.volume, project?.id]);

  const currentUserId = String(currentUser?.id || "").trim() || null;
  const chapterLexical = chapterContent?.content || "";
  const chapterPages = normalizeProjectEpisodePages(chapterContent?.pages || chapterData?.pages);
  const chapterContentFormat = resolveProjectEpisodeContentFormat({
    contentFormat: chapterContent?.contentFormat || chapterData?.contentFormat,
    episode: chapterContent || chapterData,
    pages: chapterPages,
    projectType: project?.type,
  });
  const isImageReader = chapterContentFormat === "images" && chapterPages.length > 0;
  const chapterReaderConfigResolved = resolveProjectReaderConfig({
    projectType: project?.type,
    siteSettings: settings,
    siteReaderConfig: chapterReaderConfig,
    projectReaderConfig: project?.readerConfig,
  });
  const imageReaderPreferences = useProjectReaderPreferences({
    projectType: project?.type || "",
    baseConfig: chapterReaderConfigResolved,
    currentUserId,
  });
  const imageReaderSiteHeaderVariant =
    imageReaderPreferences.resolvedConfig.siteHeaderVariant === "static" ? "static" : "fixed";
  const imageReaderViewportMode =
    imageReaderPreferences.resolvedConfig.viewportMode === "natural" ? "natural" : "viewport";
  const shouldRenderImageReaderFirstFold = isImageReader && imageReaderViewportMode === "viewport";
  const shouldUseFixedImageReaderSiteHeader =
    isImageReader && imageReaderSiteHeaderVariant === "fixed";
  const shouldShowImageReaderSiteFooter =
    isImageReader && imageReaderPreferences.resolvedConfig.showSiteFooter !== false;
  const chapterNavigationScrollKey = `${location.pathname}${location.search}`;

  useLayoutEffect(() => {
    if (!shouldUseFixedImageReaderSiteHeader) {
      setMeasuredImageReaderHeaderHeight(0);
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const container = imageReaderSiteHeaderContainerRef.current;
    if (!container) {
      return;
    }

    const resolveHeaderNode = () => {
      const firstChild = container.firstElementChild;
      if (firstChild instanceof HTMLElement) {
        return firstChild;
      }
      const headerNode = container.querySelector("header");
      return headerNode instanceof HTMLElement ? headerNode : null;
    };

    const measureHeaderHeight = () => {
      const headerNode = resolveHeaderNode();
      const nextHeight = Math.max(
        0,
        Math.ceil(headerNode?.getBoundingClientRect().height || headerNode?.offsetHeight || 0),
      );
      setMeasuredImageReaderHeaderHeight((current) =>
        current === nextHeight ? current : nextHeight,
      );
    };

    measureHeaderHeight();

    const headerNode = resolveHeaderNode();
    const resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(() => measureHeaderHeight()) : null;

    if (resizeObserver && headerNode) {
      resizeObserver.observe(headerNode);
    }

    window.addEventListener("resize", measureHeaderHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measureHeaderHeight);
    };
  }, [shouldUseFixedImageReaderSiteHeader]);

  useLayoutEffect(() => {
    const locationState =
      typeof location.state === "object" && location.state !== null
        ? (location.state as { preserveScroll?: boolean })
        : null;

    if (
      !isLightNovel ||
      isImageReader ||
      location.hash ||
      locationState?.preserveScroll !== false ||
      lastChapterNavigationScrollKeyRef.current === chapterNavigationScrollKey
    ) {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    lastChapterNavigationScrollKeyRef.current = chapterNavigationScrollKey;
  }, [
    chapterNavigationScrollKey,
    isImageReader,
    isLightNovel,
    location.hash,
    location.state,
  ]);

  const shouldShowNotFound = !slug || (!project && hasLoadedProject);
  if (shouldShowNotFound) {
    return <NotFound />;
  }
  if (!project) {
    return null;
  }
  if (!isReaderProject) {
    return <NotFound />;
  }
  const backHref = `/projeto/${encodeURIComponent(project.id)}`;
  const resolvedReaderProjectType = project.type || (isLightNovel ? "Light Novel" : "Mang\u00e1");
  const previousChapterLink: LightNovelReadingHeaderChapterLink | null = previousChapter
    ? {
        href: buildProjectPublicReadingHref(
          project.id,
          previousChapter.number,
          previousChapter.volume,
        ),
        label: formatReadingChapterOptionLabel(previousChapter),
      }
    : null;
  const nextChapterLink: LightNovelReadingHeaderChapterLink | null = nextChapter
    ? {
        href: buildProjectPublicReadingHref(project.id, nextChapter.number, nextChapter.volume),
        label: formatReadingChapterOptionLabel(nextChapter),
      }
    : null;
  const chapterOptions = sortedChapters.map((entry) => ({
    value: buildEpisodeKey(entry.number, entry.volume),
    label:
      String(entry.displayLabel || "").trim() ||
      `${Number.isFinite(Number(entry.volume)) ? `Vol. ${entry.volume} • ` : ""}Capítulo ${entry.number}${
        entry.title ? ` • ${entry.title}` : ""
      }`,
    href: buildProjectPublicReadingHref(project.id, entry.number, entry.volume),
  }));
  const chapterHeading =
    chapterContent?.title ||
    chapterData?.title ||
    (chapterContent?.entryKind === "extra" || chapterData?.entryKind === "extra"
      ? chapterBadgeLabel
      : `Capítulo ${chapterData?.number ?? chapterNumber}`);

  const chapterEditActionLabel =
    chapterContent?.entryKind === "extra" || chapterData?.entryKind === "extra"
      ? "Editar extra"
      : "Editar capítulo";

  const imageReaderProps = {
    projectTitle: project.title,
    projectType: project.type || (isLightNovel ? "Light Novel" : "Mangá"),
    chapterTitle: chapterHeading,
    chapterLabel: chapterBadgeLabel,
    synopsis: resolvedChapterSynopsis,
    volume: activeVolume,
    pages: chapterPages,
    baseConfig: chapterReaderConfigResolved,
    currentUserId,
    editHref: canEditChapter ? editChapterHref : undefined,
    editActionLabel: chapterEditActionLabel,
    chapterOptions,
    currentChapterValue,
    onNavigateChapter: navigateChapterToTop,
    backHref: `/projeto/${encodeURIComponent(project.id)}`,
    preferences: imageReaderPreferences,
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {isImageReader ? (
        <div
          data-testid={shouldRenderImageReaderFirstFold ? "project-reading-first-fold" : undefined}
          className={cn(
            "flex flex-col",
            shouldRenderImageReaderFirstFold ? "project-reading-first-fold min-h-screen" : "",
          )}
        >
          {shouldUseFixedImageReaderSiteHeader ? (
            <>
              <div ref={imageReaderSiteHeaderContainerRef}>
                <Header variant="fixed" />
              </div>
              <div
                data-testid="project-reading-site-header-offset"
                aria-hidden="true"
                className="shrink-0"
                style={{
                  height:
                    measuredImageReaderHeaderHeight > 0
                      ? `${measuredImageReaderHeaderHeight}px`
                      : undefined,
                }}
              />
            </>
          ) : (
            <Header variant="static" />
          )}
          <div
            data-testid="project-reading-images-layout"
            className={cn(
              "flex flex-col",
              imageReaderViewportMode === "natural" ? "min-h-screen" : "min-h-0 flex-1",
            )}
          >
            <PublicProjectReader {...imageReaderProps} />
          </div>
        </div>
      ) : isLightNovel ? (
        <>
          <Header variant="fixed" />
          <main className="flex-1 bg-background">
            <LightNovelReadingHeader
              projectTitle={project.title}
              projectType={resolvedReaderProjectType}
              chapterTitle={chapterHeading}
              chapterLabel={chapterBadgeLabel}
              synopsis={resolvedChapterSynopsis}
              volume={activeVolume}
              heroImage={heroImage}
              heroImageAlt={heroImageAlt}
              mediaVariants={mediaVariants}
              backHref={backHref}
              editHref={canEditChapter ? editChapterHref : undefined}
              editActionLabel={chapterEditActionLabel}
            />

            <section className="project-reading-first-fold mx-auto mt-3 w-full max-w-6xl px-6 pb-16 md:mt-4 md:px-10">
              <section>
                <article className="min-w-0 space-y-6">
                  <Card className="project-reading-reader-shell">
                    <CardContent className="project-reading-reader-shell__content min-w-0 space-y-6 p-6">
                      {chapterContent?.content ? (
                        <LexicalViewer
                          value={chapterLexical}
                          ariaLabel={`Conte\u00fado de leitura de ${pageTitle}`}
                          className="post-content reader-content min-w-0 w-full text-muted-foreground"
                          onInternalLinkNavigate={handleInternalChapterLinkNavigate}
                          pollTarget={
                            project.id && Number.isFinite(chapterNumber)
                              ? {
                                  type: "chapter",
                                  projectId: project.id,
                                  chapterNumber: chapterData?.number ?? chapterNumber,
                                  volume: chapterData?.volume ?? volumeParam,
                                }
                              : undefined
                          }
                        />
                      ) : !hasLoadedChapter ? (
                        <LexicalViewerFallback />
                      ) : chapterLoadError ? (
                        <ReaderContentState kind="error" backHref={backHref} />
                      ) : (
                        <ReaderContentState kind="empty" backHref={backHref} />
                      )}
                    </CardContent>
                  </Card>

                  {previousChapterLink || nextChapterLink ? (
                    <nav
                      data-testid="project-reading-chapter-nav"
                      aria-label={"Navega\u00e7\u00e3o de cap\u00edtulos"}
                      className="project-reading-chapter-nav flex flex-wrap items-center gap-2"
                    >
                      {previousChapterLink ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="project-reading-nav-btn project-reading-nav-btn--secondary project-reading-chapter-nav__button"
                        >
                          <Link
                            to={previousChapterLink.href}
                            title={previousChapterLink.label}
                            state={{ preserveScroll: false }}
                          >
                            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                            <span>{"Cap\u00edtulo anterior"}</span>
                          </Link>
                        </Button>
                      ) : null}
                      {nextChapterLink ? (
                        <Button
                          asChild
                          size="sm"
                          className="project-reading-nav-btn project-reading-nav-btn--next project-reading-chapter-nav__button project-reading-chapter-nav__button--next ml-auto"
                        >
                          <Link
                            to={nextChapterLink.href}
                            title={nextChapterLink.label}
                            state={{ preserveScroll: false }}
                          >
                            <span>{"Pr\u00f3ximo cap\u00edtulo"}</span>
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </Button>
                      ) : null}
                    </nav>
                  ) : null}

                  <div
                    ref={commentsSentinelRef}
                    data-testid="project-reading-comments-sentinel"
                    aria-hidden="true"
                    className="h-px w-full"
                  />

                  {isCommentsVisible ? (
                    <CommentsSection
                      targetType="chapter"
                      targetId={project.id}
                      chapterNumber={chapterData?.number ?? chapterContent?.number ?? chapterNumber}
                      volume={chapterData?.volume ?? chapterContent?.volume ?? volumeParam}
                    />
                  ) : null}
                </article>
              </section>
            </section>
          </main>
        </>
      ) : (
        <main
          className="mx-auto flex w-full flex-col gap-6 px-0 pb-16 md:px-4"
          style={{ maxWidth: "1680px" }}
        >
          <div className="space-y-4">
            <ProjectReadingInfoBar
              projectTitle={project.title}
              projectHref={`/projeto/${encodeURIComponent(project.id)}`}
              projectType={project.type || (isLightNovel ? "Light Novel" : "Mangá")}
              chapterTitle={chapterHeading}
              chapterLabel={chapterBadgeLabel}
              synopsis={resolvedChapterSynopsis}
              volume={activeVolume}
              actions={
                canEditChapter && editChapterHref ? (
                  <Button asChild variant="outline" className="rounded-full">
                    <Link to={editChapterHref}>
                      <PencilLine className="h-4 w-4" aria-hidden="true" />
                      <span>{chapterEditActionLabel}</span>
                    </Link>
                  </Button>
                ) : null
              }
            />

            <section className="project-reading-reader-shell mx-auto w-full max-w-5xl px-4 md:px-6">
              <div className="overflow-hidden rounded-3xl border border-border/60 bg-card/40 shadow-xl">
                <div className="p-5 md:p-8" style={{ minHeight: "calc(100svh - 18rem)" }}>
                  {chapterContent?.content ? (
                    <LexicalViewer
                      value={chapterLexical}
                      ariaLabel={`Conteúdo de leitura de ${pageTitle}`}
                      className="post-content reader-content min-w-0 w-full text-muted-foreground"
                      onInternalLinkNavigate={handleInternalChapterLinkNavigate}
                      pollTarget={
                        project.id && Number.isFinite(chapterNumber)
                          ? {
                              type: "chapter",
                              projectId: project.id,
                              chapterNumber: chapterData?.number ?? chapterNumber,
                              volume: chapterData?.volume ?? volumeParam,
                            }
                          : undefined
                      }
                    />
                  ) : !hasLoadedChapter ? (
                    <LexicalViewerFallback />
                  ) : chapterLoadError ? (
                    <ReaderContentState kind="error" backHref={backHref} />
                  ) : (
                    <ReaderContentState kind="empty" backHref={backHref} />
                  )}
                </div>
              </div>
            </section>
          </div>
        </main>
      )}

      {isImageReader ? (
        <div
          data-testid="project-reading-comments-handoff"
          aria-hidden="true"
          className="w-full bg-background"
          style={{ minHeight: "5rem" }}
        />
      ) : null}

      {!isLightNovel ? (
        <>
          <div
            ref={commentsSentinelRef}
            data-testid="project-reading-comments-sentinel"
            aria-hidden="true"
            className="h-px w-full"
          />

          {isCommentsVisible ? (
            <section className="mx-auto w-full max-w-5xl px-4 pb-16 md:px-6">
              <CommentsSection
                targetType="chapter"
                targetId={project.id}
                chapterNumber={chapterData?.number ?? chapterContent?.number ?? chapterNumber}
                volume={chapterData?.volume ?? chapterContent?.volume ?? volumeParam}
              />
            </section>
          ) : null}
        </>
      ) : null}

      {isImageReader ? shouldShowImageReaderSiteFooter ? <Footer /> : null : <Footer />}
    </div>
  );
};

export default ProjectReading;
