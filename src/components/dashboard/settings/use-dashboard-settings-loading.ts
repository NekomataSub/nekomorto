import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { defaultSettings, mergeSettings } from "@/hooks/site-settings-context";
import { useDashboardRefreshToast } from "@/hooks/use-dashboard-refresh-toast";
import { apiFetch } from "@/lib/api-client";
import {
  readDashboardSettingsCache,
  writeDashboardSettingsCache,
} from "@/lib/dashboard-settings-cache";
import type { SiteSettings } from "@/types/site-settings";
import { type LinkTypeItem, normalizeDefaultShareImageSettings } from "./shared";

type UseDashboardSettingsLoadingOptions = {
  apiBase: string;
  publicSettings: SiteSettings;
};

export const useDashboardSettingsLoading = ({
  apiBase,
  publicSettings,
}: UseDashboardSettingsLoadingOptions) => {
  const initialCacheRef = useRef(readDashboardSettingsCache());
  const [settings, setSettings] = useState<SiteSettings>(
    initialCacheRef.current?.settings ?? normalizeDefaultShareImageSettings(publicSettings),
  );
  const [tagTranslations, setTagTranslations] = useState<Record<string, string>>(
    initialCacheRef.current?.tagTranslations ?? {},
  );
  const [genreTranslations, setGenreTranslations] = useState<Record<string, string>>(
    initialCacheRef.current?.genreTranslations ?? {},
  );
  const [staffRoleTranslations, setStaffRoleTranslations] = useState<Record<string, string>>(
    initialCacheRef.current?.staffRoleTranslations ?? {},
  );
  const [knownTags, setKnownTags] = useState<string[]>(initialCacheRef.current?.knownTags ?? []);
  const [knownGenres, setKnownGenres] = useState<string[]>(
    initialCacheRef.current?.knownGenres ?? [],
  );
  const [knownStaffRoles, setKnownStaffRoles] = useState<string[]>(
    initialCacheRef.current?.knownStaffRoles ?? [],
  );
  const [linkTypes, setLinkTypes] = useState<LinkTypeItem[]>(
    initialCacheRef.current?.linkTypes ?? [],
  );
  const [isInitialLoading, setIsInitialLoading] = useState(!initialCacheRef.current);
  const [isRefreshing, setIsRefreshing] = useState(Boolean(initialCacheRef.current));
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(initialCacheRef.current));
  const [hasResolvedSettings, setHasResolvedSettings] = useState(Boolean(initialCacheRef.current));
  const [hasResolvedTranslations, setHasResolvedTranslations] = useState(
    Boolean(initialCacheRef.current),
  );
  const [hasResolvedLinkTypes, setHasResolvedLinkTypes] = useState(
    Boolean(initialCacheRef.current),
  );
  const [hasResolvedProjectMetadata, setHasResolvedProjectMetadata] = useState(
    Boolean(initialCacheRef.current),
  );
  const [hasLoadError, setHasLoadError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [isSyncingAniList, setIsSyncingAniList] = useState(false);
  const hasSyncedAniList = useRef(false);
  const requestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(hasLoadedOnce);

  useEffect(() => {
    hasLoadedOnceRef.current = hasLoadedOnce;
  }, [hasLoadedOnce]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const background = hasLoadedOnceRef.current;

      setHasLoadError(false);
      if (background) {
        setIsRefreshing(true);
      } else {
        setIsInitialLoading(true);
        setHasResolvedSettings(false);
      }
      if (!initialCacheRef.current) {
        setHasResolvedTranslations(false);
        setHasResolvedLinkTypes(false);
        setHasResolvedProjectMetadata(false);
      }

      try {
        const settingsPromise = apiFetch(apiBase, "/api/settings", { auth: true });
        const translationsPromise = apiFetch(apiBase, "/api/public/tag-translations", {
          cache: "no-store",
        });
        const projectsPromise = apiFetch(apiBase, "/api/projects", { auth: true });
        const linkTypesPromise = apiFetch(apiBase, "/api/link-types");

        const settingsRes = await settingsPromise;
        if (!settingsRes.ok) {
          throw new Error("settings_load_failed");
        }
        const settingsData = await settingsRes.json();
        if (!isActive || requestIdRef.current !== requestId) {
          return;
        }
        const nextSettings = settingsData.settings
          ? normalizeDefaultShareImageSettings(
              mergeSettings(defaultSettings, settingsData.settings),
            )
          : normalizeDefaultShareImageSettings(publicSettings);
        setSettings(nextSettings);
        setHasLoadedOnce(true);
        setHasResolvedSettings(true);
        setIsInitialLoading(false);

        const [translationsRes, projectsRes, linkTypesRes] = await Promise.all([
          translationsPromise,
          projectsPromise,
          linkTypesPromise,
        ]);
        if (!isActive || requestIdRef.current !== requestId) {
          return;
        }

        let nextTagTranslations: Record<string, string> = {};
        let nextGenreTranslations: Record<string, string> = {};
        let nextStaffRoleTranslations: Record<string, string> = {};
        if (translationsRes.ok) {
          const translationsData = await translationsRes.json();
          nextTagTranslations = translationsData.tags || {};
          nextGenreTranslations = translationsData.genres || {};
          nextStaffRoleTranslations = translationsData.staffRoles || {};
        }
        setTagTranslations(nextTagTranslations);
        setGenreTranslations(nextGenreTranslations);
        setStaffRoleTranslations(nextStaffRoleTranslations);
        setHasResolvedTranslations(true);

        let nextKnownTags: string[] = [];
        let nextKnownGenres: string[] = [];
        let nextKnownStaffRoles: string[] = [];
        if (projectsRes.ok) {
          const projectsData = await projectsRes.json();
          const projects = Array.isArray(projectsData.projects) ? projectsData.projects : [];
          const tags = new Set<string>();
          const genres = new Set<string>();
          const staffRoles = new Set<string>();
          projects.forEach((project) => {
            (project.tags || []).forEach((tag: string) => tags.add(tag));
            (project.genres || []).forEach((genre: string) => genres.add(genre));
            if (Array.isArray(project.animeStaff)) {
              project.animeStaff.forEach((staff: { role?: string | null }) => {
                const role = String(staff?.role || "").trim();
                if (role) {
                  staffRoles.add(role);
                }
              });
            }
          });
          nextKnownTags = Array.from(tags).sort((a, b) => a.localeCompare(b, "en"));
          nextKnownGenres = Array.from(genres).sort((a, b) => a.localeCompare(b, "en"));
          nextKnownStaffRoles = Array.from(staffRoles).sort((a, b) => a.localeCompare(b, "en"));
        }
        setKnownTags(nextKnownTags);
        setKnownGenres(nextKnownGenres);
        setKnownStaffRoles(nextKnownStaffRoles);
        setHasResolvedProjectMetadata(true);

        let nextLinkTypes: LinkTypeItem[] = [];
        if (linkTypesRes.ok) {
          const linkTypesData = await linkTypesRes.json();
          nextLinkTypes = Array.isArray(linkTypesData.items) ? linkTypesData.items : [];
        }
        setLinkTypes(nextLinkTypes);
        setHasResolvedLinkTypes(true);

        writeDashboardSettingsCache({
          settings: nextSettings,
          tagTranslations: nextTagTranslations,
          genreTranslations: nextGenreTranslations,
          staffRoleTranslations: nextStaffRoleTranslations,
          knownTags: nextKnownTags,
          knownGenres: nextKnownGenres,
          knownStaffRoles: nextKnownStaffRoles,
          linkTypes: nextLinkTypes,
        });
      } catch {
        if (isActive && requestIdRef.current === requestId) {
          if (!hasLoadedOnceRef.current) {
            setSettings(normalizeDefaultShareImageSettings(publicSettings));
            setTagTranslations({});
            setGenreTranslations({});
            setStaffRoleTranslations({});
            setKnownTags([]);
            setKnownGenres([]);
            setKnownStaffRoles([]);
            setLinkTypes([]);
            setHasResolvedTranslations(false);
            setHasResolvedLinkTypes(false);
            setHasResolvedProjectMetadata(false);
          }
          setHasLoadError(true);
        }
      } finally {
        if (isActive && requestIdRef.current === requestId) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    };

    void load();
    return () => {
      isActive = false;
    };
  }, [apiBase, loadVersion, publicSettings]);

  const syncAniListTerms = useCallback(
    async (options?: { silent?: boolean }) => {
      if (isSyncingAniList) {
        return;
      }
      setIsSyncingAniList(true);
      try {
        const response = await apiFetch(apiBase, "/api/tag-translations/anilist-sync", {
          method: "POST",
          auth: true,
        });
        if (!response.ok) {
          throw new Error("sync_failed");
        }
        const data = await response.json();
        setTagTranslations(data.tags || {});
        setGenreTranslations(data.genres || {});
        if (data.staffRoles) {
          setStaffRoleTranslations(data.staffRoles || {});
        }
        if (!options?.silent) {
          toast({
            title: "Termos do AniList atualizados",
            description: "Tags e gêneros foram importados para tradução.",
          });
        }
      } catch {
        if (!options?.silent) {
          toast({
            title: "Não foi possível importar",
            description: "Verifique a conexão ou tente novamente.",
          });
        }
      } finally {
        setIsSyncingAniList(false);
      }
    },
    [apiBase, isSyncingAniList],
  );

  useEffect(() => {
    if (!hasResolvedTranslations || hasSyncedAniList.current) {
      return;
    }
    hasSyncedAniList.current = true;
    void syncAniListTerms({ silent: true });
  }, [hasResolvedTranslations, syncAniListTerms]);

  useDashboardRefreshToast({
    active: isRefreshing && hasLoadedOnce,
    title: "Atualizando configurações",
    description: "Buscando ajustes globais mais recentes.",
  });

  const requestReload = useCallback(() => {
    setLoadVersion((previous) => previous + 1);
  }, []);

  return {
    genreTranslations,
    hasLoadError,
    hasLoadedOnce,
    hasResolvedLinkTypes,
    hasResolvedProjectMetadata,
    hasResolvedSettings,
    hasResolvedTranslations,
    isInitialLoading,
    isRefreshing,
    isSyncingAniList,
    knownGenres,
    knownStaffRoles,
    knownTags,
    linkTypes,
    requestReload,
    setGenreTranslations,
    setHasResolvedLinkTypes,
    setHasResolvedProjectMetadata,
    setHasResolvedSettings,
    setHasResolvedTranslations,
    setKnownGenres,
    setKnownStaffRoles,
    setKnownTags,
    setLinkTypes,
    setSettings,
    setStaffRoleTranslations,
    setTagTranslations,
    settings,
    staffRoleTranslations,
    syncAniListTerms,
    tagTranslations,
  };
};
