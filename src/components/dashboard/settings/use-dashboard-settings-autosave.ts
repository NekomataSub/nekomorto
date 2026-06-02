import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "@/components/ui/use-toast";
import {
  autosaveRuntimeConfig,
  autosaveStorageKeys,
  readAutosavePreference,
  writeAutosavePreference,
} from "@/config/autosave";
import { defaultSettings, mergeSettings } from "@/hooks/site-settings-context";
import { type AutosaveStatus, useAutosave } from "@/hooks/use-autosave";
import { apiFetch } from "@/lib/api-client";
import { applyBeforeUnloadCompatibility } from "@/lib/before-unload";
import { writeDashboardSettingsCache } from "@/lib/dashboard-settings-cache";
import type { SiteSettings } from "@/types/site-settings";
import {
  type LinkTypeItem,
  normalizeDefaultShareImageSettings,
  normalizeLinkTypeId,
  type SettingsTabKey,
  sanitizeReaderProjectTypesForDashboardSave,
  type TranslationsPayload,
} from "./shared";

type UseDashboardSettingsAutosaveOptions = {
  apiBase: string;
  hasResolvedLinkTypes: boolean;
  hasResolvedSettings: boolean;
  hasResolvedTranslations: boolean;
  knownGenres: string[];
  knownStaffRoles: string[];
  knownTags: string[];
  genreTranslations: Record<string, string>;
  linkTypes: LinkTypeItem[];
  activeTab: SettingsTabKey;
  refresh: () => Promise<unknown>;
  setGenreTranslations: (next: Record<string, string>) => void;
  setLinkTypes: (next: LinkTypeItem[] | ((prev: LinkTypeItem[]) => LinkTypeItem[])) => void;
  setSettings: (next: SiteSettings | ((prev: SiteSettings) => SiteSettings)) => void;
  setStaffRoleTranslations: (next: Record<string, string>) => void;
  setTagTranslations: (next: Record<string, string>) => void;
  settings: SiteSettings;
  staffRoleTranslations: Record<string, string>;
  tagTranslations: Record<string, string>;
  translations: TranslationsPayload;
};

const serializeSettingsSnapshot = (snapshot: SiteSettings) => {
  const nextSettings = normalizeDefaultShareImageSettings(snapshot);
  const sanitizedSettings: SiteSettings = {
    ...nextSettings,
    reader: {
      ...nextSettings.reader,
      projectTypes: sanitizeReaderProjectTypesForDashboardSave(nextSettings.reader.projectTypes),
    },
  };
  const socialDiscord = sanitizedSettings.footer.socialLinks.find(
    (link) => String(link.label || "").toLowerCase() === "discord",
  );
  if (socialDiscord?.href) {
    sanitizedSettings.community.discordUrl = socialDiscord.href;
  }
  return JSON.stringify(sanitizedSettings);
};

export const useDashboardSettingsAutosave = ({
  apiBase,
  hasResolvedLinkTypes,
  hasResolvedSettings,
  hasResolvedTranslations,
  knownGenres,
  knownStaffRoles,
  knownTags,
  genreTranslations,
  linkTypes,
  activeTab,
  refresh,
  setGenreTranslations,
  setLinkTypes,
  setSettings,
  setStaffRoleTranslations,
  setTagTranslations,
  settings,
  staffRoleTranslations,
  tagTranslations,
  translations,
}: UseDashboardSettingsAutosaveOptions) => {
  const initialAutosaveEnabledRef = useRef(
    autosaveRuntimeConfig.enabledByDefault &&
      readAutosavePreference(autosaveStorageKeys.settings, true),
  );
  const isTranslationsTabActive = activeTab === "traducoes";
  const isLinkTypesTabActive = activeTab === "redes-usuarios";
  const translationsValue = useMemo<TranslationsPayload>(
    () => translations,
    [translations.genres, translations.staffRoles, translations.tags],
  );

  const saveSettingsResource = useCallback(
    async (snapshot: SiteSettings) => {
      const nextSettings = normalizeDefaultShareImageSettings(snapshot);
      const sanitizedSettings: SiteSettings = {
        ...nextSettings,
        reader: {
          ...nextSettings.reader,
          projectTypes: sanitizeReaderProjectTypesForDashboardSave(
            nextSettings.reader.projectTypes,
          ),
        },
      };
      const socialDiscord = sanitizedSettings.footer.socialLinks.find(
        (link) => String(link.label || "").toLowerCase() === "discord",
      );
      if (socialDiscord?.href) {
        sanitizedSettings.community.discordUrl = socialDiscord.href;
      }
      const response = await apiFetch(apiBase, "/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        auth: true,
        body: JSON.stringify({ settings: sanitizedSettings }),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      const data = await response.json().catch(() => null);
      const normalizedSettings = normalizeDefaultShareImageSettings(
        mergeSettings(defaultSettings, data?.settings || sanitizedSettings),
      );
      setSettings(normalizedSettings);
      writeDashboardSettingsCache({
        settings: normalizedSettings,
        tagTranslations,
        genreTranslations,
        staffRoleTranslations,
        knownTags,
        knownGenres,
        knownStaffRoles,
        linkTypes,
      });
      return normalizedSettings;
    },
    [
      apiBase,
      genreTranslations,
      knownGenres,
      knownStaffRoles,
      knownTags,
      linkTypes,
      setSettings,
      staffRoleTranslations,
      tagTranslations,
    ],
  );

  const saveTranslationsResource = useCallback(
    async (snapshot: TranslationsPayload) => {
      const response = await apiFetch(apiBase, "/api/tag-translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        auth: true,
        body: JSON.stringify(snapshot),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      const data = await response.json().catch(() => null);
      const normalizedTranslations: TranslationsPayload = {
        tags: data?.tags || snapshot.tags,
        genres: data?.genres || snapshot.genres,
        staffRoles: data?.staffRoles || snapshot.staffRoles,
      };
      setTagTranslations(normalizedTranslations.tags);
      setGenreTranslations(normalizedTranslations.genres);
      setStaffRoleTranslations(normalizedTranslations.staffRoles);
      writeDashboardSettingsCache({
        settings,
        tagTranslations: normalizedTranslations.tags,
        genreTranslations: normalizedTranslations.genres,
        staffRoleTranslations: normalizedTranslations.staffRoles,
        knownTags,
        knownGenres,
        knownStaffRoles,
        linkTypes,
      });
      return normalizedTranslations;
    },
    [
      apiBase,
      knownGenres,
      knownStaffRoles,
      knownTags,
      linkTypes,
      settings,
      setGenreTranslations,
      setStaffRoleTranslations,
      setTagTranslations,
    ],
  );

  const saveLinkTypesResource = useCallback(
    async (snapshot: LinkTypeItem[]) => {
      const normalizedItems = snapshot
        .map((item) => ({
          ...item,
          id: item.id?.trim() ? item.id.trim() : normalizeLinkTypeId(item.label || ""),
          label: String(item.label || "").trim(),
          icon: String(item.icon || "globe").trim(),
        }))
        .filter((item) => item.id && item.label);
      setLinkTypes(normalizedItems);
      const response = await apiFetch(apiBase, "/api/link-types", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        auth: true,
        body: JSON.stringify({ items: normalizedItems }),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      const data = await response.json().catch(() => null);
      const resolvedItems = Array.isArray(data?.items) ? data.items : normalizedItems;
      setLinkTypes(resolvedItems);
      writeDashboardSettingsCache({
        settings,
        tagTranslations,
        genreTranslations,
        staffRoleTranslations,
        knownTags,
        knownGenres,
        knownStaffRoles,
        linkTypes: resolvedItems,
      });
      return resolvedItems;
    },
    [
      apiBase,
      genreTranslations,
      knownGenres,
      knownStaffRoles,
      knownTags,
      linkTypes,
      setLinkTypes,
      settings,
      staffRoleTranslations,
      tagTranslations,
    ],
  );

  const settingsAutosave = useAutosave<SiteSettings>({
    value: settings,
    onSave: saveSettingsResource,
    isReady: hasResolvedSettings,
    enabled: initialAutosaveEnabledRef.current && !isTranslationsTabActive && !isLinkTypesTabActive,
    debounceMs: autosaveRuntimeConfig.debounceMs,
    retryMax: autosaveRuntimeConfig.retryMax,
    retryBaseMs: autosaveRuntimeConfig.retryBaseMs,
    serialize: serializeSettingsSnapshot,
    onError: (_error, payload) => {
      if (payload.source === "auto" && payload.consecutiveErrors === 1) {
        toast({
          title: "Falha no autosave de ajustes",
          description: "As configurações gerais não foram salvas automaticamente.",
          variant: "destructive",
        });
      }
    },
  });

  const translationsAutosave = useAutosave<TranslationsPayload>({
    value: translationsValue,
    onSave: saveTranslationsResource,
    isReady: hasResolvedTranslations,
    enabled: initialAutosaveEnabledRef.current && isTranslationsTabActive,
    debounceMs: autosaveRuntimeConfig.debounceMs,
    retryMax: autosaveRuntimeConfig.retryMax,
    retryBaseMs: autosaveRuntimeConfig.retryBaseMs,
    onError: (_error, payload) => {
      if (payload.source === "auto" && payload.consecutiveErrors === 1) {
        toast({
          title: "Falha no autosave de traduções",
          description: "As traduções não foram salvas automaticamente.",
          variant: "destructive",
        });
      }
    },
  });

  const linkTypesAutosave = useAutosave<LinkTypeItem[]>({
    value: linkTypes,
    onSave: saveLinkTypesResource,
    isReady: hasResolvedLinkTypes,
    enabled: initialAutosaveEnabledRef.current && isLinkTypesTabActive,
    debounceMs: autosaveRuntimeConfig.debounceMs,
    retryMax: autosaveRuntimeConfig.retryMax,
    retryBaseMs: autosaveRuntimeConfig.retryBaseMs,
    onError: (_error, payload) => {
      if (payload.source === "auto" && payload.consecutiveErrors === 1) {
        toast({
          title: "Falha no autosave de redes",
          description: "Os tipos de link não foram salvos automaticamente.",
          variant: "destructive",
        });
      }
    },
  });

  const handleAutosaveToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!autosaveRuntimeConfig.enabledByDefault) {
        return;
      }
      settingsAutosave.setEnabled(nextEnabled);
      translationsAutosave.setEnabled(nextEnabled);
      linkTypesAutosave.setEnabled(nextEnabled);
    },
    [linkTypesAutosave, settingsAutosave, translationsAutosave],
  );

  const autosaveEnabled = useMemo(
    () => settingsAutosave.enabled && translationsAutosave.enabled && linkTypesAutosave.enabled,
    [linkTypesAutosave.enabled, settingsAutosave.enabled, translationsAutosave.enabled],
  );

  useEffect(() => {
    writeAutosavePreference(autosaveStorageKeys.settings, autosaveEnabled);
  }, [autosaveEnabled]);

  const combinedAutosaveStatus = useMemo<AutosaveStatus>(() => {
    const statuses: AutosaveStatus[] = [
      settingsAutosave.status,
      translationsAutosave.status,
      linkTypesAutosave.status,
    ];
    if (statuses.includes("saving")) {
      return "saving";
    }
    if (statuses.includes("error")) {
      return "error";
    }
    if (statuses.includes("pending")) {
      return "pending";
    }
    if (statuses.includes("saved")) {
      return "saved";
    }
    return "idle";
  }, [linkTypesAutosave.status, settingsAutosave.status, translationsAutosave.status]);

  const combinedLastSavedAt = useMemo(() => {
    const points = [
      settingsAutosave.lastSavedAt,
      translationsAutosave.lastSavedAt,
      linkTypesAutosave.lastSavedAt,
    ].filter((point): point is number => Number.isFinite(point));
    return points.length ? Math.max(...points) : null;
  }, [
    linkTypesAutosave.lastSavedAt,
    settingsAutosave.lastSavedAt,
    translationsAutosave.lastSavedAt,
  ]);

  const combinedAutosaveErrorMessage = useMemo(() => {
    if (settingsAutosave.status === "error") {
      return "Há falha no salvamento automático dos ajustes gerais.";
    }
    if (translationsAutosave.status === "error") {
      return "Há falha no salvamento automático das traduções.";
    }
    if (linkTypesAutosave.status === "error") {
      return "Há falha no salvamento automático das redes sociais.";
    }
    return null;
  }, [linkTypesAutosave.status, settingsAutosave.status, translationsAutosave.status]);

  const hasPendingChanges =
    settingsAutosave.isDirty ||
    translationsAutosave.isDirty ||
    linkTypesAutosave.isDirty ||
    settingsAutosave.status === "pending" ||
    settingsAutosave.status === "saving" ||
    translationsAutosave.status === "pending" ||
    translationsAutosave.status === "saving" ||
    linkTypesAutosave.status === "pending" ||
    linkTypesAutosave.status === "saving";

  useEffect(() => {
    if (!hasResolvedSettings || !hasPendingChanges) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      applyBeforeUnloadCompatibility(event);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPendingChanges, hasResolvedSettings]);

  const flushAllAutosave = useCallback(() => {
    if (hasResolvedSettings && settingsAutosave.enabled) {
      void settingsAutosave.flushNow();
    }
    if (hasResolvedTranslations && translationsAutosave.enabled) {
      void translationsAutosave.flushNow();
    }
    if (hasResolvedLinkTypes && linkTypesAutosave.enabled) {
      void linkTypesAutosave.flushNow();
    }
  }, [
    hasResolvedLinkTypes,
    hasResolvedSettings,
    hasResolvedTranslations,
    linkTypesAutosave,
    settingsAutosave,
    translationsAutosave,
  ]);

  const handleSaveSettings = useCallback(async () => {
    if (!hasResolvedSettings) {
      return;
    }
    const ok = await settingsAutosave.flushNow();
    if (!ok) {
      toast({
        title: "Falha ao salvar",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
      return;
    }
    await refresh().catch(() => undefined);
    toast({ title: "Configurações salvas" });
  }, [hasResolvedSettings, refresh, settingsAutosave]);

  const handleSaveTranslations = useCallback(async () => {
    if (!hasResolvedTranslations) {
      return;
    }
    const ok = await translationsAutosave.flushNow();
    if (!ok) {
      toast({
        title: "Falha ao salvar",
        description: "Não foi possível salvar as traduções.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Traduções salvas" });
  }, [hasResolvedTranslations, translationsAutosave]);

  const handleSaveLinkTypes = useCallback(async () => {
    if (!hasResolvedLinkTypes) {
      return;
    }
    const ok = await linkTypesAutosave.flushNow();
    if (!ok) {
      toast({
        title: "Falha ao salvar",
        description: "Não foi possível salvar as redes sociais.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Redes sociais salvas" });
  }, [hasResolvedLinkTypes, linkTypesAutosave]);

  const isSaving = settingsAutosave.status === "saving";
  const isSavingTranslations = translationsAutosave.status === "saving";
  const isSavingLinkTypes = linkTypesAutosave.status === "saving";

  return {
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
  };
};
