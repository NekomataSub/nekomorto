import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ExternalLink,
  FileArchive,
  Loader2,
  Plus,
  Search,
} from "lucide-react";
import { memo, type KeyboardEvent as ReactKeyboardEvent } from "react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { Combobox, Input } from "@/components/dashboard/dashboard-form-controls";
import {
  dedicatedEditorSidebarBodyClassName,
  dedicatedEditorSidebarPanelClassName,
  dedicatedEditorSidebarScrollRegionClassName,
} from "@/components/dashboard/dedicated-editor-sidebar";
import { buildStageChapterLabel } from "@/components/project-reader/MangaWorkflowPanel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import type { ComboboxOption } from "@/components/ui/combobox";
import {
  type ChapterFilterMode,
  type ChapterStructureGroup,
  chapterHasContent,
  chapterStatusLabel,
} from "@/lib/dashboard-project-chapter";
import {
  buildDashboardProjectChapterEditorHref,
  buildProjectPublicReadingHref,
} from "@/lib/project-editor-routes";
import { buildEpisodeKey } from "@/lib/project-episode-key";
import {
  normalizeProjectEpisodeContentFormat,
  normalizeProjectEpisodePages,
} from "../../../../shared/project-reader.js";

import ChapterEditorAccordionHeader from "./ChapterEditorAccordionHeader";

export type { ChapterStructureGroup } from "@/lib/dashboard-project-chapter";

type StructureReorderState = {
  key: string;
  direction: "up" | "down";
} | null;

type ChapterEditorStructureSectionProps = {
  projectId: string;
  activeChapterKey: string | null;
  selectedStageChapterId: string | null;
  selectedStructureGroupKey: string;
  structureGroups: ChapterStructureGroup[];
  openStructureGroupKeys: string[];
  chapterSearchQuery: string;
  onChapterSearchQueryChange: (nextValue: string) => void;
  filterMode: ChapterFilterMode;
  onFilterModeChange: (nextValue: ChapterFilterMode) => void;
  onAddVolume: () => void;
  onAddChapter: (targetVolume: number | null) => void | Promise<void>;
  onSelectPendingStageChapter: (chapterId: string) => void | Promise<void>;
  onStructureVolumeInteraction: (groupKey: string, volume: number) => void | Promise<void>;
  onStructureVolumeExport: (volume: number, groupKey: string) => void | Promise<void>;
  onNavigateToHref: (href: string) => void | Promise<boolean>;
  onReorderStructureChapter: (chapterKey: string, direction: "up" | "down") => void | Promise<void>;
  supportsStructureReordering: boolean;
  structureChapterReorderState: StructureReorderState;
  structureVolumeExportKey: string | null;
  onToggleGroup: (groupKey: string) => void;
};

const structureSectionClassName = `project-editor-section ${dedicatedEditorSidebarPanelClassName}`;
const structureTriggerClassName =
  "project-editor-section-trigger flex w-full items-start gap-4 px-5 py-3.5 text-left hover:no-underline md:py-4 xl:shrink-0";
const structureContentClassName = `project-editor-section-content px-5 pb-5 ${dedicatedEditorSidebarBodyClassName}`;
const filterOptions: ComboboxOption[] = [
  { value: "all", label: "Todos" },
  { value: "draft", label: "Rascunhos" },
  { value: "published", label: "Publicados" },
  { value: "with-content", label: "Com conteúdo" },
  { value: "without-content", label: "Sem conteúdo" },
];

export const ChapterEditorStructureSection = memo(
  ({
    projectId,
    activeChapterKey,
    selectedStageChapterId,
    selectedStructureGroupKey,
    structureGroups,
    openStructureGroupKeys,
    chapterSearchQuery,
    onChapterSearchQueryChange,
    filterMode,
    onFilterModeChange,
    onAddVolume,
    onAddChapter,
    onSelectPendingStageChapter,
    onStructureVolumeInteraction,
    onStructureVolumeExport,
    onNavigateToHref,
    onReorderStructureChapter,
    supportsStructureReordering,
    structureChapterReorderState,
    structureVolumeExportKey,
    onToggleGroup,
  }: ChapterEditorStructureSectionProps) => (
    <Accordion
      type="single"
      collapsible
      defaultValue="structure"
      className="project-editor-accordion min-h-0 space-y-2.5"
    >
      <AccordionItem
        value="structure"
        className={structureSectionClassName}
        data-testid="chapter-structure-section"
      >
        <AccordionTrigger className={structureTriggerClassName}>
          <ChapterEditorAccordionHeader
            title="Estrutura"
            subtitle="Volumes, filtros, navegação e criação de capítulos"
          />
        </AccordionTrigger>
        <AccordionContent
          contentClassName="flex min-h-0 flex-1 flex-col"
          className={structureContentClassName}
        >
          <div
            className={`space-y-4 pr-1 ${dedicatedEditorSidebarScrollRegionClassName}`}
            data-testid="chapter-structure-scroll-region"
          >
            <div className="space-y-3 rounded-[20px] border border-border/50 bg-background/45 p-3.5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] 2xl:grid-cols-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={chapterSearchQuery}
                    onChange={(event) => onChapterSearchQueryChange(event.target.value)}
                    placeholder="Buscar capítulo..."
                    className="pl-9"
                  />
                </div>
                <Combobox
                  ariaLabel="Filtrar estrutura"
                  value={filterMode}
                  options={filterOptions}
                  searchable={false}
                  onValueChange={(value) => onFilterModeChange(value as ChapterFilterMode)}
                />
              </div>
              <div className="space-y-3" data-testid="chapter-structure-intro-row">
                <p
                  className="text-xs leading-5 text-muted-foreground"
                  data-testid="chapter-structure-intro-copy"
                >
                  Selecione volumes, navegue por capítulos e organize a estrutura editorial do
                  projeto.
                </p>
                <DashboardActionButton
                  type="button"
                  size="sm"
                  onClick={onAddVolume}
                  className="w-full justify-center"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Adicionar volume</span>
                </DashboardActionButton>
              </div>
            </div>

            <div className="space-y-2.5">
              {structureGroups.map((group) => {
                const isSelected = group.key === selectedStructureGroupKey;
                const isOpen = openStructureGroupKeys.includes(group.key);
                const hasVisibleItems =
                  group.visiblePendingItems.length > 0 || group.visibleItems.length > 0;
                const pendingCount = group.pendingItems.length;
                const hasExportablePublishedVolumeChapter =
                  group.volume !== null &&
                  group.allItems.some((episode) => {
                    const episodePages = normalizeProjectEpisodePages(episode.pages || []);
                    const isImageEpisode =
                      normalizeProjectEpisodeContentFormat(
                        episode.contentFormat,
                        episodePages.length > 0 ? "images" : "lexical",
                      ) === "images";
                    return (
                      episode.publicationStatus === "published" &&
                      isImageEpisode &&
                      (episodePages.length > 0 || episode.hasPages === true)
                    );
                  });
                const isExportingVolume = structureVolumeExportKey === group.key;
                const emptyMessage =
                  group.chapterCount > 0 || pendingCount > 0
                    ? "Nenhum capítulo corresponde ao filtro atual neste grupo."
                    : group.volume !== null
                      ? "Nenhum capítulo vinculado a este volume ainda."
                      : "Nenhum capítulo sem volume ainda.";

                return (
                  <section
                    key={group.key}
                    className={`overflow-hidden rounded-[20px] border bg-background/40 ${
                      isSelected ? "border-primary/45 bg-primary/6" : "border-border/50"
                    }`}
                    data-testid={`chapter-structure-group-${group.key}`}
                  >
                    <div
                      className={`space-y-3 px-4 py-4 ${
                        isOpen ? "border-b border-border/50" : ""
                      } ${isSelected ? "bg-primary/4" : ""}`}
                      data-testid={`chapter-structure-group-header-${group.key}`}
                    >
                      <div className="flex items-start gap-3">
                        {group.volume !== null ? (
                          <button
                            type="button"
                            data-testid={`chapter-structure-select-${group.key}`}
                            onClick={() => {
                              void onStructureVolumeInteraction(group.key, group.volume as number);
                            }}
                            className="min-w-0 flex-1 self-stretch text-left"
                          >
                            <div
                              className="min-w-0 space-y-2"
                              data-testid={`chapter-structure-group-main-${group.key}`}
                            >
                              <div className="min-w-0 space-y-1">
                                <p className="text-sm font-semibold tracking-tight text-foreground">
                                  {group.label}
                                </p>
                                <p className="text-xs leading-5 text-muted-foreground">
                                  {group.chapterCount > 0 || pendingCount > 0
                                    ? `${group.chapterCount} salvo(s)${
                                        pendingCount > 0 ? ` + ${pendingCount} em importação` : ""
                                      }`
                                    : "Nenhum capítulo vinculado"}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={group.hasMetadata ? "secondary" : "outline"}>
                                  {group.hasMetadata ? "Metadados" : "Sem metadados"}
                                </Badge>
                                {pendingCount > 0 ? (
                                  <Badge variant="outline">Importação {pendingCount}</Badge>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onToggleGroup(group.key)}
                            className="min-w-0 flex-1 self-stretch text-left"
                            data-testid={`chapter-structure-group-main-${group.key}`}
                          >
                            <p className="text-sm font-semibold text-foreground">{group.label}</p>
                            <p className="text-xs leading-5 text-muted-foreground">
                              {group.chapterCount > 0 || pendingCount > 0
                                ? `${group.chapterCount} salvo(s)${
                                    pendingCount > 0 ? ` + ${pendingCount} em importação` : ""
                                  }`
                                : "Agrupe aqui capítulos fora de volume"}
                            </p>
                          </button>
                        )}
                        <DashboardActionButton
                          type="button"
                          size="icon"
                          data-testid={`chapter-structure-group-toggle-${group.key}`}
                          aria-label={`Alternar ${group.label}`}
                          aria-expanded={isOpen}
                          onClick={() => onToggleGroup(group.key)}
                          className="mt-0.5 shrink-0 self-start"
                        >
                          <ChevronRight
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                            aria-hidden="true"
                          />
                        </DashboardActionButton>
                      </div>
                      <div
                        className="flex gap-2"
                        data-testid={`chapter-structure-group-actions-${group.key}`}
                      >
                        <DashboardActionButton
                          type="button"
                          size="sm"
                          data-testid={`chapter-structure-add-chapter-${group.key}`}
                          onClick={() => {
                            void onAddChapter(group.volume);
                          }}
                          className="flex-1 justify-center rounded-xl"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          <span>Adicionar capítulo</span>
                        </DashboardActionButton>
                        {hasExportablePublishedVolumeChapter && group.volume !== null ? (
                          <DashboardActionButton
                            type="button"
                            size="sm"
                            data-testid={`chapter-structure-export-volume-${group.key}`}
                            onClick={() => {
                              void onStructureVolumeExport(group.volume as number, group.key);
                            }}
                            disabled={isExportingVolume}
                            className="shrink-0 justify-center rounded-xl px-3"
                          >
                            {isExportingVolume ? (
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                            ) : (
                              <FileArchive className="h-4 w-4" aria-hidden="true" />
                            )}
                            <span>ZIP</span>
                          </DashboardActionButton>
                        ) : null}
                      </div>
                    </div>
                    {isOpen ? (
                      <div className="space-y-2.5 p-3.5">
                        {hasVisibleItems ? (
                          <>
                            {group.visiblePendingItems.map((chapter) => {
                              const isActivePending = chapter.id === selectedStageChapterId;
                              return (
                                <button
                                  key={chapter.id}
                                  type="button"
                                  data-testid={`chapter-structure-stage-select-${chapter.id}`}
                                  onClick={() => {
                                    void onSelectPendingStageChapter(chapter.id);
                                  }}
                                  className={`w-full rounded-[18px] border px-3.5 py-3 text-left transition ${
                                    isActivePending
                                      ? "border-primary/50 bg-primary/[0.07]"
                                      : "border-border/50 bg-background/55 hover:bg-background/78"
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                        {chapter.operation === "update" ? "Atualizar" : "Importar"}
                                      </p>
                                      <p className="line-clamp-2 text-sm font-semibold text-foreground">
                                        {buildStageChapterLabel(chapter)}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <Badge variant="outline">Importação</Badge>
                                      <Badge
                                        variant={
                                          chapter.publicationStatus === "draft"
                                            ? "outline"
                                            : "secondary"
                                        }
                                      >
                                        {chapter.publicationStatus === "draft"
                                          ? "Rascunho"
                                          : "Publicado"}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span>
                                      {chapter.pages.length > 0
                                        ? `${chapter.pages.length} página(s)`
                                        : "Sem páginas"}
                                    </span>
                                    {chapter.warnings.length > 0 ? (
                                      <span>- {chapter.warnings.length} aviso(s)</span>
                                    ) : null}
                                  </div>
                                </button>
                              );
                            })}
                            {group.visibleItems.map((episode) => {
                              const episodeKey = buildEpisodeKey(episode.number, episode.volume);
                              const href = buildDashboardProjectChapterEditorHref(
                                projectId,
                                episode.number,
                                episode.volume,
                              );
                              const readingHref = buildProjectPublicReadingHref(
                                projectId,
                                episode.number,
                                episode.volume,
                              );
                              const isActive = episodeKey === activeChapterKey;
                              const episodePages = normalizeProjectEpisodePages(
                                episode.pages || [],
                              );
                              const isImageEpisode =
                                normalizeProjectEpisodeContentFormat(
                                  episode.contentFormat,
                                  episodePages.length > 0 ? "images" : "lexical",
                                ) === "images";
                              const groupEpisodeKeys = group.allItems.map((item) =>
                                buildEpisodeKey(item.number, item.volume),
                              );
                              const structurePosition = groupEpisodeKeys.indexOf(episodeKey);
                              const canMoveUp =
                                supportsStructureReordering && structurePosition > 0;
                              const canMoveDown =
                                supportsStructureReordering &&
                                structurePosition >= 0 &&
                                structurePosition < groupEpisodeKeys.length - 1;
                              const hasReadableChapter =
                                chapterHasContent(episode) ||
                                (isImageEpisode &&
                                  (episodePages.length > 0 || episode.hasPages === true));
                              const canOpenReadingPage =
                                episode.publicationStatus === "published" && hasReadableChapter;
                              const isReorderingEpisodeUp =
                                structureChapterReorderState?.key === episodeKey &&
                                structureChapterReorderState.direction === "up";
                              const isReorderingEpisodeDown =
                                structureChapterReorderState?.key === episodeKey &&
                                structureChapterReorderState.direction === "down";
                              const showStructureActions =
                                supportsStructureReordering || canOpenReadingPage;
                              const handleOpenEpisode = () => void onNavigateToHref(href);
                              const handleOpenReadingPage = () => {
                                if (typeof window === "undefined" || !canOpenReadingPage) {
                                  return;
                                }
                                window.open(readingHref, "_blank", "noopener,noreferrer");
                              };
                              const handleEpisodeCardKeyDown = (
                                event: ReactKeyboardEvent<HTMLDivElement>,
                              ) => {
                                if (event.target !== event.currentTarget) {
                                  return;
                                }
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  handleOpenEpisode();
                                }
                              };

                              return (
                                <div
                                  key={episodeKey}
                                  data-testid={`chapter-structure-episode-open-${episodeKey}`}
                                  data-state={isActive ? "active" : "idle"}
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Abrir capítulo ${episode.number}`}
                                  onClick={handleOpenEpisode}
                                  onKeyDown={handleEpisodeCardKeyDown}
                                  className={`w-full cursor-pointer rounded-[18px] border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${
                                    isActive
                                      ? "border-primary/50 bg-primary/[0.07]"
                                      : "border-border/50 bg-background/55 hover:bg-background/78"
                                  }`}
                                >
                                  <div className="space-y-3">
                                    <div
                                      className="space-y-3"
                                      data-testid={`chapter-structure-episode-content-${episodeKey}`}
                                    >
                                      <div
                                        className="flex items-start justify-between gap-3"
                                        data-testid={`chapter-structure-episode-header-${episodeKey}`}
                                      >
                                        <div className="min-w-0 space-y-1">
                                          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                                            Capítulo {episode.number}
                                          </p>
                                          <p className="line-clamp-2 text-sm font-semibold text-foreground">
                                            {String(episode.title || "").trim() ||
                                              `Capítulo ${episode.number}`}
                                          </p>
                                        </div>
                                        <Badge
                                          variant={
                                            episode.publicationStatus === "draft"
                                              ? "outline"
                                              : "secondary"
                                          }
                                          className="shrink-0 self-start"
                                        >
                                          {chapterStatusLabel(episode)}
                                        </Badge>
                                      </div>
                                    </div>
                                    <div
                                      className="flex items-end justify-between gap-3"
                                      data-testid={`chapter-structure-episode-footer-${episodeKey}`}
                                    >
                                      <div
                                        className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground"
                                        data-testid={`chapter-structure-episode-meta-${episodeKey}`}
                                      >
                                        <span>
                                          {chapterHasContent(episode)
                                            ? "Com leitura"
                                            : "Sem leitura"}
                                        </span>
                                        {episode.sources?.length ? (
                                          <span>- {episode.sources.length} fonte(s)</span>
                                        ) : null}
                                      </div>
                                      {showStructureActions ? (
                                        <div
                                          className="flex shrink-0 items-center gap-2"
                                          data-testid={`chapter-structure-episode-actions-${episodeKey}`}
                                        >
                                          {supportsStructureReordering ? (
                                            <>
                                              <DashboardActionButton
                                                type="button"
                                                size="icon"
                                                tone="neutral"
                                                data-testid={`chapter-structure-episode-move-up-${episodeKey}`}
                                                aria-label={`Mover capítulo ${episode.number} para cima`}
                                                className="h-9 w-9 rounded-xl bg-background/92"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void onReorderStructureChapter(episodeKey, "up");
                                                }}
                                                disabled={
                                                  !canMoveUp ||
                                                  Boolean(structureChapterReorderState)
                                                }
                                              >
                                                {isReorderingEpisodeUp ? (
                                                  <Loader2
                                                    className="h-4 w-4 animate-spin"
                                                    aria-hidden="true"
                                                  />
                                                ) : (
                                                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                                                )}
                                              </DashboardActionButton>
                                              <DashboardActionButton
                                                type="button"
                                                size="icon"
                                                tone="neutral"
                                                data-testid={`chapter-structure-episode-move-down-${episodeKey}`}
                                                aria-label={`Mover capítulo ${episode.number} para baixo`}
                                                className="h-9 w-9 rounded-xl bg-background/92"
                                                onClick={(event) => {
                                                  event.stopPropagation();
                                                  void onReorderStructureChapter(
                                                    episodeKey,
                                                    "down",
                                                  );
                                                }}
                                                disabled={
                                                  !canMoveDown ||
                                                  Boolean(structureChapterReorderState)
                                                }
                                              >
                                                {isReorderingEpisodeDown ? (
                                                  <Loader2
                                                    className="h-4 w-4 animate-spin"
                                                    aria-hidden="true"
                                                  />
                                                ) : (
                                                  <ArrowDown
                                                    className="h-4 w-4"
                                                    aria-hidden="true"
                                                  />
                                                )}
                                              </DashboardActionButton>
                                            </>
                                          ) : null}
                                          {canOpenReadingPage ? (
                                            <DashboardActionButton
                                              type="button"
                                              size="icon"
                                              tone="neutral"
                                              data-testid={`chapter-structure-episode-open-icon-${episodeKey}`}
                                              aria-label={`Abrir leitura do capítulo ${episode.number} em nova aba`}
                                              className="h-9 w-9 rounded-xl bg-background/92"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                handleOpenReadingPage();
                                              }}
                                            >
                                              <ExternalLink
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                              />
                                            </DashboardActionButton>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div className="rounded-[18px] border border-dashed border-border/60 bg-background/30 px-4 py-4 text-sm text-muted-foreground">
                            {emptyMessage}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
);

ChapterEditorStructureSection.displayName = "ChapterEditorStructureSection";

export default ChapterEditorStructureSection;
