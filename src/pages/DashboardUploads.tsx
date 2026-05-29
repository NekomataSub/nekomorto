import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import DashboardShell from "@/components/DashboardShell";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import DashboardPageContainer from "@/components/dashboard/DashboardPageContainer";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import { Input } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardAnimationDelay,
  dashboardClampedStaggerMs,
  dashboardMotionDelays,
} from "@/components/dashboard/dashboard-motion";
import { dashboardPageLayoutTokens } from "@/components/dashboard/dashboard-page-tokens";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AsyncState from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/use-toast";
import { useDashboardCurrentUser } from "@/hooks/use-dashboard-current-user";
import { useDashboardRefreshToast } from "@/hooks/use-dashboard-refresh-toast";
import { usePageMeta } from "@/hooks/use-page-meta";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";

type MeUser = {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string | null;
  accessRole?: string;
  grants?: Partial<Record<string, boolean>>;
};

type StorageAreaRow = {
  area: string;
  originalBytes: number;
  variantBytes: number;
  totalBytes: number;
  originalFiles: number;
  variantFiles: number;
  totalFiles: number;
};

type StorageSummaryPayload = {
  generatedAt: string;
  totals: StorageAreaRow;
  areas: StorageAreaRow[];
};

type CleanupFailure = {
  kind: "upload" | "variant";
  url: string;
  reason: string;
};

type CleanupExampleRow = {
  kind: "upload" | "variant";
  scope: "unused_upload" | "orphaned_variant" | "loose_original";
  id: string | null;
  ownerUploadId: string | null;
  url: string;
  fileName: string;
  folder: string;
  area: string;
  createdAt: string | null;
  originalBytes: number;
  variantBytes: number;
  totalBytes: number;
};

type CleanupPreviewPayload = {
  generatedAt: string;
  unusedCount: number;
  unusedUploadCount: number;
  orphanedVariantFilesCount: number;
  orphanedVariantDirsCount: number;
  looseOriginalFilesCount: number;
  looseOriginalTotals: StorageAreaRow;
  quarantinePendingDeleteCount: number;
  quarantinePendingDeleteTotals: StorageAreaRow;
  totals: StorageAreaRow;
  areas: StorageAreaRow[];
  examples: CleanupExampleRow[];
};

type CleanupRunPayload = {
  ok: boolean;
  deletedCount: number;
  deletedUnusedUploadsCount: number;
  deletedOrphanedVariantFilesCount: number;
  deletedOrphanedVariantDirsCount: number;
  quarantinedLooseOriginalFilesCount: number;
  deletedQuarantineFilesCount: number;
  deletedQuarantineDirsCount: number;
  failedCount: number;
  deletedTotals: StorageAreaRow;
  quarantinedTotals: StorageAreaRow;
  purgedQuarantineTotals: StorageAreaRow;
  failures: CleanupFailure[];
};

const CLEANUP_CONFIRM_TEXT = "EXCLUIR";
const CLEANUP_ACTION_LABEL = "Limpar armazenamento não utilizado";

const emptyTotals: StorageAreaRow = {
  area: "total",
  originalBytes: 0,
  variantBytes: 0,
  totalBytes: 0,
  originalFiles: 0,
  variantFiles: 0,
  totalFiles: 0,
};

const emptySummary: StorageSummaryPayload = {
  generatedAt: "",
  totals: emptyTotals,
  areas: [],
};

const emptyCleanupPreview: CleanupPreviewPayload = {
  generatedAt: "",
  unusedCount: 0,
  unusedUploadCount: 0,
  orphanedVariantFilesCount: 0,
  orphanedVariantDirsCount: 0,
  looseOriginalFilesCount: 0,
  looseOriginalTotals: emptyTotals,
  quarantinePendingDeleteCount: 0,
  quarantinePendingDeleteTotals: emptyTotals,
  totals: emptyTotals,
  areas: [],
  examples: [],
};

const UPLOADS_CACHE_TTL_MS = 60_000;

type UploadsCacheEntry<TValue> = {
  value: TValue;
  expiresAt: number;
};

let uploadsSummaryCache: UploadsCacheEntry<StorageSummaryPayload> | null = null;
let uploadsCleanupPreviewCache: UploadsCacheEntry<CleanupPreviewPayload> | null = null;

const readUploadsCache = <TValue,>(entry: UploadsCacheEntry<TValue> | null) => {
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    return null;
  }
  return entry.value;
};

const writeUploadsCache = <TValue,>(value: TValue): UploadsCacheEntry<TValue> => ({
  value,
  expiresAt: Date.now() + UPLOADS_CACHE_TTL_MS,
});

export const __testing = {
  clearUploadsCaches: () => {
    uploadsSummaryCache = null;
    uploadsCleanupPreviewCache = null;
  },
};

const normalizeStorageAreaRow = (
  value: Partial<StorageAreaRow> | null | undefined,
  fallbackArea: string,
): StorageAreaRow => ({
  ...emptyTotals,
  ...(value && typeof value === "object" ? value : {}),
  area: String(value?.area || fallbackArea),
});

const normalizeStorageSummaryPayload = (payload: unknown): StorageSummaryPayload => {
  const source =
    payload && typeof payload === "object" ? (payload as Partial<StorageSummaryPayload>) : {};
  return {
    generatedAt: String(source.generatedAt || ""),
    totals: normalizeStorageAreaRow(source.totals, "total"),
    areas: Array.isArray(source.areas)
      ? source.areas.map((item) => normalizeStorageAreaRow(item, String(item?.area || "root")))
      : [],
  };
};

const normalizeCleanupPreviewPayload = (payload: unknown): CleanupPreviewPayload => {
  const source =
    payload && typeof payload === "object" ? (payload as Partial<CleanupPreviewPayload>) : {};
  const examples = Array.isArray(source.examples) ? source.examples : [];
  const unusedUploadCount = Number.isFinite(Number(source.unusedUploadCount))
    ? Number(source.unusedUploadCount)
    : Number.isFinite(Number(source.unusedCount))
      ? Number(source.unusedCount)
      : 0;

  return {
    generatedAt: String(source.generatedAt || ""),
    unusedCount: Number.isFinite(Number(source.unusedCount))
      ? Number(source.unusedCount)
      : unusedUploadCount,
    unusedUploadCount,
    orphanedVariantFilesCount: Number.isFinite(Number(source.orphanedVariantFilesCount))
      ? Number(source.orphanedVariantFilesCount)
      : 0,
    orphanedVariantDirsCount: Number.isFinite(Number(source.orphanedVariantDirsCount))
      ? Number(source.orphanedVariantDirsCount)
      : 0,
    looseOriginalFilesCount: Number.isFinite(Number(source.looseOriginalFilesCount))
      ? Number(source.looseOriginalFilesCount)
      : 0,
    looseOriginalTotals: normalizeStorageAreaRow(source.looseOriginalTotals, "total"),
    quarantinePendingDeleteCount: Number.isFinite(Number(source.quarantinePendingDeleteCount))
      ? Number(source.quarantinePendingDeleteCount)
      : 0,
    quarantinePendingDeleteTotals: normalizeStorageAreaRow(
      source.quarantinePendingDeleteTotals,
      "total",
    ),
    totals: normalizeStorageAreaRow(source.totals, "total"),
    areas: Array.isArray(source.areas)
      ? source.areas.map((item) => normalizeStorageAreaRow(item, String(item?.area || "root")))
      : [],
    examples: examples.map((item) => {
      const example = item && typeof item === "object" ? (item as Partial<CleanupExampleRow>) : {};
      const kind = example.kind === "variant" ? "variant" : "upload";
      return {
        kind,
        scope:
          example.scope === "orphaned_variant"
            ? "orphaned_variant"
            : example.scope === "loose_original"
              ? "loose_original"
              : "unused_upload",
        id: example.id ? String(example.id) : null,
        ownerUploadId: example.ownerUploadId ? String(example.ownerUploadId) : null,
        url: String(example.url || ""),
        fileName: String(example.fileName || ""),
        folder: String(example.folder || ""),
        area: String(example.area || "root"),
        createdAt: example.createdAt ? String(example.createdAt) : null,
        originalBytes: Number.isFinite(Number(example.originalBytes))
          ? Number(example.originalBytes)
          : 0,
        variantBytes: Number.isFinite(Number(example.variantBytes))
          ? Number(example.variantBytes)
          : 0,
        totalBytes: Number.isFinite(Number(example.totalBytes)) ? Number(example.totalBytes) : 0,
      };
    }),
  };
};

const normalizeCleanupRunPayload = (payload: unknown): CleanupRunPayload => {
  const source =
    payload && typeof payload === "object" ? (payload as Partial<CleanupRunPayload>) : {};
  const failures = Array.isArray(source.failures) ? source.failures : [];
  const deletedUnusedUploadsCount = Number.isFinite(Number(source.deletedUnusedUploadsCount))
    ? Number(source.deletedUnusedUploadsCount)
    : Number.isFinite(Number(source.deletedCount))
      ? Number(source.deletedCount)
      : 0;

  return {
    ok: source.ok !== false,
    deletedCount: Number.isFinite(Number(source.deletedCount))
      ? Number(source.deletedCount)
      : deletedUnusedUploadsCount,
    deletedUnusedUploadsCount,
    deletedOrphanedVariantFilesCount: Number.isFinite(
      Number(source.deletedOrphanedVariantFilesCount),
    )
      ? Number(source.deletedOrphanedVariantFilesCount)
      : 0,
    deletedOrphanedVariantDirsCount: Number.isFinite(Number(source.deletedOrphanedVariantDirsCount))
      ? Number(source.deletedOrphanedVariantDirsCount)
      : 0,
    quarantinedLooseOriginalFilesCount: Number.isFinite(
      Number(source.quarantinedLooseOriginalFilesCount),
    )
      ? Number(source.quarantinedLooseOriginalFilesCount)
      : 0,
    deletedQuarantineFilesCount: Number.isFinite(Number(source.deletedQuarantineFilesCount))
      ? Number(source.deletedQuarantineFilesCount)
      : 0,
    deletedQuarantineDirsCount: Number.isFinite(Number(source.deletedQuarantineDirsCount))
      ? Number(source.deletedQuarantineDirsCount)
      : 0,
    failedCount: Number.isFinite(Number(source.failedCount)) ? Number(source.failedCount) : 0,
    deletedTotals: normalizeStorageAreaRow(source.deletedTotals, "total"),
    quarantinedTotals: normalizeStorageAreaRow(source.quarantinedTotals, "total"),
    purgedQuarantineTotals: normalizeStorageAreaRow(source.purgedQuarantineTotals, "total"),
    failures: failures.map((item) => {
      const failure = item && typeof item === "object" ? item : {};
      return {
        kind: (failure as { kind?: string }).kind === "variant" ? "variant" : "upload",
        url: String((failure as { url?: string }).url || ""),
        reason: String((failure as { reason?: string }).reason || ""),
      };
    }),
  };
};

const formatBytes = (value: number) => {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let next = size;
  while (next >= 1024 && index < units.length - 1) {
    next /= 1024;
    index += 1;
  }
  const digits = next >= 100 ? 0 : next >= 10 ? 1 : 2;
  return `${next.toFixed(digits)} ${units[index]}`;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString("pt-BR");
};

const formatCleanupDescription = ({
  deletedUnusedUploadsCount,
  deletedOrphanedVariantFilesCount,
  deletedOrphanedVariantDirsCount,
  quarantinedLooseOriginalFilesCount,
  deletedQuarantineFilesCount,
  deletedQuarantineDirsCount,
  deletedBytes,
  quarantinedBytes,
  purgedQuarantineBytes,
}: {
  deletedUnusedUploadsCount: number;
  deletedOrphanedVariantFilesCount: number;
  deletedOrphanedVariantDirsCount: number;
  quarantinedLooseOriginalFilesCount: number;
  deletedQuarantineFilesCount: number;
  deletedQuarantineDirsCount: number;
  deletedBytes: number;
  quarantinedBytes: number;
  purgedQuarantineBytes: number;
}) =>
  `${deletedUnusedUploadsCount} uploads removidos, ${deletedOrphanedVariantFilesCount} variantes órfãs removidas, ${deletedOrphanedVariantDirsCount} diretórios de variantes órfãos removidos, ${quarantinedLooseOriginalFilesCount} originais enviados para quarentena, ${deletedQuarantineFilesCount} arquivos de quarentena removidos e ${deletedQuarantineDirsCount} diretórios de quarentena removidos. ${formatBytes(deletedBytes)} liberados agora, ${formatBytes(quarantinedBytes)} em quarentena e ${formatBytes(purgedQuarantineBytes)} purgados da quarentena.`;

const UploadsMetricCard = ({
  label,
  value,
  files,
  loading,
  delayMs,
}: {
  label: string;
  value: string;
  files: number;
  loading: boolean;
  delayMs: number;
}) => (
  <article
    className={`min-h-34 ${dashboardPageLayoutTokens.surfaceSolid} p-5 animate-slide-up`}
    style={dashboardAnimationDelay(delayMs)}
  >
    <p className={`text-xs uppercase tracking-[0.22em] ${dashboardPageLayoutTokens.cardMetaText}`}>
      {label}
    </p>
    {loading ? (
      <>
        <Skeleton className="mt-3 h-8 w-28" />
        <Skeleton className="mt-2 h-3 w-20" />
      </>
    ) : (
      <>
        <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
        <p className={`mt-1 text-xs ${dashboardPageLayoutTokens.cardMetaText}`}>{files} arquivos</p>
      </>
    )}
  </article>
);

const DashboardUploads = () => {
  usePageMeta({ title: "Uploads", noIndex: true });
  const apiBase = getApiBase();
  const initialSummaryCacheRef = useRef(readUploadsCache(uploadsSummaryCache));
  const initialCleanupCacheRef = useRef(readUploadsCache(uploadsCleanupPreviewCache));
  const { currentUser: me, isLoadingUser } = useDashboardCurrentUser<MeUser>();
  const [summary, setSummary] = useState<StorageSummaryPayload>(
    initialSummaryCacheRef.current ?? emptySummary,
  );
  const [cleanupPreview, setCleanupPreview] = useState<CleanupPreviewPayload>(
    initialCleanupCacheRef.current ?? emptyCleanupPreview,
  );
  const [isSummaryInitialLoading, setIsSummaryInitialLoading] = useState(
    !initialSummaryCacheRef.current,
  );
  const [isSummaryRefreshing, setIsSummaryRefreshing] = useState(
    Boolean(initialSummaryCacheRef.current),
  );
  const [summaryError, setSummaryError] = useState("");
  const [hasSummaryLoadedOnce, setHasSummaryLoadedOnce] = useState(
    Boolean(initialSummaryCacheRef.current),
  );
  const [isCleanupInitialLoading, setIsCleanupInitialLoading] = useState(
    !initialCleanupCacheRef.current,
  );
  const [isCleanupRefreshing, setIsCleanupRefreshing] = useState(
    Boolean(initialCleanupCacheRef.current),
  );
  const [cleanupError, setCleanupError] = useState("");
  const [hasCleanupLoadedOnce, setHasCleanupLoadedOnce] = useState(
    Boolean(initialCleanupCacheRef.current),
  );
  const [isForbidden, setIsForbidden] = useState(false);
  const [isCleanupConfirmOpen, setIsCleanupConfirmOpen] = useState(false);
  const [cleanupConfirmText, setCleanupConfirmText] = useState("");
  const [isCleanupRunning, setIsCleanupRunning] = useState(false);
  const summaryRequestIdRef = useRef(0);
  const cleanupRequestIdRef = useRef(0);
  const hasSummaryLoadedOnceRef = useRef(hasSummaryLoadedOnce);
  const hasCleanupLoadedOnceRef = useRef(hasCleanupLoadedOnce);

  useEffect(() => {
    hasSummaryLoadedOnceRef.current = hasSummaryLoadedOnce;
  }, [hasSummaryLoadedOnce]);

  useEffect(() => {
    hasCleanupLoadedOnceRef.current = hasCleanupLoadedOnce;
  }, [hasCleanupLoadedOnce]);

  const applyForbiddenState = useCallback(() => {
    uploadsSummaryCache = null;
    uploadsCleanupPreviewCache = null;
    setIsForbidden(true);
    setSummary(emptySummary);
    setCleanupPreview(emptyCleanupPreview);
    setHasSummaryLoadedOnce(false);
    setHasCleanupLoadedOnce(false);
    setSummaryError("");
    setCleanupError("");
    setIsSummaryInitialLoading(false);
    setIsCleanupInitialLoading(false);
    setIsSummaryRefreshing(false);
    setIsCleanupRefreshing(false);
  }, []);

  const loadSummary = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background ?? hasSummaryLoadedOnceRef.current;
      const requestId = summaryRequestIdRef.current + 1;
      summaryRequestIdRef.current = requestId;
      if (background) {
        setIsSummaryRefreshing(true);
      } else {
        setIsSummaryInitialLoading(true);
      }
      setSummaryError("");
      try {
        const response = await apiFetch(apiBase, "/api/uploads/storage/areas", { auth: true });
        if (summaryRequestIdRef.current !== requestId) {
          return;
        }
        if (response.status === 403) {
          applyForbiddenState();
          return;
        }
        if (!response.ok) {
          throw new Error("summary_load_failed");
        }
        const nextSummary = normalizeStorageSummaryPayload(await response.json());
        uploadsSummaryCache = writeUploadsCache(nextSummary);
        setIsForbidden(false);
        setSummary(nextSummary);
        setHasSummaryLoadedOnce(true);
      } catch {
        if (summaryRequestIdRef.current !== requestId) {
          return;
        }
        setSummaryError("Não foi possível carregar os dados de storage.");
      } finally {
        if (summaryRequestIdRef.current !== requestId) {
          return;
        }
        setIsSummaryInitialLoading(false);
        setIsSummaryRefreshing(false);
      }
    },
    [apiBase, applyForbiddenState],
  );

  const loadCleanupPreview = useCallback(
    async (options?: { background?: boolean }) => {
      const background = options?.background ?? hasCleanupLoadedOnceRef.current;
      const requestId = cleanupRequestIdRef.current + 1;
      cleanupRequestIdRef.current = requestId;
      if (background) {
        setIsCleanupRefreshing(true);
      } else {
        setIsCleanupInitialLoading(true);
      }
      setCleanupError("");
      try {
        const response = await apiFetch(apiBase, "/api/uploads/storage/cleanup", { auth: true });
        if (cleanupRequestIdRef.current !== requestId) {
          return;
        }
        if (response.status === 403) {
          applyForbiddenState();
          return;
        }
        if (!response.ok) {
          throw new Error("cleanup_preview_load_failed");
        }
        const nextCleanupPreview = normalizeCleanupPreviewPayload(await response.json());
        uploadsCleanupPreviewCache = writeUploadsCache(nextCleanupPreview);
        setIsForbidden(false);
        setCleanupPreview(nextCleanupPreview);
        setHasCleanupLoadedOnce(true);
      } catch {
        if (cleanupRequestIdRef.current !== requestId) {
          return;
        }
        setCleanupError("Não foi possível analisar o armazenamento não utilizado.");
      } finally {
        if (cleanupRequestIdRef.current !== requestId) {
          return;
        }
        setIsCleanupInitialLoading(false);
        setIsCleanupRefreshing(false);
      }
    },
    [apiBase, applyForbiddenState],
  );

  const load = useCallback(
    async (options?: { background?: boolean }) => {
      await Promise.all([loadSummary(options), loadCleanupPreview(options)]);
    },
    [loadCleanupPreview, loadSummary],
  );

  useEffect(() => {
    void loadSummary({ background: Boolean(initialSummaryCacheRef.current) });
    void loadCleanupPreview({ background: Boolean(initialCleanupCacheRef.current) });
  }, [loadCleanupPreview, loadSummary]);

  const cards = useMemo(
    () => [
      {
        label: "Originais",
        value: formatBytes(summary.totals.originalBytes),
        files: summary.totals.originalFiles,
      },
      {
        label: "Variantes",
        value: formatBytes(summary.totals.variantBytes),
        files: summary.totals.variantFiles,
      },
      {
        label: "Total",
        value: formatBytes(summary.totals.totalBytes),
        files: summary.totals.totalFiles,
      },
    ],
    [summary.totals],
  );

  const hasCleanupCandidates = useMemo(
    () =>
      cleanupPreview.unusedUploadCount > 0 ||
      cleanupPreview.orphanedVariantFilesCount > 0 ||
      cleanupPreview.orphanedVariantDirsCount > 0 ||
      cleanupPreview.looseOriginalFilesCount > 0 ||
      cleanupPreview.quarantinePendingDeleteCount > 0,
    [
      cleanupPreview.looseOriginalFilesCount,
      cleanupPreview.orphanedVariantDirsCount,
      cleanupPreview.orphanedVariantFilesCount,
      cleanupPreview.quarantinePendingDeleteCount,
      cleanupPreview.unusedUploadCount,
    ],
  );
  const isAnyRefreshing = isSummaryRefreshing || isCleanupRefreshing;
  const hasSummaryBlockingError = !hasSummaryLoadedOnce && Boolean(summaryError);
  const hasCleanupBlockingError = !hasCleanupLoadedOnce && Boolean(cleanupError);
  const hasSummaryRetainedError = hasSummaryLoadedOnce && Boolean(summaryError);
  const hasCleanupRetainedError = hasCleanupLoadedOnce && Boolean(cleanupError);
  const showSummaryShell = isSummaryInitialLoading && !hasSummaryLoadedOnce;
  const showCleanupShell = isCleanupInitialLoading && !hasCleanupLoadedOnce;
  const summaryTimestampLabel = hasSummaryLoadedOnce
    ? formatDateTime(summary.generatedAt)
    : "aguardando dados";
  const cleanupTimestampLabel = hasCleanupLoadedOnce
    ? formatDateTime(cleanupPreview.generatedAt)
    : "aguardando dados";
  const cleanupCardClassName =
    showCleanupShell || cleanupPreview.examples.length > 0 ? "min-h-112" : "";

  useDashboardRefreshToast({
    active: isAnyRefreshing && (hasSummaryLoadedOnce || hasCleanupLoadedOnce),
    title: "Atualizando Armazenamento",
    description: "Buscando o resumo e a análise mais recente do armazenamento.",
  });

  const handleConfirmCleanup = useCallback(async () => {
    if (cleanupConfirmText !== CLEANUP_CONFIRM_TEXT || isCleanupRunning) {
      return;
    }

    setIsCleanupRunning(true);
    try {
      const response = await apiFetch(apiBase, "/api/uploads/storage/cleanup", {
        auth: true,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confirm: CLEANUP_CONFIRM_TEXT,
        }),
      });

      if (!response.ok) {
        toast({
          title: "Não foi possível limpar o armazenamento",
          variant: "destructive",
        });
        return;
      }

      const payload = normalizeCleanupRunPayload(await response.json());
      setIsCleanupConfirmOpen(false);
      setCleanupConfirmText("");
      await load({ background: true });

      if (payload.failedCount > 0) {
        toast({
          title: "Limpeza parcial concluída",
          description: `${formatCleanupDescription({
            deletedUnusedUploadsCount: payload.deletedUnusedUploadsCount,
            deletedOrphanedVariantFilesCount: payload.deletedOrphanedVariantFilesCount,
            deletedOrphanedVariantDirsCount: payload.deletedOrphanedVariantDirsCount,
            quarantinedLooseOriginalFilesCount: payload.quarantinedLooseOriginalFilesCount,
            deletedQuarantineFilesCount: payload.deletedQuarantineFilesCount,
            deletedQuarantineDirsCount: payload.deletedQuarantineDirsCount,
            deletedBytes: payload.deletedTotals.totalBytes,
            quarantinedBytes: payload.quarantinedTotals.totalBytes,
            purgedQuarantineBytes: payload.purgedQuarantineTotals.totalBytes,
          })} ${payload.failedCount} falharam.`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Armazenamento não utilizado removido",
        description: formatCleanupDescription({
          deletedUnusedUploadsCount: payload.deletedUnusedUploadsCount,
          deletedOrphanedVariantFilesCount: payload.deletedOrphanedVariantFilesCount,
          deletedOrphanedVariantDirsCount: payload.deletedOrphanedVariantDirsCount,
          quarantinedLooseOriginalFilesCount: payload.quarantinedLooseOriginalFilesCount,
          deletedQuarantineFilesCount: payload.deletedQuarantineFilesCount,
          deletedQuarantineDirsCount: payload.deletedQuarantineDirsCount,
          deletedBytes: payload.deletedTotals.totalBytes,
          quarantinedBytes: payload.quarantinedTotals.totalBytes,
          purgedQuarantineBytes: payload.purgedQuarantineTotals.totalBytes,
        }),
      });
    } catch {
      toast({
        title: "Não foi possível limpar o armazenamento",
        variant: "destructive",
      });
    } finally {
      setIsCleanupRunning(false);
    }
  }, [apiBase, cleanupConfirmText, isCleanupRunning, load]);

  const handleCleanupConfirmKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      void handleConfirmCleanup();
    },
    [handleConfirmCleanup],
  );

  return (
    <DashboardShell currentUser={me} isLoadingUser={isLoadingUser}>
      <DashboardPageContainer maxWidth="7xl">
        <DashboardPageHeader
          badge="Mídia"
          title="Armazenamento"
          description="Consumo real por área com base nos arquivos presentes em disco."
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="static">Atualizado: {summaryTimestampLabel}</Badge>
              <DashboardActionButton
                size="sm"
                onClick={() =>
                  void load({ background: hasSummaryLoadedOnce || hasCleanupLoadedOnce })
                }
                disabled={isAnyRefreshing || isCleanupRunning}
              >
                Atualizar
              </DashboardActionButton>
            </div>
          }
        />

        <section className="mt-8 space-y-6">
          {isForbidden ? (
            <article
              className={`${dashboardPageLayoutTokens.surfaceSolid} p-5 text-sm text-foreground/70 animate-slide-up`}
            >
              Você não possui permissão para visualizar o painel de uploads.
            </article>
          ) : null}

          {!isForbidden ? (
            <div className="space-y-3">
              {summaryError ? (
                <Alert className="border-border/70 bg-background text-foreground/70">
                  <AlertDescription>
                    {hasSummaryRetainedError
                      ? "Não foi possível atualizar o resumo agora. Mantendo os últimos dados visíveis."
                      : "Não foi possível carregar o resumo de storage."}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div
                className="grid gap-4 md:grid-cols-3"
                data-testid="dashboard-uploads-summary-grid"
                aria-busy={showSummaryShell || isSummaryRefreshing ? "true" : "false"}
              >
                {cards.map((card, index) => (
                  <UploadsMetricCard
                    key={card.label}
                    label={card.label}
                    value={hasSummaryLoadedOnce ? card.value : "--"}
                    files={hasSummaryLoadedOnce ? card.files : 0}
                    loading={showSummaryShell}
                    delayMs={dashboardClampedStaggerMs(index)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {!isForbidden ? (
            <article
              className={`min-h-88 overflow-hidden ${dashboardPageLayoutTokens.surfaceSolid} animate-slide-up`}
              style={dashboardAnimationDelay(dashboardMotionDelays.headerActionsMs)}
              data-testid="dashboard-uploads-storage-card"
            >
              <div className="border-b border-border/70 px-5 py-4">
                <h2 className="text-sm font-semibold text-foreground">Consumo por área</h2>
              </div>
              <div
                className="min-h-72 overflow-x-auto"
                aria-busy={showSummaryShell || isSummaryRefreshing ? "true" : "false"}
              >
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-background text-xs uppercase tracking-[0.12em] text-foreground/70">
                    <tr>
                      <th className="px-4 py-3 text-left">Área</th>
                      <th className="px-4 py-3 text-right">Originais</th>
                      <th className="px-4 py-3 text-right">Variantes</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Arquivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {showSummaryShell ? (
                      Array.from({ length: 4 }).map((_, index) => (
                        <tr
                          key={`dashboard-uploads-storage-placeholder-${index}`}
                          className="border-t border-border/50"
                        >
                          <td className="px-4 py-3">
                            <Skeleton className="h-4 w-24" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="ml-auto h-4 w-20" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="ml-auto h-4 w-20" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="ml-auto h-4 w-20" />
                          </td>
                          <td className="px-4 py-3">
                            <Skeleton className="ml-auto h-4 w-12" />
                          </td>
                        </tr>
                      ))
                    ) : hasSummaryBlockingError ? (
                      <tr className="border-t border-border/50">
                        <td colSpan={5} className="px-4 py-6">
                          <AsyncState
                            kind="error"
                            title="Não foi possível carregar o storage"
                            description="Atualize a página ou tente novamente em alguns instantes."
                          />
                        </td>
                      </tr>
                    ) : summary.areas.length === 0 ? (
                      <tr className="border-t border-border/50">
                        <td colSpan={5} className="px-4 py-6">
                          <AsyncState
                            kind="empty"
                            title="Nenhuma área encontrada"
                            description="O inventário aparece aqui quando houver arquivos mapeados no storage."
                          />
                        </td>
                      </tr>
                    ) : (
                      summary.areas.map((area) => (
                        <tr key={area.area} className="border-t border-border/50">
                          <td className="px-4 py-3 font-medium text-foreground">{area.area}</td>
                          <td className="px-4 py-3 text-right text-foreground/70">
                            {formatBytes(area.originalBytes)}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground/70">
                            {formatBytes(area.variantBytes)}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground">
                            {formatBytes(area.totalBytes)}
                          </td>
                          <td className="px-4 py-3 text-right text-foreground/70">
                            {area.totalFiles}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          ) : null}

          {!isForbidden ? (
            <article
              className={`${cleanupCardClassName} overflow-hidden ${dashboardPageLayoutTokens.surfaceSolid} animate-slide-up`}
              style={dashboardAnimationDelay(dashboardMotionDelays.sectionLeadMs)}
              data-testid="dashboard-uploads-cleanup-card"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">Limpeza</h2>
                  <p className="text-sm text-foreground/70">
                    Remove uploads sem referência, variantes órfãs e envia originais soltos para
                    _quarantine.
                  </p>
                </div>
                <Badge variant="static">Análise: {cleanupTimestampLabel}</Badge>
              </div>

              {cleanupError ? (
                <Alert className="rounded-none border-x-0 border-t-0 border-b border-border/70 bg-background text-foreground/70">
                  <AlertDescription>
                    {hasCleanupRetainedError
                      ? "Não foi possível atualizar a análise agora. Mantendo os últimos dados visíveis."
                      : "Não foi possível analisar o armazenamento não utilizado."}
                  </AlertDescription>
                </Alert>
              ) : null}
              {showCleanupShell ? (
                <div
                  className="space-y-4 px-5 py-4"
                  data-testid="dashboard-uploads-cleanup-pending"
                  aria-busy="true"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        Análise de limpeza em andamento
                      </p>
                      <p className="text-sm text-foreground/70">-- arquivos de variante órfãos</p>
                      <p className="text-sm text-foreground/70">
                        -- diretórios de variantes órfãos
                      </p>
                      <p className="text-sm text-foreground/70">-- originais soltos (quarentena)</p>
                      <p className="text-sm text-foreground/70">
                        -- arquivos de quarentena vencidos para purga
                      </p>
                      <p className="text-sm text-foreground/70">-- recuperáveis no total</p>
                      <p className="text-xs text-foreground/70">
                        -- em originais e -- em variantes.
                      </p>
                      <p className="text-xs text-foreground/70">
                        -- em originais soltos e -- em purga pendente da quarentena.
                      </p>
                    </div>
                    <DashboardActionButton size="sm" tone="destructive" disabled>
                      {CLEANUP_ACTION_LABEL}
                    </DashboardActionButton>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="bg-background text-xs uppercase tracking-[0.12em] text-foreground/70">
                        <tr>
                          <th className="px-4 py-3 text-left">Tipo</th>
                          <th className="px-4 py-3 text-left">Arquivo</th>
                          <th className="px-4 py-3 text-left">Área</th>
                          <th className="px-4 py-3 text-left">Criado em</th>
                          <th className="px-4 py-3 text-right">Recuperável</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 3 }).map((_, index) => (
                          <tr
                            key={`dashboard-uploads-cleanup-placeholder-${index}`}
                            className="border-t border-border/50"
                          >
                            <td className="px-4 py-3 text-foreground/70">Aguardando análise</td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-40" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-16" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="h-4 w-20" />
                            </td>
                            <td className="px-4 py-3">
                              <Skeleton className="ml-auto h-4 w-20" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {cleanupPreview.unusedUploadCount} uploads sem uso
                      </p>
                      <p className="text-sm text-foreground/70">
                        {cleanupPreview.orphanedVariantFilesCount} arquivos de variante órfãos
                      </p>
                      <p className="text-sm text-foreground/70">
                        {cleanupPreview.orphanedVariantDirsCount} diretórios de variantes órfãos
                      </p>
                      <p className="text-sm text-foreground/70">
                        {cleanupPreview.looseOriginalFilesCount} originais soltos (quarentena)
                      </p>
                      <p className="text-sm text-foreground/70">
                        {cleanupPreview.quarantinePendingDeleteCount} arquivos de quarentena
                        vencidos para purga
                      </p>
                      <p className="text-sm text-foreground/70">
                        {formatBytes(cleanupPreview.totals.totalBytes)} recuperáveis no total
                      </p>
                      <p className="text-xs text-foreground/70">
                        {formatBytes(cleanupPreview.totals.originalBytes)} em originais e{" "}
                        {formatBytes(cleanupPreview.totals.variantBytes)} em variantes.
                      </p>
                      <p className="text-xs text-foreground/70">
                        {formatBytes(cleanupPreview.looseOriginalTotals.totalBytes)} em originais
                        soltos e{" "}
                        {formatBytes(cleanupPreview.quarantinePendingDeleteTotals.totalBytes)} em
                        purga pendente da quarentena.
                      </p>
                    </div>
                    <DashboardActionButton
                      size="sm"
                      tone="destructive"
                      disabled={
                        isCleanupRunning || hasCleanupBlockingError || !hasCleanupCandidates
                      }
                      onClick={() => setIsCleanupConfirmOpen(true)}
                    >
                      {isCleanupRunning ? "Limpando..." : CLEANUP_ACTION_LABEL}
                    </DashboardActionButton>
                  </div>

                  {cleanupPreview.examples.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-sm">
                        <thead className="bg-background text-xs uppercase tracking-[0.12em] text-foreground/70">
                          <tr>
                            <th className="px-4 py-3 text-left">Tipo</th>
                            <th className="px-4 py-3 text-left">Arquivo</th>
                            <th className="px-4 py-3 text-left">Área</th>
                            <th className="px-4 py-3 text-left">Criado em</th>
                            <th className="px-4 py-3 text-right">Recuperável</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cleanupPreview.examples.map((item) => (
                            <tr
                              key={`${item.kind}:${item.id || item.url}`}
                              className="border-t border-border/50"
                            >
                              <td className="px-4 py-3 text-foreground/70">
                                {item.scope === "loose_original"
                                  ? "Original solto"
                                  : item.kind === "variant"
                                    ? "Variante órfã"
                                    : "Upload"}
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-foreground">
                                  {item.fileName || item.url}
                                </p>
                                <p className="text-xs text-foreground/70">{item.url}</p>
                              </td>
                              <td className="px-4 py-3 text-foreground/70">{item.area}</td>
                              <td className="px-4 py-3 text-foreground/70">
                                {formatDateTime(item.createdAt)}
                              </td>
                              <td className="px-4 py-3 text-right text-foreground">
                                {formatBytes(item.totalBytes)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <AsyncState
                      kind={hasCleanupBlockingError ? "error" : "empty"}
                      title={
                        hasCleanupBlockingError
                          ? "Análise de limpeza indisponível"
                          : "Nenhum arquivo elegível para limpeza."
                      }
                      description={
                        hasCleanupBlockingError
                          ? "Tente atualizar o painel antes de executar uma limpeza."
                          : "Arquivos sem uso, variantes órfãs e quarentena vencida aparecerão aqui."
                      }
                    />
                  )}
                </div>
              )}
            </article>
          ) : null}
        </section>
      </DashboardPageContainer>

      <AlertDialog
        open={isCleanupConfirmOpen}
        onOpenChange={(open) => {
          if (isCleanupRunning) {
            return;
          }
          setIsCleanupConfirmOpen(open);
          if (!open) {
            setCleanupConfirmText("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar armazenamento não utilizado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove uploads sem uso, variantes órfãs encontradas em _variants e move
              originais soltos para _quarantine. Arquivos em _quarantine com mais de 7 dias são
              purgados no mesmo fluxo. Digite EXCLUIR para confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-foreground/70">
              Uploads sem uso:{" "}
              <span className="font-semibold text-foreground">
                {cleanupPreview.unusedUploadCount}
              </span>
            </p>
            <p className="text-sm text-foreground/70">
              Variantes órfãs:{" "}
              <span className="font-semibold text-foreground">
                {cleanupPreview.orphanedVariantFilesCount}
              </span>
            </p>
            <p className="text-sm text-foreground/70">
              Diretórios órfãos:{" "}
              <span className="font-semibold text-foreground">
                {cleanupPreview.orphanedVariantDirsCount}
              </span>
            </p>
            <p className="text-sm text-foreground/70">
              Originais soltos (quarentena):{" "}
              <span className="font-semibold text-foreground">
                {cleanupPreview.looseOriginalFilesCount}
              </span>
            </p>
            <p className="text-sm text-foreground/70">
              Quarentena vencida para purga:{" "}
              <span className="font-semibold text-foreground">
                {cleanupPreview.quarantinePendingDeleteCount}
              </span>
            </p>
            <p className="text-sm text-foreground/70">
              Espaço recuperável:{" "}
              <span className="font-semibold text-foreground">
                {formatBytes(cleanupPreview.totals.totalBytes)}
              </span>
            </p>
            <Input
              value={cleanupConfirmText}
              onChange={(event) => setCleanupConfirmText(event.target.value)}
              onKeyDown={handleCleanupConfirmKeyDown}
              placeholder="Digite EXCLUIR"
              disabled={isCleanupRunning}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleanupRunning}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isCleanupRunning || cleanupConfirmText !== CLEANUP_CONFIRM_TEXT}
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmCleanup();
              }}
            >
              {isCleanupRunning ? "Limpando..." : CLEANUP_ACTION_LABEL}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardShell>
  );
};

export default DashboardUploads;
