import {
  memo,
  startTransition,
  type ReactNode,
  type RefObject,
  useDeferredValue,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import PublicProjectCard, {
  PUBLIC_PROJECT_CARD_CLAMP_PROFILES,
  resolvePublicProjectCardClampState,
  resolvePublicProjectCardResponsiveMaxLines,
} from "@/components/project/PublicProjectCard";
import { Combobox, Input } from "@/components/public-form-controls";
import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import AsyncState from "@/components/ui/async-state";
import { Button } from "@/components/ui/button";
import CompactPagination from "@/components/ui/compact-pagination";
import type { Project } from "@/data/projects";
import { useDynamicSynopsisClamp } from "@/hooks/use-dynamic-synopsis-clamp";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageMeta } from "@/hooks/use-page-meta";
import {
  usePublishResolvedPublicSnapshots,
  useResolvedPublicBootstrap,
  useResolvedPublicRoutePayload,
} from "@/hooks/public-bootstrap-provider";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import {
  navigatePublicDocument,
  usePublicDocumentLocation,
} from "@/lib/public-document-navigation";
import { prepareProjectBadges, type ProjectBadgeItem } from "@/lib/project-card-layout";
import { comparePtBr, normalizeSearchText } from "@/lib/search-ranking";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import { cn } from "@/lib/utils";
import "@/styles/projects-public.css";
import {
  buildInstitutionalOgImageAlt,
  buildInstitutionalOgRevision,
  buildVersionedInstitutionalOgImagePath,
  resolveInstitutionalOgSupportText,
} from "../../shared/institutional-og-seo.js";

const alphabetOptions = ["Todas", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
const PROJECTS_LIST_STATE_STORAGE_KEY = "public.projects.list-state.v1";
const MAX_QUERY_LENGTH = 80;
const SEARCH_QUERY_DEBOUNCE_MS = 60;
const PROJECTS_LIST_IMAGE_SIZES = "(max-width: 767px) 129px, 154px";
const PRIORITY_PROJECT_IMAGE_COUNT = 1;
const MOBILE_FILTERS_PANEL_ID = "projects-mobile-filters-panel";
const FILTER_COMBOBOX_INITIAL_LIMIT = 24;
const FILTER_COMBOBOX_STEP = 24;

const parseLetterParam = (value: string | null) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]$/.test(normalized) ? normalized : "Todas";
};

const parseTypeParam = (value: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || "Todos";
};

const parseProjectsPageParam = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
};

type FilterOption = {
  value: string;
  label: string;
  searchText: string;
};

type IndexedPublicProject = {
  project: Project;
  firstLetter: string;
  normalizedHaystack: string;
  tagSet: Set<string>;
  genreSet: Set<string>;
  type: string;
};

type IndexedPublicProjectsPayload = {
  items: IndexedPublicProject[];
  tagOptions: FilterOption[];
  genreOptions: FilterOption[];
  typeOptions: string[];
};

type ProjectsFilterFieldProps = {
  label: string;
  className?: string;
  children: ReactNode;
};

type ProjectsResultsSummaryProps = {
  filteredProjectsCount: number;
  onResetFilters: () => void;
  className?: string;
};

type ProjectsFiltersPanelProps = {
  isMobile: boolean;
  isMobileFiltersOpen: boolean;
  onToggleMobileFilters: () => void;
  searchInputValue: string;
  onSearchInputChange: (nextValue: string) => void;
  letterOptions: FilterOption[];
  selectedLetter: string;
  selectedTag: string;
  selectedGenre: string;
  selectedType: string;
  tagOptions: FilterOption[];
  genreOptions: FilterOption[];
  typeOptions: FilterOption[];
  filteredProjectsCount: number;
  activeFiltersSummary: string;
  onLetterChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onResetFilters: () => void;
};

type ProjectsGridProps = {
  projects: Project[];
  tagTranslations: Record<string, string>;
  genreTranslations: Record<string, string>;
  navigate: (href: string) => void;
  mediaVariants: UploadMediaVariantsMap;
  isMobile: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  getSynopsisClampState: (projectId: string) => {
    synopsisLines: number;
    synopsisClampClass: string;
  };
};

const EMPTY_FILTER_OPTIONS: FilterOption[] = [];
const catalogClampProfile = () => PUBLIC_PROJECT_CARD_CLAMP_PROFILES.catalog;

const buildFilterOption = (value: string, label: string): FilterOption => ({
  value,
  label,
  searchText: normalizeSearchText(`${label} ${value}`),
});

const ALPHABET_FILTER_OPTIONS = alphabetOptions.map((letter) =>
  buildFilterOption(letter, letter === "Todas" ? "Todas as letras" : letter),
);

const buildIndexedPublicProjects = ({
  projects,
  tagTranslations,
  genreTranslations,
}: {
  projects: Project[];
  tagTranslations: Record<string, string>;
  genreTranslations: Record<string, string>;
}): IndexedPublicProjectsPayload => {
  const tagEntries = new Map<string, string>();
  const genreEntries = new Map<string, string>();
  const typeEntries = new Set<string>();

  const items = [...projects]
    .map((project) => {
      const tags = Array.isArray(project.tags) ? project.tags.filter(Boolean) : [];
      const genres = Array.isArray(project.genres) ? project.genres.filter(Boolean) : [];
      const translatedTags = tags.map((tag) => {
        const translated = String(tagTranslations[tag] || tag).trim();
        tagEntries.set(tag, translated || tag);
        return translated || tag;
      });
      const translatedGenres = genres.map((genre) => {
        const translated = String(genreTranslations[genre] || genre).trim();
        genreEntries.set(genre, translated || genre);
        return translated || genre;
      });
      const type = String(project.type || "").trim();
      if (type) {
        typeEntries.add(type);
      }
      return {
        project,
        firstLetter: String(project.title || "")
          .trim()
          .charAt(0)
          .toUpperCase(),
        normalizedHaystack: normalizeSearchText(
          [
            project.title,
            project.titleOriginal,
            project.titleEnglish,
            project.synopsis,
            project.description,
            project.type,
            project.status,
            project.studio,
            ...(Array.isArray(project.animationStudios) ? project.animationStudios : []),
            ...(Array.isArray(project.producers) ? project.producers : []),
            ...tags,
            ...genres,
            ...translatedTags,
            ...translatedGenres,
          ]
            .filter(Boolean)
            .join(" "),
        ),
        tagSet: new Set(tags),
        genreSet: new Set(genres),
        type,
      } satisfies IndexedPublicProject;
    })
    .sort((left, right) => comparePtBr(left.project.title, right.project.title));

  return {
    items,
    tagOptions: [
      buildFilterOption("Todas", "Todas as tags"),
      ...Array.from(tagEntries.entries())
        .sort((left, right) => comparePtBr(left[1], right[1]))
        .map(([value, label]) => buildFilterOption(value, label)),
    ],
    genreOptions: [
      buildFilterOption("Todos", "Todos os gêneros"),
      ...Array.from(genreEntries.entries())
        .sort((left, right) => comparePtBr(left[1], right[1]))
        .map(([value, label]) => buildFilterOption(value, label)),
    ],
    typeOptions: ["Todos", ...Array.from(typeEntries).sort(comparePtBr)],
  };
};

const getProjectBadgeAriaLabel = (item: ProjectBadgeItem) => {
  if (item.key.startsWith("tag-")) {
    return `Filtrar por tag ${item.label}`;
  }
  if (item.key.startsWith("genre-")) {
    return `Filtrar por gênero ${item.label}`;
  }
  return item.label;
};

const isPresent = <T,>(value: T | null | undefined): value is T => value != null;

const buildCatalogProjectPrimaryBadges = ({
  project,
  tagTranslations,
  genreTranslations,
  navigate,
  isMobile,
}: {
  project: Project;
  tagTranslations: Record<string, string>;
  genreTranslations: Record<string, string>;
  navigate: (href: string) => void;
  isMobile: boolean;
}) => {
  const { visibleItems, extraCount, showOverflowBadge } = isMobile
    ? {
        visibleItems: [] as ProjectBadgeItem[],
        extraCount: 0,
        showOverflowBadge: false,
      }
    : prepareProjectBadges({
        tags: project.tags,
        genres: project.genres || [],
        producers: project.producers || [],
        tagTranslations,
        genreTranslations,
        maxVisible: 2,
        maxChars: 18,
      });

  return [
    ...visibleItems.map((item) => ({
      key: item.key,
      label: item.label,
      variant: item.variant,
      href: item.href,
      ariaLabel: getProjectBadgeAriaLabel(item),
      title: item.label,
      onClickHref: (href: string) => navigate(href),
    })),
    showOverflowBadge
      ? {
          key: `overflow-${project.id}`,
          label: `+${extraCount}`,
          variant: "secondary" as const,
          className: "w-9 justify-center",
          title: `+${extraCount} tags`,
        }
      : null,
  ].filter(isPresent);
};

const buildCatalogProjectMetaPills = (project: Project) =>
  [
    project.status
      ? {
          key: "status",
          label: project.status,
          className: "truncate",
        }
      : null,
    project.studio
      ? {
          key: "studio",
          label: project.studio,
          className: "hidden max-w-36 truncate lg:inline-flex lg:max-w-48",
          title: project.studio,
        }
      : null,
    project.episodes
      ? {
          key: "episodes",
          label: project.episodes,
          className: "hidden truncate xl:inline-flex",
        }
      : null,
  ].filter(isPresent);

const ProjectsFilterField = ({ label, className, children }: ProjectsFilterFieldProps) => (
  <div className={cn("flex flex-col gap-2", className)}>
    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      {label}
    </span>
    {children}
  </div>
);

const ProjectsResultsSummary = ({
  filteredProjectsCount,
  onResetFilters,
  className,
}: ProjectsResultsSummaryProps) => (
  <div
    className={cn(
      "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background/40 px-4 py-3 text-sm text-muted-foreground",
      className,
    )}
  >
    <div className="flex flex-wrap gap-2">
      <span className="font-semibold text-foreground">{filteredProjectsCount}</span>
      <span>projetos encontrados</span>
      <span className="text-muted-foreground">&bull;</span>
      <span>Atualizado semanalmente</span>
    </div>
    <Button variant="ghost" onClick={onResetFilters} className="w-full text-xs uppercase sm:w-auto">
      Limpar filtros
    </Button>
  </div>
);

const ProjectsFiltersPanel = memo(
  ({
    isMobile,
    isMobileFiltersOpen,
    onToggleMobileFilters,
    searchInputValue,
    onSearchInputChange,
    letterOptions,
    selectedLetter,
    selectedTag,
    selectedGenre,
    selectedType,
    tagOptions,
    genreOptions,
    typeOptions,
    filteredProjectsCount,
    activeFiltersSummary,
    onLetterChange,
    onTagChange,
    onGenreChange,
    onTypeChange,
    onResetFilters,
  }: ProjectsFiltersPanelProps) => {
    const filterControls = (
      <>
        <ProjectsFilterField label="A-Z">
          <Combobox
            id={isMobile ? "projects-letter-mobile" : "projects-letter-desktop"}
            ariaLabel="Filtrar por letra"
            listAriaLabel="A-Z"
            value={selectedLetter}
            options={letterOptions}
            placeholder="Todas as letras"
            searchable={false}
            onValueChange={onLetterChange}
          />
        </ProjectsFilterField>

        <ProjectsFilterField label="Tags">
          <Combobox
            id={isMobile ? "projects-tag-mobile" : "projects-tag-desktop"}
            ariaLabel="Filtrar por tag"
            listAriaLabel="Tags"
            value={selectedTag}
            options={tagOptions}
            placeholder="Todas as tags"
            searchable
            searchPlaceholder="Buscar tag"
            searchInputAriaLabel="Buscar em tags"
            emptyMessage="Nenhuma tag encontrada."
            initialVisibleCount={FILTER_COMBOBOX_INITIAL_LIMIT}
            visibleCountStep={FILTER_COMBOBOX_STEP}
            onValueChange={onTagChange}
          />
        </ProjectsFilterField>

        <ProjectsFilterField label="Gêneros">
          <Combobox
            id={isMobile ? "projects-genre-mobile" : "projects-genre-desktop"}
            ariaLabel="Filtrar por gênero"
            listAriaLabel="Gêneros"
            value={selectedGenre}
            options={genreOptions}
            placeholder="Todos os gêneros"
            searchable
            searchPlaceholder="Buscar gênero"
            searchInputAriaLabel="Buscar em gêneros"
            emptyMessage="Nenhum gênero encontrado."
            initialVisibleCount={FILTER_COMBOBOX_INITIAL_LIMIT}
            visibleCountStep={FILTER_COMBOBOX_STEP}
            onValueChange={onGenreChange}
          />
        </ProjectsFilterField>

        <ProjectsFilterField label="Formato">
          <Combobox
            id={isMobile ? "projects-type-mobile" : "projects-type-desktop"}
            ariaLabel="Filtrar por formato"
            listAriaLabel="Formato"
            value={selectedType}
            options={typeOptions}
            placeholder="Todos os formatos"
            searchable={false}
            onValueChange={onTypeChange}
          />
        </ProjectsFilterField>
      </>
    );

    return (
      <div className="grid gap-3 rounded-2xl bg-card/70 p-4 shadow-lg md:grid-cols-4 md:gap-4 md:p-6">
        <div className="md:col-span-4 flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Busca
          </span>
          <Input
            value={searchInputValue}
            onChange={(event) => onSearchInputChange(event.target.value.slice(0, MAX_QUERY_LENGTH))}
            placeholder="Buscar por título, sinopse, tag ou gênero"
            className="bg-background/60"
            aria-label="Buscar projetos"
          />
        </div>

        {isMobile ? (
          <div className="md:col-span-4">
            <div className="rounded-xl bg-background/40 px-4 py-3 shadow-sm">
              <button
                type="button"
                aria-expanded={isMobileFiltersOpen}
                aria-controls={MOBILE_FILTERS_PANEL_ID}
                className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
                onClick={onToggleMobileFilters}
              >
                <div className="min-w-0">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Filtros
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-semibold text-foreground">{filteredProjectsCount}</span>
                    <span>projetos encontrados</span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {activeFiltersSummary}
                </span>
              </button>
              {isMobileFiltersOpen ? (
                <div id={MOBILE_FILTERS_PANEL_ID} className="space-y-4 pt-4">
                  <div className="grid gap-3">{filterControls}</div>
                  <ProjectsResultsSummary
                    filteredProjectsCount={filteredProjectsCount}
                    onResetFilters={onResetFilters}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            {filterControls}
            <ProjectsResultsSummary
              filteredProjectsCount={filteredProjectsCount}
              onResetFilters={onResetFilters}
              className="md:col-span-4"
            />
          </>
        )}
      </div>
    );
  },
);

ProjectsFiltersPanel.displayName = "ProjectsFiltersPanel";

const ProjectsGrid = memo(
  ({
    projects,
    tagTranslations,
    genreTranslations,
    navigate,
    mediaVariants,
    isMobile,
    rootRef,
    getSynopsisClampState,
  }: ProjectsGridProps) => (
    <div ref={rootRef} className="mt-10 grid gap-6 md:grid-cols-2 md:auto-rows-fr">
      {projects.map((project, index) => {
        const isLastSingle = projects.length % 2 === 1 && index === projects.length - 1;
        const synopsisClampState = getSynopsisClampState(project.id);
        return (
          <div
            key={project.id}
            className={isLastSingle ? "md:col-span-2 flex justify-center" : undefined}
          >
            {isLastSingle ? (
              <div className="w-full md:w-[calc(50%-0.75rem)]">
                <PublicProjectCard
                  variant="catalog"
                  model={{
                    href: `/projeto/${project.id}`,
                    title: project.title,
                    coverSrc: project.cover,
                    coverAlt: project.title,
                    mediaVariants,
                    eyebrow: project.type,
                    synopsis: project.synopsis,
                    synopsisKey: project.id,
                    synopsisLines: synopsisClampState.synopsisLines,
                    synopsisClampClass: synopsisClampState.synopsisClampClass,
                    primaryBadges: buildCatalogProjectPrimaryBadges({
                      project,
                      tagTranslations,
                      genreTranslations,
                      navigate,
                      isMobile,
                    }),
                    metaPills: buildCatalogProjectMetaPills(project),
                  }}
                  imageSizes={PROJECTS_LIST_IMAGE_SIZES}
                  imageLoading={index < PRIORITY_PROJECT_IMAGE_COUNT ? "eager" : "lazy"}
                  imageFetchPriority={index < PRIORITY_PROJECT_IMAGE_COUNT ? "high" : undefined}
                />
              </div>
            ) : (
              <PublicProjectCard
                variant="catalog"
                model={{
                  href: `/projeto/${project.id}`,
                  title: project.title,
                  coverSrc: project.cover,
                  coverAlt: project.title,
                  mediaVariants,
                  eyebrow: project.type,
                  synopsis: project.synopsis,
                  synopsisKey: project.id,
                  synopsisLines: synopsisClampState.synopsisLines,
                  synopsisClampClass: synopsisClampState.synopsisClampClass,
                  primaryBadges: buildCatalogProjectPrimaryBadges({
                    project,
                    tagTranslations,
                    genreTranslations,
                    navigate,
                    isMobile,
                  }),
                  metaPills: buildCatalogProjectMetaPills(project),
                }}
                imageSizes={PROJECTS_LIST_IMAGE_SIZES}
                imageLoading={index < PRIORITY_PROJECT_IMAGE_COUNT ? "eager" : "lazy"}
                imageFetchPriority={index < PRIORITY_PROJECT_IMAGE_COUNT ? "high" : undefined}
              />
            )}
          </div>
        );
      })}
    </div>
  ),
);

ProjectsGrid.displayName = "ProjectsGrid";

const Projects = ({ initialPath = "/projetos" }: { initialPath?: string }) => {
  const apiBase = getApiBase();
  const isMobile = useIsMobile();
  const bootstrap = useResolvedPublicBootstrap();
  const routePayload = useResolvedPublicRoutePayload();
  const { publishPublicRoutePayload } = usePublishResolvedPublicSnapshots();
  const location = usePublicDocumentLocation(initialPath);
  const hasFullBootstrap = Boolean(bootstrap && bootstrap.payloadMode !== "critical-home");
  const projectsRoutePayload = routePayload?.kind === "projects-list" ? routePayload : null;
  const bootstrapProjects = hasFullBootstrap ? ((bootstrap?.projects || []) as Project[]) : [];
  const bootstrapTagTranslations = hasFullBootstrap ? bootstrap?.tagTranslations : null;
  const bootstrapMediaVariants = hasFullBootstrap ? bootstrap?.mediaVariants || {} : {};
  const initialProjects = projectsRoutePayload
    ? (projectsRoutePayload.projects as Project[])
    : bootstrapProjects;
  const initialTranslations = projectsRoutePayload?.tagTranslations || bootstrapTagTranslations;
  const initialProjectsMediaVariants =
    projectsRoutePayload?.mediaVariants || bootstrapMediaVariants;
  const [projects, setProjects] = useState<Project[]>(() => initialProjects);
  const [isLoadingProjects, setIsLoadingProjects] = useState(
    () => !projectsRoutePayload && !hasFullBootstrap,
  );
  const [hasProjectsLoadError, setHasProjectsLoadError] = useState(false);
  const [projectsLoadVersion, setProjectsLoadVersion] = useState(0);
  const [hasCatalogSnapshot, setHasCatalogSnapshot] = useState(() =>
    Boolean(projectsRoutePayload || hasFullBootstrap),
  );
  const [projectsMediaVariants, setProjectsMediaVariants] = useState<UploadMediaVariantsMap>(
    () => initialProjectsMediaVariants,
  );
  const [tagTranslations, setTagTranslations] = useState<Record<string, string>>(
    () => initialTranslations?.tags || {},
  );
  const [genreTranslations, setGenreTranslations] = useState<Record<string, string>>(
    () => initialTranslations?.genres || {},
  );
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const searchParamsRef = useRef(location.search);
  const [searchInputValue, setSearchInputValue] = useState(() => searchParams.get("q") || "");
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isClampReady, setIsClampReady] = useState(false);
  const navigate = useCallback((href: string) => {
    navigatePublicDocument(href);
  }, []);
  const pageMediaVariants = bootstrap?.mediaVariants || {};
  const projectsPerPage = 16;

  useEffect(() => {
    searchParamsRef.current = location.search;
  }, [location.search]);

  const selectedLetter = parseLetterParam(searchParams.get("letter"));
  const selectedType = parseTypeParam(searchParams.get("type"));
  const selectedTag = searchParams.get("tag") || "Todas";
  const selectedGenre = searchParams.get("genero") || searchParams.get("genre") || "Todos";
  const selectedQuery = searchParams.get("q") || "";
  const currentPage = parseProjectsPageParam(searchParams.get("page"));

  usePageMeta({
    title: "Projetos",
    description: resolveInstitutionalOgSupportText({
      pageKey: "projects",
      pages: bootstrap?.pages,
      settings: bootstrap?.settings,
    }),
    image: buildVersionedInstitutionalOgImagePath({
      pageKey: "projects",
      revision: buildInstitutionalOgRevision({
        pageKey: "projects",
        pages: bootstrap?.pages,
        settings: bootstrap?.settings,
      }),
    }),
    imageAlt: buildInstitutionalOgImageAlt("projects"),
    mediaVariants: pageMediaVariants,
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.removeItem(PROJECTS_LIST_STATE_STORAGE_KEY);
    } catch {
      // Ignore localStorage cleanup failures.
    }
  }, []);

  useEffect(() => {
    if ((projectsRoutePayload || hasFullBootstrap) && projectsLoadVersion === 0) {
      return;
    }
    let isActive = true;

    const load = async () => {
      if (isActive) {
        setIsLoadingProjects(true);
        setHasProjectsLoadError(false);
      }
      try {
        const response = await apiFetch(apiBase, "/api/public/projects");
        if (!response.ok) {
          if (isActive) {
            setHasProjectsLoadError(true);
          }
          return;
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        startTransition(() => {
          setProjects(Array.isArray(data.projects) ? data.projects : []);
          setProjectsMediaVariants(
            data?.mediaVariants && typeof data.mediaVariants === "object" ? data.mediaVariants : {},
          );
          setHasProjectsLoadError(false);
          setHasCatalogSnapshot(true);
        });
      } catch {
        if (isActive) {
          setHasProjectsLoadError(true);
        }
      } finally {
        if (isActive) {
          setIsLoadingProjects(false);
        }
      }
    };

    void load();
    return () => {
      isActive = false;
    };
  }, [apiBase, hasFullBootstrap, projectsLoadVersion, projectsRoutePayload]);

  useEffect(() => {
    if ((projectsRoutePayload || hasFullBootstrap) && projectsLoadVersion === 0) {
      return;
    }
    let isActive = true;

    const loadTranslations = async () => {
      try {
        const response = await apiFetch(apiBase, "/api/public/tag-translations", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        startTransition(() => {
          setTagTranslations(data.tags || {});
          setGenreTranslations(data.genres || {});
        });
      } catch {
        if (isActive) {
          // Preserve the last successful translation snapshot to avoid UI churn.
        }
      }
    };

    void loadTranslations();
    return () => {
      isActive = false;
    };
  }, [apiBase, hasFullBootstrap, projectsLoadVersion, projectsRoutePayload]);

  useEffect(() => {
    if (!projectsRoutePayload) {
      return;
    }
    setProjects(projectsRoutePayload.projects as Project[]);
    setProjectsMediaVariants(projectsRoutePayload.mediaVariants || {});
    setTagTranslations(projectsRoutePayload.tagTranslations?.tags || {});
    setGenreTranslations(projectsRoutePayload.tagTranslations?.genres || {});
    setIsLoadingProjects(false);
    setHasProjectsLoadError(false);
    setHasCatalogSnapshot(true);
  }, [projectsRoutePayload]);

  useEffect(() => {
    if (!hasFullBootstrap || projectsRoutePayload) {
      return;
    }
    setProjects(bootstrapProjects);
    setProjectsMediaVariants(bootstrapMediaVariants);
    setTagTranslations(bootstrapTagTranslations?.tags || {});
    setGenreTranslations(bootstrapTagTranslations?.genres || {});
    setIsLoadingProjects(false);
    setHasProjectsLoadError(false);
    setHasCatalogSnapshot(true);
  }, [
    bootstrapMediaVariants,
    bootstrapProjects,
    bootstrapTagTranslations?.genres,
    bootstrapTagTranslations?.tags,
    hasFullBootstrap,
    projectsRoutePayload,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const animationFrameId = window.requestAnimationFrame(() => {
      setIsClampReady(true);
    });
    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    const legacyGenre = searchParams.get("genre");
    if (!legacyGenre) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    if (!searchParams.get("genero")) {
      nextParams.set("genero", legacyGenre);
    }
    nextParams.delete("genre");
    if (nextParams.toString() !== searchParams.toString()) {
      const nextQuery = nextParams.toString();
      navigatePublicDocument(
        `${location.pathname}${nextQuery ? `?${nextQuery}` : ""}${location.hash || ""}`,
        { replace: true },
      );
    }
  }, [location.hash, location.pathname, searchParams]);

  useEffect(() => {
    setSearchInputValue(selectedQuery);
  }, [selectedQuery]);

  const commitSearchParams = useCallback(
    (mutate: (params: URLSearchParams) => void, options?: { replace?: boolean }) => {
      const current = new URLSearchParams(searchParamsRef.current);
      const next = new URLSearchParams(current);
      mutate(next);
      if (next.toString() === current.toString()) {
        return;
      }
      const nextQuery = next.toString();
      navigatePublicDocument(
        `${location.pathname}${nextQuery ? `?${nextQuery}` : ""}${location.hash || ""}`,
        { replace: options?.replace },
      );
    },
    [location.hash, location.pathname],
  );

  const deferredProjects = useDeferredValue(projects);
  const deferredTagTranslations = useDeferredValue(tagTranslations);
  const deferredGenreTranslations = useDeferredValue(genreTranslations);
  const isDeferredCatalogPending =
    deferredProjects !== projects ||
    deferredTagTranslations !== tagTranslations ||
    deferredGenreTranslations !== genreTranslations;
  const indexedProjects = useMemo(
    () =>
      buildIndexedPublicProjects({
        projects: deferredProjects,
        tagTranslations: deferredTagTranslations,
        genreTranslations: deferredGenreTranslations,
      }),
    [deferredGenreTranslations, deferredProjects, deferredTagTranslations],
  );
  const letterOptions = ALPHABET_FILTER_OPTIONS;
  const tagOptions = indexedProjects.tagOptions;
  const genreOptions = indexedProjects.genreOptions;
  const typeOptionValues = indexedProjects.typeOptions;
  const typeOptions = useMemo(
    () =>
      typeOptionValues.map((type) =>
        buildFilterOption(type, type === "Todos" ? "Todos os formatos" : type),
      ),
    [typeOptionValues],
  );
  const normalizedQueryTokens = useMemo(
    () => normalizeSearchText(selectedQuery).split(/\s+/).filter(Boolean),
    [selectedQuery],
  );

  const filteredProjects = useMemo(
    () =>
      indexedProjects.items
        .filter((item) => {
          const matchesTag = selectedTag === "Todas" || item.tagSet.has(selectedTag);
          const matchesGenre = selectedGenre === "Todos" || item.genreSet.has(selectedGenre);
          const matchesType = selectedType === "Todos" || item.type === selectedType;
          const matchesLetter = selectedLetter === "Todas" || item.firstLetter === selectedLetter;
          const matchesQuery =
            normalizedQueryTokens.length === 0 ||
            normalizedQueryTokens.every((token) => item.normalizedHaystack.includes(token));
          return matchesTag && matchesGenre && matchesType && matchesLetter && matchesQuery;
        })
        .map((item) => item.project),
    [
      indexedProjects.items,
      normalizedQueryTokens,
      selectedGenre,
      selectedLetter,
      selectedTag,
      selectedType,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / projectsPerPage));
  const pageStart = (currentPage - 1) * projectsPerPage;
  const paginatedProjects = filteredProjects.slice(pageStart, pageStart + projectsPerPage);
  const synopsisKeys = useMemo(
    () => paginatedProjects.map((project) => project.id),
    [paginatedProjects],
  );
  const resolveCatalogSynopsisMaxLines = useCallback(
    ({ columnWidth, defaultMaxLines }: { columnWidth: number; defaultMaxLines: number }) =>
      resolvePublicProjectCardResponsiveMaxLines({
        profile: catalogClampProfile(),
        columnWidth,
        defaultMaxLines,
      }),
    [],
  );
  const { rootRef: synopsisRootRef, lineByKey } = useDynamicSynopsisClamp({
    enabled: isClampReady && paginatedProjects.length > 0,
    keys: synopsisKeys,
    maxLines: catalogClampProfile().defaultMaxLines,
    resolveMaxLines: resolveCatalogSynopsisMaxLines,
  });
  const getSynopsisClampState = useCallback(
    (projectId: string) =>
      resolvePublicProjectCardClampState({
        profile: catalogClampProfile(),
        lines: lineByKey[projectId],
      }),
    [lineByKey],
  );

  useEffect(() => {
    if (searchInputValue === selectedQuery) {
      return;
    }
    const timeout = window.setTimeout(() => {
      commitSearchParams((params) => {
        const nextQuery = searchInputValue.trim();
        if (nextQuery) {
          params.set("q", nextQuery);
        } else {
          params.delete("q");
        }
        params.delete("page");
      });
    }, SEARCH_QUERY_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [commitSearchParams, searchInputValue, selectedQuery]);

  useEffect(() => {
    if (
      !hasCatalogSnapshot ||
      isLoadingProjects ||
      hasProjectsLoadError ||
      isDeferredCatalogPending
    ) {
      return;
    }
    if (selectedType === "Todos" || typeOptionValues.includes(selectedType)) {
      return;
    }
    commitSearchParams(
      (params) => {
        params.delete("type");
      },
      { replace: true },
    );
  }, [
    commitSearchParams,
    hasCatalogSnapshot,
    hasProjectsLoadError,
    isDeferredCatalogPending,
    isLoadingProjects,
    selectedType,
    typeOptionValues,
  ]);

  useEffect(() => {
    if (
      !hasCatalogSnapshot ||
      isLoadingProjects ||
      hasProjectsLoadError ||
      isDeferredCatalogPending
    ) {
      return;
    }
    if (selectedTag === "Todas" || tagOptions.some((option) => option.value === selectedTag)) {
      return;
    }
    commitSearchParams(
      (params) => {
        params.delete("tag");
      },
      { replace: true },
    );
  }, [
    commitSearchParams,
    hasCatalogSnapshot,
    hasProjectsLoadError,
    isDeferredCatalogPending,
    isLoadingProjects,
    selectedTag,
    tagOptions,
  ]);

  useEffect(() => {
    if (
      !hasCatalogSnapshot ||
      isLoadingProjects ||
      hasProjectsLoadError ||
      isDeferredCatalogPending
    ) {
      return;
    }
    if (
      selectedGenre === "Todos" ||
      genreOptions.some((option) => option.value === selectedGenre)
    ) {
      return;
    }
    commitSearchParams(
      (params) => {
        params.delete("genero");
        params.delete("genre");
      },
      { replace: true },
    );
  }, [
    commitSearchParams,
    genreOptions,
    hasCatalogSnapshot,
    hasProjectsLoadError,
    isDeferredCatalogPending,
    isLoadingProjects,
    selectedGenre,
  ]);

  useEffect(() => {
    if (
      !hasCatalogSnapshot ||
      isLoadingProjects ||
      hasProjectsLoadError ||
      isDeferredCatalogPending
    ) {
      return;
    }
    if (currentPage <= totalPages) {
      return;
    }
    commitSearchParams(
      (params) => {
        if (totalPages <= 1) {
          params.delete("page");
        } else {
          params.set("page", String(totalPages));
        }
      },
      { replace: true },
    );
  }, [
    commitSearchParams,
    currentPage,
    hasCatalogSnapshot,
    hasProjectsLoadError,
    isDeferredCatalogPending,
    isLoadingProjects,
    totalPages,
  ]);

  const handleFilterChange = useCallback(
    (key: "letter" | "tag" | "genero" | "type", value: string, emptyValue: "Todas" | "Todos") => {
      commitSearchParams((params) => {
        if (value === emptyValue) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
        if (key === "genero") {
          params.delete("genre");
        }
        params.delete("page");
      });
    },
    [commitSearchParams],
  );

  const handleLetterChange = useCallback(
    (value: string) => handleFilterChange("letter", parseLetterParam(value), "Todas"),
    [handleFilterChange],
  );
  const handleTagChange = useCallback(
    (value: string) => handleFilterChange("tag", value || "Todas", "Todas"),
    [handleFilterChange],
  );
  const handleGenreChange = useCallback(
    (value: string) => handleFilterChange("genero", value || "Todos", "Todos"),
    [handleFilterChange],
  );
  const handleTypeChange = useCallback(
    (value: string) => handleFilterChange("type", value || "Todos", "Todos"),
    [handleFilterChange],
  );
  const handlePageChange = useCallback(
    (nextPage: number) => {
      commitSearchParams((params) => {
        if (nextPage <= 1) {
          params.delete("page");
        } else {
          params.set("page", String(nextPage));
        }
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [commitSearchParams],
  );
  const resetFilters = useCallback(() => {
    commitSearchParams(
      (params) => {
        params.delete("tag");
        params.delete("genero");
        params.delete("genre");
        params.delete("letter");
        params.delete("type");
        params.delete("page");
        params.delete("q");
      },
      { replace: true },
    );
  }, [commitSearchParams]);

  const activeFilterCount = [
    selectedLetter !== "Todas",
    selectedTag !== "Todas",
    selectedGenre !== "Todos",
    selectedType !== "Todos",
  ].filter(Boolean).length;
  const activeFiltersSummary =
    activeFilterCount === 0
      ? "Nenhum filtro ativo"
      : activeFilterCount === 1
        ? "1 filtro ativo"
        : `${activeFilterCount} filtros ativos`;

  useEffect(() => {
    publishPublicRoutePayload({
      kind: "projects-list",
      generatedAt: projectsRoutePayload?.generatedAt || bootstrap?.generatedAt || "",
      projects,
      mediaVariants: projectsMediaVariants,
      tagTranslations: {
        tags: tagTranslations,
        genres: genreTranslations,
        staffRoles: bootstrapTagTranslations?.staffRoles || {},
      },
    });
  }, [
    bootstrapTagTranslations?.staffRoles,
    bootstrap?.generatedAt,
    genreTranslations,
    projects,
    projectsMediaVariants,
    projectsRoutePayload?.generatedAt,
    publishPublicRoutePayload,
    tagTranslations,
  ]);

  return (
    <div className="min-h-screen text-foreground">
      <main className="pt-20 md:pt-28">
        <section
          className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-20 reveal`}
          data-reveal
        >
          <ProjectsFiltersPanel
            isMobile={isMobile}
            isMobileFiltersOpen={isMobileFiltersOpen}
            onToggleMobileFilters={() => setIsMobileFiltersOpen((current) => !current)}
            searchInputValue={searchInputValue}
            onSearchInputChange={setSearchInputValue}
            letterOptions={letterOptions}
            selectedLetter={selectedLetter}
            selectedTag={selectedTag}
            selectedGenre={selectedGenre}
            selectedType={selectedType}
            tagOptions={tagOptions.length > 0 ? tagOptions : EMPTY_FILTER_OPTIONS}
            genreOptions={genreOptions.length > 0 ? genreOptions : EMPTY_FILTER_OPTIONS}
            typeOptions={typeOptions}
            filteredProjectsCount={filteredProjects.length}
            activeFiltersSummary={activeFiltersSummary}
            onLetterChange={handleLetterChange}
            onTagChange={handleTagChange}
            onGenreChange={handleGenreChange}
            onTypeChange={handleTypeChange}
            onResetFilters={resetFilters}
          />

          {isLoadingProjects ? (
            <AsyncState
              kind="loading"
              title="Carregando projetos"
              description="Estamos buscando os projetos publicados."
              className="mt-10"
            />
          ) : hasProjectsLoadError ? (
            <AsyncState
              kind="error"
              title="Não foi possível carregar os projetos"
              description="Verifique sua conexão e tente novamente."
              className="mt-10"
              action={
                <Button
                  variant="outline"
                  onClick={() => setProjectsLoadVersion((current) => current + 1)}
                >
                  Tentar novamente
                </Button>
              }
            />
          ) : paginatedProjects.length === 0 ? (
            <AsyncState
              kind="empty"
              title="Nenhum projeto encontrado."
              description="Ajuste os filtros para ampliar os resultados."
              className="mt-10"
              action={
                <Button variant="ghost" onClick={resetFilters} className="text-xs uppercase">
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <ProjectsGrid
              projects={paginatedProjects}
              tagTranslations={tagTranslations}
              genreTranslations={genreTranslations}
              navigate={navigate}
              mediaVariants={projectsMediaVariants}
              isMobile={isMobile}
              rootRef={synopsisRootRef}
              getSynopsisClampState={getSynopsisClampState}
            />
          )}

          {!isLoadingProjects &&
            !hasProjectsLoadError &&
            filteredProjects.length > projectsPerPage && (
              <div className="mt-12 flex justify-center">
                <CompactPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
        </section>
      </main>
    </div>
  );
};

export default Projects;
