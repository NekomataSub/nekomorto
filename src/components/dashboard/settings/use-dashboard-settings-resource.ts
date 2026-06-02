import { type DragEvent, useCallback, useMemo, useState } from "react";
import { useDashboardSettingsAutosave } from "@/components/dashboard/settings/use-dashboard-settings-autosave";
import { useDashboardSettingsLoading } from "@/components/dashboard/settings/use-dashboard-settings-loading";
import { useDashboardSettingsQuerySync } from "@/components/dashboard/settings/use-dashboard-settings-query-sync";
import type { SiteSettings } from "@/types/site-settings";
import {
  getProjectReaderPresetByType,
  mergeProjectReaderConfig,
} from "../../../../shared/project-reader.js";
import { type ReaderProjectTypeKey, reorderItems, type TranslationsPayload } from "./shared";

type UseDashboardSettingsResourceOptions = {
  apiBase: string;
  location: { pathname: string; hash: string };
  navigate: (to: string, options?: { replace?: boolean }) => void;
  publicSettings: SiteSettings;
  refresh: () => Promise<unknown>;
  searchParams: URLSearchParams;
};

export const useDashboardSettingsResource = ({
  apiBase,
  location,
  navigate,
  publicSettings,
  refresh,
  searchParams,
}: UseDashboardSettingsResourceOptions) => {
  const loading = useDashboardSettingsLoading({ apiBase, publicSettings });
  const query = useDashboardSettingsQuerySync({
    hasResolvedSettings: loading.hasResolvedSettings,
    location,
    navigate,
    searchParams,
  });
  const translationsValue = useMemo<TranslationsPayload>(
    () => ({
      genres: loading.genreTranslations,
      staffRoles: loading.staffRoleTranslations,
      tags: loading.tagTranslations,
    }),
    [loading.genreTranslations, loading.staffRoleTranslations, loading.tagTranslations],
  );
  const autosave = useDashboardSettingsAutosave({
    apiBase,
    hasResolvedLinkTypes: loading.hasResolvedLinkTypes,
    hasResolvedSettings: loading.hasResolvedSettings,
    hasResolvedTranslations: loading.hasResolvedTranslations,
    activeTab: query.activeTab,
    genreTranslations: loading.genreTranslations,
    knownGenres: loading.knownGenres,
    knownStaffRoles: loading.knownStaffRoles,
    knownTags: loading.knownTags,
    linkTypes: loading.linkTypes,
    refresh,
    setGenreTranslations: loading.setGenreTranslations,
    setLinkTypes: loading.setLinkTypes,
    setSettings: loading.setSettings,
    setStaffRoleTranslations: loading.setStaffRoleTranslations,
    setTagTranslations: loading.setTagTranslations,
    settings: loading.settings,
    staffRoleTranslations: loading.staffRoleTranslations,
    tagTranslations: loading.tagTranslations,
    translations: translationsValue,
  });
  const [tagQuery, setTagQuery] = useState("");
  const [genreQuery, setGenreQuery] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newGenre, setNewGenre] = useState("");
  const [staffRoleQuery, setStaffRoleQuery] = useState("");
  const [newStaffRole, setNewStaffRole] = useState("");
  const [footerSocialDragIndex, setFooterSocialDragIndex] = useState<number | null>(null);
  const [footerSocialDragOverIndex, setFooterSocialDragOverIndex] = useState<number | null>(null);

  const clearFooterSocialDragState = useCallback(() => {
    setFooterSocialDragIndex(null);
    setFooterSocialDragOverIndex(null);
  }, []);

  const handleFooterSocialDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, index: number) => {
      setFooterSocialDragIndex(index);
      setFooterSocialDragOverIndex(index);
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    },
    [],
  );

  const handleFooterSocialDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      if (footerSocialDragIndex === null) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (footerSocialDragOverIndex !== index) {
        setFooterSocialDragOverIndex(index);
      }
    },
    [footerSocialDragIndex, footerSocialDragOverIndex],
  );

  const handleFooterSocialDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();
      const from = footerSocialDragIndex;
      if (from === null || from === index) {
        clearFooterSocialDragState();
        return;
      }
      loading.setSettings((prev) => ({
        ...prev,
        footer: {
          ...prev.footer,
          socialLinks: reorderItems(prev.footer.socialLinks, from, index),
        },
      }));
      clearFooterSocialDragState();
    },
    [clearFooterSocialDragState, footerSocialDragIndex, loading.setSettings],
  );

  const moveFooterSocialLink = useCallback(
    (from: number, to: number) => {
      loading.setSettings((prev) => ({
        ...prev,
        footer: {
          ...prev.footer,
          socialLinks: reorderItems(prev.footer.socialLinks, from, to),
        },
      }));
    },
    [loading.setSettings],
  );

  const filteredTags = useMemo(() => {
    const query = tagQuery.trim().toLowerCase();
    const allTags = Array.from(
      new Set([...loading.knownTags, ...Object.keys(loading.tagTranslations)]),
    );
    return allTags
      .filter((tag) => !query || tag.toLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b, "en"));
  }, [loading.knownTags, loading.tagTranslations, tagQuery]);

  const filteredGenres = useMemo(() => {
    const query = genreQuery.trim().toLowerCase();
    const allGenres = Array.from(
      new Set([...loading.knownGenres, ...Object.keys(loading.genreTranslations)]),
    );
    return allGenres
      .filter((genre) => !query || genre.toLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b, "en"));
  }, [genreQuery, loading.genreTranslations, loading.knownGenres]);

  const filteredStaffRoles = useMemo(() => {
    const query = staffRoleQuery.trim().toLowerCase();
    const allRoles = Array.from(
      new Set([...loading.knownStaffRoles, ...Object.keys(loading.staffRoleTranslations)]),
    );
    return allRoles
      .filter((role) => !query || role.toLowerCase().includes(query))
      .sort((a, b) => a.localeCompare(b, "en"));
  }, [loading.knownStaffRoles, loading.staffRoleTranslations, staffRoleQuery]);

  const readerPresets = useMemo(
    () => ({
      manga: mergeProjectReaderConfig(
        getProjectReaderPresetByType("manga"),
        loading.settings.reader?.projectTypes?.manga,
        {
          projectType: "manga",
        },
      ),
      webtoon: mergeProjectReaderConfig(
        getProjectReaderPresetByType("webtoon"),
        loading.settings.reader?.projectTypes?.webtoon,
        {
          projectType: "webtoon",
        },
      ),
    }),
    [loading.settings.reader?.projectTypes?.manga, loading.settings.reader?.projectTypes?.webtoon],
  );

  const updateReaderPreset = useCallback(
    (
      key: ReaderProjectTypeKey,
      updater: (
        current: SiteSettings["reader"]["projectTypes"][ReaderProjectTypeKey],
      ) => SiteSettings["reader"]["projectTypes"][ReaderProjectTypeKey],
    ) => {
      loading.setSettings((prev) => ({
        ...prev,
        reader: {
          ...prev.reader,
          projectTypes: {
            ...prev.reader.projectTypes,
            [key]: updater(prev.reader.projectTypes[key]),
          },
        },
      }));
    },
    [loading.setSettings],
  );

  const hasBlockingLoadError = !loading.hasLoadedOnce && loading.hasLoadError;
  const hasRetainedLoadError = loading.hasLoadedOnce && loading.hasLoadError;

  const {
    autosaveEnabled,
    combinedAutosaveErrorMessage,
    combinedAutosaveStatus,
    combinedLastSavedAt,
    flushAllAutosave,
    handleAutosaveToggle,
    handleSaveLinkTypes,
    handleSaveSettings,
    handleSaveTranslations,
    isSaving,
    isSavingLinkTypes,
    isSavingTranslations,
  } = autosave;
  const isSettingsManualSaveDisabled =
    isSaving || loading.isInitialLoading || !loading.hasResolvedSettings || hasBlockingLoadError;

  return {
    activeTab: query.activeTab,
    autosaveEnabled,
    clearFooterSocialDragState,
    combinedAutosaveErrorMessage,
    combinedAutosaveStatus,
    combinedLastSavedAt,
    filteredGenres,
    filteredStaffRoles,
    filteredTags,
    flushAllAutosave,
    footerSocialDragOverIndex,
    genreQuery,
    genreTranslations: loading.genreTranslations,
    handleAutosaveToggle,
    handleFooterSocialDragOver,
    handleFooterSocialDragStart,
    handleFooterSocialDrop,
    handleSaveLinkTypes,
    handleSaveSettings,
    handleSaveTranslations,
    hasBlockingLoadError,
    hasLoadError: loading.hasLoadError,
    hasResolvedLinkTypes: loading.hasResolvedLinkTypes,
    hasResolvedProjectMetadata: loading.hasResolvedProjectMetadata,
    hasResolvedSettings: loading.hasResolvedSettings,
    hasResolvedTranslations: loading.hasResolvedTranslations,
    hasRetainedLoadError,
    isInitialLoading: loading.isInitialLoading,
    isRefreshing: loading.isRefreshing,
    isSaving,
    isSavingLinkTypes,
    isSavingTranslations,
    isSettingsManualSaveDisabled,
    isSyncingAniList: loading.isSyncingAniList,
    knownGenres: loading.knownGenres,
    knownStaffRoles: loading.knownStaffRoles,
    knownTags: loading.knownTags,
    linkTypes: loading.linkTypes,
    moveFooterSocialLink,
    newGenre,
    newStaffRole,
    newTag,
    readerPresets,
    requestReload: loading.requestReload,
    setActiveTab: query.setActiveTab,
    setGenreQuery,
    setGenreTranslations: loading.setGenreTranslations,
    setLinkTypes: loading.setLinkTypes,
    setNewGenre,
    setNewStaffRole,
    setNewTag,
    setSettings: loading.setSettings,
    setStaffRoleQuery,
    setStaffRoleTranslations: loading.setStaffRoleTranslations,
    setTagQuery,
    setTagTranslations: loading.setTagTranslations,
    settings: loading.settings,
    staffRoleQuery,
    staffRoleTranslations: loading.staffRoleTranslations,
    syncAniListTerms: loading.syncAniListTerms,
    tagQuery,
    tagTranslations: loading.tagTranslations,
    updateReaderPreset,
  };
};
