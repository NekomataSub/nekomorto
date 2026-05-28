import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ProjectRecord } from "@/components/dashboard/project-editor/dashboard-projects-editor-types";
import { DEFAULT_PROJECT_FORMAT_OPTIONS } from "@/components/dashboard/project-editor/project-editor-constants";
import { apiFetch } from "@/lib/api-client";
import {
  areDashboardSearchParamsEqual,
  buildDashboardSearchParams,
  parseDashboardEnumParam,
  parseDashboardPageParam,
} from "@/lib/dashboard-query-state";
import { comparePtBr } from "@/lib/search-ranking";

export const defaultFormatOptions = DEFAULT_PROJECT_FORMAT_OPTIONS;

type DashboardProjectsPageCacheEntry = {
  projects: ProjectRecord[];
  projectTypeOptions: string[];
  memberDirectory: string[];
  tagTranslations: Record<string, string>;
  genreTranslations: Record<string, string>;
  staffRoleTranslations: Record<string, string>;
  expiresAt: number;
};

type DashboardProjectsResourceState = {
  projects: ProjectRecord[];
  projectTypeOptions: string[];
  memberDirectory: string[];
  tagTranslations: Record<string, string>;
  genreTranslations: Record<string, string>;
  staffRoleTranslations: Record<string, string>;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  hasLoadedOnce: boolean;
  hasResolvedProjects: boolean;
  hasResolvedProjectTypes: boolean;
  hasResolvedMemberDirectory: boolean;
  hasResolvedTranslations: boolean;
  hasLoadError: boolean;
};

const PROJECTS_PAGE_CACHE_TTL_MS = 60_000;

let projectsPageCache: DashboardProjectsPageCacheEntry | null = null;

const cloneProjectsPageCache = (value: Omit<DashboardProjectsPageCacheEntry, "expiresAt">) => ({
  projects: JSON.parse(JSON.stringify(value.projects)) as ProjectRecord[],
  projectTypeOptions: [...value.projectTypeOptions],
  memberDirectory: [...value.memberDirectory],
  tagTranslations: { ...value.tagTranslations },
  genreTranslations: { ...value.genreTranslations },
  staffRoleTranslations: { ...value.staffRoleTranslations },
});

export const readProjectsPageCache = () => {
  if (!projectsPageCache) {
    return null;
  }
  if (projectsPageCache.expiresAt <= Date.now()) {
    projectsPageCache = null;
    return null;
  }
  return cloneProjectsPageCache(projectsPageCache);
};

export const writeProjectsPageCache = (
  value: Omit<DashboardProjectsPageCacheEntry, "expiresAt">,
) => {
  projectsPageCache = {
    ...cloneProjectsPageCache(value),
    expiresAt: Date.now() + PROJECTS_PAGE_CACHE_TTL_MS,
  };
};

export const clearProjectsPageCache = () => {
  projectsPageCache = null;
};

const normalizeMemberDirectory = (users: unknown): string[] => {
  if (!Array.isArray(users)) {
    return [];
  }

  const activeMemberNames = users.flatMap((user): string[] => {
    if (!user || typeof user !== "object") {
      return [];
    }
    const record = user as { name?: unknown; status?: unknown };
    if (record.status !== "active") {
      return [];
    }
    const name = String(record.name || "").trim();
    return name ? [name] : [];
  });

  return Array.from(new Set(activeMemberNames)).sort(comparePtBr);
};

const parseTypeParam = (value: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "Todos";
  }
  return normalized;
};

const resolveNextStateValue = <T>(updater: SetStateAction<T>, previousValue: T): T =>
  typeof updater === "function" ? (updater as (previousValue: T) => T)(previousValue) : updater;

const buildInitialResourceState = (
  cached: ReturnType<typeof readProjectsPageCache>,
): DashboardProjectsResourceState => ({
  projects: cached?.projects ?? [],
  projectTypeOptions: cached?.projectTypeOptions ?? defaultFormatOptions,
  memberDirectory: cached?.memberDirectory ?? [],
  tagTranslations: cached?.tagTranslations ?? {},
  genreTranslations: cached?.genreTranslations ?? {},
  staffRoleTranslations: cached?.staffRoleTranslations ?? {},
  isInitialLoading: !cached,
  isRefreshing: Boolean(cached),
  hasLoadedOnce: Boolean(cached),
  hasResolvedProjects: Boolean(cached),
  hasResolvedProjectTypes: Boolean(cached),
  hasResolvedMemberDirectory: Boolean(cached),
  hasResolvedTranslations: Boolean(cached),
  hasLoadError: false,
});

type SortMode = "alpha" | "status" | "views" | "comments" | "recent";
const SORT_MODES = ["alpha", "status", "views", "comments", "recent"] as const;

export type UseDashboardProjectsEditorResourceResult = {
  currentPage: number;
  genreTranslations: Record<string, string>;
  hasLoadError: boolean;
  hasLoadedOnce: boolean;
  hasResolvedMemberDirectory: boolean;
  hasResolvedProjectTypes: boolean;
  hasResolvedProjects: boolean;
  hasResolvedTranslations: boolean;
  isInitialLoading: boolean;
  isRefreshing: boolean;
  memberDirectory: string[];
  projectTypeOptions: string[];
  projects: ProjectRecord[];
  refreshProjects: () => void;
  searchParams: ReturnType<typeof useSearchParams>[0];
  selectedType: string;
  setCurrentPage: (page: number) => void;
  setGenreTranslations: Dispatch<SetStateAction<Record<string, string>>>;
  setMemberDirectory: Dispatch<SetStateAction<string[]>>;
  setProjectTypeOptions: Dispatch<SetStateAction<string[]>>;
  setProjects: Dispatch<SetStateAction<ProjectRecord[]>>;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  setSelectedType: Dispatch<SetStateAction<string>>;
  setSortMode: Dispatch<SetStateAction<SortMode>>;
  setStaffRoleTranslations: Dispatch<SetStateAction<Record<string, string>>>;
  setTagTranslations: Dispatch<SetStateAction<Record<string, string>>>;
  sortMode: SortMode;
  staffRoleTranslations: Record<string, string>;
  tagTranslations: Record<string, string>;
};

export function useDashboardProjectsEditorResource(
  apiBase: string,
): UseDashboardProjectsEditorResourceResult {
  const initialCacheRef = useRef(readProjectsPageCache());
  const [searchParams, setSearchParams] = useSearchParams();
  const [resourceState, setResourceState] = useState<DashboardProjectsResourceState>(() =>
    buildInitialResourceState(initialCacheRef.current),
  );
  const [loadVersion, setLoadVersion] = useState(0);
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    return parseDashboardEnumParam(searchParams.get("sort"), SORT_MODES, "alpha");
  });
  const [currentPage, setCurrentPage] = useState(() =>
    parseDashboardPageParam(searchParams.get("page")),
  );
  const [selectedType, setSelectedType] = useState(() => parseTypeParam(searchParams.get("type")));
  const searchParamsSnapshot = searchParams.toString();
  const hasLoadedOnceRef = useRef(resourceState.hasLoadedOnce);
  const isApplyingSearchParamsRef = useRef(false);
  const queryStateRef = useRef({
    sortMode,
    currentPage,
    selectedType,
  });
  const requestIdRef = useRef(0);

  const setProjects = useCallback<Dispatch<SetStateAction<ProjectRecord[]>>>((updater) => {
    setResourceState((previousState) => ({
      ...previousState,
      projects: resolveNextStateValue(updater, previousState.projects),
    }));
  }, []);

  const setProjectTypeOptions = useCallback<Dispatch<SetStateAction<string[]>>>((updater) => {
    setResourceState((previousState) => ({
      ...previousState,
      projectTypeOptions: resolveNextStateValue(updater, previousState.projectTypeOptions),
    }));
  }, []);

  const setMemberDirectory = useCallback<Dispatch<SetStateAction<string[]>>>((updater) => {
    setResourceState((previousState) => ({
      ...previousState,
      memberDirectory: resolveNextStateValue(updater, previousState.memberDirectory),
    }));
  }, []);

  const setTagTranslations = useCallback<Dispatch<SetStateAction<Record<string, string>>>>(
    (updater) => {
      setResourceState((previousState) => ({
        ...previousState,
        tagTranslations: resolveNextStateValue(updater, previousState.tagTranslations),
      }));
    },
    [],
  );

  const setGenreTranslations = useCallback<Dispatch<SetStateAction<Record<string, string>>>>(
    (updater) => {
      setResourceState((previousState) => ({
        ...previousState,
        genreTranslations: resolveNextStateValue(updater, previousState.genreTranslations),
      }));
    },
    [],
  );

  const setStaffRoleTranslations = useCallback<Dispatch<SetStateAction<Record<string, string>>>>(
    (updater) => {
      setResourceState((previousState) => ({
        ...previousState,
        staffRoleTranslations: resolveNextStateValue(updater, previousState.staffRoleTranslations),
      }));
    },
    [],
  );

  useEffect(() => {
    hasLoadedOnceRef.current = resourceState.hasLoadedOnce;
  }, [resourceState.hasLoadedOnce]);

  useEffect(() => {
    queryStateRef.current = {
      sortMode,
      currentPage,
      selectedType,
    };
  }, [currentPage, selectedType, sortMode]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParamsSnapshot);
    const nextSort = parseDashboardEnumParam(nextSearchParams.get("sort"), SORT_MODES, "alpha");
    const nextPage = parseDashboardPageParam(nextSearchParams.get("page"));
    const nextType = parseTypeParam(nextSearchParams.get("type"));
    const {
      sortMode: currentSortMode,
      currentPage: currentCurrentPage,
      selectedType: currentSelectedType,
    } = queryStateRef.current;
    const shouldApply =
      currentSortMode !== nextSort ||
      currentCurrentPage !== nextPage ||
      currentSelectedType !== nextType;
    if (!shouldApply) {
      return;
    }
    isApplyingSearchParamsRef.current = true;
    setSortMode((prev) => (prev === nextSort ? prev : nextSort));
    setCurrentPage((prev) => (prev === nextPage ? prev : nextPage));
    setSelectedType((prev) => (prev === nextType ? prev : nextType));
  }, [searchParamsSnapshot]);

  useEffect(() => {
    const currentSearchParams = new URLSearchParams(searchParamsSnapshot);
    const nextParams = buildDashboardSearchParams(currentSearchParams, [
      { key: "sort", value: sortMode, fallbackValue: "alpha" },
      { key: "page", value: currentPage, fallbackValue: 1 },
      { key: "type", value: selectedType, fallbackValue: "Todos" },
    ]);
    if (isApplyingSearchParamsRef.current) {
      if (areDashboardSearchParamsEqual(nextParams, currentSearchParams)) {
        isApplyingSearchParamsRef.current = false;
      }
      return;
    }
    if (!areDashboardSearchParamsEqual(nextParams, currentSearchParams)) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [currentPage, searchParamsSnapshot, selectedType, setSearchParams, sortMode]);

  const refreshProjects = useCallback(() => {
    setLoadVersion((previous) => previous + 1);
  }, []);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const cached = initialCacheRef.current;
      const hasWarmState = hasLoadedOnceRef.current;

      setResourceState((previousState) => ({
        ...previousState,
        hasLoadError: false,
        isRefreshing: hasWarmState,
        isInitialLoading: !hasWarmState,
        hasResolvedProjects: hasWarmState ? previousState.hasResolvedProjects : false,
        hasResolvedProjectTypes: cached ? previousState.hasResolvedProjectTypes : false,
        hasResolvedMemberDirectory: cached ? previousState.hasResolvedMemberDirectory : false,
        hasResolvedTranslations: cached ? previousState.hasResolvedTranslations : false,
      }));

      try {
        const [projectsResult, projectTypesResult, usersResult, translationsResult] =
          await Promise.allSettled([
            apiFetch(apiBase, "/api/projects", { auth: true }),
            apiFetch(apiBase, "/api/project-types", {
              auth: true,
              cache: "no-store",
            }),
            apiFetch(apiBase, "/api/users", { auth: true }),
            apiFetch(apiBase, "/api/public/tag-translations", {
              cache: "no-store",
            }),
          ]);

        if (!isActive || requestIdRef.current !== requestId) {
          return;
        }

        if (projectsResult.status !== "fulfilled" || !projectsResult.value.ok) {
          throw new Error("projects_load_failed");
        }

        const [projectsData, projectTypesData, usersData, translationsData] = await Promise.all([
          projectsResult.value.json(),
          projectTypesResult.status === "fulfilled" && projectTypesResult.value.ok
            ? projectTypesResult.value.json()
            : Promise.resolve(null),
          usersResult.status === "fulfilled" && usersResult.value.ok
            ? usersResult.value.json()
            : Promise.resolve(null),
          translationsResult.status === "fulfilled" && translationsResult.value.ok
            ? translationsResult.value.json()
            : Promise.resolve(null),
        ]);

        if (!isActive || requestIdRef.current !== requestId) {
          return;
        }

        const nextProjects: ProjectRecord[] = Array.isArray(projectsData?.projects)
          ? (projectsData.projects as ProjectRecord[])
          : [];
        const remoteTypes = Array.isArray(projectTypesData?.types)
          ? projectTypesData.types.map((item: unknown) => String(item || "").trim()).filter(Boolean)
          : [];
        const nextProjectTypeOptions = Array.from(
          new Set([...remoteTypes, ...defaultFormatOptions]),
        );
        const nextMemberDirectory = normalizeMemberDirectory(usersData?.users);
        const nextTagTranslations =
          translationsData && typeof translationsData.tags === "object" && translationsData.tags
            ? (translationsData.tags as Record<string, string>)
            : {};
        const nextGenreTranslations =
          translationsData && typeof translationsData.genres === "object" && translationsData.genres
            ? (translationsData.genres as Record<string, string>)
            : {};
        const nextStaffRoleTranslations =
          translationsData &&
          typeof translationsData.staffRoles === "object" &&
          translationsData.staffRoles
            ? (translationsData.staffRoles as Record<string, string>)
            : {};

        setResourceState((previousState) => ({
          ...previousState,
          projects: nextProjects,
          projectTypeOptions:
            nextProjectTypeOptions.length > 0 ? nextProjectTypeOptions : defaultFormatOptions,
          memberDirectory: nextMemberDirectory,
          tagTranslations: nextTagTranslations,
          genreTranslations: nextGenreTranslations,
          staffRoleTranslations: nextStaffRoleTranslations,
          isInitialLoading: false,
          isRefreshing: false,
          hasLoadedOnce: true,
          hasResolvedProjects: true,
          hasResolvedProjectTypes: true,
          hasResolvedMemberDirectory: true,
          hasResolvedTranslations: true,
          hasLoadError: false,
        }));

        const cacheValue = {
          projects: nextProjects,
          projectTypeOptions:
            nextProjectTypeOptions.length > 0 ? nextProjectTypeOptions : defaultFormatOptions,
          memberDirectory: nextMemberDirectory,
          tagTranslations: nextTagTranslations,
          genreTranslations: nextGenreTranslations,
          staffRoleTranslations: nextStaffRoleTranslations,
        };

        initialCacheRef.current = cacheValue;
        writeProjectsPageCache(cacheValue);
      } catch {
        if (!isActive || requestIdRef.current !== requestId) {
          return;
        }

        setResourceState((previousState) => {
          if (hasLoadedOnceRef.current) {
            return {
              ...previousState,
              isInitialLoading: false,
              isRefreshing: false,
              hasLoadError: true,
            };
          }

          return {
            ...previousState,
            projects: [],
            projectTypeOptions: defaultFormatOptions,
            memberDirectory: [],
            tagTranslations: {},
            genreTranslations: {},
            staffRoleTranslations: {},
            isInitialLoading: false,
            isRefreshing: false,
            hasResolvedProjects: false,
            hasResolvedProjectTypes: false,
            hasResolvedMemberDirectory: false,
            hasResolvedTranslations: false,
            hasLoadError: true,
          };
        });
      }
    };

    void load();
    return () => {
      isActive = false;
    };
  }, [apiBase, loadVersion]);

  return {
    currentPage,
    genreTranslations: resourceState.genreTranslations,
    hasLoadError: resourceState.hasLoadError,
    hasLoadedOnce: resourceState.hasLoadedOnce,
    hasResolvedMemberDirectory: resourceState.hasResolvedMemberDirectory,
    hasResolvedProjectTypes: resourceState.hasResolvedProjectTypes,
    hasResolvedProjects: resourceState.hasResolvedProjects,
    hasResolvedTranslations: resourceState.hasResolvedTranslations,
    isInitialLoading: resourceState.isInitialLoading,
    isRefreshing: resourceState.isRefreshing,
    memberDirectory: resourceState.memberDirectory,
    projectTypeOptions: resourceState.projectTypeOptions,
    projects: resourceState.projects,
    refreshProjects,
    searchParams,
    selectedType,
    setCurrentPage,
    setGenreTranslations,
    setMemberDirectory,
    setProjectTypeOptions,
    setProjects,
    setSearchParams,
    setSelectedType,
    setSortMode,
    setStaffRoleTranslations,
    setTagTranslations,
    sortMode,
    staffRoleTranslations: resourceState.staffRoleTranslations,
    tagTranslations: resourceState.tagTranslations,
  };
}
