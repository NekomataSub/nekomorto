import {
  BookOpen,
  CalendarDays,
  Clock3,
  Cloud,
  Copy,
  Download,
  Film,
  HardDrive,
  Hash,
  Link2,
  PlayCircle,
  Send,
  Share2,
  Users,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import CommentsSection from "@/components/CommentsSection";
import PublicLink from "@/components/PublicLink";
import PublicProjectCard from "@/components/project/PublicProjectCard";
import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import ThemedSvgLogo from "@/components/ThemedSvgLogo";
import UploadPicture from "@/components/UploadPicture";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PillButton } from "@/components/ui/pill-button";
import { toast } from "@/components/ui/use-toast";
import type { Project } from "@/data/projects";
import {
  usePublishResolvedPublicSnapshots,
  useResolvedPublicBootstrap,
  useResolvedPublicRoutePayload,
} from "@/hooks/public-bootstrap-provider";
import { usePageMeta } from "@/hooks/use-page-meta";
import { usePublicBootstrap } from "@/hooks/use-public-bootstrap";
import { usePublicCurrentUser } from "@/hooks/use-public-current-user";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { canManageProjectsAccess } from "@/lib/access-control";
import { getApiBase } from "@/lib/api-base";
import { apiFetch, apiFetchBestEffort } from "@/lib/api-client";
import { normalizeAssetUrl } from "@/lib/asset-url";
import { formatDate } from "@/lib/date";
import { formatBytesCompact } from "@/lib/file-size";
import { usePublicDocumentLocation } from "@/lib/public-document-navigation";
import { PROJECT_COVER_ASPECT_RATIO } from "@/lib/project-card-layout";
import { buildProjectPublicReadingHref } from "@/lib/project-editor-routes";
import { buildEpisodeKey } from "@/lib/project-episode-key";
import {
  buildTranslationMap,
  sortByTranslatedLabel,
  translateAnilistRole,
  translateGenre,
  translateRelation,
  translateTag,
} from "@/lib/project-taxonomy";
import { isChapterBasedType, isMangaType } from "@/lib/project-utils";
import { findVolumeCoverByVolume } from "@/lib/project-volume-cover-key";
import { normalizeProjectVolumeEntries } from "@/lib/project-volume-entries";
import { PUBLIC_ANALYTICS_INGEST_PATH } from "@/lib/public-analytics";
import {
  hasPublicEpisodePages,
  hasPublicEpisodeReadableContent,
} from "@/lib/public-project-episodes";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import type {
  PublicBootstrapPayload,
  PublicBootstrapProject,
  PublicRoutePayloadProjectLookup,
  PublicRouteProjectDetailPayload,
} from "@/types/public-bootstrap";
import {
  peekPreloadedPublicRoutePayload,
  preloadPublicRoutePayload,
} from "@/routes/public-preload";
import NotFound from "./NotFound";

type ProjectFilterPillTone = "secondary" | "outline";

type DownloadSourceButtonStyle = CSSProperties & {
  "--download-source-hover-bg": string;
};

type ProjectFilterPillLinkProps = {
  label: string;
  to: string;
  tone: ProjectFilterPillTone;
};

const normalizeProjectStaffEntries = (value: unknown) => {
  const entries = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.entries(value).map(([role, members]) => ({ role, members }))
      : [];

  if (!entries.length) {
    return [];
  }

  return entries
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const staff = entry as { role?: unknown; members?: unknown };
      const role = String(staff.role || "").trim();
      const members = Array.isArray(staff.members)
        ? staff.members.map((member) => String(member || "").trim()).filter(Boolean)
        : String(staff.members || "")
            .split(",")
            .map((member) => member.trim())
            .filter(Boolean);

      return role || members.length ? { role, members } : null;
    })
    .filter((entry): entry is { role: string; members: string[] } => Boolean(entry));
};

const shouldProjectStaffEntrySpanColumns = (members: string[]) => {
  const memberText = members.join(", ");
  return memberText.length > 64;
};

const buildProjectStaffEntryColumnSpans = (entries: Array<{ members: string[] }>) => {
  const spans = new Set<number>();
  let pendingSingleIndex: number | null = null;

  entries.forEach((entry, index) => {
    if (shouldProjectStaffEntrySpanColumns(entry.members)) {
      if (pendingSingleIndex !== null) {
        spans.add(pendingSingleIndex);
        pendingSingleIndex = null;
      }
      spans.add(index);
      return;
    }

    if (pendingSingleIndex === null) {
      pendingSingleIndex = index;
      return;
    }

    pendingSingleIndex = null;
  });

  if (pendingSingleIndex !== null) {
    spans.add(pendingSingleIndex);
  }

  return spans;
};

const projectFilterPillClassName =
  "h-6 min-h-6 min-w-6 gap-0 rounded-full px-2 py-0 text-[10px] uppercase leading-none";

const ProjectFilterPillLink = ({ label, to, tone }: ProjectFilterPillLinkProps) => (
  <PillButton asChild tone={tone} className={projectFilterPillClassName}>
    <PublicLink href={to}>{label}</PublicLink>
  </PillButton>
);

const resolveProjectSlugFromPath = (pathname: string) => {
  const match = String(pathname || "").match(/^\/projeto\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const buildDownloadSourceHoverColor = (color: string) => {
  const trimmed = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `${trimmed}24`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, red, green, blue] = trimmed;
    return `#${red}${red}${green}${green}${blue}${blue}24`;
  }
  return `color-mix(in srgb, ${trimmed} 14%, transparent)`;
};

const buildDownloadSourceButtonStyle = (color: string): DownloadSourceButtonStyle => ({
  borderColor: `${color}99`,
  color,
  "--download-source-hover-bg": buildDownloadSourceHoverColor(color),
});

const normalizeProjectRouteKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const resolveBootstrapProject = (
  bootstrapData: PublicBootstrapPayload | null,
  slug: string | undefined,
): PublicBootstrapProject | null => {
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

const buildRelationProjectLookup = ({
  project,
  projects,
}: {
  project: PublicBootstrapProject | null;
  projects: Array<Pick<Project, "id" | "anilistId">>;
}): PublicRoutePayloadProjectLookup => {
  if (!project?.relations?.length) {
    return {};
  }
  const relationKeys = new Set<string>();
  project.relations.forEach((relation) => {
    const relationProjectId = String(relation.projectId || "").trim();
    const relationAniListId = String(relation.anilistId || "").trim();
    if (relationProjectId) {
      relationKeys.add(relationProjectId);
    }
    if (relationAniListId) {
      relationKeys.add(relationAniListId);
    }
  });
  return projects.reduce<PublicRoutePayloadProjectLookup>((result, entry) => {
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

const resolveProjectRoutePayloadForSlug = (
  payload: PublicRouteProjectDetailPayload | null,
  slug: string | undefined,
) => {
  if (!payload?.project) {
    return null;
  }
  const projectListBootstrap = {
    projects: [payload.project],
  } as PublicBootstrapPayload;
  return resolveBootstrapProject(projectListBootstrap, slug) ? payload : null;
};

const hasProjectRoutePayloadTranslations = (payload: PublicRouteProjectDetailPayload | null) =>
  Boolean(
    payload?.tagTranslations &&
      (Object.keys(payload.tagTranslations.tags || {}).length > 0 ||
        Object.keys(payload.tagTranslations.genres || {}).length > 0 ||
        Object.keys(payload.tagTranslations.staffRoles || {}).length > 0),
  );

const ProjectPage = ({
  renderHero = true,
  slug: slugProp,
}: {
  renderHero?: boolean;
  slug?: string;
}) => {
  const location = usePublicDocumentLocation();
  const params = useParams();
  const slug = slugProp || resolveProjectSlugFromPath(location.pathname) || params.slug;
  const apiBase = getApiBase();
  const bootstrapData = useResolvedPublicBootstrap();
  const routePayload = useResolvedPublicRoutePayload();
  const { publishPublicRoutePayload } = usePublishResolvedPublicSnapshots();
  const hasFullBootstrap = bootstrapData?.payloadMode === "full";
  const rawProjectRoutePayload = routePayload?.kind === "project-detail" ? routePayload : null;
  const canonicalProjectPath = slug ? `/projeto/${slug}` : "";
  const bootstrapProject = resolveBootstrapProject(bootstrapData, slug);
  const projectRoutePayload = useMemo(
    () => resolveProjectRoutePayloadForSlug(rawProjectRoutePayload, slug),
    [rawProjectRoutePayload, slug],
  );
  const preloadedProjectRoutePayload = useMemo(() => {
    const payload = peekPreloadedPublicRoutePayload(canonicalProjectPath);
    return payload?.kind === "project-detail"
      ? resolveProjectRoutePayloadForSlug(payload, slug)
      : null;
  }, [canonicalProjectPath, slug]);
  const routeProject = projectRoutePayload?.project
    ? (projectRoutePayload.project as Project)
    : null;
  const preloadedProject = preloadedProjectRoutePayload?.project
    ? (preloadedProjectRoutePayload.project as Project)
    : null;
  const bootstrapProjectSnapshot = hasFullBootstrap ? (bootstrapProject as Project | null) : null;
  const initialProject = routeProject || preloadedProject || bootstrapProjectSnapshot || null;
  const [project, setProject] = useState<Project | null>(() => initialProject);
  const [projectRevision, setProjectRevision] = useState(
    () => projectRoutePayload?.revision || preloadedProjectRoutePayload?.revision || "",
  );
  const [hasLoaded, setHasLoaded] = useState(Boolean(initialProject));
  const [relationProjectLookup, setRelationProjectLookup] =
    useState<PublicRoutePayloadProjectLookup>(
      () =>
        projectRoutePayload?.relationProjectLookup ||
        preloadedProjectRoutePayload?.relationProjectLookup ||
        buildRelationProjectLookup({
          project: bootstrapProjectSnapshot as PublicBootstrapProject | null,
          projects: hasFullBootstrap ? ((bootstrapData?.projects || []) as Project[]) : [],
        }),
    );
  const [tagTranslations, setTagTranslations] = useState<Record<string, string>>(
    () =>
      projectRoutePayload?.tagTranslations?.tags ||
      preloadedProjectRoutePayload?.tagTranslations?.tags ||
      (hasFullBootstrap ? bootstrapData?.tagTranslations?.tags || {} : {}),
  );
  const [genreTranslations, setGenreTranslations] = useState<Record<string, string>>(
    () =>
      projectRoutePayload?.tagTranslations?.genres ||
      preloadedProjectRoutePayload?.tagTranslations?.genres ||
      (hasFullBootstrap ? bootstrapData?.tagTranslations?.genres || {} : {}),
  );
  const [staffRoleTranslations, setStaffRoleTranslations] = useState<Record<string, string>>(
    () =>
      projectRoutePayload?.tagTranslations?.staffRoles ||
      preloadedProjectRoutePayload?.tagTranslations?.staffRoles ||
      (hasFullBootstrap ? bootstrapData?.tagTranslations?.staffRoles || {} : {}),
  );
  const [hasLoadedTaxonomyTranslations, setHasLoadedTaxonomyTranslations] = useState(
    () =>
      hasProjectRoutePayloadTranslations(projectRoutePayload) ||
      hasProjectRoutePayloadTranslations(preloadedProjectRoutePayload) ||
      hasFullBootstrap,
  );
  const shouldHydrateProjectMetaFromApi =
    !hasFullBootstrap &&
    (!projectRoutePayload || !hasProjectRoutePayloadTranslations(projectRoutePayload));
  const { status: bootstrapStatus } = usePublicBootstrap();
  const isHydratingProject = !project && !hasLoaded;
  const hasHydrationError = isHydratingProject && bootstrapStatus === "error";
  const { currentUser } = usePublicCurrentUser();
  const [episodePage, setEpisodePage] = useState(1);
  const [mediaVariants, setMediaVariants] = useState<UploadMediaVariantsMap>(
    () =>
      projectRoutePayload?.mediaVariants ||
      (hasFullBootstrap ? bootstrapData?.mediaVariants || {} : {}),
  );
  const { settings } = useSiteSettings();
  const trackedViewsRef = useRef<Set<string>>(new Set());
  const projectOgImageAlt = project?.title
    ? `Card de compartilhamento do projeto ${project.title}`
    : undefined;

  const shareImage = useMemo(
    () =>
      project?.id
        ? normalizeAssetUrl(
            `/api/og/project/${encodeURIComponent(project.id)}${
              projectRevision ? `?v=${encodeURIComponent(projectRevision)}` : ""
            }`,
          )
        : normalizeAssetUrl(settings.site.defaultShareImage),
    [project?.id, projectRevision, settings.site.defaultShareImage],
  );

  usePageMeta({
    title: project?.title || "Projeto",
    description: project?.synopsis || "",
    image: shareImage,
    imageAlt: projectOgImageAlt || settings.site.defaultShareImageAlt || undefined,
    mediaVariants,
    type: "article",
  });

  const applyProjectRoutePayloadSnapshot = useCallback(
    (payload: PublicRouteProjectDetailPayload, options?: { publish?: boolean }) => {
      setProject((payload.project as Project | null) || null);
      setProjectRevision(payload.revision || "");
      setMediaVariants(payload.mediaVariants || {});
      setRelationProjectLookup(payload.relationProjectLookup || {});
      if (hasProjectRoutePayloadTranslations(payload)) {
        setTagTranslations(payload.tagTranslations?.tags || {});
        setGenreTranslations(payload.tagTranslations?.genres || {});
        setStaffRoleTranslations(payload.tagTranslations?.staffRoles || {});
        setHasLoadedTaxonomyTranslations(true);
      }
      setHasLoaded(Boolean(payload.project));
      if (options?.publish) {
        publishPublicRoutePayload(payload);
      }
    },
    [publishPublicRoutePayload],
  );

  const applyBootstrapProjectSnapshot = useCallback(
    (nextProject: Project) => {
      setProject(nextProject);
      setProjectRevision("");
      setHasLoaded(true);
      setMediaVariants(bootstrapData?.mediaVariants || {});
      setRelationProjectLookup(
        buildRelationProjectLookup({
          project: nextProject as PublicBootstrapProject | null,
          projects: (bootstrapData?.projects || []) as Project[],
        }),
      );
      setTagTranslations(bootstrapData?.tagTranslations?.tags || {});
      setGenreTranslations(bootstrapData?.tagTranslations?.genres || {});
      setStaffRoleTranslations(bootstrapData?.tagTranslations?.staffRoles || {});
      setHasLoadedTaxonomyTranslations(true);
    },
    [
      bootstrapData?.mediaVariants,
      bootstrapData?.projects,
      bootstrapData?.tagTranslations?.genres,
      bootstrapData?.tagTranslations?.staffRoles,
      bootstrapData?.tagTranslations?.tags,
    ],
  );

  const clearProjectPendingState = useCallback(() => {
    setProject(null);
    setProjectRevision("");
    setMediaVariants({});
    setRelationProjectLookup({});
    setHasLoaded(false);
  }, []);

  useEffect(() => {
    if (!slug) {
      return;
    }
    if (projectRoutePayload) {
      applyProjectRoutePayloadSnapshot(projectRoutePayload);
      return;
    }
    if (preloadedProjectRoutePayload) {
      applyProjectRoutePayloadSnapshot(preloadedProjectRoutePayload, { publish: true });
      return;
    }
    if (bootstrapProjectSnapshot) {
      applyBootstrapProjectSnapshot(bootstrapProjectSnapshot);
      return;
    }
    clearProjectPendingState();
    let isActive = true;
    const load = async () => {
      const preloadedPayload = await preloadPublicRoutePayload(canonicalProjectPath);
      if (!isActive) {
        return;
      }
      if (preloadedPayload?.kind === "project-detail") {
        const matchingPayload = resolveProjectRoutePayloadForSlug(preloadedPayload, slug);
        if (matchingPayload) {
          applyProjectRoutePayloadSnapshot(matchingPayload, { publish: true });
          return;
        }
      }
      if (isActive) {
        setHasLoaded(true);
      }
    };
    void load();
    return () => {
      isActive = false;
    };
  }, [
    apiBase,
    applyBootstrapProjectSnapshot,
    applyProjectRoutePayloadSnapshot,
    bootstrapProjectSnapshot,
    canonicalProjectPath,
    clearProjectPendingState,
    preloadedProjectRoutePayload,
    projectRoutePayload,
    slug,
  ]);

  useEffect(() => {
    if (!project?.id) {
      return;
    }
    if (trackedViewsRef.current.has(project.id)) {
      return;
    }
    trackedViewsRef.current.add(project.id);
    void apiFetchBestEffort(apiBase, `/api/public/projects/${project.id}/view`, {
      method: "POST",
    });
  }, [apiBase, project?.id]);
  useEffect(() => {
    if (!shouldHydrateProjectMetaFromApi) {
      return;
    }
    let isActive = true;
    const loadMeta = async () => {
      const shouldLoadTranslations = !hasLoadedTaxonomyTranslations;
      try {
        const tagsResult = shouldLoadTranslations
          ? await apiFetch(apiBase, "/api/public/tag-translations", {
              cache: "no-store",
            })
          : null;
        if (shouldLoadTranslations) {
          if (tagsResult?.ok) {
            const data = await tagsResult.json();
            if (isActive) {
              setTagTranslations(data.tags || {});
              setGenreTranslations(data.genres || {});
              setStaffRoleTranslations(data.staffRoles || {});
            }
          }
          if (isActive) {
            setHasLoadedTaxonomyTranslations(true);
          }
        }
      } catch {
        if (isActive) {
          if (!hasLoadedTaxonomyTranslations) {
            setTagTranslations({});
            setGenreTranslations({});
            setStaffRoleTranslations({});
            setHasLoadedTaxonomyTranslations(true);
          }
        }
      }
    };

    void loadMeta();
    return () => {
      isActive = false;
    };
  }, [apiBase, hasLoadedTaxonomyTranslations, shouldHydrateProjectMetaFromApi]);

  const projectDetails = useMemo(() => {
    if (!project) {
      return [];
    }
    const typeLabel = (project.type || "").toLowerCase();
    const isChapterBased = isChapterBasedType(typeLabel);
    return [
      { label: "Formato", value: project.type },
      { label: "Status", value: project.status },
      { label: "Ano", value: project.year },
      { label: "Estúdio", value: project.studio },
      { label: "Temporada", value: project.season },
      {
        label: isChapterBased ? "Capítulos" : "Episódios",
        value: project.episodes,
      },
      { label: "Classificação", value: project.rating },
      { label: "Agenda", value: project.schedule },
    ].filter((item) => String(item.value || "").trim().length > 0);
  }, [project]);

  const tagTranslationMap = useMemo(() => buildTranslationMap(tagTranslations), [tagTranslations]);
  const genreTranslationMap = useMemo(
    () => buildTranslationMap(genreTranslations),
    [genreTranslations],
  );
  const staffRoleTranslationMap = useMemo(
    () => buildTranslationMap(staffRoleTranslations),
    [staffRoleTranslations],
  );

  const sortedTags = useMemo(() => {
    const tags = Array.isArray(project?.tags) ? project.tags : [];
    return sortByTranslatedLabel(tags, (tag) => translateTag(tag, tagTranslationMap));
  }, [project?.tags, tagTranslationMap]);

  const sortedGenres = useMemo(() => {
    const genres = Array.isArray(project?.genres) ? project.genres : [];
    return sortByTranslatedLabel(genres, (genre) => translateGenre(genre, genreTranslationMap));
  }, [project?.genres, genreTranslationMap]);

  const animeStaffEntries = useMemo(
    () => normalizeProjectStaffEntries(project?.animeStaff),
    [project?.animeStaff],
  );

  const animeStaffEntryColumnSpans = useMemo(
    () => buildProjectStaffEntryColumnSpans(animeStaffEntries),
    [animeStaffEntries],
  );

  const fansubStaffEntries = useMemo(
    () => normalizeProjectStaffEntries(project?.staff),
    [project?.staff],
  );

  const sourceThemeMap = useMemo(() => {
    const map = new Map<string, { color: string; icon?: string; tintIcon: boolean }>();
    settings.downloads.sources.forEach((source) => {
      if (!source?.label) {
        return;
      }
      map.set(source.label.toLowerCase(), {
        color: source.color || "#7C3AED",
        icon: source.icon,
        tintIcon: source.tintIcon !== false,
      });
    });
    return map;
  }, [settings.downloads.sources]);

  const renderSourceIcon = (
    iconKey: string | undefined,
    color: string,
    label?: string,
    tintIcon = true,
  ) => {
    if (
      iconKey &&
      (iconKey.startsWith("http") || iconKey.startsWith("data:") || iconKey.startsWith("/uploads/"))
    ) {
      if (!tintIcon) {
        return <img src={iconKey} alt={label || ""} className="h-4 w-4" />;
      }
      return (
        <ThemedSvgLogo
          url={iconKey}
          label={label || "Fonte de download"}
          className="h-4 w-4"
          color={color}
        />
      );
    }
    const normalized = String(iconKey || "").toLowerCase();
    if (normalized === "google-drive") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" style={{ color }}>
          <path fill="currentColor" d="M7.5 3h9l4.5 8-4.5 8h-9L3 11z" />
        </svg>
      );
    }
    if (normalized === "mega") {
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
          <circle cx="12" cy="12" r="10" fill={color} />
          <path
            fill="#fff"
            d="M7.2 16.4V7.6h1.6l3.2 4.2 3.2-4.2h1.6v8.8h-1.6V10l-3.2 4.1L8.8 10v6.4z"
          />
        </svg>
      );
    }
    const iconMap: Record<string, typeof Download> = {
      telegram: Send,
      mediafire: Cloud,
      torrent: HardDrive,
      link: Link2,
      download: Download,
    };
    const Icon = iconMap[normalized] || Download;
    return <Icon className="h-4 w-4" style={{ color }} />;
  };

  const buildEpisodeMetadata = (episode: { sizeBytes?: number; hash?: string }) => {
    const rawSize = Number(episode.sizeBytes);
    const sizeLabel = Number.isFinite(rawSize) && rawSize > 0 ? formatBytesCompact(rawSize) : "";
    const hashTitle = String(episode.hash || "").trim();

    let hashType = "MD5";
    let hashValue = hashTitle;

    const match = hashTitle.match(/^([A-Za-z0-9-]+):\s*(.+)$/);
    if (match) {
      hashType = match[1];
      hashValue = match[2];
    }

    return {
      sizeLabel,
      hashType,
      hashValue,
      hashTitle,
    };
  };

  const getEpisodeSourceTypeLabel = (value: unknown) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }
    const normalized = trimmed
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z]/g, "")
      .toLowerCase();
    if (normalized === "tv") {
      return "TV";
    }
    if (normalized === "web") {
      return "Web";
    }
    if (normalized === "bluray") {
      return "Blu-ray";
    }
    return trimmed;
  };

  const getEpisodeEntryKind = (episode: { entryKind?: string } | null | undefined) =>
    episode?.entryKind === "extra" ? "extra" : "main";

  const compareEpisodeOrdering = (
    left: { number?: number; volume?: number; readingOrder?: number },
    right: { number?: number; volume?: number; readingOrder?: number },
  ) => {
    const leftReadingOrder = Number(left?.readingOrder);
    const rightReadingOrder = Number(right?.readingOrder);
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
    const numberDelta = (left.number || 0) - (right.number || 0);
    if (numberDelta !== 0) {
      return numberDelta;
    }
    return (left.volume || 0) - (right.volume || 0);
  };

  const downloadableEpisodes = useMemo(
    () => (project?.episodeDownloads || []).filter((episode) => (episode.sources || []).length > 0),
    [project?.episodeDownloads],
  );

  const readableChapters = useMemo(
    () =>
      (project?.episodeDownloads || []).filter(
        (episode) => hasPublicEpisodeReadableContent(episode) || (episode.sources || []).length > 0,
      ),
    [project?.episodeDownloads],
  );

  const sortedDownloadableEpisodes = useMemo(() => {
    return [...downloadableEpisodes].sort((a, b) => compareEpisodeOrdering(a, b));
  }, [downloadableEpisodes]);

  const sortedReadableChapters = useMemo(
    () => [...readableChapters].sort((a, b) => compareEpisodeOrdering(a, b)),
    [readableChapters],
  );

  const filteredReadableChapters = sortedReadableChapters;
  const firstReadableChapter =
    filteredReadableChapters.find((episode) => hasPublicEpisodeReadableContent(episode)) || null;

  const visibleRelations = useMemo(() => {
    if (!project?.relations?.length) {
      return [];
    }
    return project.relations.filter((relation) => {
      const relationProjectId = String(relation.projectId || "").trim();
      const relationAniListId = String(relation.anilistId || "").trim();
      return Boolean(
        relationProjectId || (relationAniListId && relationProjectLookup[relationAniListId]),
      );
    });
  }, [project?.relations, relationProjectLookup]);

  const projectType = project?.type || "";
  const projectId = project?.id || "";
  const projectFallbackCardImage = project?.banner || project?.cover || "/placeholder.svg";
  const isManga = isMangaType(projectType);
  const isChapterBased = isChapterBasedType(projectType);
  const canEditProject = useMemo(() => {
    return canManageProjectsAccess(currentUser);
  }, [currentUser]);
  type EpisodeItem = (typeof sortedDownloadableEpisodes)[number];

  const trackDownloadClick = (episode: EpisodeItem, sourceLabel: string) => {
    if (!project?.id) {
      return;
    }
    const chapterNumber = Number(episode.number);
    const volumeNumber = Number(episode.volume);
    const resourceId = `${project.id}:${Number.isFinite(chapterNumber) ? chapterNumber : 0}:${
      Number.isFinite(volumeNumber) ? volumeNumber : 0
    }`;
    const payload: {
      eventType: "download_click";
      resourceType: "chapter";
      resourceId: string;
      meta: {
        projectId: string;
        sourceLabel: string;
        chapterNumber?: number;
        volume?: number;
      };
    } = {
      eventType: "download_click",
      resourceType: "chapter",
      resourceId,
      meta: {
        projectId: project.id,
        sourceLabel: String(sourceLabel || "").trim(),
      },
    };
    if (Number.isFinite(chapterNumber)) {
      payload.meta.chapterNumber = chapterNumber;
    }
    if (Number.isFinite(volumeNumber)) {
      payload.meta.volume = volumeNumber;
    }
    void apiFetchBestEffort(apiBase, PUBLIC_ANALYTICS_INGEST_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  type EpisodeReadAction = {
    href: string;
    label: string;
  };

  type VolumeGroup = {
    label: string;
    volume?: number;
    items: EpisodeItem[];
  };

  type VolumeGroupMeta = {
    src: string;
    alt: string;
    synopsis: string;
  };

  type RenderEpisodeCardOptions = {
    showRawBadge?: boolean;
    readAction?: EpisodeReadAction | null;
    showSynopsis?: boolean;
    emptyStateBadge?: string;
  };

  const renderEpisodeDownloadCard = (
    episode: EpisodeItem,
    key: string,
    options: RenderEpisodeCardOptions = {},
  ) => {
    const {
      showRawBadge = false,
      readAction = null,
      showSynopsis = false,
      emptyStateBadge = "Em breve",
    } = options;
    const { sizeLabel, hashType, hashValue, hashTitle } = buildEpisodeMetadata(episode);
    const isExtraEntry = getEpisodeEntryKind(episode) === "extra";
    const isAnimeDownloadCard = !isChapterBased;
    const sources = episode.sources || [];
    const hasReadAction = Boolean(readAction?.href && readAction.label);
    const hasSources = sources.length > 0;
    const sourceTypeLabel = getEpisodeSourceTypeLabel(episode.sourceType);
    const episodeBadgeLabel = isExtraEntry
      ? String(episode.displayLabel || "Extra").trim() || "Extra"
      : isChapterBased
        ? `Cap ${episode.number}${episode.volume ? ` • Vol. ${episode.volume}` : ""}`
        : `EP ${episode.number}`;

    return (
      <Card
        key={key}
        className={`group/download-card w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-floating-soft transition-[border-color] duration-200 hover:border-primary/60 ${
          isAnimeDownloadCard ? "md:h-[210px]" : "md:min-h-[185px]"
        }`}
      >
        <CardContent className="relative grid h-full gap-4 p-4 md:grid-cols-[316px_minmax(0,1fr)] md:items-start md:gap-4 md:p-4">
          <div className="w-full overflow-hidden rounded-xl border border-border/40 bg-background/50 shadow-inner md:h-[178px] md:w-[316px]">
            <UploadPicture
              src={episode.coverImageUrl || projectFallbackCardImage}
              alt={`Prévia de ${episode.title}`}
              preset="cardWide"
              mediaVariants={mediaVariants}
              className="h-full w-full"
              imgClassName="h-full w-full aspect-video object-cover object-center transition-transform duration-300 group-hover/download-card:scale-105"
            />
          </div>
          <div className="relative h-full md:min-h-[178px] md:pr-0">
            <div className="space-y-2.5 md:pb-[52px]">
              <div className="flex min-w-0 flex-wrap items-center gap-2 md:pr-20">
                <Badge
                  variant="secondary"
                  className="rounded-full px-2.5 py-0.5 text-[10px] uppercase"
                >
                  {episodeBadgeLabel}
                </Badge>
                {showRawBadge && sourceTypeLabel ? (
                  <Badge
                    variant="outline"
                    className="inline-flex items-center gap-1 rounded-full border-primary/25 bg-background/70 text-[10px] uppercase tracking-wide md:absolute md:right-0 md:top-0"
                  >
                    <HardDrive className="h-3 w-3" />
                    {sourceTypeLabel}
                  </Badge>
                ) : null}
                <p className="min-w-0 flex-1 basis-full text-base font-semibold text-foreground md:basis-auto md:truncate md:text-lg">
                  {episode.title}
                </p>
              </div>
              <div className="flex flex-col items-start gap-1.5 text-xs text-muted-foreground">
                {episode.duration ? (
                  <span
                    className="inline-flex min-w-0 max-w-full items-center gap-1"
                    title={String(episode.duration)}
                  >
                    <Clock3 className="h-3.5 w-3.5 text-primary/70" />
                    <span className="font-medium text-foreground/90">Duração:</span>
                    <span className="truncate">{episode.duration}</span>
                  </span>
                ) : null}
                {episode.releaseDate ? (
                  <span
                    className="inline-flex min-w-0 max-w-full items-center gap-1"
                    title={formatDate(episode.releaseDate)}
                  >
                    <CalendarDays className="h-3.5 w-3.5 text-primary/70" />
                    <span className="font-medium text-foreground/90">Data:</span>
                    <span className="truncate">{formatDate(episode.releaseDate)}</span>
                  </span>
                ) : null}
                {sizeLabel ? (
                  <span
                    className="inline-flex min-w-0 max-w-full items-center gap-1"
                    title={sizeLabel}
                  >
                    <HardDrive className="h-3.5 w-3.5 text-primary/70" />
                    <span className="font-medium text-foreground/90">Tamanho:</span>
                    <span className="truncate">{sizeLabel}</span>
                  </span>
                ) : null}
                {hashValue ? (
                  <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                    <Hash className="mt-0 h-3.5 w-3.5 shrink-0 text-primary/70" />
                    <span className="shrink-0 font-medium text-foreground/90">{hashType}:</span>
                    <span className="break-all" title={hashTitle}>
                      {hashValue}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        navigator.clipboard.writeText(hashValue);
                        toast({
                          title: "Copiado",
                          description: `${hashType} copiado para a área de transferência.`,
                        });
                      }}
                      className="ml-1 shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      aria-label={`Copiar ${hashType}`}
                      title={`Copiar ${hashType}`}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </span>
                ) : null}
              </div>
              {showSynopsis && episode.synopsis ? (
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {episode.synopsis}
                </p>
              ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 md:absolute md:bottom-0 md:left-0 md:right-0 md:mt-0 md:justify-end">
              {hasReadAction ? (
                <Button asChild size="sm">
                  <PublicLink href={String(readAction?.href || "#")}>
                    {String(readAction?.label || "")}
                  </PublicLink>
                </Button>
              ) : null}
              {hasSources
                ? sources.map((source, sourceIndex) => {
                    const theme = sourceThemeMap.get(source.label.toLowerCase());
                    const color = theme?.color || "#4b5563";
                    const icon = renderSourceIcon(
                      theme?.icon,
                      color,
                      source.label,
                      theme?.tintIcon ?? true,
                    );
                    return (
                      <Button
                        key={`${key}-${source.label}-${sourceIndex}`}
                        asChild
                        variant="outline"
                        size="sm"
                        className="h-9 w-9 rounded-full bg-card/70 px-0 text-sm hover:bg-(--download-source-hover-bg) md:w-auto md:px-4"
                        style={buildDownloadSourceButtonStyle(color)}
                      >
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={source.label}
                          title={source.label}
                          className="inline-flex items-center justify-center gap-0 md:gap-2"
                          onClick={() => trackDownloadClick(episode, source.label)}
                        >
                          {icon}
                          <span className="sr-only md:not-sr-only">{source.label}</span>
                        </a>
                      </Button>
                    );
                  })
                : null}
              {!hasReadAction && !hasSources && emptyStateBadge ? (
                <Badge variant="outline" className="text-[10px] uppercase">
                  {emptyStateBadge}
                </Badge>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  type RenderChapterCardOptions = {
    allowReadAction: boolean;
  };

  const renderChapterDownloadCard = (
    chapter: EpisodeItem,
    key: string,
    options: RenderChapterCardOptions,
  ) => {
    const { allowReadAction } = options;
    const isExtraEntry = getEpisodeEntryKind(chapter) === "extra";
    const chapterLabel = isExtraEntry
      ? String(chapter.displayLabel || "Extra").trim() || "Extra"
      : Number.isFinite(Number(chapter.number))
        ? `Capítulo ${chapter.number}`
        : "Capítulo";
    const rawChapterTitle = String(chapter.title || "").trim();
    const normalizedChapterTitle = rawChapterTitle.toLocaleLowerCase();
    const isGenericNumberedChapterTitle = /^cap[íi]tulo\s+\d+$/i.test(rawChapterTitle);
    const hasRelevantCustomTitle =
      rawChapterTitle.length > 0 &&
      normalizedChapterTitle !== "capítulo" &&
      normalizedChapterTitle !== "capitulo" &&
      normalizedChapterTitle !== "extra" &&
      !isGenericNumberedChapterTitle;
    const chapterTitle = hasRelevantCustomTitle ? rawChapterTitle : chapterLabel;
    const hasContent = hasPublicEpisodeReadableContent(chapter);
    const hasPages = hasPublicEpisodePages(chapter);
    const hasSources = (chapter.sources || []).length > 0;
    const readAction: EpisodeReadAction | null =
      allowReadAction && hasContent
        ? {
            href: buildProjectPublicReadingHref(projectId, chapter.number, chapter.volume),
            label: isExtraEntry
              ? "Ler extra"
              : hasPages && !hasSources
                ? "Abrir leitor"
                : "Ler capítulo",
          }
        : null;

    return (
      <Card
        key={key}
        className="chapter-download-card group/chapter-card w-full transform-none! rounded-2xl border border-border/60 bg-background/40 shadow-project-download-card"
      >
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <p
            className="chapter-download-card__title min-w-0 text-base font-semibold text-foreground md:flex-1 md:pr-4 md:truncate"
            title={chapterTitle}
          >
            {chapterTitle}
          </p>

          <div className="chapter-download-card__actions flex flex-wrap items-center gap-2 md:justify-end">
            {hasSources
              ? (chapter.sources || []).map((source, sourceIndex) => {
                  const theme = sourceThemeMap.get(source.label.toLowerCase());
                  const color = theme?.color || "#4b5563";
                  const icon = renderSourceIcon(
                    theme?.icon,
                    color,
                    source.label,
                    theme?.tintIcon ?? true,
                  );
                  return (
                    <Button
                      key={`${key}-${source.label}-${sourceIndex}`}
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-9 w-9 rounded-full bg-card/70 px-0 text-sm hover:bg-(--download-source-hover-bg) md:w-auto md:px-4"
                      style={buildDownloadSourceButtonStyle(color)}
                    >
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={source.label}
                        title={source.label}
                        className="inline-flex items-center justify-center gap-0 md:gap-2"
                        onClick={() => trackDownloadClick(chapter, source.label)}
                      >
                        {icon}
                        <span className="sr-only md:not-sr-only">{source.label}</span>
                      </a>
                    </Button>
                  );
                })
              : null}
            {readAction ? (
              <Button asChild size="sm" className="order-last">
                <PublicLink href={readAction.href}>{readAction.label}</PublicLink>
              </Button>
            ) : null}
            {!readAction && !hasSources ? (
              <Badge variant="outline" className="text-[10px] uppercase">
                Em breve
              </Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  };

  const buildChapterListItemKey = (chapter: EpisodeItem, index: number) => {
    const readingOrder = Number(chapter.readingOrder);
    const readingOrderKey = Number.isFinite(readingOrder) ? String(readingOrder) : "none";
    const entryKind = getEpisodeEntryKind(chapter);
    const labelKey = String(chapter.displayLabel || chapter.title || "").trim() || "untitled";
    return [
      buildEpisodeKey(chapter.number, chapter.volume),
      entryKind,
      readingOrderKey,
      labelKey,
      index,
    ].join(":");
  };

  const volumeGroups = useMemo(() => {
    const groups = new Map<string, VolumeGroup>();
    const allItems = isChapterBased ? sortedReadableChapters : sortedDownloadableEpisodes;
    allItems.forEach((item) => {
      const volumeKey =
        typeof item.volume === "number" && !Number.isNaN(item.volume)
          ? String(item.volume)
          : "none";
      if (!groups.has(volumeKey)) {
        groups.set(volumeKey, {
          label: volumeKey === "none" ? "Sem volume" : `Volume ${volumeKey}`,
          volume: volumeKey === "none" ? undefined : Number(volumeKey),
          items: [],
        });
      }
      groups.get(volumeKey)?.items.push(item);
    });
    const entries = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === "none") return 1;
      if (b[0] === "none") return -1;
      return Number(a[0]) - Number(b[0]);
    });
    return entries.map(([, value]) => value);
  }, [isChapterBased, sortedDownloadableEpisodes, sortedReadableChapters]);

  const normalizedVolumeEntries = useMemo(() => {
    return normalizeProjectVolumeEntries(
      Array.isArray(project?.volumeEntries)
        ? project.volumeEntries
        : Array.isArray(project?.volumeCovers)
          ? project.volumeCovers
          : [],
    );
  }, [project?.volumeEntries, project?.volumeCovers]);

  const resolveVolumeGroupMeta = (group: VolumeGroup): VolumeGroupMeta => {
    const volumeEntry = findVolumeCoverByVolume(normalizedVolumeEntries, group.volume);
    const volumeCover = findVolumeCoverByVolume(project?.volumeCovers, group.volume);
    const firstEpisodeWithCover = group.items.find(
      (item) => String(item.coverImageUrl || "").trim().length > 0,
    );
    const hasNumericVolume = Number.isFinite(Number(group.volume));
    return {
      src:
        volumeEntry?.coverImageUrl ||
        volumeCover?.coverImageUrl ||
        firstEpisodeWithCover?.coverImageUrl ||
        project?.cover ||
        project?.banner ||
        "/placeholder.svg",
      alt:
        volumeEntry?.coverImageAlt ||
        volumeCover?.coverImageAlt ||
        String(firstEpisodeWithCover?.coverImageAlt || "").trim() ||
        (hasNumericVolume
          ? `Capa do volume ${Number(group.volume)} de ${project?.title || ""}`
          : `Capa do projeto ${project?.title || ""}`),
      synopsis:
        String(volumeEntry?.synopsis || "").trim() || String(project?.synopsis || "").trim(),
    };
  };

  type RenderVolumeAccordionCardOptions = {
    allowReadAction: boolean;
  };

  const renderVolumeAccordionCard = (
    group: VolumeGroup,
    options: RenderVolumeAccordionCardOptions,
  ) => {
    const { allowReadAction } = options;
    const groupMeta = resolveVolumeGroupMeta(group);
    const chapterCountLabel = `${group.items.length} capítulos disponíveis`;

    return (
      <Accordion key={group.label} type="multiple" className="w-full">
        <AccordionItem
          value={group.label}
          className="group/download-card w-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-project-details-card"
        >
          <AccordionTrigger className="items-start gap-3 px-5 py-5 text-left hover:no-underline">
            <div className="grid w-full items-start gap-4 md:grid-cols-[128px_minmax(0,1fr)_auto] md:items-start md:gap-5">
              <div className="mx-auto w-28 md:mx-0">
                <div
                  className="overflow-hidden rounded-xl border border-border/60 bg-background/70"
                  style={{ aspectRatio: PROJECT_COVER_ASPECT_RATIO }}
                >
                  <UploadPicture
                    src={groupMeta.src}
                    alt={groupMeta.alt}
                    preset="poster"
                    mediaVariants={mediaVariants}
                    className="h-full w-full"
                    imgClassName="h-full w-full object-cover object-center transition-transform duration-300 group-hover/download-card:scale-105"
                  />
                </div>
              </div>

              <div className="self-start space-y-1 text-center md:text-left">
                <p className="text-base font-semibold text-foreground">{group.label}</p>
                <p className="text-xs text-muted-foreground">{chapterCountLabel}</p>
                {groupMeta.synopsis ? (
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground line-clamp-3 md:line-clamp-2">
                    {groupMeta.synopsis}
                  </p>
                ) : null}
              </div>

              <div className="flex justify-center md:self-start md:justify-end">
                <Badge variant="outline" className="text-[10px] uppercase">
                  {group.items.length} capítulos
                </Badge>
              </div>
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-5 pt-0 pb-6">
            <div className="grid gap-4">
              {group.items.map((chapter, chapterIndex) =>
                renderChapterDownloadCard(chapter, buildChapterListItemKey(chapter, chapterIndex), {
                  allowReadAction,
                }),
              )}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  };

  const filteredDownloadableEpisodes = useMemo(() => {
    if (!isChapterBased) {
      return sortedDownloadableEpisodes;
    }
    return sortedDownloadableEpisodes;
  }, [isChapterBased, sortedDownloadableEpisodes]);

  useEffect(() => {
    setEpisodePage(1);
  }, [project?.id]);

  const episodesPerPage = 24;
  const totalEpisodePages = Math.max(
    1,
    Math.ceil(filteredDownloadableEpisodes.length / episodesPerPage),
  );
  const episodePageStart = (episodePage - 1) * episodesPerPage;
  const paginatedEpisodes = filteredDownloadableEpisodes.slice(
    episodePageStart,
    episodePageStart + episodesPerPage,
  );

  const relationProjectIds = useMemo(
    () => new Map(Object.entries(relationProjectLookup)),
    [relationProjectLookup],
  );

  const handleCopyLink = async () => {
    if (!project) {
      return;
    }
    const url = `${window.location.origin}/projeto/${project.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  };

  if (!slug || (!project && hasLoaded)) {
    return <NotFound />;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <main>
          <section
            className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-24 pt-24 reveal`}
            data-reveal
          >
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/60 px-6 py-16 text-center text-sm text-muted-foreground">
              {hasHydrationError
                ? "Não foi possível carregar o projeto agora."
                : "Carregando projeto..."}
            </div>
          </section>
        </main>
      </div>
    );
  }

  const heroBannerSrc =
    project.banner || project.heroImageUrl || project.cover || "/placeholder.svg";
  const heroCoverSrc = project.cover || project.banner || "/placeholder.svg";
  const heroBannerAlt = `Banner do projeto ${project.title}`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main>
        {renderHero ? (
          <section data-testid="project-hero" className="relative overflow-hidden">
            <UploadPicture
              src={heroBannerSrc}
              alt={heroBannerAlt}
              preset="hero"
              mediaVariants={mediaVariants}
              applyFocalObjectPosition
              className="absolute inset-0 h-full w-full"
              imgClassName="h-full w-full object-cover object-center"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-background/20 backdrop-blur-[1.5px]" />
            <div className="absolute inset-0 bg-linear-to-r from-background/76 via-background/48 to-background/74 md:from-background/66 md:via-background/44 md:to-background/80" />
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/70 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent via-background/80 to-background" />

            <div
              className={`${publicPageLayoutTokens.sectionBase} relative max-w-6xl pb-14 pt-24 md:pb-16 lg:pt-28 lg:pb-20`}
            >
              <div
                data-testid="project-hero-layout"
                className="grid items-start gap-10 lg:gap-12 reveal md:items-stretch md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]"
                data-reveal
              >
                <div
                  data-testid="project-hero-cover-shell"
                  className="order-1 mx-auto w-64 self-start md:mx-0 md:w-[320px] lg:w-[340px]"
                >
                  <div
                    data-testid="project-hero-cover-frame"
                    className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/90 shadow-project-cover-card animate-slide-up"
                    style={{ aspectRatio: PROJECT_COVER_ASPECT_RATIO }}
                  >
                    <UploadPicture
                      src={heroCoverSrc}
                      alt={project.title || "Capa do projeto"}
                      preset="posterThumb"
                      mediaVariants={mediaVariants}
                      className="block h-full w-full"
                      imgClassName="block h-full w-full object-cover object-center"
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      sizes="(max-width: 767px) 256px, (max-width: 1023px) 320px, 340px"
                    />
                  </div>
                </div>
                <div
                  data-testid="project-hero-info-panel"
                  className="order-2 flex w-full flex-1 flex-col items-center gap-4 px-2 py-3 text-center md:h-full md:items-start md:px-0 md:py-2 md:text-left"
                >
                  <div className="flex w-full flex-wrap items-center justify-center gap-3 text-center text-xs uppercase tracking-[0.2em] text-primary/80 animate-fade-in md:w-auto md:justify-start md:text-left">
                    <span>{project.type}</span>
                    <span className="text-muted-foreground">•</span>
                    <span>{project.status}</span>
                  </div>
                  <h1 className="text-center text-3xl font-semibold text-foreground md:text-left md:text-4xl lg:text-5xl animate-slide-up">
                    {project.title}
                  </h1>
                  <p
                    className="max-w-2xl whitespace-pre-wrap text-center text-sm text-muted-foreground md:text-left md:text-base animate-slide-up"
                    style={{ animationDelay: "0.2s" }}
                  >
                    {project.synopsis}
                  </p>
                  {project.tags?.length ? (
                    <div
                      className="flex w-full flex-wrap justify-center gap-2 animate-slide-up md:justify-start"
                      style={{ animationDelay: "0.3s" }}
                    >
                      {hasLoadedTaxonomyTranslations
                        ? sortedTags.map((tag) => (
                            <ProjectFilterPillLink
                              key={tag}
                              tone="secondary"
                              to={`/projetos?tag=${encodeURIComponent(tag)}`}
                              label={translateTag(tag, tagTranslationMap)}
                            />
                          ))
                        : Array.from({ length: Math.min(project.tags.length, 4) }).map((_, i) => (
                            <div
                              key={i}
                              className="h-6 w-16 animate-pulse rounded-full bg-muted"
                              aria-hidden="true"
                            />
                          ))}
                    </div>
                  ) : null}
                  <div
                    data-testid="project-hero-actions-row"
                    className="flex w-full flex-wrap justify-center gap-3 animate-slide-up md:mt-auto md:justify-start"
                    style={{ animationDelay: "0.4s" }}
                  >
                    <Button asChild className="gap-2">
                      <a href="#downloads">
                        <Download className="h-4 w-4" />
                        {isChapterBased ? "Ver capítulos" : "Ver episódios"}
                      </a>
                    </Button>
                    {project.trailerUrl ? (
                      <Button asChild variant="outline" className="gap-2">
                        <a href={project.trailerUrl} target="_blank" rel="noreferrer">
                          <PlayCircle className="h-4 w-4" />
                          Assistir trailer
                        </a>
                      </Button>
                    ) : null}
                    {canEditProject ? (
                      <Button asChild variant="secondary" className="gap-2">
                        <PublicLink
                          href={`/dashboard/projetos?edit=${encodeURIComponent(project.id)}`}
                        >
                          Editar projeto
                        </PublicLink>
                      </Button>
                    ) : null}
                    {isChapterBased && firstReadableChapter ? (
                      <Button asChild variant="outline" className="gap-2 order-last">
                        <PublicLink
                          href={buildProjectPublicReadingHref(
                            project.id,
                            firstReadableChapter.number,
                            firstReadableChapter.volume,
                          )}
                        >
                          Começar leitura
                        </PublicLink>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section
          className={`${publicPageLayoutTokens.sectionBase} relative z-10 ${
            renderHero ? "-mt-8 pt-8 md:-mt-10 md:pt-10" : "pt-12 md:pt-14"
          } max-w-6xl pb-12 reveal`}
          data-reveal
        >
          <div
            className={
              fansubStaffEntries.length
                ? "grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
                : "grid gap-8"
            }
          >
            <div className="space-y-8">
              <Card className="bg-card/80 shadow-lg">
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                    {isChapterBased ? (
                      <BookOpen className="h-4 w-4 text-primary" />
                    ) : (
                      <Film className="h-4 w-4 text-primary" />
                    )}
                    Sobre o projeto
                  </div>
                  {project.genres?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {hasLoadedTaxonomyTranslations
                        ? sortedGenres.map((genre) => (
                            <ProjectFilterPillLink
                              key={genre}
                              tone="outline"
                              to={`/projetos?genero=${encodeURIComponent(genre)}`}
                              label={translateGenre(genre, genreTranslationMap)}
                            />
                          ))
                        : Array.from({ length: Math.min(project.genres.length, 3) }).map((_, i) => (
                            <div
                              key={i}
                              className="h-6 w-14 animate-pulse rounded-full bg-muted"
                              aria-hidden="true"
                            />
                          ))}
                    </div>
                  ) : null}
                  {projectDetails.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {projectDetails.map((detail) => (
                        <div
                          key={detail.label}
                          className="rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-[border-color] duration-200 hover:border-primary/60"
                        >
                          <span className="block text-xs font-semibold uppercase tracking-widest text-primary/80">
                            {detail.label}
                          </span>
                          <p className="mt-1 text-sm font-semibold text-foreground">
                            {detail.value}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {animeStaffEntries.length ? (
                <Card className="bg-card/70 shadow-md">
                  <CardContent className="space-y-5 p-6">
                    <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                      <Users className="h-4 w-4 text-primary" />
                      Staff do anime
                    </div>
                    {hasLoadedTaxonomyTranslations ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {animeStaffEntries.map((staff, index) => (
                          <div
                            key={`${staff.role}-${index}`}
                            className={`rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-[border-color] duration-200 hover:border-primary/60 ${
                              animeStaffEntryColumnSpans.has(index) ? "md:col-span-2" : ""
                            }`}
                          >
                            <p className="block text-xs font-semibold uppercase tracking-widest text-primary/80">
                              {translateAnilistRole(staff.role, staffRoleTranslationMap)}
                            </p>
                            <p className="mt-1 text-sm text-foreground">
                              {staff.members.join(", ")}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {animeStaffEntries.map((staff, index) => (
                          <div
                            key={`${staff.role}-${index}`}
                            className="rounded-xl border border-border/50 bg-background/60 px-4 py-3"
                          >
                            <div
                              className="h-3 w-24 animate-pulse rounded bg-muted"
                              aria-hidden="true"
                            />
                            <div
                              className="mt-2 h-3 w-36 animate-pulse rounded bg-muted"
                              aria-hidden="true"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              {visibleRelations.length > 0 ? (
                <Card className="bg-card/80 shadow-lg">
                  <CardContent className="space-y-5 p-6">
                    <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                      <Users className="h-4 w-4 text-primary" />
                      Relacionados
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {visibleRelations.map((relation) => {
                        const relationId =
                          relation.projectId ||
                          (relation.anilistId ? String(relation.anilistId) : "");
                        const projectId = relationProjectIds.get(relationId);
                        const targetId = projectId || relationId;
                        const supportingText = [relation.format, relation.status]
                          .map((value) => String(value || "").trim())
                          .filter(Boolean)
                          .join(" • ");
                        return (
                          <PublicProjectCard
                            key={`${relation.relation}-${relation.title}`}
                            variant="related"
                            model={{
                              href: targetId ? `/projeto/${targetId}` : "#",
                              title: relation.title,
                              coverSrc: relation.image,
                              coverAlt: relation.title,
                              mediaVariants,
                              eyebrow: translateRelation(relation.relation),
                              synopsisKey: relation.title,
                              supportingText,
                            }}
                          />
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {fansubStaffEntries.length ? (
              <div className="space-y-6">
                <Card className="bg-card/70 shadow-md">
                  <CardContent className="space-y-5 p-6">
                    <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                      <Users className="h-4 w-4 text-primary" />
                      Equipe da fansub
                    </div>
                    <div className="space-y-3">
                      {fansubStaffEntries.map((staff) => (
                        <div
                          key={staff.role}
                          className="rounded-xl border border-border/50 bg-background/60 px-4 py-3 transition-[border-color] duration-200 hover:border-primary/60"
                        >
                          <p className="block text-xs font-semibold uppercase tracking-widest text-primary/80">
                            {staff.role}
                          </p>
                          <p className="mt-1 text-sm text-foreground">{staff.members.join(", ")}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </div>
        </section>

        <section
          id="downloads"
          className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-20 pt-4 reveal`}
          data-reveal
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {isChapterBased ? "Capítulos" : "Downloads"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isChapterBased
                    ? "Leia no site ou baixe os capítulos disponíveis."
                    : "Selecione uma fonte de download para cada item disponível."}
                </p>
              </div>
              <Badge variant="secondary" className="text-xs uppercase">
                {isChapterBased
                  ? filteredReadableChapters.length
                  : filteredDownloadableEpisodes.length}{" "}
                disponíveis
              </Badge>
            </div>

            {isChapterBased ? (
              filteredReadableChapters.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
                  Nenhum capítulo publicado ainda.
                </div>
              ) : (
                <div className="grid gap-6">
                  {volumeGroups.map((group) =>
                    renderVolumeAccordionCard(group, {
                      allowReadAction: true,
                    }),
                  )}
                </div>
              )
            ) : filteredDownloadableEpisodes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-card/40 p-8 text-center text-sm text-muted-foreground">
                Este projeto ainda está em produção. Assim que os episódios forem lançados, os
                downloads aparecerão aqui.
              </div>
            ) : (
              <div className="grid gap-6">
                {isManga
                  ? volumeGroups.map((group) =>
                      renderVolumeAccordionCard(group, {
                        allowReadAction: false,
                      }),
                    )
                  : paginatedEpisodes.map((episode) =>
                      renderEpisodeDownloadCard(episode, String(episode.number), {
                        showRawBadge: true,
                      }),
                    )}
              </div>
            )}

            {!isChapterBased && totalEpisodePages > 1 ? (
              <div className="mt-6 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={episodePage === 1}
                  onClick={() => setEpisodePage((page) => Math.max(1, page - 1))}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {episodePage} de {totalEpisodePages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={episodePage === totalEpisodePages}
                  onClick={() => setEpisodePage((page) => Math.min(totalEpisodePages, page + 1))}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-24 pt-4 reveal`}
          data-reveal
        >
          <div className="grid gap-6">
            <Card className="bg-card">
              <CardHeader>
                <CardTitle className="text-lg">Compartilhar</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Share2 className="h-4 w-4 text-primary/70" aria-hidden="true" />
                  Copie o link para compartilhar este projeto.
                </div>
                <Button size="sm" variant="secondary" onClick={handleCopyLink}>
                  Copiar link
                </Button>
              </CardContent>
            </Card>

            <CommentsSection targetType="project" targetId={project.id} />
          </div>
        </section>
      </main>
    </div>
  );
};

export default ProjectPage;
