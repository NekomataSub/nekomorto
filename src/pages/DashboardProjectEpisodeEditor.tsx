import DashboardShell from "@/components/DashboardShell";
import type { ImageLibraryOptions } from "@/components/ImageLibraryDialog";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import DashboardDedicatedEditorHeader from "@/components/dashboard/DashboardDedicatedEditorHeader";
import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import DashboardPageContainer from "@/components/dashboard/DashboardPageContainer";
import { Combobox, Input } from "@/components/dashboard/dashboard-form-controls";
import {
  type DedicatedEditorSidebarHeightStyle,
  dedicatedEditorSidebarPanelClassName,
  dedicatedEditorSidebarScrollRegionClassName,
  dedicatedEditorSidebarStickyClassName,
  useDedicatedEditorSidebarHeight,
} from "@/components/dashboard/dedicated-editor-sidebar";
import DownloadSourcesEditor from "@/components/dashboard/project-editor/DownloadSourcesEditor";
import LazyImageLibraryDialog from "@/components/lazy/LazyImageLibraryDialog";
import ProjectEditorSectionCard from "@/components/project-reader/ProjectEditorSectionCard";
import AsyncState from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
import type { Project, ProjectEpisode } from "@/data/projects";
import { useDashboardCurrentUser } from "@/hooks/use-dashboard-current-user";
import { usePageMeta } from "@/hooks/use-page-meta";
import { refetchPublicBootstrapCache } from "@/hooks/use-public-bootstrap";
import { canManageProjectsAccess } from "@/lib/access-control";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import {
  canonicalToDisplayTime,
  digitsOnly,
  displayDateToIso,
  displayTimeToCanonical,
  formatDateDigitsToDisplay,
  formatTimeDigitsToDisplay,
  getTodayIsoDate,
  isoToDisplayDate,
} from "@/lib/dashboard-date-time";
import { buildProjectEpisodeAssetLibraryOptions } from "@/lib/dashboard-image-library";
import { formatBytesCompact, parseHumanSizeToBytes } from "@/lib/file-size";
import {
  DEFAULT_PROJECT_COVER_ALT,
  getEpisodeCoverAltFallback,
  resolveAssetAltText,
} from "@/lib/image-alt";
import {
  type AnimeEpisodeQuickFilter,
  cloneEpisodeSources,
  getAnimeEpisodeCompletionIssues,
  getAnimeEpisodeCompletionLabel,
  matchesAnimeEpisodeQuickFilter,
} from "@/lib/project-anime-episodes";
import { findIncompleteDownloadSourceIndex } from "@/lib/project-download-sources";
import {
  buildDashboardProjectEditorHref,
  buildDashboardProjectEpisodeEditorHref,
  buildDashboardProjectEpisodesEditorHref,
  buildProjectPublicHref,
} from "@/lib/project-editor-routes";
import {
  buildEpisodeKey,
  findDuplicateEpisodeKey,
  resolveEpisodeLookup,
  resolveNextMainEpisodeNumber,
} from "@/lib/project-episode-key";
import { resolveProjectImageFolders } from "@/lib/project-image-folders";
import {
  getProjectProgressStagesForEditor,
  getProjectProgressStateForEditor,
  syncProjectProgress,
} from "@/lib/project-progress";
import {
  resolveProjectEpisodePublicationErrorState,
  resolveProjectEpisodePublicationState,
} from "@/lib/project-publication";
import { isChapterBasedType } from "@/lib/project-utils";
import { ArrowLeft, ExternalLink, ImagePlus, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

const animeEpisodeFilterOptions = [
  { value: "all", label: "Todos" },
  { value: "published", label: "Publicados" },
  { value: "draft", label: "Rascunhos" },
  { value: "missing-links", label: "Sem links" },
  { value: "missing-date", label: "Sem data" },
  { value: "incomplete", label: "Incompletos" },
];

const animeEpisodePublicationStatusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "published", label: "Publicado" },
];

const animeEpisodeSourceTypeOptions = [
  { value: "TV", label: "TV" },
  { value: "Web", label: "Web" },
  { value: "Blu-ray", label: "Blu-ray" },
];

const hashTypeOptions = [
  { value: "MD5", label: "MD5" },
  { value: "SHA-1", label: "SHA-1" },
  { value: "SHA-256", label: "SHA-256" },
  { value: "SHA-512", label: "SHA-512" },
  { value: "CRC32", label: "CRC32" },
];

const parseHashValue = (hash?: string) => {
  const trimmed = String(hash || "").trim();
  const match = trimmed.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
  if (match) {
    const type = match[1];
    if (hashTypeOptions.some((opt) => opt.value === type)) {
      return { type, value: match[2] };
    }
  }
  return { type: "MD5", value: trimmed };
};

import NotFound from "./NotFound";

type ProjectRecord = Project & {
  revision?: string;
};

type CurrentUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  accessRole?: string;
  permissions?: string[];
  ownerIds?: string[];
  primaryOwnerId?: string | null;
  grants?: Partial<Record<string, boolean>>;
};

type EditableAnimeEpisode = ProjectEpisode & {
  _editorKey: string;
};

type PendingEpisodeAction =
  | {
      type: "navigate";
      href: string;
    }
  | {
      type: "create";
    }
  | null;

const editorSectionClassName =
  "overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-editor-surface";

const formatCountLabel = (count: number, singular: string, plural: string) =>
  `${count} ${count === 1 ? singular : plural}`;

const sortEpisodes = (episodes: ProjectEpisode[]) =>
  [...episodes].sort((left, right) => {
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
    if (left.number !== right.number) {
      return (left.number || 0) - (right.number || 0);
    }
    return String(left.title || "").localeCompare(String(right.title || ""), "pt-BR");
  });

const matchesEpisodeSearch = (episode: ProjectEpisode, query: string) => {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const haystack = [
    episode.number,
    episode.title,
    episode.synopsis,
    episode.sourceType,
    ...(episode.sources || []).flatMap((source) => [source.label, source.url]),
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(normalizedQuery);
};

const toastIncompleteDownloadSources = () => {
  toast({
    title: "Complete as fontes de download",
    description: "Selecione uma fonte e informe a URL antes de salvar o episódio.",
    variant: "destructive",
  });
};

const normalizeEpisodeForEditor = (episode: ProjectEpisode): EditableAnimeEpisode => ({
  ...episode,
  _editorKey: buildEpisodeKey(episode.number, episode.volume) || String(episode.number || ""),
  title: String(episode.title || ""),
  synopsis: String(episode.synopsis || ""),
  releaseDate: String(episode.releaseDate || ""),
  duration: String(episode.duration || ""),
  sourceType:
    episode.sourceType === "Blu-ray" || episode.sourceType === "Web" ? episode.sourceType : "TV",
  sources: cloneEpisodeSources(episode.sources),
  coverImageUrl: String(episode.coverImageUrl || ""),
  coverImageAlt: episode.coverImageUrl
    ? resolveAssetAltText(episode.coverImageAlt, getEpisodeCoverAltFallback(false))
    : "",
  publicationStatus: episode.publicationStatus === "draft" ? "draft" : "published",
  completedStages: Array.isArray(episode.completedStages) ? [...episode.completedStages] : [],
});

const normalizeEpisodeForSave = (episode: EditableAnimeEpisode): ProjectEpisode =>
  syncProjectProgress(
    {
      ...episode,
      title: String(episode.title || "").trim(),
      synopsis: String(episode.synopsis || "").trim(),
      releaseDate: String(episode.releaseDate || "").trim() || getTodayIsoDate(),
      duration: String(episode.duration || "").trim(),
      sourceType:
        episode.sourceType === "Blu-ray" || episode.sourceType === "Web"
          ? episode.sourceType
          : "TV",
      sources: cloneEpisodeSources(episode.sources).filter(
        (source) => String(source.url || "").trim() || String(source.label || "").trim(),
      ),
      coverImageUrl: String(episode.coverImageUrl || "").trim(),
      coverImageAlt: String(episode.coverImageUrl || "").trim()
        ? resolveAssetAltText(episode.coverImageAlt, getEpisodeCoverAltFallback(false))
        : "",
      number: Math.max(1, Number(episode.number) || 1),
      publicationStatus: episode.publicationStatus === "draft" ? "draft" : "published",
      completedStages: Array.isArray(episode.completedStages) ? [...episode.completedStages] : [],
      entryKind: episode.entryKind === "extra" ? "extra" : "main",
      entrySubtype: String(episode.entrySubtype || "").trim() || undefined,
      displayLabel:
        episode.entryKind === "extra"
          ? String(episode.displayLabel || "").trim() || undefined
          : undefined,
      hash: String(episode.hash || "").trim() || undefined,
      sizeBytes: Number(episode.sizeBytes) > 0 ? Number(episode.sizeBytes) : undefined,
    },
    "anime",
  );

const buildEpisodeSnapshot = (episode: EditableAnimeEpisode | null) =>
  JSON.stringify(
    episode
      ? {
          number: Number(episode.number) || 0,
          title: String(episode.title || ""),
          synopsis: String(episode.synopsis || ""),
          releaseDate: String(episode.releaseDate || ""),
          duration: String(episode.duration || ""),
          sourceType: String(episode.sourceType || ""),
          sources: cloneEpisodeSources(episode.sources),
          coverImageUrl: String(episode.coverImageUrl || ""),
          coverImageAlt: String(episode.coverImageAlt || ""),
          hash: String(episode.hash || ""),
          sizeBytes: Number(episode.sizeBytes) || 0,
          publicationStatus: episode.publicationStatus === "draft" ? "draft" : "published",
          completedStages: Array.isArray(episode.completedStages)
            ? [...episode.completedStages]
            : [],
        }
      : null,
  );

const buildCompletionBadges = (episode: ProjectEpisode | EditableAnimeEpisode) =>
  getAnimeEpisodeCompletionIssues(episode).map((issue) => ({
    issue,
    label: getAnimeEpisodeCompletionLabel(issue),
  }));

const buildNewAnimeEpisode = (episodes: ProjectEpisode[]): ProjectEpisode =>
  syncProjectProgress(
    {
      number: resolveNextMainEpisodeNumber(episodes, {
        isExtra: (episode) => episode.entryKind === "extra",
      }),
      title: "",
      synopsis: "",
      releaseDate: getTodayIsoDate(),
      duration: "",
      sourceType: "TV",
      sources: [],
      hash: undefined,
      sizeBytes: undefined,
      coverImageUrl: "",
      coverImageAlt: "",
      completedStages: [],
      content: "",
      contentFormat: "lexical",
      publicationStatus: "draft",
      entryKind: "main",
    } satisfies ProjectEpisode,
    "anime",
  );

const DashboardProjectEpisodeEditor = () => {
  usePageMeta({ title: "Editor de Episódios", noIndex: true });
  const apiBase = getApiBase();
  const navigate = useNavigate();
  const { projectId, episodeNumber } = useParams<{ projectId: string; episodeNumber?: string }>();
  const { currentUser, isLoadingUser } = useDashboardCurrentUser<CurrentUser>();
  const hasLoadedCurrentUser = !isLoadingUser;
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<AnimeEpisodeQuickFilter>("all");
  const [activeDraft, setActiveDraft] = useState<EditableAnimeEpisode | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [releaseDateInput, setReleaseDateInput] = useState("");
  const [durationInput, setDurationInput] = useState("");
  const [sizeInput, setSizeInput] = useState("");
  const [sizeInputError, setSizeInputError] = useState("");
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingEpisodeAction>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const mainColumnRef = useRef<HTMLDivElement | null>(null);
  const focusTitleOnNextOpenRef = useRef(false);
  const fallbackNeutralToastKeyRef = useRef<string | null>(null);
  const measuredSidebarHeight = useDedicatedEditorSidebarHeight(
    mainColumnRef,
    activeDraft?._editorKey || "neutral",
  );

  const canManageProjects = useMemo(() => {
    return canManageProjectsAccess(currentUser);
  }, [currentUser]);

  const loadProject = useCallback(async () => {
    if (!projectId) {
      setProject(null);
      setHasLoadError(false);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setHasLoadError(false);
    try {
      const response = await apiFetch(apiBase, `/api/projects/${projectId}`, { auth: true });
      if (!response.ok) {
        setProject(null);
        setHasLoadError(response.status !== 404);
        return;
      }
      const data = (await response.json()) as { project?: ProjectRecord };
      setProject(data?.project || null);
    } catch {
      setProject(null);
      setHasLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, projectId]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  const isChapterBased = isChapterBasedType(project?.type || "");
  const episodes = useMemo(
    () => sortEpisodes(Array.isArray(project?.episodeDownloads) ? project.episodeDownloads : []),
    [project?.episodeDownloads],
  );

  const activeEpisodeLookup = useMemo(() => {
    if (!episodeNumber) {
      return { ok: false as const, code: "neutral" as const };
    }
    return resolveEpisodeLookup(episodes, episodeNumber);
  }, [episodeNumber, episodes]);

  const activeEpisode =
    activeEpisodeLookup.ok && "episode" in activeEpisodeLookup ? activeEpisodeLookup.episode : null;
  const activeEpisodeKey = activeEpisode
    ? buildEpisodeKey(activeEpisode.number, activeEpisode.volume)
    : null;
  const activeEpisodeSnapshot = useMemo(
    () => buildEpisodeSnapshot(activeEpisode ? normalizeEpisodeForEditor(activeEpisode) : null),
    [activeEpisode],
  );
  const activeDraftSnapshot = useMemo(() => buildEpisodeSnapshot(activeDraft), [activeDraft]);
  const isDirty = Boolean(
    activeEpisode && activeDraft && activeEpisodeSnapshot !== activeDraftSnapshot,
  );

  useEffect(() => {
    if (!activeEpisode) {
      setActiveDraft(null);
      setReleaseDateInput("");
      setDurationInput("");
      setSizeInput("");
      setSizeInputError("");
      return;
    }
    const nextDraft = normalizeEpisodeForEditor(activeEpisode);
    setActiveDraft((current) => {
      if (!current || !activeEpisodeKey) {
        return nextDraft;
      }
      const currentKey = buildEpisodeKey(current.number, current.volume);
      return currentKey === activeEpisodeKey &&
        buildEpisodeSnapshot(current) !== activeEpisodeSnapshot
        ? current
        : nextDraft;
    });
  }, [activeEpisode, activeEpisodeKey, activeEpisodeSnapshot]);

  useEffect(() => {
    if (!activeDraft) {
      return;
    }
    setReleaseDateInput((current) =>
      current && isDirty ? current : isoToDisplayDate(activeDraft.releaseDate),
    );
    setDurationInput((current) =>
      current && isDirty ? current : canonicalToDisplayTime(activeDraft.duration),
    );
    setSizeInput((current) =>
      current && isDirty
        ? current
        : activeDraft.sizeBytes
          ? formatBytesCompact(activeDraft.sizeBytes)
          : "",
    );
    setSizeInputError("");
  }, [activeDraft, isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDirty]);

  const filteredEpisodes = useMemo(
    () =>
      episodes.filter(
        (episode) =>
          matchesEpisodeSearch(episode, searchQuery) &&
          matchesAnimeEpisodeQuickFilter(episode, filterMode),
      ),
    [episodes, filterMode, searchQuery],
  );

  const neutralHref = project
    ? buildDashboardProjectEpisodesEditorHref(project.id)
    : buildDashboardProjectEditorHref(projectId || "");
  const fallbackNeutralToastKey = `${project?.id || projectId || ""}:${String(episodeNumber || "")}`;
  const shouldFallbackToNeutralRoute = Boolean(
    project &&
      !isChapterBased &&
      episodeNumber &&
      !activeEpisode &&
      !activeDraft &&
      !activeEpisodeLookup.ok,
  );

  useEffect(() => {
    if (!shouldFallbackToNeutralRoute) {
      fallbackNeutralToastKeyRef.current = null;
      return;
    }
    if (fallbackNeutralToastKeyRef.current !== fallbackNeutralToastKey) {
      fallbackNeutralToastKeyRef.current = fallbackNeutralToastKey;
      toast({
        title: "Episódio não encontrado. Mostrando a lista.",
        intent: "warning",
      });
    }
    navigate(neutralHref, { replace: true });
  }, [fallbackNeutralToastKey, navigate, neutralHref, shouldFallbackToNeutralRoute]);

  const publicProjectHref = project ? buildProjectPublicHref(project.id) : "";
  const stageOptions = getProjectProgressStagesForEditor(project?.type || "Anime");
  const progressState = useMemo(
    () => getProjectProgressStateForEditor(project?.type || "Anime", activeDraft?.completedStages),
    [activeDraft?.completedStages, project?.type],
  );
  const projectImageFolders = useMemo(
    () => resolveProjectImageFolders(project?.id || projectId || "", project?.title || ""),
    [project?.id, project?.title, projectId],
  );
  const libraryOptions = useMemo<ImageLibraryOptions>(
    () =>
      buildProjectEpisodeAssetLibraryOptions({
        projectFolders: projectImageFolders,
        projectId: project?.id,
        canManageProjects,
        currentSelectionUrls:
          activeDraft?.coverImageUrl && String(activeDraft.coverImageUrl || "").trim()
            ? [activeDraft.coverImageUrl]
            : [],
      }),
    [
      activeDraft?.coverImageUrl,
      canManageProjects,
      project?.id,
      projectImageFolders.projectEpisodesFolder,
      projectImageFolders.projectRootFolder,
    ],
  );

  useEffect(() => {
    if (!activeEpisodeKey || !focusTitleOnNextOpenRef.current) {
      return;
    }
    const frameId = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
      focusTitleOnNextOpenRef.current = false;
    });
    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [activeEpisodeKey]);

  const updateDraft = useCallback(
    (updater: (current: EditableAnimeEpisode) => EditableAnimeEpisode) => {
      setActiveDraft((current) => (current ? updater(current) : current));
    },
    [],
  );

  const persistProject = useCallback(
    async (nextProject: ProjectRecord) => {
      if (!projectId) {
        return null;
      }
      const response = await apiFetch(apiBase, `/api/projects/${projectId}`, {
        method: "PUT",
        auth: true,
        json: nextProject,
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        const code = typeof data?.error === "string" ? data.error : "";
        const publicationFailure = resolveProjectEpisodePublicationErrorState(
          nextProject.type || project?.type || "",
          code,
        );
        if (code === "forbidden") {
          toast({
            title: "Acesso negado",
            description: "Você não tem permissão para salvar episódios.",
            variant: "destructive",
          });
          return null;
        }
        if (publicationFailure) {
          const errorKey = typeof data?.key === "string" ? data.key : "";
          const episodeNumber = errorKey ? Number(errorKey.split(":")[0]) : null;
          const episodeSuffix =
            Number.isFinite(episodeNumber) && episodeNumber !== null
              ? ` (Episódio ${episodeNumber})`
              : "";
          toast({
            title: publicationFailure.title,
            description: `${publicationFailure.description}${episodeSuffix}`,
            variant: "destructive",
          });
          return null;
        }
        toast({
          title: "Não foi possível salvar o episódio",
          description: "Tente novamente em alguns instantes.",
          variant: "destructive",
        });
        return null;
      }
      const data = (await response.json().catch(() => null)) as { project?: ProjectRecord } | null;
      const persistedProject = data?.project || nextProject;
      setProject(persistedProject);
      void refetchPublicBootstrapCache();
      return persistedProject;
    },
    [apiBase, project?.type, projectId],
  );

  const createEpisode = useCallback(
    async (projectSnapshot?: ProjectRecord) => {
      const baseProject = projectSnapshot || project;
      if (!baseProject) {
        return false;
      }

      const baseEpisodes = sortEpisodes(
        Array.isArray(baseProject.episodeDownloads) ? baseProject.episodeDownloads : [],
      );
      const newEpisode = buildNewAnimeEpisode(baseEpisodes);

      setIsCreating(true);
      const persistedProject = await persistProject({
        ...baseProject,
        episodeDownloads: [...baseEpisodes, newEpisode],
      });
      setIsCreating(false);

      if (!persistedProject) {
        return false;
      }

      focusTitleOnNextOpenRef.current = true;
      toast({
        title: "Episódio criado",
        description: `Episódio ${newEpisode.number} adicionado ao projeto.`,
        intent: "success",
      });
      navigate(buildDashboardProjectEpisodeEditorHref(persistedProject.id, newEpisode.number));
      return true;
    },
    [navigate, persistProject, project],
  );

  const runPendingAction = useCallback(
    async (action: PendingEpisodeAction, projectSnapshot?: ProjectRecord) => {
      if (!action) {
        return false;
      }
      if (action.type === "navigate") {
        navigate(action.href);
        return true;
      }
      return createEpisode(projectSnapshot);
    },
    [createEpisode, navigate],
  );

  const requestNavigateToHref = useCallback(
    (href: string) => {
      if (!href) {
        return;
      }
      if (isDirty) {
        setPendingAction({ type: "navigate", href });
        return;
      }
      navigate(href);
    },
    [isDirty, navigate],
  );

  const saveActiveDraft = useCallback(async () => {
    if (!project || !activeDraft || !activeEpisodeKey) {
      return null;
    }
    if (findIncompleteDownloadSourceIndex(activeDraft.sources) >= 0) {
      toastIncompleteDownloadSources();
      return null;
    }
    const normalizedDraft = normalizeEpisodeForSave(activeDraft);
    const nextEpisodes = episodes.map((episode) =>
      buildEpisodeKey(episode.number, episode.volume) === activeEpisodeKey
        ? normalizedDraft
        : episode,
    );
    const duplicateEpisode = findDuplicateEpisodeKey(nextEpisodes);
    if (duplicateEpisode) {
      toast({
        title: "Episódios duplicados",
        description: "Cada episódio precisa ter um número único neste projeto.",
        variant: "destructive",
      });
      return null;
    }
    const publicationState = resolveProjectEpisodePublicationState(
      project.type || "",
      normalizedDraft,
    );
    if (normalizedDraft.publicationStatus === "published" && publicationState.errorCode) {
      const publicationFailure = resolveProjectEpisodePublicationErrorState(
        project.type || "",
        publicationState.errorCode,
      );
      if (publicationFailure) {
        toast({
          title: publicationFailure.title,
          description: publicationFailure.description,
          variant: "destructive",
        });
      }
      return null;
    }
    setIsSaving(true);
    const persistedProject = await persistProject({
      ...project,
      episodeDownloads: nextEpisodes,
    });
    setIsSaving(false);
    if (!persistedProject) {
      return null;
    }
    return {
      normalizedDraft,
      persistedProject,
    };
  }, [activeDraft, activeEpisodeKey, episodes, persistProject, project]);

  const handleSave = useCallback(async () => {
    const savedDraft = await saveActiveDraft();
    if (!savedDraft) {
      return false;
    }
    const { normalizedDraft, persistedProject } = savedDraft;
    toast({
      title: "Episódio salvo",
      description: `Episódio ${normalizedDraft.number} atualizado no projeto.`,
      intent: "success",
    });
    navigate(buildDashboardProjectEpisodeEditorHref(persistedProject.id, normalizedDraft.number), {
      replace: true,
    });
    return true;
  }, [navigate, saveActiveDraft]);

  const handleDelete = useCallback(async () => {
    if (!project || !activeEpisodeKey) {
      return;
    }
    setIsDeleting(true);
    const nextEpisodes = episodes.filter(
      (episode) => buildEpisodeKey(episode.number, episode.volume) !== activeEpisodeKey,
    );
    const persistedProject = await persistProject({
      ...project,
      episodeDownloads: nextEpisodes,
    });
    setIsDeleting(false);
    if (!persistedProject) {
      return;
    }
    setDeleteDialogOpen(false);
    toast({
      title: "Episódio removido",
      description: "O episódio foi removido do projeto.",
      intent: "success",
    });
    navigate(buildDashboardProjectEpisodesEditorHref(persistedProject.id), { replace: true });
  }, [activeEpisodeKey, episodes, navigate, persistProject, project]);

  const handleAddEpisode = useCallback(async () => {
    if (isDirty) {
      setPendingAction({ type: "create" });
      return;
    }
    await createEpisode();
  }, [createEpisode, isDirty]);

  const handleLeaveSaveAndContinue = useCallback(async () => {
    if (!pendingAction) {
      return;
    }
    const action = pendingAction;
    const savedDraft = await saveActiveDraft();
    if (!savedDraft) {
      return;
    }
    toast({
      title: "Episódio salvo",
      description: `Episódio ${savedDraft.normalizedDraft.number} atualizado no projeto.`,
      intent: "success",
    });
    setPendingAction(null);
    await runPendingAction(action, savedDraft.persistedProject);
  }, [pendingAction, runPendingAction, saveActiveDraft]);

  if (!projectId) {
    return <NotFound />;
  }

  if (isLoading || !hasLoadedCurrentUser) {
    return (
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={!hasLoadedCurrentUser}
        onUserCardClick={() => navigate("/dashboard/usuarios?edit=me")}
      >
        <DashboardPageContainer maxWidth="7xl">
          <AsyncState kind="loading" title="Carregando editor de episódios" />
        </DashboardPageContainer>
      </DashboardShell>
    );
  }

  if (hasLoadError) {
    return (
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={!hasLoadedCurrentUser}
        onUserCardClick={() => navigate("/dashboard/usuarios?edit=me")}
      >
        <DashboardPageContainer maxWidth="7xl">
          <AsyncState
            kind="error"
            title="Não foi possível carregar os episódios"
            description="Tente novamente em alguns instantes."
            action={
              <DashboardActionButton onClick={() => void loadProject()}>
                Tentar novamente
              </DashboardActionButton>
            }
          />
        </DashboardPageContainer>
      </DashboardShell>
    );
  }

  if (!canManageProjects) {
    return (
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={!hasLoadedCurrentUser}
        onUserCardClick={() => navigate("/dashboard/usuarios?edit=me")}
      >
        <DashboardPageContainer maxWidth="6xl">
          <AsyncState
            kind="error"
            title="Acesso negado"
            description="Você não tem permissão para editar episódios."
          />
        </DashboardPageContainer>
      </DashboardShell>
    );
  }

  if (!project || isChapterBased) {
    return <NotFound />;
  }

  if (!activeEpisode && episodeNumber && !shouldFallbackToNeutralRoute) {
    return <NotFound />;
  }

  const episodeNavigationPanel = (
    <section
      className={activeDraft ? dedicatedEditorSidebarPanelClassName : editorSectionClassName}
      data-testid={activeDraft ? undefined : "anime-episode-empty-state"}
    >
      <div className={`space-y-4 px-5 py-5 ${activeDraft ? "shrink-0" : ""}`}>
        <div className="space-y-3">
          {!activeDraft ? (
            <div className="rounded-[22px] border border-dashed border-border/60 bg-background/35 px-4 py-5">
              <div className="space-y-3">
                <h2 className="text-lg font-semibold text-foreground">Nenhum episódio aberto</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Escolha um episódio na lista ou crie um novo rascunho para começar a edição.
                </p>
              </div>
            </div>
          ) : null}
          <DashboardActionButton
            type="button"
            tone="primary"
            className="w-full justify-center"
            onClick={() => void handleAddEpisode()}
            disabled={isCreating || isSaving}
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>Adicionar episódio</span>
          </DashboardActionButton>
          <div className="grid gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar episódio..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Combobox
                value={filterMode}
                onValueChange={(value) => setFilterMode(value as AnimeEpisodeQuickFilter)}
                ariaLabel="Filtrar episódios"
                options={animeEpisodeFilterOptions}
                placeholder="Filtrar"
                searchable={false}
                className="w-full sm:max-w-[220px]"
              />
              <p className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground sm:text-right">
                {formatCountLabel(filteredEpisodes.length, "episódio", "episódios")} no filtro atual
              </p>
            </div>
          </div>
        </div>
      </div>

      <div
        className={
          activeDraft
            ? `space-y-2.5 px-5 pb-5 ${dedicatedEditorSidebarScrollRegionClassName}`
            : "space-y-2.5 px-5 pb-5"
        }
        data-testid={activeDraft ? "anime-episode-sidebar-scroll-region" : undefined}
      >
        {filteredEpisodes.map((episode) => {
          const episodeHref = buildDashboardProjectEpisodeEditorHref(project.id, episode.number);
          const isActive = activeEpisodeKey === buildEpisodeKey(episode.number, episode.volume);
          return (
            <button
              key={buildEpisodeKey(episode.number, episode.volume)}
              type="button"
              onClick={() => requestNavigateToHref(episodeHref)}
              className={`w-full rounded-[18px] border px-3.5 py-3 text-left transition ${
                isActive
                  ? "border-primary/50 bg-primary/[0.07] shadow-sm"
                  : "border-border/50 bg-background/55 hover:bg-background/78"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    Episódio {episode.number}
                  </p>
                  <p className="line-clamp-2 text-sm font-semibold text-foreground">
                    {episode.title || "Sem título"}
                  </p>
                </div>
                <Badge variant={episode.publicationStatus === "draft" ? "outline" : "secondary"}>
                  {episode.publicationStatus === "draft" ? "Rascunho" : "Publicado"}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {episode.releaseDate ? <span>{isoToDisplayDate(episode.releaseDate)}</span> : null}
                {episode.sources?.length ? (
                  <span>{formatCountLabel(episode.sources.length, "fonte", "fontes")}</span>
                ) : null}
                <span>{episode.sourceType}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {buildCompletionBadges(episode).map((badge) => (
                  <Badge
                    key={`${episode.number}-${badge.issue}`}
                    variant="outline"
                    className="text-[10px] uppercase tracking-[0.08em]"
                  >
                    {badge.label}
                  </Badge>
                ))}
              </div>
            </button>
          );
        })}
        {filteredEpisodes.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-border/60 bg-background/30 px-4 py-6 text-sm text-muted-foreground">
            Nenhum episódio corresponde aos filtros atuais.
          </div>
        ) : null}
      </div>
    </section>
  );

  return (
    <>
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={!hasLoadedCurrentUser}
        onUserCardClick={() => requestNavigateToHref("/dashboard/usuarios?edit=me")}
      >
        <DashboardPageContainer maxWidth="editor" reveal={false}>
          <div className="space-y-4 pb-8">
            <DashboardDedicatedEditorHeader
              shellTestId="anime-episode-editor-header-shell"
              mastheadTestId="anime-episode-editor-masthead"
              commandBarTestId="anime-episode-editor-command-bar"
              primaryRowTestId="anime-episode-editor-action-rail"
              primaryStatusTestId="anime-episode-editor-top-status-group"
              primaryActionsTestId="anime-episode-editor-top-actions"
              secondaryMetaTestId="anime-episode-editor-status-bar"
              secondaryActionsTestId="anime-episode-editor-secondary-actions"
              badges={
                <>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                    Episódios de anime
                  </Badge>
                  {activeDraft
                    ? buildCompletionBadges(activeDraft).map((badge) => (
                        <Badge
                          key={badge.issue}
                          variant="outline"
                          className="text-[10px] uppercase tracking-[0.12em]"
                        >
                          {badge.label}
                        </Badge>
                      ))
                    : null}
                </>
              }
              title="Gerenciamento de Episódios"
              description="Liste, adicione e ajuste episódios sem sair do fluxo principal de publicação."
              summaryCard={
                <>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Projeto
                  </p>
                  <p className="mt-1 text-base font-semibold tracking-tight text-foreground">
                    {project.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {activeDraft
                      ? `Episódio ${activeDraft.number} - ${activeDraft.title || "Sem título"}`
                      : formatCountLabel(
                          episodes.length,
                          "episódio disponível",
                          "episódios disponíveis",
                        )}
                  </p>
                </>
              }
              primaryStatus={
                activeDraft ? (
                  <>
                    <Badge
                      variant={isDirty ? "outline" : "secondary"}
                      className="text-[10px] uppercase tracking-[0.12em]"
                    >
                      {isDirty ? "Alterações pendentes" : "Tudo salvo"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-[0.12em]">
                      {progressState.currentStage.label}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                    Adicione um episódio ou escolha um item na lista.
                  </Badge>
                )
              }
              primaryActions={
                <>
                  <DashboardActionButton
                    type="button"
                    size="sm"
                    tone="primary"
                    onClick={() => void handleAddEpisode()}
                    disabled={isCreating || isSaving}
                  >
                    {isCreating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    <span>Adicionar episódio</span>
                  </DashboardActionButton>
                  {activeDraft ? (
                    <>
                      <DashboardActionButton
                        type="button"
                        size="sm"
                        tone="destructive"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Excluir</span>
                      </DashboardActionButton>
                      <DashboardActionButton
                        type="button"
                        size="sm"
                        tone="primary"
                        onClick={() => void handleSave()}
                        disabled={isSaving || isCreating || !isDirty}
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        <span>Salvar episódio</span>
                      </DashboardActionButton>
                    </>
                  ) : null}
                </>
              }
              secondaryActions={
                <>
                  <DashboardActionButton size="sm" asChild>
                    <Link to={buildDashboardProjectEditorHref(project.id)}>
                      <ArrowLeft className="h-4 w-4" />
                      <span>Voltar ao projeto</span>
                    </Link>
                  </DashboardActionButton>
                  {publicProjectHref ? (
                    <DashboardActionButton size="sm" asChild>
                      <Link to={publicProjectHref} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        <span>Página pública</span>
                      </Link>
                    </DashboardActionButton>
                  ) : null}
                  {activeDraft ? (
                    <DashboardActionButton
                      size="sm"
                      onClick={() => requestNavigateToHref(neutralHref)}
                    >
                      <span>Fechar episódio</span>
                    </DashboardActionButton>
                  ) : null}
                </>
              }
            />

            <div
              className={
                activeDraft
                  ? "grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start"
                  : "space-y-5"
              }
              data-testid="anime-episode-editor-layout"
              style={
                {
                  "--dedicated-editor-sidebar-height": measuredSidebarHeight,
                } as DedicatedEditorSidebarHeightStyle
              }
            >
              <div
                className="min-w-0 space-y-4"
                data-testid="anime-episode-editor-main-column"
                ref={mainColumnRef}
              >
                {activeDraft ? (
                  <>
                    <ProjectEditorSectionCard
                      title="Dados do episódio"
                      subtitle="Número, título, status e data."
                      eyebrow="Edição"
                      testId="anime-episode-identity-section"
                      actions={
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase tracking-[0.12em]"
                        >
                          Episódio {activeDraft.number}
                        </Badge>
                      }
                    >
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.8fr)_repeat(3,minmax(140px,0.85fr))]">
                        <DashboardFieldStack>
                          <Label htmlFor="anime-episode-title">Título</Label>
                          <Input
                            id="anime-episode-title"
                            ref={titleInputRef}
                            value={activeDraft.title}
                            onChange={(event) =>
                              updateDraft((current) => ({ ...current, title: event.target.value }))
                            }
                            placeholder="Título do episódio"
                          />
                        </DashboardFieldStack>
                        <DashboardFieldStack>
                          <Label htmlFor="anime-episode-number">Episódio</Label>
                          <Input
                            id="anime-episode-number"
                            type="number"
                            min={1}
                            step={1}
                            value={activeDraft.number}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                number: Math.max(1, Number(event.target.value) || current.number),
                              }))
                            }
                          />
                        </DashboardFieldStack>
                        <DashboardFieldStack>
                          <Label htmlFor="anime-episode-publication-status">Status</Label>
                          <Combobox
                            id="anime-episode-publication-status"
                            value={
                              activeDraft.publicationStatus === "draft" ? "draft" : "published"
                            }
                            onValueChange={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                publicationStatus: value === "draft" ? "draft" : "published",
                              }))
                            }
                            ariaLabel="Selecionar status"
                            options={animeEpisodePublicationStatusOptions}
                            placeholder="Status"
                            searchable={false}
                          />
                        </DashboardFieldStack>
                        <DashboardFieldStack>
                          <Label htmlFor="anime-episode-date">Release</Label>
                          <Input
                            id="anime-episode-date"
                            value={releaseDateInput}
                            onChange={(event) => {
                              const masked = formatDateDigitsToDisplay(event.target.value);
                              setReleaseDateInput(masked);
                              const isoValue = displayDateToIso(masked);
                              if (isoValue) {
                                updateDraft((current) => ({ ...current, releaseDate: isoValue }));
                              }
                              if (!digitsOnly(masked).length) {
                                updateDraft((current) => ({ ...current, releaseDate: "" }));
                              }
                            }}
                            onBlur={() => {
                              const isoValue = displayDateToIso(releaseDateInput);
                              setReleaseDateInput(isoValue ? isoToDisplayDate(isoValue) : "");
                              if (isoValue) {
                                updateDraft((current) => ({ ...current, releaseDate: isoValue }));
                              }
                            }}
                            placeholder="DD/MM/AAAA"
                          />
                        </DashboardFieldStack>
                      </div>
                    </ProjectEditorSectionCard>

                    <div
                      className="grid gap-5 xl:grid-cols-2 xl:items-start"
                      data-testid="anime-episode-secondary-grid"
                    >
                      <div
                        className="space-y-5"
                        data-testid="anime-episode-secondary-primary-column"
                      >
                        <ProjectEditorSectionCard
                          title="Etapas editoriais"
                          subtitle="Acompanhe o andamento e ajuste as etapas concluídas do episódio."
                          eyebrow="Pipeline"
                          testId="anime-episode-progress-section"
                          actions={
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-[0.12em]"
                            >
                              {progressState.progress}%
                            </Badge>
                          }
                        >
                          <div className="space-y-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-foreground">Etapa atual</p>
                              <Badge
                                variant="accent"
                                data-testid="anime-episode-current-stage-badge"
                              >
                                {progressState.currentStage.label}
                              </Badge>
                            </div>
                            <div
                              className="flex flex-wrap items-center gap-1.5"
                              role="list"
                              aria-label="Etapas editoriais"
                            >
                              {progressState.stages.map((stage) => {
                                const isCompleted = progressState.completedStages.includes(
                                  stage.id,
                                );
                                const isCurrentStage = stage.id === progressState.currentStageId;
                                return (
                                  <span
                                    key={stage.id}
                                    role="listitem"
                                    title={stage.label}
                                    className={`block h-2.5 rounded-full ${
                                      isCompleted
                                        ? "w-6 bg-primary"
                                        : isCurrentStage
                                          ? "w-10 border border-border/60 bg-background/80"
                                          : "w-2.5 bg-muted/55"
                                    }`}
                                  />
                                );
                              })}
                            </div>
                            <div
                              className="space-y-2"
                              data-testid="anime-episode-progress-stage-list"
                              role="group"
                              aria-label="Etapas concluídas"
                            >
                              {stageOptions.map((stage) => {
                                const isCompleted = (activeDraft.completedStages || []).includes(
                                  stage.id,
                                );
                                const isCurrentStage = stage.id === progressState.currentStageId;
                                return (
                                  <label
                                    key={stage.id}
                                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/35 px-3 py-2.5"
                                  >
                                    <div className="flex min-w-0 items-center gap-3">
                                      <Switch
                                        checked={isCompleted}
                                        onCheckedChange={() =>
                                          updateDraft((current) => {
                                            const completedStages = new Set(
                                              current.completedStages || [],
                                            );
                                            if (completedStages.has(stage.id)) {
                                              completedStages.delete(stage.id);
                                            } else {
                                              completedStages.add(stage.id);
                                            }
                                            return {
                                              ...current,
                                              completedStages: stageOptions
                                                .filter((item) => completedStages.has(item.id))
                                                .map((item) => item.id),
                                            };
                                          })
                                        }
                                        aria-label={stage.label}
                                        className="shrink-0"
                                      />
                                      <span className="truncate text-sm font-medium text-foreground">
                                        {stage.label}
                                      </span>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                      {isCurrentStage ? (
                                        <Badge variant="accent">Atual</Badge>
                                      ) : (
                                        <span className="text-xs text-muted-foreground">
                                          {isCompleted ? "Concluída" : "Pendente"}
                                        </span>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </ProjectEditorSectionCard>

                        <ProjectEditorSectionCard
                          title="Capa do episódio"
                          eyebrow="Imagem"
                          testId="anime-episode-cover-section"
                        >
                          <div
                            className="w-full max-w-152"
                            data-testid="anime-episode-cover-layout"
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,24rem)_minmax(220px,1fr)] lg:items-start">
                              <div
                                className="w-full max-w-[24rem]"
                                data-testid="anime-episode-cover-preview"
                              >
                                <div className="overflow-hidden rounded-[26px] border border-border/60 bg-linear-to-b from-background via-background to-muted/30">
                                  <div className="relative aspect-video bg-muted/35">
                                    {activeDraft.coverImageUrl ? (
                                      <>
                                        <img
                                          src={activeDraft.coverImageUrl}
                                          alt={
                                            activeDraft.coverImageAlt || DEFAULT_PROJECT_COVER_ALT
                                          }
                                          className="absolute inset-0 h-full w-full object-cover"
                                        />
                                        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/80 via-black/35 to-transparent p-3">
                                          <Badge
                                            variant="secondary"
                                            className="border border-white/15 bg-black/45 text-[10px] uppercase tracking-[0.12em] text-white"
                                          >
                                            Capa selecionada
                                          </Badge>
                                        </div>
                                      </>
                                    ) : (
                                      <div className="flex h-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,hsl(var(--background))_0%,transparent_70%)] px-6 text-center">
                                        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-background/90 shadow-sm">
                                          <ImagePlus className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-sm font-semibold text-foreground">
                                            Escolha uma capa
                                          </p>
                                          <p className="max-w-sm text-xs leading-5 text-muted-foreground">
                                            Use a biblioteca para selecionar um banner 16:9 do
                                            episódio.
                                          </p>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <DashboardFieldStack
                                className="lg:self-center"
                                data-testid="anime-episode-cover-controls"
                              >
                                <Label htmlFor="anime-episode-cover-alt">
                                  Texto alternativo da capa
                                </Label>
                                <Input
                                  id="anime-episode-cover-alt"
                                  value={activeDraft.coverImageAlt || ""}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      coverImageAlt: event.target.value,
                                    }))
                                  }
                                  placeholder="Texto alternativo da capa"
                                />
                                <DashboardActionButton
                                  type="button"
                                  onClick={() => setIsLibraryOpen(true)}
                                  className="w-full"
                                >
                                  <ImagePlus className="h-4 w-4" />
                                  <span>Biblioteca</span>
                                </DashboardActionButton>
                              </DashboardFieldStack>
                            </div>
                          </div>
                        </ProjectEditorSectionCard>
                      </div>

                      <ProjectEditorSectionCard
                        title="Arquivo e fontes"
                        subtitle="Metadados técnicos do release, origem, duração e links de distribuição."
                        eyebrow="Entrega"
                        testId="anime-episode-file-section"
                        actions={
                          <DashboardActionButton
                            type="button"
                            size="sm"
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                sources: [...(current.sources || []), { label: "", url: "" }],
                              }))
                            }
                          >
                            <Plus className="h-4 w-4" />
                            <span>Adicionar fonte</span>
                          </DashboardActionButton>
                        }
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <DashboardFieldStack>
                            <Label htmlFor="anime-episode-source-type">Origem</Label>
                            <Combobox
                              id="anime-episode-source-type"
                              value={activeDraft.sourceType}
                              onValueChange={(value) =>
                                updateDraft((current) => ({
                                  ...current,
                                  sourceType: value === "Blu-ray" || value === "Web" ? value : "TV",
                                }))
                              }
                              ariaLabel="Selecionar origem"
                              options={animeEpisodeSourceTypeOptions}
                              placeholder="Origem"
                              searchable={false}
                            />
                          </DashboardFieldStack>
                          <DashboardFieldStack>
                            <Label htmlFor="anime-episode-duration">Duração</Label>
                            <Input
                              id="anime-episode-duration"
                              value={durationInput}
                              onChange={(event) => {
                                const masked = formatTimeDigitsToDisplay(event.target.value);
                                setDurationInput(masked);
                                const canonicalValue = displayTimeToCanonical(masked);
                                if (canonicalValue) {
                                  updateDraft((current) => ({
                                    ...current,
                                    duration: canonicalValue,
                                  }));
                                }
                                if (!digitsOnly(masked).length) {
                                  updateDraft((current) => ({ ...current, duration: "" }));
                                }
                              }}
                              onBlur={() => {
                                const canonicalValue = displayTimeToCanonical(durationInput);
                                setDurationInput(
                                  canonicalValue ? canonicalToDisplayTime(canonicalValue) : "",
                                );
                                if (canonicalValue) {
                                  updateDraft((current) => ({
                                    ...current,
                                    duration: canonicalValue,
                                  }));
                                }
                              }}
                              placeholder="MM:SS ou H:MM:SS"
                            />
                          </DashboardFieldStack>
                          <DashboardFieldStack>
                            <Label htmlFor="anime-episode-size">Tamanho</Label>
                            <DashboardFieldStack density="compact">
                              <Input
                                id="anime-episode-size"
                                value={sizeInput}
                                onChange={(event) => {
                                  setSizeInput(event.target.value);
                                  setSizeInputError("");
                                }}
                                onBlur={() => {
                                  const trimmed = String(sizeInput || "").trim();
                                  if (!trimmed) {
                                    updateDraft((current) => ({
                                      ...current,
                                      sizeBytes: undefined,
                                    }));
                                    setSizeInput("");
                                    setSizeInputError("");
                                    return;
                                  }
                                  const parsedSize = parseHumanSizeToBytes(trimmed);
                                  if (!parsedSize) {
                                    setSizeInputError("Use formatos como 700 MB ou 1.4 GB.");
                                    return;
                                  }
                                  updateDraft((current) => ({ ...current, sizeBytes: parsedSize }));
                                  setSizeInput(formatBytesCompact(parsedSize));
                                  setSizeInputError("");
                                }}
                                placeholder="Ex.: 700 MB ou 1.4 GB"
                              />
                              {sizeInputError ? (
                                <p className="text-[11px] text-destructive">{sizeInputError}</p>
                              ) : (
                                <p className="text-[11px] text-muted-foreground">
                                  Campo opcional salvo em bytes.
                                </p>
                              )}
                            </DashboardFieldStack>
                          </DashboardFieldStack>
                          <DashboardFieldStack>
                            <Label htmlFor="anime-episode-hash">Hash</Label>
                            <div className="flex items-center gap-2">
                              <Combobox
                                value={parseHashValue(activeDraft.hash).type}
                                onValueChange={(value) =>
                                  updateDraft((current) => {
                                    const parsed = parseHashValue(current.hash);
                                    const nextType = value;
                                    const nextValue = parsed.value;
                                    return {
                                      ...current,
                                      hash: `${nextType}: ${nextValue}`,
                                    };
                                  })
                                }
                                ariaLabel="Tipo de Hash"
                                options={hashTypeOptions}
                                placeholder="Tipo"
                                searchable={false}
                                className="w-[110px] shrink-0"
                              />
                              <Input
                                id="anime-episode-hash"
                                value={parseHashValue(activeDraft.hash).value}
                                onChange={(event) =>
                                  updateDraft((current) => {
                                    const parsed = parseHashValue(current.hash);
                                    const nextValue = event.target.value;
                                    return {
                                      ...current,
                                      hash: `${parsed.type}: ${nextValue}`,
                                    };
                                  })
                                }
                                placeholder="Ex.: a1b2c3d4..."
                                className="min-w-0 flex-1"
                              />
                            </div>
                          </DashboardFieldStack>
                        </div>
                        <DashboardFieldStack>
                          <Label className="text-sm">Fontes de download</Label>
                          <DownloadSourcesEditor
                            sources={activeDraft.sources || []}
                            sourceAriaLabelPrefix="Fonte"
                            onChange={(nextSources) =>
                              updateDraft((current) => ({
                                ...current,
                                sources: nextSources,
                              }))
                            }
                          />
                        </DashboardFieldStack>
                      </ProjectEditorSectionCard>
                    </div>
                  </>
                ) : (
                  episodeNavigationPanel
                )}
              </div>

              {activeDraft ? (
                <aside
                  className={dedicatedEditorSidebarStickyClassName}
                  data-testid="anime-episode-editor-sidebar"
                >
                  {episodeNavigationPanel}
                </aside>
              ) : null}
            </div>
          </div>
        </DashboardPageContainer>
      </DashboardShell>

      <Dialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAction(null);
          }
        }}
      >
        <DialogContent className="max-w-lg" data-testid="anime-episode-unsaved-leave-dialog">
          <DialogHeader>
            <DialogTitle>Sair da edição?</DialogTitle>
            <DialogDescription>
              Você tem alterações não salvas. Salve o episódio antes de continuar ou descarte as
              mudanças.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <DashboardActionButton type="button" onClick={() => setPendingAction(null)}>
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              type="button"
              onClick={() => {
                const action = pendingAction;
                setPendingAction(null);
                if (action) {
                  void runPendingAction(action);
                }
              }}
            >
              Descartar e continuar
            </DashboardActionButton>
            <DashboardActionButton
              type="button"
              tone="primary"
              onClick={() => void handleLeaveSaveAndContinue()}
              disabled={isSaving}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar e continuar
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-lg" data-testid="anime-episode-delete-dialog">
          <DialogHeader>
            <DialogTitle>Excluir episódio?</DialogTitle>
            <DialogDescription>
              Esta ação remove o episódio do snapshot atual do projeto assim que for confirmada.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <DashboardActionButton type="button" onClick={() => setDeleteDialogOpen(false)}>
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              type="button"
              tone="destructive"
              onClick={() => void handleDelete()}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Excluir episódio
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>

      <LazyImageLibraryDialog
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        apiBase={apiBase}
        title="Selecionar capa do episódio"
        description="Escolha a capa que representa este episódio."
        uploadFolder={libraryOptions.uploadFolder}
        listFolders={libraryOptions.listFolders}
        listAll={libraryOptions.listAll}
        includeProjectImages={libraryOptions.includeProjectImages}
        projectImageProjectIds={libraryOptions.projectImageProjectIds}
        projectImagesView={libraryOptions.projectImagesView}
        currentSelectionUrls={libraryOptions.currentSelectionUrls}
        onSave={({ urls, items }) => {
          const nextUrl = String(urls[0] || "").trim();
          if (!nextUrl) {
            return;
          }
          updateDraft((current) => ({
            ...current,
            coverImageUrl: nextUrl,
            coverImageAlt:
              current.coverImageAlt ||
              resolveAssetAltText(items[0]?.altText, getEpisodeCoverAltFallback(false)),
          }));
          setIsLibraryOpen(false);
        }}
      />
    </>
  );
};

export default DashboardProjectEpisodeEditor;
