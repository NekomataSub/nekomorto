import DashboardShell from "@/components/DashboardShell";
import ProjectEmbedCard from "@/components/ProjectEmbedCard";
import UploadPicture from "@/components/UploadPicture";
import DashboardActionButton, {
  default as Button,
} from "@/components/dashboard/DashboardActionButton";
import DashboardEditorBackdrop from "@/components/dashboard/DashboardEditorBackdrop";
import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import DashboardPageContainer from "@/components/dashboard/DashboardPageContainer";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardSegmentedActionButton from "@/components/dashboard/DashboardSegmentedActionButton";
import { Combobox, Input } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardAnimationDelay,
  dashboardClampedStaggerMs,
} from "@/components/dashboard/dashboard-motion";
import {
  dashboardEditorDialogWidthClassName,
  dashboardPageLayoutTokens,
  dashboardStrongSurfaceHoverClassName,
  dashboardSubtleSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import {
  emptyPostForm as emptyForm,
  getPostStatusLabel,
  hasRestorableVersionForPost,
  isVersionRestorableAgainstPost,
  type PostRecord,
} from "@/components/dashboard/post-editor/dashboard-posts-types";
import {
  clearPostsPageCache,
  DASHBOARD_POST_SORT_MODES,
  type DashboardPostsSortMode,
  useDashboardPostsResource,
} from "@/components/dashboard/post-editor/useDashboardPostsResource";
import LazyImageLibraryDialog from "@/components/lazy/LazyImageLibraryDialog";
import type { LexicalEditorHandle } from "@/components/lexical/LexicalEditor";
import LexicalEditorSurface from "@/components/lexical/LexicalEditorSurface";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AsyncState from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import CompactPagination from "@/components/ui/compact-pagination";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  MuiBrazilDateField,
  MuiBrazilTimeField,
  MuiDateTimeFieldsProvider,
} from "@/components/ui/mui-date-time-fields";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useAccessibilityAnnouncer } from "@/hooks/accessibility-announcer";
import { useDashboardCurrentUser } from "@/hooks/use-dashboard-current-user";
import { useDashboardRefreshToast } from "@/hooks/use-dashboard-refresh-toast";
import { useEditorScrollLock } from "@/hooks/use-editor-scroll-lock";
import { usePageMeta } from "@/hooks/use-page-meta";
import { canManagePostsAccess } from "@/lib/access-control";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { applyBeforeUnloadCompatibility } from "@/lib/before-unload";
import {
  parseLocalDateTimeValue,
  toLocalDateTimeFromIso,
  toLocalDateTimeValue,
  toTimeFieldValue,
} from "@/lib/dashboard-date-time";
import {
  areDashboardPostCoverUrlsEquivalent as areCoverUrlsEquivalent,
  buildDashboardPostEditorSnapshot as buildPostEditorSnapshot,
  extractLexicalImageUploadUrls,
} from "@/lib/dashboard-post-editor";
import {
  areDashboardSearchParamsEqual,
  buildDashboardSearchParams,
  parseDashboardEnumParam,
  parseDashboardPageParam,
  removeDashboardSearchParamKeys,
} from "@/lib/dashboard-query-state";
import { formatDateTimeShort } from "@/lib/date";
import {
  createPostVersion,
  fetchEditorialCalendar,
  fetchPostVersions,
  rollbackPostVersion,
} from "@/lib/editorial-admin";
import { DEFAULT_POST_COVER_ALT, resolveAssetAltText } from "@/lib/image-alt";
import { filterImageLibraryFoldersByAccess } from "@/lib/image-library-scope";
import { createSlug, getLexicalText } from "@/lib/post-content";
import { getImageFileNameFromUrl, resolvePostCoverPreview } from "@/lib/post-cover";
import { buildTranslationMap, sortByTranslatedLabel, translateTag } from "@/lib/project-taxonomy";
import { normalizeUploadVariantUrlKey, type UploadMediaVariantsMap } from "@/lib/upload-variants";
import type { ContentVersion, EditorialCalendarItem } from "@/types/editorial";
import {
  CalendarDays,
  Copy,
  Eye,
  List as ListIcon,
  MessageSquare,
  Plus,
  RotateCcw,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";

const POST_EDITOR_TOOLBAR_STICKY_OFFSET_PX = 5;

const postStatusLabels = {
  draft: "Rascunho",
  scheduled: "Agendado",
  published: "Publicado",
} as const;

const postStatusOptions = [
  { value: "draft", label: postStatusLabels.draft },
  { value: "scheduled", label: postStatusLabels.scheduled },
  { value: "published", label: postStatusLabels.published },
];

const postSortOptions = [
  { value: "recent", label: "Mais recentes" },
  { value: "alpha", label: "Ordem alfabética" },
  { value: "tags", label: "Tags" },
  { value: "projects", label: "Projetos" },
  { value: "status", label: "Status" },
  { value: "views", label: "Visualizações" },
  { value: "comments", label: "Comentários" },
];

const postEditorSectionHeaderTextClassName = "min-w-0 flex-1 space-y-1 text-left";
const postEditorSectionTitleClassName =
  "block text-[15px] font-semibold leading-tight md:text-base";
const postEditorSectionSubtitleClassName = "block text-xs leading-5 text-muted-foreground";

const PostEditorSectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className={postEditorSectionHeaderTextClassName}>
    <span className={postEditorSectionTitleClassName}>{title}</span>
    <span className={postEditorSectionSubtitleClassName}>{subtitle}</span>
  </div>
);

const toMonthStart = (value: Date) => new Date(value.getFullYear(), value.getMonth(), 1);

const toLocalDateKey = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

const formatLocalTimeShort = (value?: string | null) => {
  if (!value) {
    return "";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const isPostCurrentlyPublic = (post?: Pick<PostRecord, "status" | "publishedAt"> | null) => {
  if (!post) {
    return false;
  }
  if (post.status !== "published" && post.status !== "scheduled") {
    return false;
  }
  const publishTimeMs = new Date(post.publishedAt).getTime();
  return Number.isFinite(publishTimeMs) && publishTimeMs <= Date.now();
};

const buildMonthCalendarGrid = (monthCursor: Date) => {
  const start = toMonthStart(monthCursor);
  const monthStartWeekday = start.getDay();
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - monthStartWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const next = new Date(gridStart);
    next.setDate(gridStart.getDate() + index);
    return next;
  });
};

const getCalendarItemDisplayTime = (item: EditorialCalendarItem) =>
  item.status === "scheduled" ? item.scheduledAt || item.publishedAt : item.publishedAt;

const getCalendarItemStatusLabel = (status: EditorialCalendarItem["status"]) =>
  status === "published" ? "Publicada" : "Agendada";

const calendarWeekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
const calendarSurfaceFadeStyle: CSSProperties = {
  animationDuration: "220ms",
  animationTimingFunction: "ease-out",
};

const DashboardPosts = () => {
  usePageMeta({ title: "Posts", noIndex: true });
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const apiBase = getApiBase();
  const { announce } = useAccessibilityAnnouncer();
  const restoreWindowMs = 3 * 24 * 60 * 60 * 1000;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const {
    hasLoadError,
    hasLoadedOnce,
    hasResolvedPosts,
    hasResolvedProjects,
    hasResolvedUsers,
    isRefreshing,
    loadPosts,
    mediaVariants,
    posts,
    projects,
    refreshPosts,
    setMediaVariants,
    setPosts,
    tagTranslations,
  } = useDashboardPostsResource(apiBase);
  const { currentUser, isLoadingUser } = useDashboardCurrentUser();
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  useEditorScrollLock(isEditorOpen);
  const [isEditorDialogScrolled, setIsEditorDialogScrolled] = useState(false);
  const [postEditorToolbarStickyTop, setPostEditorToolbarStickyTop] = useState(0);
  const [editorTopElement, setEditorTopElement] = useState<HTMLDivElement | null>(null);
  const [editingPost, setEditingPost] = useState<PostRecord | null>(null);
  const [formState, setFormState] = useState(emptyForm);
  const [isSlugCustom, setIsSlugCustom] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [listViewMode, setListViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonthCursor, setCalendarMonthCursor] = useState(() => toMonthStart(new Date()));
  const [calendarItems, setCalendarItems] = useState<EditorialCalendarItem[]>([]);
  const [calendarTz, setCalendarTz] = useState(timeZone);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [hasCalendarError, setHasCalendarError] = useState(false);
  const [sortMode, setSortMode] = useState<DashboardPostsSortMode>(() =>
    parseDashboardEnumParam(searchParams.get("sort"), DASHBOARD_POST_SORT_MODES, "recent"),
  );
  const [currentPage, setCurrentPage] = useState(() =>
    parseDashboardPageParam(searchParams.get("page")),
  );
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") || "");
  const [projectFilterId, setProjectFilterId] = useState<string>(
    () => searchParams.get("project") || "all",
  );
  const [deleteTarget, setDeleteTarget] = useState<PostRecord | null>(null);
  const [tagInput, setTagInput] = useState("");
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const [tagOrder, setTagOrder] = useState<string[]>([]);
  const [draggedTag, setDraggedTag] = useState<string | null>(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [hasVersionsError, setHasVersionsError] = useState(false);
  const [postVersions, setPostVersions] = useState<ContentVersion[]>([]);
  const [versionsNextCursor, setVersionsNextCursor] = useState<string | null>(null);
  const [versionHistoryAvailabilityByPostId, setVersionHistoryAvailabilityByPostId] = useState<
    Record<string, boolean | undefined>
  >({});
  const openingVersionHistoryRef = useRef(false);
  const [isCreatingManualVersion, setIsCreatingManualVersion] = useState(false);
  const [rollbackTargetVersion, setRollbackTargetVersion] = useState<ContentVersion | null>(null);
  const [isRollingBackVersion, setIsRollingBackVersion] = useState(false);
  const [pendingEditQueryCleanup, setPendingEditQueryCleanup] = useState<string | null>(null);
  const [pendingSearchReplacement, setPendingSearchReplacement] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("Sair da edição?");
  const [confirmDescription, setConfirmDescription] = useState(
    "Você tem alterações não salvas. Deseja continuar?",
  );
  const confirmActionRef = useRef<(() => void) | null>(null);
  const confirmCancelRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<LexicalEditorHandle | null>(null);
  const editorInitialSnapshotRef = useRef<string>(buildPostEditorSnapshot(emptyForm));
  const autoEditHandledRef = useRef<string | null>(null);
  const isApplyingSearchParamsRef = useRef(false);
  const queryStateRef = useRef({
    sortMode,
    searchQuery,
    projectFilterId,
    currentPage,
  });

  const canManagePosts = useMemo(() => {
    return canManagePostsAccess(currentUser);
  }, [currentUser]);

  const isDirty = useMemo(
    () => buildPostEditorSnapshot(formState) !== editorInitialSnapshotRef.current,
    [formState],
  );
  const editorResolvedCover = useMemo(
    () =>
      resolvePostCoverPreview({
        coverImageUrl: formState.coverImageUrl,
        coverAlt: formState.coverAlt,
        content: formState.contentLexical,
        contentFormat: "lexical",
        title: formState.title,
      }),
    [formState.contentLexical, formState.coverAlt, formState.coverImageUrl, formState.title],
  );
  const postEditorLexicalWrapperStyle = useMemo(
    () =>
      ({
        "--post-editor-toolbar-sticky-top": `${postEditorToolbarStickyTop + POST_EDITOR_TOOLBAR_STICKY_OFFSET_PX}px`,
      }) as CSSProperties,
    [postEditorToolbarStickyTop],
  );
  const editorCoverFileName = useMemo(
    () => getImageFileNameFromUrl(editorResolvedCover.coverImageUrl),
    [editorResolvedCover.coverImageUrl],
  );
  const allowPopRef = useRef(false);
  const hasPushedBlockRef = useRef(false);

  useEffect(() => {
    if (!isSlugCustom) {
      setFormState((prev) => ({ ...prev, slug: createSlug(prev.title) }));
    }
  }, [formState.title, isSlugCustom]);

  useEffect(() => {
    if (!isEditorOpen) {
      setIsEditorDialogScrolled(false);
    }
  }, [isEditorOpen]);

  useLayoutEffect(() => {
    if (!isEditorOpen) {
      setPostEditorToolbarStickyTop(0);
      return;
    }

    if (!editorTopElement) {
      return;
    }

    const editorTop = editorTopElement;

    const updateStickyTop = () => {
      const nextTop = Math.max(0, Math.ceil(editorTop.getBoundingClientRect().height));
      setPostEditorToolbarStickyTop((prev) => (prev === nextTop ? prev : nextTop));
    };

    updateStickyTop();
    window.addEventListener("resize", updateStickyTop);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", updateStickyTop);
      };
    }

    const observer = new ResizeObserver(() => {
      updateStickyTop();
    });
    observer.observe(editorTop);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateStickyTop);
    };
  }, [editorTopElement, isEditorOpen]);

  const loadEditorialCalendar = useCallback(
    async (monthCursor: Date) => {
      const monthStart = toMonthStart(monthCursor);
      const from = toLocalDateKey(monthStart);
      const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
      const to = toLocalDateKey(monthEnd);
      setIsCalendarLoading(true);
      setHasCalendarError(false);
      try {
        const response = await fetchEditorialCalendar(apiBase, {
          from,
          to,
          tz: timeZone,
        });
        setCalendarItems(Array.isArray(response.items) ? response.items : []);
        setCalendarTz(response.tz || timeZone);
      } catch {
        setCalendarItems([]);
        setCalendarTz(timeZone);
        setHasCalendarError(true);
      } finally {
        setIsCalendarLoading(false);
      }
    },
    [apiBase, timeZone],
  );

  const loadVersionHistory = useCallback(
    async (postId: string) => {
      if (!postId) {
        setPostVersions([]);
        setVersionsNextCursor(null);
        return;
      }
      setIsLoadingVersions(true);
      setHasVersionsError(false);
      try {
        const response = await fetchPostVersions(apiBase, postId, { limit: 20 });
        const versions = Array.isArray(response.versions) ? response.versions : [];
        const nextCursor = response.nextCursor || null;
        setPostVersions(versions);
        setVersionsNextCursor(nextCursor);
        const currentPostForComparison =
          posts.find((post) => post.id === postId) ||
          (editingPost?.id === postId ? editingPost : null);
        setVersionHistoryAvailabilityByPostId((prev) => ({
          ...prev,
          [postId]: hasRestorableVersionForPost(versions, currentPostForComparison, nextCursor),
        }));
      } catch {
        setPostVersions([]);
        setVersionsNextCursor(null);
        setHasVersionsError(true);
      } finally {
        setIsLoadingVersions(false);
      }
    },
    [apiBase, editingPost, posts],
  );

  const checkRestorableHistoryAvailability = useCallback(
    async (post: PostRecord | null | undefined) => {
      const safePostId = String(post?.id || "").trim();
      if (!safePostId || !post) {
        return;
      }
      const baselinePost = posts.find((item) => item.id === safePostId) || post;
      try {
        const response = await fetchPostVersions(apiBase, safePostId, { limit: 5 });
        const versions = Array.isArray(response.versions) ? response.versions : [];
        const hasRestorableHistory = hasRestorableVersionForPost(
          versions,
          baselinePost,
          response.nextCursor || null,
        );
        setVersionHistoryAvailabilityByPostId((prev) => ({
          ...prev,
          [safePostId]: hasRestorableHistory,
        }));
      } catch {
        setVersionHistoryAvailabilityByPostId((prev) => {
          if (!(safePostId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[safePostId];
          return next;
        });
      }
    },
    [apiBase, posts],
  );

  useEffect(() => {
    if (!isEditorOpen || !isDirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      applyBeforeUnloadCompatibility(event);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isEditorOpen, isDirty]);

  useEffect(() => {
    if (!isEditorOpen || !isDirty) {
      return;
    }
    if (!hasPushedBlockRef.current) {
      window.history.pushState(null, document.title, window.location.href);
      hasPushedBlockRef.current = true;
    }
    const handlePopState = () => {
      if (allowPopRef.current) {
        allowPopRef.current = false;
        return;
      }
      window.history.pushState(null, document.title, window.location.href);
      setConfirmTitle("Sair da edição?");
      setConfirmDescription("Você tem alterações não salvas. Deseja continuar?");
      confirmActionRef.current = () => {
        allowPopRef.current = true;
        closeEditor();
        navigate(-1);
      };
      confirmCancelRef.current = () => {
        allowPopRef.current = false;
      };
      setConfirmOpen(true);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      hasPushedBlockRef.current = false;
    };
  }, [isEditorOpen, isDirty, navigate]);

  useEffect(() => {
    if (!isEditorOpen || !isDirty) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) {
        return;
      }
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.getAttribute("target") === "_blank") {
        return;
      }
      event.preventDefault();
      setConfirmTitle("Sair da edição?");
      setConfirmDescription("Você tem alterações não salvas. Deseja continuar?");
      confirmActionRef.current = () => {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin === window.location.origin) {
          navigate(`${url.pathname}${url.search}${url.hash}`);
        } else {
          window.location.href = url.href;
        }
      };
      confirmCancelRef.current = () => {
        setConfirmOpen(false);
      };
      setConfirmOpen(true);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [isEditorOpen, isDirty, navigate]);

  const openCreate = () => {
    const nextForm = {
      ...emptyForm,
      author: currentUser?.name || "",
      publishAt: toLocalDateTimeValue(new Date()),
    };
    if (isEditorOpen && isDirty) {
      setConfirmTitle("Criar nova postagem?");
      setConfirmDescription(
        "Há alterações não salvas. Deseja descartar e criar uma nova postagem?",
      );
      confirmActionRef.current = () => {
        setEditingPost(null);
        setIsSlugCustom(false);
        setFormState(nextForm);
        editorInitialSnapshotRef.current = buildPostEditorSnapshot(nextForm);
        setIsEditorOpen(true);
      };
      confirmCancelRef.current = null;
      setConfirmOpen(true);
      return;
    }
    setEditingPost(null);
    setIsSlugCustom(false);
    setFormState(nextForm);
    editorInitialSnapshotRef.current = buildPostEditorSnapshot(nextForm);
    setIsEditorOpen(true);
  };

  const openEdit = useCallback((post: PostRecord) => {
    const nextForm = {
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || "",
      contentLexical: post.content || "",
      author: post.author || "",
      coverImageUrl: post.coverImageUrl || "",
      coverAlt: post.coverAlt || "",
      status: post.status || "draft",
      publishAt: toLocalDateTimeFromIso(post.publishedAt),
      projectId: post.projectId || "",
      tags: Array.isArray(post.tags) ? post.tags : [],
    };
    setEditingPost(post);
    setIsSlugCustom(true);
    setFormState(nextForm);
    editorInitialSnapshotRef.current = buildPostEditorSnapshot(nextForm);
    setIsEditorOpen(true);
  }, []);

  const scheduleSearchReplace = useCallback(
    (nextParams: URLSearchParams) => {
      const nextSearch = nextParams.toString();
      const currentSearch = location.search.startsWith("?")
        ? location.search.slice(1)
        : location.search;
      if (nextSearch === currentSearch) {
        setPendingSearchReplacement(null);
        return;
      }
      setPendingSearchReplacement(
        `${location.pathname}${nextSearch ? `?${nextSearch}` : ""}${location.hash}`,
      );
    },
    [location.hash, location.pathname, location.search],
  );

  const clearEditQueryParam = useCallback(() => {
    if (!searchParams.get("edit")) {
      return;
    }
    const nextParams = removeDashboardSearchParamKeys(searchParams, ["edit"]);
    if (nextParams.toString() !== searchParams.toString()) {
      scheduleSearchReplace(nextParams);
    }
  }, [scheduleSearchReplace, searchParams]);

  useEffect(() => {
    if (!editingPost?.id || !canManagePosts) {
      return;
    }
    void checkRestorableHistoryAvailability(editingPost);
  }, [canManagePosts, checkRestorableHistoryAvailability, editingPost]);

  const openVersionHistory = useCallback(async () => {
    if (!editingPost?.id) {
      return;
    }
    openingVersionHistoryRef.current = true;
    setIsVersionHistoryOpen(true);
    setTimeout(() => {
      openingVersionHistoryRef.current = false;
    }, 0);
    await loadVersionHistory(editingPost.id);
  }, [editingPost?.id, loadVersionHistory]);

  const handleCreateManualVersion = useCallback(async () => {
    if (!editingPost?.id) {
      return;
    }
    setIsCreatingManualVersion(true);
    try {
      await createPostVersion(apiBase, editingPost.id);
      void checkRestorableHistoryAvailability(editingPost);
      await loadVersionHistory(editingPost.id);
      toast({
        title: "Versão criada",
        description: "Checkpoint manual criado com sucesso.",
        intent: "success",
      });
    } catch {
      toast({
        title: "Não foi possível criar a versão",
        description: "Tente novamente em alguns instantes.",
      });
    } finally {
      setIsCreatingManualVersion(false);
    }
  }, [apiBase, checkRestorableHistoryAvailability, editingPost, loadVersionHistory]);

  const handleConfirmRollbackVersion = useCallback(async () => {
    if (!editingPost?.id || !rollbackTargetVersion?.id) {
      return;
    }
    setIsRollingBackVersion(true);
    try {
      const response = await rollbackPostVersion<PostRecord>(
        apiBase,
        editingPost.id,
        rollbackTargetVersion.id,
      );
      await loadPosts();
      if (response?.post) {
        openEdit(response.post);
        void checkRestorableHistoryAvailability(response.post);
      }
      await loadVersionHistory(editingPost.id);
      setRollbackTargetVersion(null);
      toast({
        title: "Versão restaurada",
        description: response.rollback?.slugAdjusted
          ? `Slug ajustado para /${response.rollback?.resultingSlug || response.post?.slug || ""}.`
          : "O post foi restaurado com sucesso.",
        intent: "success",
      });
    } catch {
      toast({
        title: "Não foi possível restaurar a versão",
        description: "Verifique as permissões e tente novamente.",
      });
    } finally {
      setIsRollingBackVersion(false);
    }
  }, [
    apiBase,
    checkRestorableHistoryAvailability,
    editingPost?.id,
    loadPosts,
    loadVersionHistory,
    openEdit,
    rollbackTargetVersion,
  ]);

  useEffect(() => {
    const editTarget = (searchParams.get("edit") || "").trim();
    if (!editTarget) {
      autoEditHandledRef.current = null;
      setPendingEditQueryCleanup(null);
      return;
    }
    if (autoEditHandledRef.current === editTarget) {
      return;
    }
    if (isLoadingUser) {
      return;
    }
    if (!hasResolvedPosts || !hasResolvedUsers) {
      return;
    }
    autoEditHandledRef.current = editTarget;

    if (canManagePosts && editTarget === "new") {
      openCreate();
    } else {
      const target = canManagePosts
        ? posts.find((post) => post.id === editTarget || post.slug === editTarget) || null
        : null;
      if (target) {
        openEdit(target);
      }
    }
    setPendingEditQueryCleanup(editTarget);
  }, [
    canManagePosts,
    hasResolvedPosts,
    hasResolvedUsers,
    isLoadingUser,
    openCreate,
    openEdit,
    posts,
    searchParams,
  ]);

  useEffect(() => {
    if (!pendingEditQueryCleanup) {
      return;
    }
    const activeEditQuery = (searchParams.get("edit") || "").trim();
    if (!activeEditQuery) {
      setPendingEditQueryCleanup(null);
      return;
    }
    if (activeEditQuery !== pendingEditQueryCleanup) {
      return;
    }
    clearEditQueryParam();
    setPendingEditQueryCleanup(null);
  }, [clearEditQueryParam, pendingEditQueryCleanup, searchParams]);

  useEffect(() => {
    if (!pendingSearchReplacement) {
      return;
    }
    const currentUrl = `${location.pathname}${location.search}${location.hash}`;
    if (currentUrl === pendingSearchReplacement) {
      setPendingSearchReplacement(null);
    }
  }, [location.hash, location.pathname, location.search, pendingSearchReplacement]);

  const closeEditor = () => {
    clearEditQueryParam();
    setIsEditorOpen(false);
    setEditingPost(null);
  };

  const requestCloseEditor = () => {
    if (!isEditorOpen || !isDirty) {
      closeEditor();
      return;
    }
    setConfirmTitle("Sair da edição?");
    setConfirmDescription("Você tem alterações não salvas. Deseja continuar?");
    confirmActionRef.current = () => {
      closeEditor();
    };
    confirmCancelRef.current = () => {
      setConfirmOpen(false);
    };
    setConfirmOpen(true);
  };

  const handleEditorOpenChange = (next: boolean) => {
    if (
      !next &&
      (isLibraryOpen ||
        isVersionHistoryOpen ||
        openingVersionHistoryRef.current ||
        Boolean(rollbackTargetVersion))
    ) {
      return;
    }
    if (!next) {
      requestCloseEditor();
      return;
    }
    setIsEditorOpen(true);
  };

  const handleRouteNavigate = (href: string) => {
    if (!isEditorOpen || !isDirty) {
      navigate(href);
      return;
    }
    setConfirmTitle("Sair da edição?");
    setConfirmDescription("Você tem alterações não salvas. Deseja continuar?");
    confirmActionRef.current = () => {
      navigate(href);
    };
    confirmCancelRef.current = () => {
      setConfirmOpen(false);
    };
    setConfirmOpen(true);
  };

  const projectMap = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const embeddedUploadUrls = useMemo(
    () => extractLexicalImageUploadUrls(formState.contentLexical),
    [formState.contentLexical],
  );
  const postImageLibraryOptions = useMemo(
    () => ({
      uploadFolder: "posts",
      listFolders: filterImageLibraryFoldersByAccess(["posts", "shared"], {
        grants: { posts: canManagePosts },
      }),
      listAll: false,
      includeProjectImages: true,
      projectImageProjectIds: [],
      projectImagesView: "by-project" as const,
      currentSelectionUrls: embeddedUploadUrls,
    }),
    [canManagePosts, embeddedUploadUrls],
  );
  const projectTags = useMemo(() => {
    if (!formState.projectId) {
      return [];
    }
    return projectMap.get(formState.projectId)?.tags || [];
  }, [formState.projectId, projectMap]);
  const tagTranslationMap = useMemo(() => buildTranslationMap(tagTranslations), [tagTranslations]);
  const displayTag = useCallback(
    (tag: string) => translateTag(tag, tagTranslationMap),
    [tagTranslationMap],
  );
  useEffect(() => {
    const base = (formState.tags || []).filter(Boolean);
    const next = [...base];
    projectTags.forEach((tag) => {
      if (tag && !next.includes(tag)) {
        next.push(tag);
      }
    });
    setTagOrder((prev) => {
      if (prev.length === 0) {
        return next;
      }
      const ordered = prev.filter((tag) => next.includes(tag));
      next.forEach((tag) => {
        if (!ordered.includes(tag)) {
          ordered.push(tag);
        }
      });
      return ordered;
    });
  }, [projectTags, formState.tags]);
  const isRestorable = useCallback(
    (post: PostRecord) => {
      if (!post.deletedAt) {
        return false;
      }
      const ts = new Date(post.deletedAt).getTime();
      if (!Number.isFinite(ts)) {
        return false;
      }
      return Date.now() - ts <= restoreWindowMs;
    },
    [restoreWindowMs],
  );
  const getRestoreRemainingLabel = (post: PostRecord) => {
    if (!post.deletedAt) {
      return "";
    }
    const ts = new Date(post.deletedAt).getTime();
    if (!Number.isFinite(ts)) {
      return "";
    }
    const remainingMs = restoreWindowMs - (Date.now() - ts);
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    if (remainingDays <= 1) {
      return "1 dia";
    }
    return `${remainingDays} dias`;
  };
  const activePosts = useMemo(() => posts.filter((post) => !post.deletedAt), [posts]);
  const trashedPosts = useMemo(
    () => posts.filter((post) => post.deletedAt && isRestorable(post)),
    [isRestorable, posts],
  );
  const availableTags = useMemo(() => {
    const collected = new Set<string>();
    projects.forEach((project) => {
      (project.tags || []).forEach((tag) => {
        if (tag) {
          collected.add(tag);
        }
      });
    });
    activePosts.forEach((post) => {
      (post.tags || []).forEach((tag) => {
        if (tag) {
          collected.add(tag);
        }
      });
    });
    return sortByTranslatedLabel(Array.from(collected), (tag) => displayTag(tag));
  }, [activePosts, displayTag, projects]);
  const mergedTags = useMemo(() => {
    if (tagOrder.length) {
      return tagOrder;
    }
    const combined = [...projectTags, ...(formState.tags || [])];
    return Array.from(new Set(combined.filter(Boolean)));
  }, [projectTags, formState.tags, tagOrder]);

  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      if (sortMode === "projects" && projectFilterId !== "all") {
        return activePosts.filter((post) => post.projectId === projectFilterId);
      }
      return activePosts;
    }
    return activePosts.filter((post) => {
      if (
        sortMode === "projects" &&
        projectFilterId !== "all" &&
        post.projectId !== projectFilterId
      ) {
        return false;
      }
      const project = post.projectId ? projectMap.get(post.projectId) : null;
      const projectTitle = project?.title || "";
      const projectTags = project?.tags?.join(" ") || "";
      const postTags = Array.isArray(post.tags) ? post.tags.join(" ") : "";
      const haystack = [
        post.title,
        post.slug,
        post.excerpt,
        post.author,
        projectTitle,
        projectTags,
        postTags,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [activePosts, projectFilterId, projectMap, searchQuery, sortMode]);

  const sortedPosts = useMemo(() => {
    if (
      sortMode === "projects" ||
      sortMode === "recent" ||
      !["alpha", "tags", "status", "views", "comments"].includes(sortMode)
    ) {
      // Precompute timestamps to avoid O(N log N) date parsing
      const mapped = filteredPosts.map((post) => ({
        post,
        timestamp: new Date(post.publishedAt).getTime(),
      }));

      mapped.sort((aWrapper, bWrapper) => bWrapper.timestamp - aWrapper.timestamp);

      return mapped.map((w) => w.post);
    }

    const next = [...filteredPosts];
    next.sort((a, b) => {
      if (sortMode === "alpha") {
        return a.title.localeCompare(b.title, "pt-BR");
      }
      if (sortMode === "tags") {
        const tagsA = [
          ...(a.projectId ? projectMap.get(a.projectId)?.tags || [] : []),
          ...(Array.isArray(a.tags) ? a.tags : []),
        ];
        const tagsB = [
          ...(b.projectId ? projectMap.get(b.projectId)?.tags || [] : []),
          ...(Array.isArray(b.tags) ? b.tags : []),
        ];
        return tagsA.join(",").localeCompare(tagsB.join(","), "pt-BR");
      }
      if (sortMode === "status") {
        return a.status.localeCompare(b.status, "pt-BR");
      }
      if (sortMode === "views") {
        return (b.views || 0) - (a.views || 0);
      }
      if (sortMode === "comments") {
        return (b.commentsCount || 0) - (a.commentsCount || 0);
      }
      return 0; // Should not reach here based on outer if
    });
    return next;
  }, [filteredPosts, projectMap, sortMode]);

  const calendarGridDays = useMemo(
    () => buildMonthCalendarGrid(calendarMonthCursor),
    [calendarMonthCursor],
  );
  const calendarDayItemsMap = useMemo(() => {
    const map = new Map<string, EditorialCalendarItem[]>();
    calendarItems.forEach((item) => {
      const key = toLocalDateKey(item.scheduledAt || item.publishedAt);
      if (!key) {
        return;
      }
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key)?.push(item);
    });
    map.forEach((items) => {
      // Precompute timestamps to avoid O(N log N) date parsing
      const mapped = items.map((item) => ({
        item,
        timestamp: new Date(item.scheduledAt || item.publishedAt || 0).getTime(),
      }));
      mapped.sort((a, b) => a.timestamp - b.timestamp);
      // Mutate original array to keep behavior
      items.length = 0;
      mapped.forEach((w) => items.push(w.item));
    });
    return map;
  }, [calendarItems]);
  const calendarWeeks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => calendarGridDays.slice(index * 7, index * 7 + 7)),
    [calendarGridDays],
  );
  const calendarMonthLabel = useMemo(
    () =>
      calendarMonthCursor.toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
      }),
    [calendarMonthCursor],
  );

  useEffect(() => {
    if (listViewMode !== "calendar" || !canManagePosts) {
      return;
    }
    void loadEditorialCalendar(calendarMonthCursor);
  }, [calendarMonthCursor, canManagePosts, listViewMode, loadEditorialCalendar, posts]);

  const handleShowListView = () => {
    setListViewMode("list");
  };

  const handleShowCalendarView = () => {
    setListViewMode("calendar");
  };

  const postsPerPage = 10;
  const totalPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const pageStart = (currentPage - 1) * postsPerPage;
  const paginatedPosts = sortedPosts.slice(pageStart, pageStart + postsPerPage);

  useEffect(() => {
    if (!hasResolvedPosts) {
      return;
    }
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [hasResolvedPosts, totalPages]);

  useEffect(() => {
    queryStateRef.current = {
      sortMode,
      searchQuery,
      projectFilterId,
      currentPage,
    };
  }, [currentPage, projectFilterId, searchQuery, sortMode]);

  useEffect(() => {
    const nextSortMode = parseDashboardEnumParam(
      searchParams.get("sort"),
      DASHBOARD_POST_SORT_MODES,
      "recent",
    );
    const nextSearchQuery = searchParams.get("q") || "";
    const nextProjectFilterId = searchParams.get("project") || "all";
    const nextPage = parseDashboardPageParam(searchParams.get("page"));
    const {
      sortMode: currentSortMode,
      searchQuery: currentSearchQuery,
      projectFilterId: currentProjectFilterId,
      currentPage: currentCurrentPage,
    } = queryStateRef.current;
    const shouldApply =
      currentSortMode !== nextSortMode ||
      currentSearchQuery !== nextSearchQuery ||
      currentProjectFilterId !== nextProjectFilterId ||
      currentCurrentPage !== nextPage;
    if (!shouldApply) {
      return;
    }
    isApplyingSearchParamsRef.current = true;
    setSortMode((prev) => (prev === nextSortMode ? prev : nextSortMode));
    setSearchQuery((prev) => (prev === nextSearchQuery ? prev : nextSearchQuery));
    setProjectFilterId((prev) => (prev === nextProjectFilterId ? prev : nextProjectFilterId));
    setCurrentPage((prev) => (prev === nextPage ? prev : nextPage));
  }, [searchParams]);

  useEffect(() => {
    const activeEditQuery = (searchParams.get("edit") || "").trim();
    const shouldStripEditQuery =
      Boolean(activeEditQuery) && autoEditHandledRef.current === activeEditQuery;
    const nextParams = buildDashboardSearchParams(
      searchParams,
      [
        { key: "sort", value: sortMode, fallbackValue: "recent" },
        { key: "q", value: searchQuery.trim(), fallbackValue: "" },
        { key: "project", value: projectFilterId, fallbackValue: "all" },
        { key: "page", value: currentPage, fallbackValue: 1 },
      ],
      shouldStripEditQuery ? { deleteKeys: ["edit"] } : undefined,
    );
    if (isApplyingSearchParamsRef.current) {
      if (areDashboardSearchParamsEqual(nextParams, searchParams)) {
        isApplyingSearchParamsRef.current = false;
      }
      return;
    }
    if (!areDashboardSearchParamsEqual(nextParams, searchParams)) {
      scheduleSearchReplace(nextParams);
    }
  }, [
    currentPage,
    location.hash,
    location.pathname,
    location.search,
    projectFilterId,
    scheduleSearchReplace,
    searchParams,
    searchQuery,
    sortMode,
  ]);

  const handlePublishDateChange = (nextDate: Date | null) => {
    if (!nextDate) {
      setFormState((prev) => ({ ...prev, publishAt: "" }));
      return;
    }
    const { time } = parseLocalDateTimeValue(formState.publishAt || "");
    const timePart = time || "12:00";
    const nextValue = `${toLocalDateTimeValue(nextDate).slice(0, 10)}T${timePart}`;
    setFormState((prev) => ({ ...prev, publishAt: nextValue }));
  };

  const handlePublishTimeChange = (nextTime: Date | null) => {
    if (!nextTime || Number.isNaN(nextTime.getTime())) {
      return;
    }
    const nextTimePart = `${String(nextTime.getHours()).padStart(2, "0")}:${String(
      nextTime.getMinutes(),
    ).padStart(2, "0")}`;
    const { date } = parseLocalDateTimeValue(formState.publishAt || "");
    const baseDate = date || new Date();
    const datePart = toLocalDateTimeValue(baseDate).slice(0, 10);
    setFormState((prev) => ({ ...prev, publishAt: `${datePart}T${nextTimePart}` }));
  };

  const publishDateParts = parseLocalDateTimeValue(formState.publishAt || "");
  const publishDateValue = publishDateParts.date;
  const publishTimeValue = toTimeFieldValue(publishDateParts.time || "12:00");

  const handleSetNow = () => {
    const now = new Date();
    handlePublishDateChange(now);
    handlePublishTimeChange(now);
  };

  const handleAddTag = () => {
    const nextTag = tagInput.trim();
    if (!nextTag) {
      return;
    }
    const tagsToAdd = nextTag
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tagsToAdd.length === 0) {
      setTagInput("");
      return;
    }
    setFormState((prev) => {
      const current = prev.tags || [];
      const combined = [...current, ...tagsToAdd.filter((tag) => !projectTags.includes(tag))];
      return { ...prev, tags: Array.from(new Set(combined)) };
    });
    setTagOrder((prev) => {
      const next = [...prev];
      tagsToAdd.forEach((tag) => {
        if (!next.includes(tag)) {
          next.push(tag);
        }
      });
      return next;
    });
    setTagInput("");
    if (tagInputRef.current) {
      tagInputRef.current.value = "";
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormState((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((item) => item !== tag),
    }));
    setTagOrder((prev) => prev.filter((item) => item !== tag));
  };

  const announceTagMove = useCallback(
    (tag: string, targetIndex: number) => {
      announce(`${displayTag(tag)} movida para a posição ${targetIndex + 1}.`);
    },
    [announce, displayTag],
  );

  const moveTag = useCallback(
    (tag: string, targetIndex: number) => {
      setTagOrder((prev) => {
        const source = prev.length > 0 ? [...prev] : [...mergedTags];
        const fromIndex = source.indexOf(tag);
        if (
          fromIndex === -1 ||
          fromIndex === targetIndex ||
          targetIndex < 0 ||
          targetIndex >= source.length
        ) {
          return prev.length > 0 ? prev : source;
        }
        source.splice(fromIndex, 1);
        source.splice(targetIndex, 0, tag);
        return source;
      });
    },
    [mergedTags],
  );

  const handleTagDragStart = (tag: string) => {
    setDraggedTag(tag);
  };

  const handleTagDrop = (targetTag: string) => {
    if (!draggedTag || draggedTag === targetTag) {
      setDraggedTag(null);
      return;
    }
    const targetIndex = mergedTags.indexOf(targetTag);
    if (targetIndex !== -1) {
      moveTag(draggedTag, targetIndex);
      announceTagMove(draggedTag, targetIndex);
    }
    setDraggedTag(null);
  };

  const handleTagKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, tag: string, tagIndex: number) => {
      if (!event.altKey) {
        return;
      }
      if (event.key === "ArrowUp" && tagIndex > 0) {
        event.preventDefault();
        const targetIndex = tagIndex - 1;
        moveTag(tag, targetIndex);
        announceTagMove(tag, targetIndex);
        return;
      }
      if (event.key === "ArrowDown" && tagIndex < mergedTags.length - 1) {
        event.preventDefault();
        const targetIndex = tagIndex + 1;
        moveTag(tag, targetIndex);
        announceTagMove(tag, targetIndex);
      }
    },
    [announceTagMove, mergedTags.length, moveTag],
  );

  const openLibrary = () => {
    setIsLibraryOpen(true);
  };

  const handleLibrarySelect = useCallback(
    (
      url: string,
      altText?: string,
      selectedItem?: {
        url?: string | null;
        variants?: unknown;
        variantsVersion?: number | null;
      },
    ) => {
      const nextUrl = String(url || "").trim();
      const variantKey = normalizeUploadVariantUrlKey(selectedItem?.url || nextUrl);
      const nextVariants =
        selectedItem?.variants && typeof selectedItem.variants === "object"
          ? selectedItem.variants
          : null;
      if (variantKey && nextVariants) {
        const variantsVersionRaw = Number(selectedItem?.variantsVersion);
        const nextVariantsVersion = Number.isFinite(variantsVersionRaw)
          ? Math.max(1, Math.floor(variantsVersionRaw))
          : 1;
        setMediaVariants((prev) => ({
          ...prev,
          [variantKey]: {
            variantsVersion: nextVariantsVersion,
            variants: nextVariants as UploadMediaVariantsMap[string]["variants"],
          },
        }));
      }
      setFormState((prev) => {
        const hasManualCover = Boolean(String(prev.coverImageUrl || "").trim());
        const shouldKeepAutomatic =
          !hasManualCover &&
          editorResolvedCover.source === "content" &&
          areCoverUrlsEquivalent(nextUrl, editorResolvedCover.coverImageUrl);
        return {
          ...prev,
          coverImageUrl: shouldKeepAutomatic ? "" : nextUrl,
          coverAlt:
            shouldKeepAutomatic || !nextUrl
              ? ""
              : resolveAssetAltText(altText, DEFAULT_POST_COVER_ALT),
        };
      });
    },
    [editorResolvedCover.coverImageUrl, editorResolvedCover.source],
  );

  const handleCopyLink = async (slug: string) => {
    const url = `${window.location.origin}/postagem/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: url });
    } catch {
      toast({ title: "Não foi possível copiar o link" });
    }
  };

  const handleSave = async (overrideStatus?: "draft" | "scheduled" | "published") => {
    const resolvedStatus = overrideStatus || formState.status;
    const parsedPublishAtMs = formState.publishAt ? new Date(formState.publishAt).getTime() : null;
    const publishAtValue =
      parsedPublishAtMs !== null && Number.isFinite(parsedPublishAtMs)
        ? new Date(parsedPublishAtMs).toISOString()
        : null;
    const nowIso = new Date().toISOString();
    const originalPublishAtLocal = editingPost
      ? toLocalDateTimeFromIso(editingPost.publishedAt)
      : "";
    const didPublishAtChange =
      Boolean(editingPost) && formState.publishAt !== originalPublishAtLocal;
    let resolvedPublishedAt = editingPost?.publishedAt || nowIso;
    if (overrideStatus === "published") {
      resolvedPublishedAt = nowIso;
    } else if (editingPost && !didPublishAtChange) {
      resolvedPublishedAt = editingPost.publishedAt || nowIso;
    } else if (publishAtValue) {
      resolvedPublishedAt = publishAtValue;
    }
    const scheduledDateSource =
      editingPost && !didPublishAtChange ? editingPost.publishedAt : publishAtValue;
    const hasScheduledDate = resolvedStatus !== "scheduled" || Boolean(scheduledDateSource);
    if (!hasScheduledDate) {
      toast({
        title: "Defina uma data de publicação",
        description: "Posts agendados precisam de uma data.",
      });
      return;
    }
    const lexicalText = getLexicalText(formState.contentLexical);
    const seoDescription = lexicalText.trim().slice(0, 150);
    const coverImageUrl = formState.coverImageUrl.trim() || null;
    const coverAlt = coverImageUrl
      ? resolveAssetAltText(formState.coverAlt, DEFAULT_POST_COVER_ALT)
      : formState.coverAlt.trim() || "";
    const excerpt = formState.excerpt.trim() || lexicalText.trim().slice(0, 160);
    const rawTagInput = tagInputRef.current?.value ?? tagInput;
    const pendingTags = rawTagInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const tagsToSave = (() => {
      const ordered: string[] = [];
      const pushUnique = (tag: string) => {
        if (tag && !ordered.includes(tag)) {
          ordered.push(tag);
        }
      };
      tagOrder.forEach(pushUnique);
      (formState.tags || []).forEach(pushUnique);
      projectTags.forEach(pushUnique);
      pendingTags.forEach(pushUnique);
      return ordered;
    })();
    const payload = {
      title: formState.title.trim(),
      slug: formState.slug.trim(),
      coverImageUrl,
      coverAlt,
      excerpt,
      content: formState.contentLexical,
      contentFormat: "lexical",
      author: formState.author.trim(),
      publishedAt: resolvedPublishedAt,
      status: resolvedStatus,
      seoTitle: formState.title.trim(),
      seoDescription,
      projectId: formState.projectId || "",
      tags: tagsToSave,
    };

    if (!payload.title || !payload.slug) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Título e slug são necessários para criar a postagem.",
      });
      return;
    }
    const response = await apiFetch(
      apiBase,
      `/api/posts${editingPost ? `/${editingPost.id}` : ""}`,
      {
        method: editingPost ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        auth: true,
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      toast({
        title: "Não foi possível salvar",
        description: "Verifique as permissões ou tente novamente.",
      });
      return;
    }

    const data = await response.json();
    const savedPostSlug = typeof data?.post?.slug === "string" ? data.post.slug : "";
    if (!editingPost) {
      const baseSlug = createSlug(payload.slug || payload.title);
      if (savedPostSlug && savedPostSlug !== baseSlug) {
        toast({
          title: "Link ajustado automaticamente",
          description: `Conflito detectado. O post foi salvo com /${savedPostSlug}.`,
        });
      }
    }

    await loadPosts();
    if (editingPost?.id) {
      const savedPost =
        data?.post && typeof data.post === "object"
          ? ({ ...(editingPost || {}), ...(data.post as Partial<PostRecord>) } as PostRecord)
          : editingPost;
      void checkRestorableHistoryAvailability(savedPost);
    }
    const nextFormAfterSave = {
      ...formState,
      status: resolvedStatus,
      publishAt: resolvedPublishedAt ? toLocalDateTimeFromIso(resolvedPublishedAt) : "",
      excerpt,
      coverImageUrl: coverImageUrl || "",
      coverAlt,
      tags: tagsToSave.filter((tag) => !projectTags.includes(tag)),
    };
    editorInitialSnapshotRef.current = buildPostEditorSnapshot(nextFormAfterSave);
    setFormState((prev) => ({
      ...prev,
      ...nextFormAfterSave,
    }));
    setTagOrder(tagsToSave);
    toast({
      title: editingPost ? "Postagem atualizada" : "Postagem criada",
      description: "As alterações já estão na dashboard.",
    });
    if (pendingTags.length) {
      setTagInput("");
      if (tagInputRef.current) {
        tagInputRef.current.value = "";
      }
    }
    if (editingPost) {
      closeEditor();
    } else if (resolvedStatus === "published" || resolvedStatus === "scheduled") {
      closeEditor();
    }
  };

  const handleDelete = () => {
    if (!editingPost) {
      return;
    }
    setDeleteTarget(editingPost);
  };

  const handleDeletePost = async (post: PostRecord) => {
    setDeleteTarget(post);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    const response = await apiFetch(apiBase, `/api/posts/${deleteTarget.id}`, {
      method: "DELETE",
      auth: true,
    });
    if (!response.ok) {
      toast({ title: "Não foi possível excluir a postagem" });
      return;
    }
    await loadPosts();
    setDeleteTarget(null);
    if (editingPost && deleteTarget.id === editingPost.id) {
      closeEditor();
    }
    toast({
      title: "Postagem movida para a lixeira",
      description: "Você pode restaurar por 3 dias.",
    });
  };
  const handleRestorePost = async (post: PostRecord) => {
    const response = await apiFetch(apiBase, `/api/posts/${post.id}/restore`, {
      method: "POST",
      auth: true,
    });
    if (!response.ok) {
      if (response.status === 410) {
        toast({ title: "Janela de restauração expirou" });
        await loadPosts();
        return;
      }
      toast({ title: "Não foi possível restaurar a postagem" });
      return;
    }
    const data = await response.json();
    setPosts((prev) => prev.map((item) => (item.id === post.id ? data.post : item)));
    toast({ title: "Postagem restaurada" });
  };

  const persistedEditingPost = editingPost?.id
    ? posts.find((post) => post.id === editingPost.id) || editingPost
    : null;

  const editingPostHasRestorableHistory = Boolean(
    editingPost?.id && versionHistoryAvailabilityByPostId[editingPost.id] === true,
  );
  const editorSectionClassName =
    "project-editor-section rounded-2xl border border-border/60 bg-card/70 px-4";
  const editorSectionHeaderClassName =
    "project-editor-section-trigger flex w-full items-start gap-4 pb-1 pt-3 text-left md:pb-1.5 md:pt-3";
  const editorSectionContentClassName = "project-editor-section-content px-1 pb-3.5 pt-0!";
  const subtleSummarySurfaceClassName = `border border-border/60 bg-card/65 ${dashboardSubtleSurfaceHoverClassName}`;
  const subtleSurfaceClassName = `border border-border/60 bg-card/60 ${dashboardSubtleSurfaceHoverClassName}`;
  const editorPostLabel = editingPost ? "Postagem em edição" : "Nova postagem";
  const editorPostTitle = formState.title.trim() || "Sem título";
  const editorPostId = editingPost?.id || "Será definido ao salvar";
  const editorSlugValue = formState.slug.trim() || editingPost?.slug || "";
  const editorPublicHref =
    persistedEditingPost?.slug && isPostCurrentlyPublic(persistedEditingPost)
      ? `/postagem/${persistedEditingPost.slug}`
      : "";
  const editorPostSlug = editorSlugValue ? `/${editorSlugValue}` : "Slug será definido ao salvar";
  const editorStatusLabel = postStatusLabels[formState.status];
  const editorAuthorLabel = formState.author.trim() || currentUser?.name || "Sem autor";
  const editorProjectLabel = formState.projectId
    ? projectMap.get(formState.projectId)?.title || `ID ${formState.projectId}`
    : "Sem projeto";
  const editorTagCount = mergedTags.length;
  const editorTagSummary = `${editorTagCount} ${editorTagCount === 1 ? "tag" : "tags"}`;
  const editorMediaLabel =
    editorResolvedCover.source === "manual"
      ? "Capa manual"
      : editorResolvedCover.coverImageUrl
        ? "Fallback do conteúdo"
        : "Sem capa";
  const hasBlockingLoadError = !hasLoadedOnce && hasLoadError;
  const hasRetainedLoadError = hasLoadedOnce && hasLoadError;
  const showPostsSurfaceSkeleton = !hasResolvedPosts && !hasBlockingLoadError;
  useDashboardRefreshToast({
    active: isRefreshing && hasLoadedOnce,
    title: "Atualizando postagens",
    description: "Buscando a lista mais recente do painel editorial.",
  });

  return (
    <>
      {pendingSearchReplacement ? <Navigate to={pendingSearchReplacement} replace /> : null}
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={isLoadingUser}
        onUserCardClick={() => navigate("/dashboard/usuarios?edit=me")}
        onMenuItemClick={(item, event) => {
          if (!item.enabled || !isEditorOpen || !isDirty) {
            return;
          }
          event.preventDefault();
          handleRouteNavigate(item.href);
        }}
      >
        <DashboardPageContainer>
          <DashboardPageHeader
            badge="Postagens"
            title="Gerenciar posts"
            description="Visualize, edite e publique os posts mais recentes do site."
            actions={
              canManagePosts ? (
                <DashboardActionButton type="button" size="toolbar" onClick={openCreate}>
                  <Plus className="h-4 w-4" />
                  Nova postagem
                </DashboardActionButton>
              ) : undefined
            }
          />

          {isEditorOpen && canManagePosts ? (
            <>
              <Dialog open={isEditorOpen} onOpenChange={handleEditorOpenChange} modal={false}>
                <DashboardEditorBackdrop />
                <DialogContent
                  className={`project-editor-dialog ${dashboardEditorDialogWidthClassName} gap-0 p-0 ${
                    isEditorDialogScrolled ? "editor-modal-scrolled" : ""
                  }`}
                  onPointerDownOutside={(event) => {
                    if (isLibraryOpen) {
                      event.preventDefault();
                      return;
                    }
                    const target = event.target as HTMLElement | null;
                    if (target?.closest(".lexical-playground")) {
                      event.preventDefault();
                    }
                  }}
                  onInteractOutside={(event) => {
                    if (isLibraryOpen) {
                      event.preventDefault();
                      return;
                    }
                    const target = event.target as HTMLElement | null;
                    if (target?.closest(".lexical-playground")) {
                      event.preventDefault();
                    }
                  }}
                >
                  <div className="project-editor-modal-frame flex max-h-[min(90vh,calc(100dvh-1.5rem))] min-h-0 flex-col">
                    <div
                      className="project-editor-scroll-shell flex-1 overflow-y-auto no-scrollbar"
                      onScroll={(event) => {
                        const nextScrolled = event.currentTarget.scrollTop > 0;
                        setIsEditorDialogScrolled((prev) =>
                          prev === nextScrolled ? prev : nextScrolled,
                        );
                      }}
                    >
                      <div
                        ref={setEditorTopElement}
                        className="project-editor-top sticky top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/80"
                      >
                        <DialogHeader className="space-y-0 px-4 pb-2.5 pt-3.5 text-left md:px-6 lg:px-8">
                          <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] uppercase tracking-[0.12em]"
                                >
                                  {editorPostLabel}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase tracking-[0.12em]"
                                >
                                  {editorStatusLabel}
                                </Badge>
                              </div>
                              <DialogTitle className="text-xl md:text-2xl">
                                {editingPost ? "Editar postagem" : "Nova postagem"}
                              </DialogTitle>
                              <DialogDescription className="max-w-2xl text-xs md:text-sm">
                                Crie, edite e publique conteúdos sem sair da listagem.
                              </DialogDescription>
                            </div>
                            <div
                              className={`rounded-xl px-3 py-1.5 text-right ${subtleSummarySurfaceClassName}`}
                            >
                              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                                Postagem
                              </p>
                              <p className="max-w-[260px] truncate text-sm font-medium text-foreground">
                                {editorPostTitle}
                              </p>
                              <p className="max-w-[260px] truncate text-[11px] text-muted-foreground">
                                {editorPostSlug}
                              </p>
                            </div>
                          </div>
                        </DialogHeader>
                        <div className="project-editor-status-bar flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-1.5 md:px-6 lg:px-8">
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-[0.12em]"
                          >
                            ID {editorPostId}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-[0.12em]"
                          >
                            {editorStatusLabel}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-[0.12em]"
                          >
                            {editorAuthorLabel}
                          </Badge>
                          <span className="max-w-[280px] truncate text-[11px] text-muted-foreground">
                            {editorProjectLabel}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {editorTagSummary}
                          </span>
                        </div>
                      </div>
                      <div
                        onFocusCapture={(event) => {
                          const target = event.target as HTMLElement | null;
                          if (target?.closest(".lexical-playground")) {
                            return;
                          }
                          editorRef.current?.blur();
                        }}
                      >
                        <div className="project-editor-layout space-y-4 px-4 pb-4 pt-2.5 md:px-6 md:pb-5 lg:px-8">
                          <div className="grid gap-3.5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.95fr)]">
                            <section
                              className={`${editorSectionClassName} min-w-0`}
                              data-state="open"
                            >
                              <div className={editorSectionHeaderClassName}>
                                <PostEditorSectionHeader
                                  title="Conteúdo"
                                  subtitle="Texto principal do post"
                                />
                              </div>
                              <div className={editorSectionContentClassName}>
                                <div
                                  className="post-editor-lexical-wrapper min-w-0"
                                  style={postEditorLexicalWrapperStyle}
                                >
                                  <LexicalEditorSurface
                                    fallbackVariant="post"
                                    fallbackMinHeightClassName="min-h-[460px] lg:min-h-[680px]"
                                    ref={editorRef}
                                    value={formState.contentLexical}
                                    onChange={(value) =>
                                      setFormState((prev) => ({
                                        ...prev,
                                        contentLexical: value,
                                      }))
                                    }
                                    placeholder="Escreva o conteúdo do post..."
                                    className="lexical-playground--modal lexical-playground--stretch lexical-playground--post-editor lexical-playground--post-editor-top-flush min-w-0 w-full"
                                    imageLibraryOptions={postImageLibraryOptions}
                                    autoFocus={false}
                                    followCaretScroll
                                  />
                                </div>
                              </div>
                            </section>

                            <aside className="min-w-0 space-y-3.5 md:space-y-4">
                              <section className={editorSectionClassName} data-state="open">
                                <div className={editorSectionHeaderClassName}>
                                  <PostEditorSectionHeader
                                    title="Publicação"
                                    subtitle={editorStatusLabel}
                                  />
                                </div>
                                <div className={`${editorSectionContentClassName} space-y-4`}>
                                  <DashboardFieldStack>
                                    <Label htmlFor="post-title">Título</Label>
                                    <Input
                                      id="post-title"
                                      value={formState.title}
                                      onChange={(event) =>
                                        setFormState((prev) => ({
                                          ...prev,
                                          title: event.target.value,
                                        }))
                                      }
                                    />
                                  </DashboardFieldStack>
                                  <DashboardFieldStack>
                                    <div className="flex items-center justify-between gap-2">
                                      <Label htmlFor="post-slug">Link</Label>
                                      <DashboardActionButton
                                        type="button"
                                        size="compact"
                                        onClick={() => setIsSlugCustom((prev) => !prev)}
                                      >
                                        {isSlugCustom ? "Automático" : "Personalizar"}
                                      </DashboardActionButton>
                                    </div>
                                    <Input
                                      id="post-slug"
                                      value={formState.slug}
                                      onChange={(event) => {
                                        setIsSlugCustom(true);
                                        setFormState((prev) => ({
                                          ...prev,
                                          slug: event.target.value,
                                        }));
                                      }}
                                      disabled={!isSlugCustom}
                                    />
                                  </DashboardFieldStack>
                                  <DashboardFieldStack>
                                    <Label htmlFor="post-author">Autor</Label>
                                    <Input
                                      id="post-author"
                                      value={formState.author}
                                      onChange={(event) =>
                                        setFormState((prev) => ({
                                          ...prev,
                                          author: event.target.value,
                                        }))
                                      }
                                    />
                                  </DashboardFieldStack>
                                  <DashboardFieldStack>
                                    <Label htmlFor="post-status">Status</Label>
                                    <Combobox
                                      id="post-status"
                                      value={formState.status}
                                      onValueChange={(value) =>
                                        setFormState((prev) => ({
                                          ...prev,
                                          status: value as "draft" | "scheduled" | "published",
                                        }))
                                      }
                                      ariaLabel="Selecionar status"
                                      options={postStatusOptions}
                                      placeholder="Selecione"
                                      searchable={false}
                                    />
                                  </DashboardFieldStack>
                                  <DashboardFieldStack>
                                    <Label htmlFor="post-date">Publicação</Label>
                                    <MuiDateTimeFieldsProvider>
                                      <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
                                        <MuiBrazilDateField
                                          id="post-date"
                                          value={publishDateValue}
                                          onChange={handlePublishDateChange}
                                          className="mui-date-time-field--editor"
                                        />
                                        <div className="flex min-w-0 items-stretch gap-2">
                                          <MuiBrazilTimeField
                                            id="post-time"
                                            value={publishTimeValue}
                                            onChange={handlePublishTimeChange}
                                            className="mui-date-time-field--editor flex-1"
                                          />
                                          <DashboardActionButton
                                            type="button"
                                            size="sm"
                                            className="h-10 shrink-0 rounded-md px-3 text-[13px] md:text-sm"
                                            onClick={handleSetNow}
                                          >
                                            Agora
                                          </DashboardActionButton>
                                        </div>
                                      </div>
                                    </MuiDateTimeFieldsProvider>
                                  </DashboardFieldStack>
                                </div>
                              </section>

                              <section className={editorSectionClassName} data-state="open">
                                <div className={editorSectionHeaderClassName}>
                                  <PostEditorSectionHeader
                                    title="Mídia"
                                    subtitle={editorMediaLabel}
                                  />
                                </div>
                                <div className={`${editorSectionContentClassName} space-y-4`}>
                                  <DashboardFieldStack>
                                    <Label>Capa</Label>
                                    {editorResolvedCover.coverImageUrl ? (
                                      <div className="space-y-2">
                                        <div
                                          className={`overflow-hidden rounded-lg border border-border/60 bg-muted/20 ${dashboardSubtleSurfaceHoverClassName}`}
                                        >
                                          <UploadPicture
                                            src={editorResolvedCover.coverImageUrl}
                                            alt={editorResolvedCover.coverAlt}
                                            preset="card"
                                            mediaVariants={mediaVariants}
                                            className="block w-full"
                                            imgClassName="aspect-3/2 w-full object-cover"
                                          />
                                        </div>
                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                          <span className="min-w-0 truncate">
                                            {editorCoverFileName || "Imagem"}
                                          </span>
                                          <Badge
                                            variant={
                                              editorResolvedCover.source === "manual"
                                                ? "secondary"
                                                : "outline"
                                            }
                                            className="shrink-0 text-[10px] uppercase"
                                          >
                                            {editorResolvedCover.source === "manual"
                                              ? "Manual"
                                              : "Automática"}
                                          </Badge>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">
                                        Sem capa definida.
                                      </p>
                                    )}
                                  </DashboardFieldStack>
                                  <DashboardActionButton
                                    type="button"
                                    size="sm"
                                    onClick={openLibrary}
                                  >
                                    Biblioteca
                                  </DashboardActionButton>
                                </div>
                              </section>

                              <section className={editorSectionClassName} data-state="open">
                                <div className={editorSectionHeaderClassName}>
                                  <PostEditorSectionHeader
                                    title="Relacionamento"
                                    subtitle={editorProjectLabel}
                                  />
                                </div>
                                <DashboardFieldStack className={editorSectionContentClassName}>
                                  <Label>Projeto associado</Label>
                                  <Combobox
                                    value={formState.projectId || "none"}
                                    onValueChange={(value) =>
                                      setFormState((prev) => ({
                                        ...prev,
                                        projectId: value === "none" ? "" : value,
                                      }))
                                    }
                                    ariaLabel="Selecionar projeto associado"
                                    options={[
                                      { value: "none", label: "Nenhum" },
                                      ...projects.map((project) => ({
                                        value: project.id,
                                        label: project.title,
                                      })),
                                    ]}
                                    placeholder="Selecione"
                                    searchable
                                    searchPlaceholder="Buscar projeto"
                                    emptyMessage="Nenhum projeto encontrado."
                                  />
                                </DashboardFieldStack>
                              </section>

                              <section className={editorSectionClassName} data-state="open">
                                <div className={editorSectionHeaderClassName}>
                                  <PostEditorSectionHeader
                                    title="Tags"
                                    subtitle={editorTagSummary}
                                  />
                                </div>
                                <div className={`${editorSectionContentClassName} space-y-4`}>
                                  <div className="flex flex-wrap gap-2">
                                    {mergedTags.map((tag) => {
                                      const isProjectTag = projectTags.includes(tag);
                                      const tagIndex = mergedTags.indexOf(tag);
                                      const tagLabel = displayTag(tag);
                                      const tagHint = isProjectTag
                                        ? `Tag ${tagLabel}. Arraste para reordenar ou use Alt+Seta para mover.`
                                        : `Tag ${tagLabel}. Clique para remover, arraste para reordenar ou use Alt+Seta para mover.`;
                                      return (
                                        <div key={`tag-${tag}`} className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            className="group cursor-grab active:cursor-grabbing"
                                            draggable
                                            onDragStart={() => handleTagDragStart(tag)}
                                            onDragEnd={() => setDraggedTag(null)}
                                            onDragOver={(event) => event.preventDefault()}
                                            onDrop={() => handleTagDrop(tag)}
                                            onKeyDown={(event) =>
                                              handleTagKeyDown(event, tag, tagIndex)
                                            }
                                            onClick={() => {
                                              if (!isProjectTag) {
                                                handleRemoveTag(tag);
                                              }
                                            }}
                                            title={tagHint}
                                            aria-label={tagHint}
                                          >
                                            <Badge
                                              variant={isProjectTag ? "secondary" : "outline"}
                                              className="text-[10px] uppercase"
                                            >
                                              {tagLabel}
                                              {isProjectTag ? null : (
                                                <span className="ml-2 text-[10px] text-muted-foreground group-hover:text-foreground">
                                                  ?
                                                </span>
                                              )}
                                            </Badge>
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {mergedTags.length === 0 ? (
                                      <span className="text-xs text-muted-foreground">
                                        Sem tags ainda.
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Input
                                      ref={tagInputRef}
                                      value={tagInput}
                                      onChange={(event) => setTagInput(event.target.value)}
                                      placeholder="Adicionar tag"
                                      list="post-tag-options"
                                      onBlur={() => {
                                        if (tagInput.trim()) {
                                          handleAddTag();
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === ",") {
                                          event.preventDefault();
                                          handleAddTag();
                                        }
                                      }}
                                    />
                                    <datalist id="post-tag-options">
                                      {availableTags.map((tag) => (
                                        <option key={tag} value={tag} />
                                      ))}
                                    </datalist>
                                    <DashboardActionButton
                                      type="button"
                                      size="sm"
                                      onClick={handleAddTag}
                                    >
                                      Adicionar
                                    </DashboardActionButton>
                                  </div>
                                </div>
                              </section>
                            </aside>
                          </div>

                          {formState.projectId ? (
                            <ProjectEmbedCard projectId={formState.projectId} />
                          ) : null}
                        </div>
                        <div className="project-editor-footer sticky bottom-0 z-20 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm supports-backdrop-filter:bg-background/80 md:px-6 md:py-3 lg:px-8">
                          {editingPostHasRestorableHistory ? (
                            <DashboardActionButton
                              size="sm"
                              onClick={() => void openVersionHistory()}
                            >
                              Histórico
                            </DashboardActionButton>
                          ) : null}
                          {editorPublicHref ? (
                            <DashboardActionButton type="button" size="icon" asChild>
                              <Link target="_blank" rel="noreferrer" to={editorPublicHref}>
                                <Eye className="h-4 w-4" aria-hidden="true" />
                              </Link>
                            </DashboardActionButton>
                          ) : null}
                          {editingPost ? (
                            <DashboardActionButton
                              size="icon"
                              tone="destructive"
                              onClick={handleDelete}
                              aria-label="Excluir postagem"
                            >
                              <Trash2 className="h-4 w-4" />
                            </DashboardActionButton>
                          ) : null}
                          <DashboardActionButton size="sm" onClick={requestCloseEditor}>
                            Cancelar
                          </DashboardActionButton>
                          {editingPost ? (
                            <>
                              <DashboardActionButton
                                size="sm"
                                tone="primary"
                                onClick={() => handleSave()}
                              >
                                Salvar
                              </DashboardActionButton>
                              {formState.status === "draft" ? (
                                <DashboardActionButton
                                  size="sm"
                                  tone="primary"
                                  onClick={() => handleSave("published")}
                                >
                                  Publicar agora
                                </DashboardActionButton>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <DashboardActionButton size="sm" onClick={() => handleSave("draft")}>
                                Salvar rascunho
                              </DashboardActionButton>
                              <DashboardActionButton
                                size="sm"
                                tone="primary"
                                onClick={() => handleSave("scheduled")}
                              >
                                Agendar
                              </DashboardActionButton>
                              <DashboardActionButton
                                size="sm"
                                tone="primary"
                                onClick={() => handleSave("published")}
                              >
                                Publicar agora
                              </DashboardActionButton>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}

          <section className="mt-10 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 animate-slide-up">
              <div className="flex flex-1 flex-wrap items-center gap-3">
                <div className="w-full max-w-sm">
                  <Input
                    value={searchQuery}
                    onChange={(event) => {
                      setCurrentPage(1);
                      setSearchQuery(event.target.value);
                    }}
                    placeholder="Buscar por título, slug, autor, tags..."
                  />
                </div>
                <Combobox
                  value={sortMode}
                  onValueChange={(value) => {
                    setCurrentPage(1);
                    setSortMode(value as typeof sortMode);
                  }}
                  ariaLabel="Ordenar posts"
                  options={postSortOptions}
                  placeholder="Ordenar por"
                  searchable={false}
                  className="w-[200px]"
                />
                {sortMode === "projects" ? (
                  <Combobox
                    value={projectFilterId}
                    disabled={!hasResolvedProjects}
                    onValueChange={(value) => {
                      setCurrentPage(1);
                      setProjectFilterId(value);
                    }}
                    ariaLabel="Selecionar projeto"
                    options={[
                      { value: "all", label: "Todos os projetos" },
                      ...projects.map((project) => ({
                        value: project.id,
                        label: project.title,
                      })),
                    ]}
                    placeholder="Selecionar projeto"
                    searchable
                    searchPlaceholder="Buscar projeto"
                    emptyMessage="Nenhum projeto encontrado."
                    className="w-[240px]"
                  />
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <div
                  data-testid="dashboard-posts-view-toggle"
                  className={`inline-flex items-center gap-1.5 ${dashboardPageLayoutTokens.cardActionSurface} p-1`}
                >
                  <DashboardSegmentedActionButton
                    type="button"
                    active={listViewMode === "list"}
                    onClick={handleShowListView}
                  >
                    <ListIcon className="h-4 w-4" />
                    Lista
                  </DashboardSegmentedActionButton>
                  <DashboardSegmentedActionButton
                    type="button"
                    active={listViewMode === "calendar"}
                    onClick={handleShowCalendarView}
                  >
                    <CalendarDays className="h-4 w-4" />
                    Calendário
                  </DashboardSegmentedActionButton>
                </div>
                <Badge variant="static" className="text-xs uppercase animate-slide-up">
                  {sortedPosts.length} posts
                </Badge>
              </div>
            </div>
            {hasRetainedLoadError ? (
              <Alert className={dashboardPageLayoutTokens.surfaceSolid}>
                <AlertTitle>Atualização parcial indisponível</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>Mantendo a última lista de posts carregada.</span>
                  <DashboardActionButton size="sm" onClick={refreshPosts}>
                    Tentar novamente
                  </DashboardActionButton>
                </AlertDescription>
              </Alert>
            ) : hasBlockingLoadError ? (
              <AsyncState
                kind="error"
                title="Não foi possível carregar as postagens"
                description="Confira a conexão e tente atualizar os dados."
                className={dashboardPageLayoutTokens.surfaceSolid}
                action={
                  <DashboardActionButton onClick={refreshPosts}>Recarregar</DashboardActionButton>
                }
              />
            ) : showPostsSurfaceSkeleton ? (
              <Card
                className={dashboardPageLayoutTokens.surfaceSolid}
                data-testid="dashboard-posts-skeleton-surface"
              >
                <CardContent className="space-y-4 p-4 md:p-6">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-72" />
                  </div>
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`post-skeleton-${index}`}
                        className={`${dashboardPageLayoutTokens.surfaceInset} p-4`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex gap-2">
                              <Skeleton className="h-5 w-20" />
                              <Skeleton className="h-5 w-24" />
                            </div>
                            <Skeleton className="h-6 w-2/5" />
                            <Skeleton className="h-4 w-4/5" />
                            <Skeleton className="h-4 w-3/5" />
                          </div>
                          <div className="flex gap-2">
                            <Skeleton className="h-9 w-9 rounded-md" />
                            <Skeleton className="h-9 w-9 rounded-md" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : sortedPosts.length === 0 ? (
              <AsyncState
                kind="empty"
                title="Nenhuma postagem cadastrada"
                description="Crie uma nova postagem para iniciar o fluxo editorial."
                className={dashboardPageLayoutTokens.surfaceInset}
                action={
                  canManagePosts ? (
                    <Button onClick={openCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      Criar primeira postagem
                    </Button>
                  ) : null
                }
              />
            ) : listViewMode === "calendar" ? (
              <Card
                lift={false}
                data-testid="dashboard-posts-calendar-surface"
                className={`${dashboardPageLayoutTokens.surfaceSolid} animate-fade-in opacity-0`}
                style={calendarSurfaceFadeStyle}
              >
                <CardContent
                  data-testid="dashboard-posts-calendar-content"
                  className="space-y-4 p-4 md:p-6"
                >
                  <div
                    data-testid="dashboard-posts-calendar-header"
                    className="flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <h3 className="text-base font-semibold capitalize">{calendarMonthLabel}</h3>
                      <p className="text-xs text-muted-foreground">
                        Agenda de postagens (agendadas e publicadas) ({calendarTz || timeZone})
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <DashboardActionButton
                        type="button"
                        size="sm"
                        onClick={() =>
                          setCalendarMonthCursor(
                            (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                          )
                        }
                      >
                        Mês anterior
                      </DashboardActionButton>
                      <DashboardActionButton
                        type="button"
                        size="sm"
                        onClick={() =>
                          setCalendarMonthCursor(
                            (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                          )
                        }
                      >
                        Próximo mês
                      </DashboardActionButton>
                    </div>
                  </div>
                  {hasCalendarError ? (
                    <AsyncState
                      kind="error"
                      title="Não foi possível carregar o calendário"
                      description="Tente novamente em alguns instantes."
                      className="border-0 bg-transparent p-0"
                      action={
                        <DashboardActionButton
                          type="button"
                          onClick={() => void loadEditorialCalendar(calendarMonthCursor)}
                        >
                          Recarregar
                        </DashboardActionButton>
                      }
                    />
                  ) : (
                    <div className="space-y-3">
                      <div
                        data-testid="dashboard-posts-calendar-weekday-row"
                        className="grid grid-cols-7 gap-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                      >
                        {calendarWeekdayLabels.map((label) => (
                          <div key={label} className="py-1">
                            {label}
                          </div>
                        ))}
                      </div>
                      {isCalendarLoading ? (
                        <div
                          aria-hidden="true"
                          data-testid="dashboard-posts-calendar-loading-space"
                          className="min-h-[760px]"
                        />
                      ) : (
                        <div
                          data-testid="dashboard-posts-calendar-ready-content"
                          className="space-y-3"
                        >
                          <div className="grid gap-2">
                            {calendarWeeks.map((week, weekIndex) => (
                              <div
                                key={`calendar-week-${weekIndex}`}
                                data-testid={`dashboard-posts-calendar-week-${weekIndex}`}
                                className="grid grid-cols-7 gap-2"
                              >
                                {week.map((day) => {
                                  const dayKey = toLocalDateKey(day);
                                  const dayItems = calendarDayItemsMap.get(dayKey) || [];
                                  const isCurrentMonth =
                                    day.getMonth() === calendarMonthCursor.getMonth();
                                  const isToday = dayKey === toLocalDateKey(new Date());
                                  return (
                                    <div
                                      key={dayKey}
                                      className={`min-h-[120px] rounded-lg border p-2 ${
                                        isCurrentMonth
                                          ? "border-border/70 bg-background"
                                          : "border-border/40 bg-muted/15"
                                      } ${isToday ? "ring-1 ring-primary/50" : ""}`}
                                    >
                                      <div className="mb-2 flex items-center justify-between gap-2">
                                        <span
                                          className={`text-xs font-medium ${
                                            isCurrentMonth
                                              ? "text-foreground"
                                              : "text-muted-foreground"
                                          }`}
                                        >
                                          {day.getDate()}
                                        </span>
                                        {dayItems.length > 0 ? (
                                          <Badge
                                            variant="secondary"
                                            className="text-[10px] uppercase"
                                          >
                                            {dayItems.length}
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <div className="space-y-1">
                                        {dayItems.length === 0 ? (
                                          <span className="text-[11px] text-muted-foreground">
                                            Sem postagens
                                          </span>
                                        ) : (
                                          dayItems.slice(0, 4).map((item) => (
                                            <button
                                              key={item.id}
                                              type="button"
                                              className={`block w-full rounded-md border border-border/70 bg-background px-2 py-1 text-left ${dashboardStrongSurfaceHoverClassName}`}
                                              onClick={() => {
                                                const target = posts.find(
                                                  (post) => post.id === item.id,
                                                );
                                                if (target && canManagePosts) {
                                                  openEdit(target);
                                                }
                                              }}
                                            >
                                              <div className="flex items-center justify-between gap-1">
                                                <div className="truncate text-[11px] font-medium text-foreground">
                                                  {item.title}
                                                </div>
                                                <Badge
                                                  variant={
                                                    item.status === "published"
                                                      ? "outline"
                                                      : "secondary"
                                                  }
                                                  className="shrink-0 text-[9px] uppercase"
                                                >
                                                  {getCalendarItemStatusLabel(item.status)}
                                                </Badge>
                                              </div>
                                              <div className="truncate text-[10px] text-muted-foreground">
                                                {formatLocalTimeShort(
                                                  getCalendarItemDisplayTime(item),
                                                )}
                                              </div>
                                            </button>
                                          ))
                                        )}
                                        {dayItems.length > 4 ? (
                                          <span className="text-[10px] text-muted-foreground">
                                            +{dayItems.length - 4} postagens
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          {calendarItems.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              Nenhuma postagem publicada/agendada neste mês.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6">
                {paginatedPosts.map((post, index) => {
                  const formattedDate = post.publishedAt
                    ? formatDateTimeShort(post.publishedAt)
                    : "Sem data";
                  const project = post.projectId ? projectMap.get(post.projectId) : null;
                  const tags = Array.from(
                    new Set([
                      ...(project?.tags || []),
                      ...(Array.isArray(post.tags) ? post.tags : []),
                    ]),
                  );
                  const sortedCardTags = sortByTranslatedLabel(tags, (tag) => displayTag(tag));
                  const visibleCardTags = sortedCardTags.slice(0, 3);
                  const extraTagCount = Math.max(0, sortedCardTags.length - visibleCardTags.length);
                  const statusLabel = getPostStatusLabel(post.status);
                  const resolvedCardCover = resolvePostCoverPreview({
                    coverImageUrl: post.coverImageUrl,
                    coverAlt: post.coverAlt,
                    content: post.content,
                    contentFormat: post.contentFormat || "lexical",
                    title: post.title,
                  });
                  return (
                    <Card
                      key={post.id}
                      data-testid={`post-card-${post.id}`}
                      lift={false}
                      className={`${dashboardPageLayoutTokens.listCardSolid} ${dashboardStrongSurfaceHoverClassName} group cursor-pointer overflow-hidden transition animate-fade-in opacity-0`}
                      style={dashboardAnimationDelay(dashboardClampedStaggerMs(index))}
                      role={canManagePosts ? "button" : undefined}
                      tabIndex={canManagePosts ? 0 : -1}
                      onKeyDown={(event) => {
                        if (!canManagePosts) {
                          return;
                        }
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openEdit(post);
                        }
                      }}
                      onClick={() => {
                        if (canManagePosts) {
                          openEdit(post);
                        }
                      }}
                    >
                      <CardContent className="p-0">
                        <div className="grid min-h-[360px] gap-0 lg:h-[280px] lg:min-h-0 lg:grid-cols-[220px_1fr]">
                          <div className="relative h-52 w-full overflow-hidden lg:h-full">
                            {resolvedCardCover.coverImageUrl ? (
                              <UploadPicture
                                src={resolvedCardCover.coverImageUrl}
                                alt={resolvedCardCover.coverAlt || post.title}
                                preset="card"
                                mediaVariants={mediaVariants}
                                className="absolute inset-0 block h-full w-full"
                                imgClassName="absolute inset-0 block h-full w-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                                loading="lazy"
                              />
                            ) : (
                              <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-muted/30 text-xs text-muted-foreground">
                                Sem capa
                              </div>
                            )}
                          </div>
                          <div className="grid h-full min-h-0 overflow-hidden grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2 p-4 lg:pb-5">
                            <div data-slot="top" className="flex items-start justify-between gap-3">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[10px] uppercase">
                                  {statusLabel}
                                </Badge>
                                {project ? (
                                  <Badge
                                    variant="secondary"
                                    className="max-w-60 truncate text-[10px] uppercase"
                                  >
                                    {project.title}
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <DashboardActionButton
                                  size="icon-sm"
                                  title="Visualizar"
                                  onClick={(event) => event.stopPropagation()}
                                  asChild
                                >
                                  <Link to={`/postagem/${post.slug}`}>
                                    <Eye className="h-3.5 w-3.5" />
                                  </Link>
                                </DashboardActionButton>
                                <DashboardActionButton
                                  size="icon-sm"
                                  title="Copiar link"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleCopyLink(post.slug);
                                  }}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </DashboardActionButton>
                                {canManagePosts ? (
                                  <DashboardActionButton
                                    tone="destructive"
                                    size="icon-sm"
                                    title="Excluir"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleDeletePost(post);
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                  </DashboardActionButton>
                                ) : null}
                              </div>
                            </div>

                            <div data-slot="headline" className="min-h-11">
                              <h3 className="clamp-safe-2 text-lg font-semibold leading-tight text-muted-foreground lg:clamp-safe-1">
                                {post.title}
                              </h3>
                              <span className={`text-xs ${dashboardPageLayoutTokens.cardMetaText}`}>
                                {formattedDate}
                              </span>
                            </div>

                            <p
                              data-slot="excerpt"
                              className={`line-clamp-2 min-h-0 overflow-hidden text-sm ${dashboardPageLayoutTokens.cardMetaText} [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] lg:line-clamp-1 lg:[-webkit-line-clamp:1]`}
                            >
                              {post.excerpt || "Sem prévia cadastrada."}
                            </p>

                            <div className="flex min-h-0 shrink-0 flex-col gap-2">
                              <div data-slot="tags" className="min-h-6">
                                {visibleCardTags.length > 0 ? (
                                  <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                    {visibleCardTags.map((tag) => (
                                      <Badge
                                        key={tag}
                                        variant="secondary"
                                        className="min-w-0 max-w-34 overflow-hidden text-[10px] uppercase"
                                      >
                                        <span className="block min-w-0 truncate">
                                          {displayTag(tag)}
                                        </span>
                                      </Badge>
                                    ))}
                                    {extraTagCount > 0 ? (
                                      <Badge variant="secondary" className="text-[10px] uppercase">
                                        +{extraTagCount}
                                      </Badge>
                                    ) : null}
                                  </div>
                                ) : (
                                  <span className="invisible text-[10px]">placeholder</span>
                                )}
                              </div>

                              <div
                                data-slot="meta"
                                className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs ${dashboardPageLayoutTokens.cardMetaText} lg:flex-nowrap lg:gap-y-0`}
                              >
                                <span className="inline-flex min-w-0 max-w-full items-center gap-2">
                                  <UserRound className="h-4 w-4 shrink-0" />
                                  <span className="truncate">
                                    {post.author || "Autor não definido"}
                                  </span>
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
                                  <Eye className="h-4 w-4" />
                                  {post.views}
                                  {` ${post.views === 1 ? "visualização" : "visualizações"}`}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
                                  <MessageSquare className="h-4 w-4" />
                                  {post.commentsCount}
                                  {" comentários"}
                                </span>
                                <span
                                  className={`ml-auto hidden max-w-44 truncate text-right text-xs ${dashboardPageLayoutTokens.cardMetaText} lg:block`}
                                >
                                  /{post.slug}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            {listViewMode === "list" && sortedPosts.length > postsPerPage ? (
              <div className="mt-6 flex justify-center">
                <CompactPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            ) : null}
            {listViewMode === "list" && trashedPosts.length > 0 ? (
              <Card lift={false} className={`mt-8 ${dashboardPageLayoutTokens.surfaceSolid}`}>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">Lixeira</h3>
                      <p className="text-xs text-muted-foreground">
                        Restaure em até 3 dias após a exclusão.
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs uppercase">
                      {trashedPosts.length} itens
                    </Badge>
                  </div>
                  <div className="grid gap-3">
                    {trashedPosts.map((post, index) => (
                      <div
                        key={`trash-${post.id}`}
                        className={`${dashboardPageLayoutTokens.surfaceInset} flex flex-wrap items-center justify-between gap-3 px-4 py-3 animate-slide-up`}
                        style={dashboardAnimationDelay(dashboardClampedStaggerMs(index))}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{post.title}</p>
                          <p className="text-xs text-muted-foreground">/{post.slug}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            Restam {getRestoreRemainingLabel(post)}
                          </span>
                          <DashboardActionButton size="sm" onClick={() => handleRestorePost(post)}>
                            Restaurar
                          </DashboardActionButton>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </section>
        </DashboardPageContainer>
      </DashboardShell>

      <LazyImageLibraryDialog
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        apiBase={apiBase}
        description="Escolha uma imagem já enviada ou use capas/banners de projetos."
        uploadFolder={postImageLibraryOptions.uploadFolder}
        listFolders={postImageLibraryOptions.listFolders}
        listAll={postImageLibraryOptions.listAll}
        includeProjectImages={postImageLibraryOptions.includeProjectImages}
        projectImageProjectIds={postImageLibraryOptions.projectImageProjectIds}
        projectImagesView={postImageLibraryOptions.projectImagesView}
        allowDeselect
        mode="single"
        currentSelectionUrls={
          editorResolvedCover.coverImageUrl ? [editorResolvedCover.coverImageUrl] : []
        }
        onSave={({ urls, items }) =>
          handleLibrarySelect(urls[0] || "", items[0]?.altText, items[0])
        }
      />

      <Dialog
        open={isVersionHistoryOpen}
        onOpenChange={(open) => {
          setIsVersionHistoryOpen(open);
          if (!open) {
            setRollbackTargetVersion(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Histórico de versões</DialogTitle>
            <DialogDescription>
              {editingPost
                ? `Postagem: ${editingPost.title}`
                : "Selecione uma postagem para visualizar versões."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Versões mais recentes primeiro. Rollback restaura o conteúdo editorial da versão
                escolhida.
              </p>
              {editingPost ? (
                <DashboardActionButton
                  type="button"
                  size="sm"
                  tone="primary"
                  disabled={isCreatingManualVersion}
                  onClick={() => void handleCreateManualVersion()}
                >
                  {isCreatingManualVersion ? "Criando..." : "Criar versão agora"}
                </DashboardActionButton>
              ) : null}
            </div>
            {isLoadingVersions ? (
              <AsyncState
                kind="loading"
                title="Carregando versões"
                description="Buscando histórico da postagem."
                className="border-0 bg-transparent p-0"
              />
            ) : hasVersionsError ? (
              <AsyncState
                kind="error"
                title="Não foi possível carregar o histórico"
                description="Tente novamente em alguns instantes."
                className="border-0 bg-transparent p-0"
                action={
                  editingPost ? (
                    <DashboardActionButton
                      type="button"
                      onClick={() => void loadVersionHistory(editingPost.id)}
                    >
                      Recarregar
                    </DashboardActionButton>
                  ) : null
                }
              />
            ) : postVersions.length === 0 ? (
              <AsyncState
                kind="empty"
                title="Sem versões ainda"
                description="As versões aparecem após salvar/editar a postagem."
                className="border-0 bg-transparent p-0"
              />
            ) : (
              <div className="max-h-[55vh] space-y-3 overflow-auto pr-1">
                {postVersions.map((version) => {
                  const isRestorable = isVersionRestorableAgainstPost(
                    version,
                    persistedEditingPost,
                  );
                  return (
                    <div
                      key={version.id}
                      className={`flex flex-wrap items-start justify-between gap-3 rounded-lg p-3 ${subtleSurfaceClassName}`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            v{version.versionNumber}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] uppercase">
                            {version.reasonLabel || version.reason}
                          </Badge>
                          {version.label ? (
                            <Badge variant="secondary" className="text-[10px]">
                              {version.label}
                            </Badge>
                          ) : null}
                          {!isRestorable ? (
                            <Badge variant="outline" className="text-[10px] uppercase">
                              Estado atual
                            </Badge>
                          ) : null}
                        </div>
                        <p className="text-sm font-medium text-foreground">
                          {formatDateTimeShort(version.createdAt)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {version.actorName || "Sistema"} {"•"} /{version.slug}
                        </p>
                      </div>
                      <div className="shrink-0 self-start">
                        {isRestorable ? (
                          <DashboardActionButton
                            type="button"
                            size="sm"
                            onClick={() => setRollbackTargetVersion(version)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            {"Restaurar esta versão"}
                          </DashboardActionButton>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {versionsNextCursor ? (
                  <p className="text-xs text-muted-foreground">
                    Há mais versões antigas disponíveis. (Paginação v1 ainda não exposta na UI)
                  </p>
                ) : null}
              </div>
            )}
            <div className="flex justify-end">
              <DashboardActionButton type="button" onClick={() => setIsVersionHistoryOpen(false)}>
                Fechar
              </DashboardActionButton>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rollbackTargetVersion)}
        onOpenChange={(open) => !open && setRollbackTargetVersion(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Restaurar versão?</DialogTitle>
            <DialogDescription>
              {rollbackTargetVersion
                ? `Restaurar a versão v${rollbackTargetVersion.versionNumber} de ${formatDateTimeShort(
                    rollbackTargetVersion.createdAt,
                  )}?`
                : "Confirme o rollback da versão selecionada."}
            </DialogDescription>
          </DialogHeader>
          {rollbackTargetVersion ? (
            <Card className={subtleSurfaceClassName}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-[10px] uppercase">
                    v{rollbackTargetVersion.versionNumber}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] uppercase">
                    {rollbackTargetVersion.reasonLabel || rollbackTargetVersion.reason}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] uppercase">
                    {getPostStatusLabel(
                      rollbackTargetVersion.snapshot?.status === "scheduled" ||
                        rollbackTargetVersion.snapshot?.status === "published"
                        ? rollbackTargetVersion.snapshot.status
                        : "draft",
                    )}
                  </Badge>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Título
                    </p>
                    <p className="font-medium text-foreground">
                      {rollbackTargetVersion.snapshot?.title || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Slug
                    </p>
                    <p className="font-medium text-foreground">
                      /{rollbackTargetVersion.snapshot?.slug || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Versão salva
                    </p>
                    <p className="text-foreground">
                      {formatDateTimeShort(rollbackTargetVersion.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Data editorial
                    </p>
                    <p className="text-foreground">
                      {(() => {
                        const editorialAt =
                          rollbackTargetVersion.snapshot?.status === "scheduled"
                            ? rollbackTargetVersion.snapshot?.scheduledAt ||
                              rollbackTargetVersion.snapshot?.publishedAt
                            : rollbackTargetVersion.snapshot?.publishedAt;
                        return editorialAt ? formatDateTimeShort(editorialAt) : "Sem data";
                      })()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Autor
                    </p>
                    <p className="text-foreground">
                      {rollbackTargetVersion.snapshot?.author || "Não definido"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Projeto
                    </p>
                    <p className="text-foreground">
                      {rollbackTargetVersion.snapshot?.projectId
                        ? projectMap.get(String(rollbackTargetVersion.snapshot.projectId || ""))
                            ?.title || `ID ${rollbackTargetVersion.snapshot.projectId}`
                        : "Sem projeto"}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Resumo
                  </p>
                  <p className="line-clamp-3 text-sm text-foreground/90">
                    {String(rollbackTargetVersion.snapshot?.excerpt || "").trim() || "Sem resumo"}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
          <div className="flex justify-end gap-3">
            <DashboardActionButton
              type="button"
              size="sm"
              disabled={isRollingBackVersion}
              onClick={() => setRollbackTargetVersion(null)}
            >
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              type="button"
              tone="primary"
              size="sm"
              disabled={isRollingBackVersion}
              onClick={() => void handleConfirmRollbackVersion()}
            >
              {isRollingBackVersion ? "Restaurando..." : "Confirmar rollback"}
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <DashboardActionButton
              size="sm"
              onClick={() => {
                confirmCancelRef.current?.();
                setConfirmOpen(false);
              }}
            >
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              size="sm"
              tone="primary"
              onClick={() => {
                confirmActionRef.current?.();
                setConfirmOpen(false);
              }}
            >
              Confirmar
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir postagem?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Excluir "${deleteTarget.title}"? Você pode restaurar por até 3 dias.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <DashboardActionButton size="sm" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton size="sm" tone="destructive" onClick={handleConfirmDelete}>
              Excluir
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const __testing = {
  clearPostsPageCache,
};

export default DashboardPosts;
