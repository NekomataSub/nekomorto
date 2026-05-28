import type { StageChapter } from "@/components/project-reader/MangaWorkflowPanel";
import type { ProjectEpisode, ProjectVolumeCover, ProjectVolumeEntry } from "@/data/projects";
import { buildEpisodeKey, resolveNextMainEpisodeNumber } from "@/lib/project-episode-key";
import type { EpubImportPreviewPayload } from "@/lib/project-epub";
import type { ProjectProgressKind } from "@/lib/project-progress";
import { syncProjectProgress } from "@/lib/project-progress";
import { isLightNovelType, isMangaType } from "@/lib/project-utils";
import { buildVolumeCoverKey } from "@/lib/project-volume-cover-key";
import { normalizeProjectVolumeEntries } from "@/lib/project-volume-entries";
import { comparePtBr } from "@/lib/search-ranking";
import {
  hasProjectEpisodeReadableContent,
  normalizeProjectEpisodeContentFormat,
  normalizeProjectEpisodePages,
} from "../../shared/project-reader.js";

export type ChapterFilterMode = "all" | "draft" | "published" | "with-content" | "without-content";

export type EditableVolumeOption = {
  volume: number;
  chapterCount: number;
  hasMetadata: boolean;
};

export type ChapterStructureGroup = {
  key: string;
  label: string;
  volume: number | null;
  hasMetadata: boolean;
  chapterCount: number;
  allItems: ProjectEpisode[];
  visibleItems: ProjectEpisode[];
  pendingItems: StageChapter[];
  visiblePendingItems: StageChapter[];
};

type ProjectSnapshotWithVolumes = {
  volumeEntries?: ProjectVolumeEntry[] | null;
  volumeCovers?: ProjectVolumeCover[] | null;
};

type ChapterOrderProjectSnapshot = ProjectSnapshotWithVolumes & {
  episodeDownloads?: ProjectEpisode[];
  type?: string;
};

export const chapterHasContent = (episode: ProjectEpisode | null | undefined) =>
  hasProjectEpisodeReadableContent(episode);

export const chapterStatusLabel = (episode: ProjectEpisode | null | undefined) =>
  episode?.publicationStatus === "draft" ? "Rascunho" : "Publicado";

export const normalizePositiveInteger = (value: number, fallback?: number) => {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

export const normalizeNonNegativeInteger = (value: unknown, fallback?: number) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  return normalized >= 0 ? normalized : fallback;
};

export const resolveChapterEntrySubtype = (entryKind: ProjectEpisode["entryKind"]) =>
  entryKind === "extra" ? "extra" : "chapter";

export const sortChapters = (episodes: ProjectEpisode[]) =>
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
    const volumeDelta = (Number(left.volume) || 0) - (Number(right.volume) || 0);
    if (volumeDelta !== 0) {
      return volumeDelta;
    }
    const numberDelta = (Number(left.number) || 0) - (Number(right.number) || 0);
    if (numberDelta !== 0) {
      return numberDelta;
    }
    return comparePtBr(left.title || "", right.title || "");
  });

export const buildChapterVolumeLabel = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "Sem volume";
  }
  return `Volume ${Math.floor(parsed)}`;
};

const buildEmptyVolumeEntry = (volume: number): ProjectVolumeEntry => ({
  volume,
  synopsis: "",
  coverImageUrl: "",
  coverImageAlt: "",
});

export const findChapterStructureGroupElement = (groupKey: string) => {
  if (typeof document === "undefined") {
    return null;
  }
  return document.querySelector<HTMLElement>(`[data-testid="chapter-structure-group-${groupKey}"]`);
};

export const buildChapterStructureGroupKey = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? String(Math.floor(parsed)) : "none";
};

export const groupChaptersByStructureKey = (episodes: ProjectEpisode[]) => {
  const groups = new Map<string, ProjectEpisode[]>();
  (Array.isArray(episodes) ? episodes : []).forEach((episode) => {
    const key = buildChapterStructureGroupKey(episode.volume);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(episode);
  });
  return groups;
};

export const groupStageChaptersByStructureKey = (chapters: StageChapter[]) => {
  const groups = new Map<string, StageChapter[]>();
  (Array.isArray(chapters) ? chapters : []).forEach((chapter) => {
    const key = buildChapterStructureGroupKey(chapter.volume);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(chapter);
  });
  return groups;
};

export const matchesFilter = (episode: ProjectEpisode, mode: ChapterFilterMode) => {
  if (mode === "draft") {
    return episode.publicationStatus === "draft";
  }
  if (mode === "published") {
    return episode.publicationStatus !== "draft";
  }
  if (mode === "with-content") {
    return chapterHasContent(episode);
  }
  if (mode === "without-content") {
    return !chapterHasContent(episode);
  }
  return true;
};

export const matchesChapterSearch = (episode: ProjectEpisode, query: string) => {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const haystack = [
    episode.number,
    episode.volume,
    episode.title,
    episode.displayLabel,
    episode.synopsis,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(normalizedQuery);
};

export const matchesStageChapterFilter = (chapter: StageChapter, mode: ChapterFilterMode) => {
  if (mode === "draft") {
    return chapter.publicationStatus === "draft";
  }
  if (mode === "published") {
    return chapter.publicationStatus !== "draft";
  }
  if (mode === "with-content") {
    return chapter.pages.length > 0;
  }
  if (mode === "without-content") {
    return chapter.pages.length === 0;
  }
  return true;
};

export const matchesStageChapterSearch = (chapter: StageChapter, query: string) => {
  const normalizedQuery = String(query || "")
    .trim()
    .toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  const haystack = [
    chapter.number,
    chapter.volume,
    chapter.title,
    chapter.sourceLabel,
    chapter.titleDetected,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
  return haystack.includes(normalizedQuery);
};

export const normalizeEpubImportPreviewPayload = (
  value: unknown,
): EpubImportPreviewPayload | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as EpubImportPreviewPayload)
    : null;

export const resolveImportedChapterCount = (
  payload: EpubImportPreviewPayload | null | undefined,
  chapters: ProjectEpisode[],
) => {
  const summaryChapterCount = Number(payload?.summary?.chapters);
  return Number.isFinite(summaryChapterCount) ? summaryChapterCount : chapters.length;
};

export const supportsStructureChapterReordering = (projectType?: string | null) =>
  isLightNovelType(projectType) || isMangaType(projectType);

export const EMPTY_CHAPTER_DRAFT: ProjectEpisode = {
  number: 1,
  title: "",
  synopsis: "",
  releaseDate: "",
  duration: "",
  sourceType: "TV",
  sources: [],
  completedStages: [],
  content: "",
  contentFormat: "lexical",
  pages: [],
  pageCount: 0,
  hasPages: false,
  publicationStatus: "draft",
  coverImageUrl: "",
  coverImageAlt: "",
};

export const IMAGE_PUBLICATION_PAGES_REQUIRED_MESSAGE =
  "Capítulos em imagem precisam ter ao menos uma página para serem publicados.";
export const VOLUME_REQUIRED_IDENTITY_MESSAGE =
  "Informe o volume para salvar um capítulo com número ambíguo.";
export const VOLUME_REQUIRED_SAVE_DIALOG_DESCRIPTION =
  "Esse salvamento foi bloqueado porque a URL do editor ficaria ambígua. Informe o volume antes de salvar este capítulo.";

export const buildNewChapterDraft = (
  episodes: ProjectEpisode[],
  options: { volume?: number; projectType?: string | null } = {},
) =>
  normalizeChapterForEditor({
    ...EMPTY_CHAPTER_DRAFT,
    number: resolveNextMainEpisodeNumber(
      options.volume === undefined
        ? episodes.map((episode) => ({
            ...episode,
            volume: undefined,
          }))
        : episodes,
      { volume: options.volume },
    ),
    volume: options.volume,
    title: "",
    synopsis: "",
    entryKind: "main",
    entrySubtype: "chapter",
    releaseDate: "",
    duration: "",
    coverImageUrl: "",
    coverImageAlt: "",
    sourceType: "TV",
    sources: [],
    progressStage: "aguardando-raw",
    completedStages: [],
    content: "",
    contentFormat: isMangaType(options.projectType || "") ? "images" : "lexical",
    pages: [],
    pageCount: 0,
    hasPages: false,
    publicationStatus: "draft",
  });

export const compareChapterStructureGroupKeys = (leftKey: string, rightKey: string) => {
  if (leftKey === rightKey) {
    return 0;
  }
  if (leftKey === "none") {
    return 1;
  }
  if (rightKey === "none") {
    return -1;
  }
  return (Number(leftKey) || 0) - (Number(rightKey) || 0);
};

export const normalizeChapterState = (
  chapter: ProjectEpisode,
  progressKind?: ProjectProgressKind,
  options?: { preserveEmptySources?: boolean },
): ProjectEpisode => {
  const parsedNumber = Number(chapter.number);
  const parsedReadingOrder = Number(chapter.readingOrder);
  const parsedSizeBytes = Number(chapter.sizeBytes);
  const entryKind: NonNullable<ProjectEpisode["entryKind"]> =
    String(chapter.entryKind || "")
      .trim()
      .toLowerCase() === "extra"
      ? "extra"
      : "main";
  const normalizedPages = normalizeProjectEpisodePages(chapter.pages);
  const contentFormat = normalizeProjectEpisodeContentFormat(
    chapter.contentFormat,
    normalizedPages.length > 0 ? "images" : "lexical",
  );
  const normalizedChapter: ProjectEpisode = {
    ...chapter,
    number: normalizePositiveInteger(parsedNumber, 1) ?? 1,
    volume: normalizeNonNegativeInteger(chapter.volume),
    title: String(chapter.title || ""),
    entryKind,
    entrySubtype: resolveChapterEntrySubtype(entryKind),
    readingOrder: Number.isFinite(parsedReadingOrder) ? Math.floor(parsedReadingOrder) : undefined,
    displayLabel:
      entryKind === "extra" ? String(chapter.displayLabel || "").trim() || undefined : undefined,
    synopsis: String(chapter.synopsis || ""),
    releaseDate: String(chapter.releaseDate || "").trim(),
    duration: String(chapter.duration || "").trim(),
    coverImageAlt: String(chapter.coverImageAlt || ""),
    sourceType:
      chapter.sourceType === "Web" || chapter.sourceType === "Blu-ray" ? chapter.sourceType : "TV",
    sources: (Array.isArray(chapter.sources) ? chapter.sources : [])
      .map((source) => ({
        label: String(source.label || "").trim(),
        url: String(source.url || "").trim(),
      }))
      .filter((source) => options?.preserveEmptySources || source.label || source.url),
    hash: String(chapter.hash || "").trim() || undefined,
    sizeBytes:
      Number.isFinite(parsedSizeBytes) && parsedSizeBytes > 0
        ? Math.floor(parsedSizeBytes)
        : undefined,
    progressStage: String(chapter.progressStage || "").trim() || undefined,
    completedStages: Array.isArray(chapter.completedStages)
      ? Array.from(
          new Set(chapter.completedStages.map((item) => String(item || "").trim()).filter(Boolean)),
        )
      : [],
    content: contentFormat === "images" ? "" : String(chapter.content || ""),
    contentFormat,
    pages: normalizedPages,
    pageCount: normalizedPages.length,
    hasPages: normalizedPages.length > 0,
    coverImageUrl: String(chapter.coverImageUrl || "").trim() || normalizedPages[0]?.imageUrl || "",
    publicationStatus: chapter.publicationStatus === "published" ? "published" : "draft",
    chapterUpdatedAt: String(chapter.chapterUpdatedAt || "").trim() || undefined,
  };
  return progressKind ? syncProjectProgress(normalizedChapter, progressKind) : normalizedChapter;
};

export const normalizeChapterForSave = (
  chapter: ProjectEpisode,
  progressKind?: ProjectProgressKind,
) => normalizeChapterState(chapter, progressKind);

export const normalizeChapterForEditor = (
  chapter: ProjectEpisode,
  progressKind?: ProjectProgressKind,
) => normalizeChapterState(chapter, progressKind, { preserveEmptySources: true });

export const buildChapterSnapshot = (
  chapter: ProjectEpisode | null,
  progressKind?: ProjectProgressKind,
) => (chapter ? JSON.stringify(normalizeChapterForEditor(chapter, progressKind)) : "");

export const normalizeOriginLabel = (value: unknown) => {
  const normalized = String(value || "").trim();
  return normalized || "indisponivel";
};

export const buildVolumeCoverAltFallback = (volume: number) => `Capa do volume ${volume}`;

export const normalizeVolumeEntriesForSave = (entries: ProjectVolumeEntry[] | null | undefined) =>
  normalizeProjectVolumeEntries(entries).map((entry) => {
    const coverImageUrl = String(entry.coverImageUrl || "").trim();
    return {
      volume: entry.volume,
      synopsis: String(entry.synopsis || "").trim(),
      coverImageUrl,
      coverImageAlt: coverImageUrl
        ? String(entry.coverImageAlt || "").trim() || buildVolumeCoverAltFallback(entry.volume)
        : "",
    };
  });

export const buildVolumeEntriesSnapshot = (entries: ProjectVolumeEntry[] | null | undefined) =>
  JSON.stringify(normalizeProjectVolumeEntries(entries));

export const buildProjectSnapshotWithVolumeEntries = <T extends ProjectSnapshotWithVolumes>(
  project: T,
  entries: ProjectVolumeEntry[] | null | undefined,
): T => {
  const volumeEntries = normalizeVolumeEntriesForSave(entries);
  const volumeCovers = volumeEntries
    .filter((entry) => String(entry.coverImageUrl || "").trim())
    .map((entry) => ({
      volume: entry.volume,
      coverImageUrl: entry.coverImageUrl,
      coverImageAlt: entry.coverImageAlt || buildVolumeCoverAltFallback(entry.volume),
    }));
  return {
    ...project,
    volumeEntries,
    volumeCovers,
  };
};

export const findProjectVolumeEntryByVolume = (
  entries: ProjectVolumeEntry[] | null | undefined,
  volume: number | null | undefined,
) => {
  const normalizedVolume = normalizePositiveInteger(Number(volume));
  if (normalizedVolume === undefined) {
    return null;
  }
  return (
    normalizeProjectVolumeEntries(entries).find(
      (entry) => buildVolumeCoverKey(entry.volume) === buildVolumeCoverKey(normalizedVolume),
    ) || null
  );
};

export const updateProjectVolumeEntriesDraft = (
  entries: ProjectVolumeEntry[] | null | undefined,
  volume: number,
  updater: (entry: ProjectVolumeEntry) => ProjectVolumeEntry,
) => {
  const normalizedVolume = normalizePositiveInteger(Number(volume));
  const nextEntries = normalizeProjectVolumeEntries(entries);
  if (normalizedVolume === undefined) {
    return nextEntries;
  }

  const existingEntry = findProjectVolumeEntryByVolume(nextEntries, normalizedVolume);
  const updatedEntry = updater(existingEntry || buildEmptyVolumeEntry(normalizedVolume));
  return normalizeProjectVolumeEntries([
    ...nextEntries.filter(
      (entry) => buildVolumeCoverKey(entry.volume) !== buildVolumeCoverKey(normalizedVolume),
    ),
    {
      ...updatedEntry,
      volume: normalizedVolume,
    },
  ]);
};

export const ensureProjectVolumeEntryDraft = (
  entries: ProjectVolumeEntry[] | null | undefined,
  volume: number | null,
) => {
  const normalizedVolume = normalizePositiveInteger(Number(volume));
  if (normalizedVolume === undefined) {
    return {
      entries: normalizeProjectVolumeEntries(entries),
      selectedVolume: null,
    };
  }

  if (findProjectVolumeEntryByVolume(entries, normalizedVolume)) {
    return {
      entries: normalizeProjectVolumeEntries(entries),
      selectedVolume: normalizedVolume,
    };
  }

  return {
    entries: normalizeProjectVolumeEntries([
      ...normalizeProjectVolumeEntries(entries),
      buildEmptyVolumeEntry(normalizedVolume),
    ]),
    selectedVolume: normalizedVolume,
  };
};

export const appendNextProjectVolumeEntryDraft = (
  entries: ProjectVolumeEntry[] | null | undefined,
) => {
  const normalizedEntries = normalizeProjectVolumeEntries(entries);
  const nextVolume =
    normalizedEntries.reduce(
      (maxValue, entry) => Math.max(maxValue, Number(entry.volume) || 0),
      0,
    ) + 1;
  return {
    entries: normalizeProjectVolumeEntries([
      ...normalizedEntries,
      buildEmptyVolumeEntry(nextVolume),
    ]),
    selectedVolume: nextVolume,
  };
};

export const hasExplicitReadingOrder = (episodes: ProjectEpisode[]) =>
  (Array.isArray(episodes) ? episodes : []).some((episode) =>
    Number.isFinite(Number(episode?.readingOrder)),
  );

export const renumberChapterReadingOrderSequence = (episodes: ProjectEpisode[]) =>
  episodes.map((episode, index) =>
    normalizeChapterForSave({
      ...episode,
      readingOrder: index + 1,
    }),
  );

export const insertEpisodesAtGroupBoundary = (
  orderedEpisodes: ProjectEpisode[],
  groupKey: string,
  insertedEpisodes: ProjectEpisode[],
) => {
  if (!insertedEpisodes.length) {
    return orderedEpisodes;
  }

  const lastGroupIndex = orderedEpisodes.reduce((lastIndex, episode, index) => {
    return buildChapterStructureGroupKey(episode.volume) === groupKey ? index : lastIndex;
  }, -1);

  if (lastGroupIndex >= 0) {
    return [
      ...orderedEpisodes.slice(0, lastGroupIndex + 1),
      ...insertedEpisodes,
      ...orderedEpisodes.slice(lastGroupIndex + 1),
    ];
  }

  const nextGroupIndex = orderedEpisodes.findIndex(
    (episode) =>
      compareChapterStructureGroupKeys(buildChapterStructureGroupKey(episode.volume), groupKey) > 0,
  );

  if (nextGroupIndex >= 0) {
    return [
      ...orderedEpisodes.slice(0, nextGroupIndex),
      ...insertedEpisodes,
      ...orderedEpisodes.slice(nextGroupIndex),
    ];
  }

  return [...orderedEpisodes, ...insertedEpisodes];
};

export const preserveManualChapterReadingOrder = (
  previousEpisodes: ProjectEpisode[],
  nextEpisodes: ProjectEpisode[],
) => {
  const normalizedPreviousEpisodes = sortChapters(previousEpisodes).map((episode) =>
    normalizeChapterForSave(episode),
  );
  if (!hasExplicitReadingOrder(normalizedPreviousEpisodes)) {
    return nextEpisodes;
  }

  const normalizedNextEpisodes = (Array.isArray(nextEpisodes) ? nextEpisodes : []).map((episode) =>
    normalizeChapterForSave(episode),
  );
  const nextEpisodeByKey = new Map(
    normalizedNextEpisodes.map((episode) => [
      buildEpisodeKey(episode.number, episode.volume),
      episode,
    ]),
  );

  let orderedEpisodes = normalizedPreviousEpisodes
    .map((episode) => nextEpisodeByKey.get(buildEpisodeKey(episode.number, episode.volume)) || null)
    .filter((episode): episode is ProjectEpisode => Boolean(episode));

  const existingEpisodeKeySet = new Set(
    orderedEpisodes.map((episode) => buildEpisodeKey(episode.number, episode.volume)),
  );
  const insertedEpisodes = normalizedNextEpisodes.filter(
    (episode) => !existingEpisodeKeySet.has(buildEpisodeKey(episode.number, episode.volume)),
  );
  const insertedEpisodesByGroup = groupChaptersByStructureKey(sortChapters(insertedEpisodes));

  Array.from(insertedEpisodesByGroup.keys())
    .sort(compareChapterStructureGroupKeys)
    .forEach((groupKey) => {
      orderedEpisodes = insertEpisodesAtGroupBoundary(
        orderedEpisodes,
        groupKey,
        insertedEpisodesByGroup.get(groupKey) || [],
      );
    });

  return renumberChapterReadingOrderSequence(orderedEpisodes);
};

export const reorderChaptersWithinStructureGroup = (
  episodes: ProjectEpisode[],
  chapterKey: string,
  direction: "up" | "down",
) => {
  const orderedEpisodes = sortChapters(episodes).map((episode) => normalizeChapterForSave(episode));
  const targetIndex = orderedEpisodes.findIndex(
    (episode) => buildEpisodeKey(episode.number, episode.volume) === chapterKey,
  );
  if (targetIndex < 0) {
    return null;
  }

  const targetGroupKey = buildChapterStructureGroupKey(orderedEpisodes[targetIndex]?.volume);
  const groupIndexes = orderedEpisodes.reduce<number[]>((indexes, episode, index) => {
    if (buildChapterStructureGroupKey(episode.volume) === targetGroupKey) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const currentGroupIndex = groupIndexes.indexOf(targetIndex);
  const nextGroupIndex = direction === "up" ? currentGroupIndex - 1 : currentGroupIndex + 1;

  if (currentGroupIndex < 0 || nextGroupIndex < 0 || nextGroupIndex >= groupIndexes.length) {
    return null;
  }

  const swapTargetIndex = groupIndexes[nextGroupIndex];
  const reorderedEpisodes = [...orderedEpisodes];
  const [movedEpisode] = reorderedEpisodes.splice(targetIndex, 1);
  reorderedEpisodes.splice(swapTargetIndex, 0, movedEpisode);
  return renumberChapterReadingOrderSequence(reorderedEpisodes);
};

export const normalizeProjectSnapshotChapterOrderForPersist = <
  TPrevious extends ChapterOrderProjectSnapshot | null | undefined,
  TNext extends ChapterOrderProjectSnapshot,
>(
  previousProject: TPrevious,
  nextProject: TNext,
): TNext => {
  if (!supportsStructureChapterReordering(nextProject.type || previousProject?.type || "")) {
    return nextProject;
  }

  const previousEpisodes = Array.isArray(previousProject?.episodeDownloads)
    ? previousProject.episodeDownloads
    : [];
  const nextEpisodes = Array.isArray(nextProject.episodeDownloads)
    ? nextProject.episodeDownloads
    : [];

  if (!hasExplicitReadingOrder(previousEpisodes)) {
    return nextProject;
  }

  return {
    ...nextProject,
    episodeDownloads: preserveManualChapterReadingOrder(previousEpisodes, nextEpisodes),
  };
};

export const normalizeStructureGroupKeys = (
  nextKeys: string[] | null | undefined,
  structureGroups: ChapterStructureGroup[],
) => {
  const availableKeys = new Set(structureGroups.map((group) => group.key));
  return Array.from(
    new Set(
      (Array.isArray(nextKeys) ? nextKeys : []).filter(
        (key): key is string => typeof key === "string" && availableKeys.has(key),
      ),
    ),
  );
};

export const buildEditableVolumeOptions = (
  snapshot: Pick<{ episodeDownloads?: ProjectEpisode[] }, "episodeDownloads"> | null | undefined,
  entries: ProjectVolumeEntry[] | null | undefined,
): EditableVolumeOption[] => {
  if (!snapshot) {
    return [];
  }
  const chapterCountByVolume = new Map<number, number>();
  const metadataVolumeKeys = new Set(
    normalizeProjectVolumeEntries(entries).map((entry) => buildVolumeCoverKey(entry.volume)),
  );
  (Array.isArray(snapshot.episodeDownloads) ? snapshot.episodeDownloads : []).forEach((episode) => {
    const parsedVolume = Number(episode?.volume);
    if (!Number.isFinite(parsedVolume) || parsedVolume <= 0) {
      return;
    }
    chapterCountByVolume.set(parsedVolume, (chapterCountByVolume.get(parsedVolume) || 0) + 1);
  });
  normalizeProjectVolumeEntries(entries).forEach((entry) => {
    if (!chapterCountByVolume.has(entry.volume)) {
      chapterCountByVolume.set(entry.volume, 0);
    }
  });
  return Array.from(chapterCountByVolume.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([volume, chapterCount]) => ({
      volume,
      chapterCount,
      hasMetadata: metadataVolumeKeys.has(buildVolumeCoverKey(volume)),
    }));
};

export const buildChapterStructureGroups = ({
  availableVolumes,
  chaptersByStructureGroup,
  filteredChaptersByStructureGroup,
  stagedChaptersByStructureGroup,
  visibleStagedChaptersByStructureGroup,
}: {
  availableVolumes: EditableVolumeOption[];
  chaptersByStructureGroup: Map<string, ProjectEpisode[]>;
  filteredChaptersByStructureGroup: Map<string, ProjectEpisode[]>;
  stagedChaptersByStructureGroup: Map<string, StageChapter[]>;
  visibleStagedChaptersByStructureGroup: Map<string, StageChapter[]>;
}): ChapterStructureGroup[] => {
  const numericVolumeMap = new Map<number, EditableVolumeOption>();
  availableVolumes.forEach((volumeOption) => {
    numericVolumeMap.set(volumeOption.volume, volumeOption);
  });

  Array.from(chaptersByStructureGroup.keys()).forEach((key) => {
    const parsedVolume = Number(key);
    if (key !== "none" && Number.isFinite(parsedVolume) && parsedVolume > 0) {
      numericVolumeMap.set(
        parsedVolume,
        numericVolumeMap.get(parsedVolume) || {
          volume: parsedVolume,
          chapterCount: (chaptersByStructureGroup.get(key) || []).length,
          hasMetadata: false,
        },
      );
    }
  });

  Array.from(stagedChaptersByStructureGroup.keys()).forEach((key) => {
    const parsedVolume = Number(key);
    if (key !== "none" && Number.isFinite(parsedVolume) && parsedVolume > 0) {
      numericVolumeMap.set(
        parsedVolume,
        numericVolumeMap.get(parsedVolume) || {
          volume: parsedVolume,
          chapterCount: (chaptersByStructureGroup.get(key) || []).length,
          hasMetadata: false,
        },
      );
    }
  });

  const numericGroups: ChapterStructureGroup[] = Array.from(numericVolumeMap.values())
    .sort((left, right) => left.volume - right.volume)
    .map((volumeOption) => {
      const key = String(volumeOption.volume);
      return {
        key,
        label: buildChapterVolumeLabel(volumeOption.volume),
        volume: volumeOption.volume,
        hasMetadata: volumeOption.hasMetadata,
        chapterCount: volumeOption.chapterCount,
        allItems: chaptersByStructureGroup.get(key) || [],
        visibleItems: filteredChaptersByStructureGroup.get(key) || [],
        pendingItems: stagedChaptersByStructureGroup.get(key) || [],
        visiblePendingItems: visibleStagedChaptersByStructureGroup.get(key) || [],
      };
    });

  const semVolumeItems = chaptersByStructureGroup.get("none") || [];
  numericGroups.push({
    key: "none",
    label: "Sem volume",
    volume: null,
    hasMetadata: false,
    chapterCount: semVolumeItems.length,
    allItems: semVolumeItems,
    visibleItems: filteredChaptersByStructureGroup.get("none") || [],
    pendingItems: stagedChaptersByStructureGroup.get("none") || [],
    visiblePendingItems: visibleStagedChaptersByStructureGroup.get("none") || [],
  });

  return numericGroups;
};

export const resolveFallbackSelectedChapterVolume = ({
  availableVolumes,
  enabled,
  volume,
}: {
  availableVolumes: EditableVolumeOption[];
  enabled: boolean;
  volume: number | null | undefined;
}) => {
  const normalizedVolume = normalizePositiveInteger(Number(volume));
  if (!enabled || normalizedVolume === undefined) {
    return null;
  }
  return availableVolumes.some((volumeOption) => volumeOption.volume === normalizedVolume)
    ? normalizedVolume
    : null;
};

export const resolveSelectedChapterVolume = ({
  activeChapterVolume,
  availableVolumes,
  fallbackVolume,
}: {
  activeChapterVolume: number | null | undefined;
  availableVolumes: EditableVolumeOption[];
  fallbackVolume?: number | null;
}) => {
  const normalizedActiveVolume = normalizePositiveInteger(Number(activeChapterVolume));
  if (
    normalizedActiveVolume !== undefined &&
    availableVolumes.some((volumeOption) => volumeOption.volume === normalizedActiveVolume)
  ) {
    return normalizedActiveVolume;
  }
  return fallbackVolume ?? null;
};

export const resolveSelectedVolumeChapterCount = ({
  availableVolumes,
  volume,
}: {
  availableVolumes: EditableVolumeOption[];
  volume: number | null | undefined;
}) => {
  const normalizedVolume = normalizePositiveInteger(Number(volume));
  if (normalizedVolume === undefined) {
    return 0;
  }
  return (
    availableVolumes.find((volumeOption) => volumeOption.volume === normalizedVolume)
      ?.chapterCount || 0
  );
};

export const resolveChapterStructureGroupKey = ({
  activeChapterKey,
  fallbackToFirstGroup,
  hasActiveChapter,
  selectedStageChapterId,
  selectedVolume,
  structureGroups,
}: {
  activeChapterKey?: string | null;
  fallbackToFirstGroup?: boolean;
  hasActiveChapter: boolean;
  selectedStageChapterId?: string | null;
  selectedVolume: number | null;
  structureGroups: ChapterStructureGroup[];
}) => {
  const activeGroup = activeChapterKey
    ? structureGroups.find((group) =>
        group.allItems.some(
          (episode) => buildEpisodeKey(episode.number, episode.volume) === activeChapterKey,
        ),
      )
    : null;
  if (activeGroup?.key) {
    return activeGroup.key;
  }

  if (!hasActiveChapter && selectedStageChapterId) {
    const pendingGroup = structureGroups.find((group) =>
      group.pendingItems.some((chapter) => chapter.id === selectedStageChapterId),
    );
    if (pendingGroup?.key) {
      return pendingGroup.key;
    }
  }

  if (selectedVolume !== null) {
    const selectedGroupKey =
      structureGroups.find((group) => group.volume === selectedVolume)?.key || "";
    if (selectedGroupKey) {
      return selectedGroupKey;
    }
  }

  return fallbackToFirstGroup ? structureGroups[0]?.key || "" : "";
};
