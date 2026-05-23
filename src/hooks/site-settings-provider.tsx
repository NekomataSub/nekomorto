import { defaultSettings, mergeSettings, SiteSettingsContext } from "@/hooks/site-settings-context";
import { useResolvedPublicBootstrap } from "@/hooks/public-bootstrap-provider";
import {
  refetchPublicBootstrapCache,
  refreshPublicBootstrapCacheIfStale,
} from "@/hooks/use-public-bootstrap";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { normalizeAssetUrl } from "@/lib/asset-url";
import { truncateMetaDescription } from "@/lib/meta-description";
import { applyThemeAccentVariables } from "@/lib/theme-accent";
import type { SiteSettings } from "@/types/site-settings";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ensureMeta = (selector: string, attrs: Record<string, string>) => {
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    Object.entries(attrs).forEach(([key, value]) => {
      el?.setAttribute(key, value);
    });
    document.head.appendChild(el);
  }
  return el;
};

const buildSettingsSignature = (settings: SiteSettings) =>
  JSON.stringify({
    siteName: settings.site.name || "Nekomata",
    siteDescription: truncateMetaDescription(settings.site.description || ""),
    shareImage: normalizeAssetUrl(settings.site.defaultShareImage || ""),
    faviconUrl: settings.site.faviconUrl || "",
    accent: String(settings.theme?.accent || "").trim(),
    mode: String(settings.theme?.mode || "").trim(),
  });

const applyDocumentSettings = (settings: SiteSettings) => {
  if (!settings) {
    return;
  }
  const siteName = settings.site.name || "Nekomata";
  const description = truncateMetaDescription(settings.site.description || "");
  const shareImage = normalizeAssetUrl(settings.site.defaultShareImage || "");
  const hasPageMeta = document.documentElement.dataset.pageMeta === "true";

  const ogSiteName = ensureMeta('meta[property="og:site_name"]', { property: "og:site_name" });
  ogSiteName?.setAttribute("content", siteName);
  if (!hasPageMeta) {
    document.title = siteName;

    const descriptionMeta = ensureMeta('meta[name="description"]', { name: "description" });
    descriptionMeta?.setAttribute("content", description);

    const ogTitle = ensureMeta('meta[property="og:title"]', { property: "og:title" });
    ogTitle?.setAttribute("content", siteName);
    const ogDescription = ensureMeta('meta[property="og:description"]', {
      property: "og:description",
    });
    ogDescription?.setAttribute("content", description);
    const ogImage = ensureMeta('meta[property="og:image"]', { property: "og:image" });
    ogImage?.setAttribute("content", shareImage);

    const twitterTitle = ensureMeta('meta[name="twitter:title"]', { name: "twitter:title" });
    twitterTitle?.setAttribute("content", siteName);
    const twitterDescription = ensureMeta('meta[name="twitter:description"]', {
      name: "twitter:description",
    });
    twitterDescription?.setAttribute("content", description);
    const twitterImage = ensureMeta('meta[name="twitter:image"]', { name: "twitter:image" });
    twitterImage?.setAttribute("content", shareImage);
    const twitterCard = ensureMeta('meta[name="twitter:card"]', { name: "twitter:card" });
    twitterCard?.setAttribute("content", shareImage ? "summary_large_image" : "summary");
  }

  if (settings.site.faviconUrl) {
    let icon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!icon) {
      icon = document.createElement("link");
      icon.rel = "icon";
      document.head.appendChild(icon);
    }
    icon.href = settings.site.faviconUrl;
  }

  applyThemeAccentVariables(document.documentElement.style, settings.theme?.accent);
};

export const SiteSettingsProvider = ({
  children,
  initialSettings,
  initiallyLoaded = false,
}: {
  children: ReactNode;
  initialSettings?: SiteSettings;
  initiallyLoaded?: boolean;
}) => {
  const apiBase = getApiBase();
  const bootstrapPayload = useResolvedPublicBootstrap();
  const bootstrapSettings = bootstrapPayload?.settings;
  const resolvedInitialSettings = initialSettings || bootstrapSettings;
  const hasFreshFullBootstrap = Boolean(
    bootstrapPayload && bootstrapPayload.payloadMode === "full",
  );
  const [settings, setSettings] = useState<SiteSettings>(
    mergeSettings(defaultSettings, resolvedInitialSettings || {}),
  );
  const appliedSettingsSignatureRef = useRef("");
  const [isLoading, setIsLoading] = useState(
    !(initiallyLoaded || Boolean(resolvedInitialSettings)),
  );

  const refresh = useCallback(
    async (showLoading = true, options?: { force?: boolean }) => {
      if (showLoading) {
        setIsLoading(true);
      }
      try {
        const bootstrapPayload = options?.force
          ? await refetchPublicBootstrapCache(apiBase)
          : await refreshPublicBootstrapCacheIfStale({ apiBase });
        const nextSettings = bootstrapPayload?.settings;
        if (nextSettings) {
          setSettings((current) => {
            const mergedSettings = mergeSettings(defaultSettings, nextSettings);
            return buildSettingsSignature(current) === buildSettingsSignature(mergedSettings)
              ? current
              : mergedSettings;
          });
          return;
        }

        const response = await apiFetch(apiBase, "/api/public/settings");
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        setSettings((current) => {
          const mergedSettings = mergeSettings(defaultSettings, data.settings || {});
          return buildSettingsSignature(current) === buildSettingsSignature(mergedSettings)
            ? current
            : mergedSettings;
        });
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    },
    [apiBase],
  );

  useEffect(() => {
    if (!resolvedInitialSettings) {
      return;
    }
    setSettings((current) => {
      const mergedSettings = mergeSettings(defaultSettings, resolvedInitialSettings);
      return buildSettingsSignature(current) === buildSettingsSignature(mergedSettings)
        ? current
        : mergedSettings;
    });
    setIsLoading(false);
  }, [resolvedInitialSettings]);

  useEffect(() => {
    if (initiallyLoaded || resolvedInitialSettings) {
      return;
    }
    void refresh(true);
  }, [initiallyLoaded, refresh, resolvedInitialSettings]);

  useEffect(() => {
    if (!resolvedInitialSettings) {
      return;
    }
    if (hasFreshFullBootstrap) {
      return;
    }
    void refresh(false);
  }, [hasFreshFullBootstrap, refresh, resolvedInitialSettings]);

  useEffect(() => {
    const nextSignature = buildSettingsSignature(settings);
    if (appliedSettingsSignatureRef.current === nextSignature) {
      return;
    }
    appliedSettingsSignatureRef.current = nextSignature;
    applyDocumentSettings(settings);
  }, [settings]);

  const value = useMemo(
    () => ({
      settings,
      isLoading,
      refresh,
    }),
    [settings, isLoading, refresh],
  );

  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
};
