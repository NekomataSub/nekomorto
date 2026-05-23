import {
  getProjectReaderPresetByType,
  mergeProjectReaderConfig,
} from "../../shared/project-reader.js";
import { normalizeLegacyInviteCardText } from "./pt-legacy-normalization.js";
import { normalizePublicRedirects } from "./public-redirects.js";
import { sanitizeAssetUrl, sanitizePublicHref } from "./url-safety.js";

export const defaultSiteSettings = {
  site: {
    name: "Nekomata",
    logoUrl: "",
    faviconUrl: "",
    description:
      "Fansub e scan dedicada a trazer histórias inesquecíveis com o carinho que a comunidade merece.",
    defaultShareImage: "/placeholder.svg",
    defaultShareImageAlt: "Imagem padrão de compartilhamento da Nekomata",
    titleSeparator: " | ",
  },
  theme: {
    accent: "#9667e0",
    mode: "dark",
    useAccentInProgressCard: false,
  },
  navbar: {
    links: [
      { label: "Início", href: "/", icon: "home" },
      { label: "Projetos", href: "/projetos", icon: "folder-kanban" },
      { label: "Equipe", href: "/equipe", icon: "users" },
      { label: "Recrutamento", href: "/recrutamento", icon: "user-plus" },
      { label: "Sobre", href: "/sobre", icon: "info" },
    ],
  },
  community: {
    discordUrl: "https://discord.com/invite/BAHKhdX2ju",
    inviteCard: {
      title: "Entre no Discord",
      subtitle: "Converse com a equipe e acompanhe novidades em tempo real.",
      panelTitle: "Comunidade do Zuraaa!",
      panelDescription:
        "Receba alertas de lançamentos, participe de eventos e fale sobre os nossos projetos.",
      ctaLabel: "Entrar no servidor",
      ctaUrl: "https://discord.com/invite/BAHKhdX2ju",
    },
  },
  branding: {
    assets: {
      symbolUrl: "",
      wordmarkUrl: "",
    },
    overrides: {
      navbarSymbolUrl: "",
      footerSymbolUrl: "",
      navbarWordmarkUrl: "",
      footerWordmarkUrl: "",
    },
    display: {
      navbar: "symbol-text",
      footer: "symbol-text",
    },
    wordmarkUrl: "",
    wordmarkUrlNavbar: "",
    wordmarkUrlFooter: "",
    wordmarkPlacement: "both",
    wordmarkEnabled: false,
  },
  downloads: {
    sources: [
      {
        id: "google-drive",
        label: "Google Drive",
        color: "#34A853",
        icon: "google-drive",
        tintIcon: true,
      },
      {
        id: "mega",
        label: "MEGA",
        color: "#D9272E",
        icon: "mega",
        tintIcon: true,
      },
      {
        id: "torrent",
        label: "Torrent",
        color: "#7C3AED",
        icon: "torrent",
        tintIcon: true,
      },
      {
        id: "mediafire",
        label: "Mediafire",
        color: "#2563EB",
        icon: "mediafire",
        tintIcon: true,
      },
      {
        id: "telegram",
        label: "Telegram",
        color: "#0EA5E9",
        icon: "telegram",
        tintIcon: true,
      },
      {
        id: "outro",
        label: "Outro",
        color: "#64748B",
        icon: "link",
        tintIcon: true,
      },
    ],
  },
  teamRoles: [
    { id: "tradutor", label: "Tradutor", icon: "languages" },
    { id: "revisor", label: "Revisor", icon: "check" },
    { id: "typesetter", label: "Typesetter", icon: "pen-tool" },
    { id: "qualidade", label: "Qualidade", icon: "sparkles" },
    { id: "desenvolvedor", label: "Desenvolvedor", icon: "code" },
    { id: "cleaner", label: "Cleaner", icon: "paintbrush" },
    { id: "redrawer", label: "Redrawer", icon: "layers" },
    { id: "encoder", label: "Encoder", icon: "video" },
    { id: "k-timer", label: "K-Timer", icon: "clock" },
    { id: "logo-maker", label: "Logo Maker", icon: "badge" },
    { id: "k-maker", label: "K-Maker", icon: "palette" },
  ],
  footer: {
    brandName: "Nekomata",
    brandLogoUrl: "",
    brandDescription:
      "Fansub dedicada a trazer histórias inesquecíveis com o carinho que a comunidade merece. Traduzimos por paixão, respeitando autores e apoiando o consumo legal das obras.",
    columns: [
      {
        title: "Nekomata",
        links: [
          { label: "Sobre", href: "/sobre" },
          { label: "Equipe", href: "/equipe" },
        ],
      },
      {
        title: "Ajude nossa equipe",
        links: [
          { label: "Recrutamento", href: "/recrutamento" },
          { label: "Doações", href: "/doacoes" },
        ],
      },
      {
        title: "Links úteis",
        links: [
          { label: "Projetos", href: "/projetos" },
          { label: "FAQ", href: "/faq" },
          {
            label: "Reportar erros",
            href: "https://discord.com/invite/BAHKhdX2ju",
          },
          { label: "Info Anime", href: "https://infoanime.com.br" },
        ],
      },
    ],
    socialLinks: [
      { label: "Instagram", href: "https://instagram.com", icon: "instagram" },
      { label: "Facebook", href: "https://facebook.com", icon: "facebook" },
      { label: "Twitter", href: "https://twitter.com", icon: "twitter" },
      {
        label: "Discord",
        href: "https://discord.com/invite/BAHKhdX2ju",
        icon: "discord",
      },
    ],
    disclaimer: [
      "Todo o conteúdo divulgado aqui pertence a seus respectivos autores e editoras. As traduções são realizadas por fãs, sem fins lucrativos, com o objetivo de divulgar as obras no Brasil.",
      "Caso goste de alguma obra, apoie a versão oficial. A venda de materiais legendados pela equipe é proibida.",
    ],
    highlightTitle: "Atribuição • Não Comercial",
    highlightDescription:
      "Este site segue a licença Creative Commons BY-NC. Você pode compartilhar com créditos, sem fins comerciais.",
    copyright: "© 2014 - 2026 Nekomata Fansub. Feito por fãs para fãs.",
  },
  seo: {
    redirects: [],
  },
  reader: {
    projectTypes: {
      manga: getProjectReaderPresetByType("manga"),
      webtoon: getProjectReaderPresetByType("webtoon"),
    },
  },
};

const LEGACY_BRANDING_STORAGE_KEYS = [
  "wordmarkUrl",
  "wordmarkUrlNavbar",
  "wordmarkUrlFooter",
  "wordmarkPlacement",
  "wordmarkEnabled",
];
const LEGACY_SITE_STORAGE_KEYS = ["logoUrl"];
const LEGACY_FOOTER_STORAGE_KEYS = ["brandLogoUrl"];

const mergeSettings = (base, override) => {
  if (Array.isArray(base)) {
    return Array.isArray(override) ? override : base;
  }
  if (base && typeof base === "object") {
    const next = { ...base };
    if (override && typeof override === "object") {
      Object.keys(override).forEach((key) => {
        next[key] = mergeSettings(base[key], override[key]);
      });
    }
    return next;
  }
  return override ?? base;
};

const hasMojibake = (value) => /\u00C3|\u00C2|\uFFFD/.test(String(value || ""));

export const fixMojibakeText = (value) => {
  if (typeof value !== "string") {
    return value;
  }
  if (!hasMojibake(value)) {
    return value;
  }
  try {
    return Buffer.from(value, "latin1").toString("utf8");
  } catch {
    return value;
  }
};

export const fixMojibakeDeep = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => fixMojibakeDeep(item));
  }
  if (value && typeof value === "object") {
    const next = { ...value };
    Object.keys(next).forEach((key) => {
      next[key] = fixMojibakeDeep(next[key]);
    });
    return next;
  }
  return fixMojibakeText(value);
};

export const createSiteSettingsRuntimeHelpers = ({ primaryAppOrigin } = {}) => {
  const normalizeUploadsPath = (value) => {
    if (!value || typeof value !== "string") {
      return value;
    }
    if (value.startsWith("/uploads/")) {
      return value;
    }
    try {
      const parsed = new URL(value, primaryAppOrigin);
      if (parsed.pathname && parsed.pathname.startsWith("/uploads/")) {
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
    } catch {
      // ignore
    }
    return value;
  };

  const normalizeUploadsInText = (value) => {
    if (!value || typeof value !== "string") {
      return value;
    }
    if (!value.includes("/uploads/")) {
      return value;
    }
    const urlPattern = /https?:\/\/[^\s"'()<>]+/gi;
    return value.replace(urlPattern, (match) => normalizeUploadsPath(match));
  };

  const normalizeUploadsDeep = (value) => {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeUploadsDeep(item));
    }
    if (value && typeof value === "object") {
      const next = { ...value };
      Object.keys(next).forEach((key) => {
        next[key] = normalizeUploadsDeep(next[key]);
      });
      return next;
    }
    return normalizeUploadsInText(value);
  };

  const normalizeSiteSettings = (payload) => {
    const merged = fixMojibakeDeep(mergeSettings(defaultSiteSettings, payload || {}));
    const normalizeThemeMode = (value) => {
      const normalized = String(value || "")
        .trim()
        .toLowerCase();
      return normalized === "light" ? "light" : "dark";
    };
    const accentValue =
      String(merged?.theme?.accent || defaultSiteSettings.theme.accent || "").trim() ||
      defaultSiteSettings.theme.accent;
    merged.theme = {
      ...(merged.theme || {}),
      accent: accentValue,
      mode: normalizeThemeMode(merged?.theme?.mode),
      useAccentInProgressCard: merged?.theme?.useAccentInProgressCard === true,
    };
    const resolveNavbarIcon = (label, href, icon) => {
      const iconValue = String(icon || "")
        .trim()
        .toLowerCase();
      if (iconValue) {
        return iconValue;
      }
      const normalizedLabel = String(label || "")
        .trim()
        .toLowerCase();
      const normalizedHref = String(href || "").trim();
      const matchByHref = defaultSiteSettings.navbar.links.find(
        (item) => String(item.href || "").trim() === normalizedHref,
      );
      if (matchByHref?.icon) {
        return String(matchByHref.icon).trim().toLowerCase();
      }
      const matchByLabel = defaultSiteSettings.navbar.links.find(
        (item) =>
          String(item.label || "")
            .trim()
            .toLowerCase() === normalizedLabel,
      );
      if (matchByLabel?.icon) {
        return String(matchByLabel.icon).trim().toLowerCase();
      }
      return "link";
    };
    const navbarLinks = Array.isArray(merged?.navbar?.links)
      ? merged.navbar.links
          .map((link) => ({
            label: String(link?.label || "").trim(),
            href: sanitizePublicHref(String(link?.href || "").trim()) || "",
            icon: resolveNavbarIcon(link?.label, link?.href, link?.icon),
          }))
          .filter((link) => link.label && link.href)
      : [];
    const normalizedNavbarLinks = Array.isArray(merged?.navbar?.links)
      ? navbarLinks
      : defaultSiteSettings.navbar.links.map((link) => ({ ...link }));
    merged.navbar = {
      links: normalizedNavbarLinks,
    };
    const allowedPlacements = new Set(["navbar", "footer", "both"]);
    const allowedNavbarModes = new Set(["wordmark", "symbol-text", "symbol", "text"]);
    const allowedFooterModes = new Set(["wordmark", "symbol-text", "text"]);
    const legacyPlacement = String(merged?.branding?.wordmarkPlacement || "both");
    const normalizedLegacyPlacement = allowedPlacements.has(legacyPlacement)
      ? legacyPlacement
      : "both";
    const legacyWordmarkEnabled = Boolean(merged?.branding?.wordmarkEnabled);
    const legacyWordmarkUrl = String(merged?.branding?.wordmarkUrl || "").trim();
    const legacyWordmarkUrlNavbar = String(merged?.branding?.wordmarkUrlNavbar || "").trim();
    const legacyWordmarkUrlFooter = String(merged?.branding?.wordmarkUrlFooter || "").trim();
    const legacySiteSymbol = String(merged?.site?.logoUrl || "").trim();
    const legacyFooterSymbol = String(merged?.footer?.brandLogoUrl || "").trim();

    const payloadBranding =
      payload?.branding && typeof payload.branding === "object" ? payload.branding : null;
    const hasAnyNewBrandingInput = Boolean(
      payloadBranding &&
        (typeof payloadBranding.assets === "object" ||
          typeof payloadBranding.overrides === "object" ||
          typeof payloadBranding.display === "object"),
    );

    const rawBrandAssets =
      merged?.branding?.assets && typeof merged.branding.assets === "object"
        ? merged.branding.assets
        : {};
    const rawBrandOverrides =
      merged?.branding?.overrides && typeof merged.branding.overrides === "object"
        ? merged.branding.overrides
        : {};
    const rawBrandDisplay =
      merged?.branding?.display && typeof merged.branding.display === "object"
        ? merged.branding.display
        : {};

    const symbolAssetUrl =
      sanitizeAssetUrl(
        rawBrandAssets.symbolUrl || (!hasAnyNewBrandingInput ? legacySiteSymbol : "") || "",
      ) || "";
    const wordmarkAssetUrl =
      sanitizeAssetUrl(
        rawBrandAssets.wordmarkUrl ||
          (!hasAnyNewBrandingInput
            ? legacyWordmarkUrl || legacyWordmarkUrlNavbar || legacyWordmarkUrlFooter
            : "") ||
          "",
      ) || "";

    const navbarSymbolOverride = sanitizeAssetUrl(rawBrandOverrides.navbarSymbolUrl || "") || "";
    const footerSymbolOverride =
      sanitizeAssetUrl(
        rawBrandOverrides.footerSymbolUrl ||
          (!hasAnyNewBrandingInput ? legacyFooterSymbol : "") ||
          "",
      ) || "";
    const navbarWordmarkOverride =
      sanitizeAssetUrl(
        rawBrandOverrides.navbarWordmarkUrl ||
          (!hasAnyNewBrandingInput ? legacyWordmarkUrlNavbar : "") ||
          "",
      ) || "";
    const footerWordmarkOverride =
      sanitizeAssetUrl(
        rawBrandOverrides.footerWordmarkUrl ||
          (!hasAnyNewBrandingInput ? legacyWordmarkUrlFooter : "") ||
          "",
      ) || "";

    const legacyNavbarMode =
      legacyWordmarkEnabled &&
      (normalizedLegacyPlacement === "navbar" || normalizedLegacyPlacement === "both")
        ? "wordmark"
        : "symbol-text";
    const legacyFooterMode =
      legacyWordmarkEnabled &&
      (normalizedLegacyPlacement === "footer" || normalizedLegacyPlacement === "both")
        ? "wordmark"
        : "symbol-text";

    const navbarModeCandidate = String(rawBrandDisplay.navbar || "").trim();
    const footerModeCandidate = String(rawBrandDisplay.footer || "").trim();
    const navbarMode = allowedNavbarModes.has(navbarModeCandidate)
      ? navbarModeCandidate
      : legacyNavbarMode;
    const footerMode = allowedFooterModes.has(footerModeCandidate)
      ? footerModeCandidate
      : legacyFooterMode;

    const resolvedNavbarWordmark = navbarWordmarkOverride || wordmarkAssetUrl;
    const resolvedFooterWordmark = footerWordmarkOverride || wordmarkAssetUrl;
    const resolvedFooterSymbol = footerSymbolOverride || symbolAssetUrl;

    const usesWordmarkNavbar = navbarMode === "wordmark";
    const usesWordmarkFooter = footerMode === "wordmark";
    const compatPlacement =
      usesWordmarkNavbar && usesWordmarkFooter
        ? "both"
        : usesWordmarkNavbar
          ? "navbar"
          : usesWordmarkFooter
            ? "footer"
            : normalizedLegacyPlacement;
    const compatWordmarkEnabled = usesWordmarkNavbar || usesWordmarkFooter;

    merged.branding = {
      ...(merged.branding || {}),
      assets: {
        symbolUrl: symbolAssetUrl,
        wordmarkUrl: wordmarkAssetUrl,
      },
      overrides: {
        navbarSymbolUrl: navbarSymbolOverride,
        footerSymbolUrl: footerSymbolOverride,
        navbarWordmarkUrl: navbarWordmarkOverride,
        footerWordmarkUrl: footerWordmarkOverride,
      },
      display: {
        navbar: navbarMode,
        footer: footerMode,
      },
      wordmarkUrl: wordmarkAssetUrl,
      wordmarkUrlNavbar: resolvedNavbarWordmark,
      wordmarkUrlFooter: resolvedFooterWordmark,
      wordmarkPlacement: compatPlacement,
      wordmarkEnabled: compatWordmarkEnabled,
    };
    const normalizedSiteName =
      String(merged?.site?.name || defaultSiteSettings.site.name || "Nekomata").trim() ||
      String(defaultSiteSettings.site.name || "Nekomata").trim() ||
      "Nekomata";
    const siteFaviconUrl =
      sanitizeAssetUrl(merged?.site?.faviconUrl || defaultSiteSettings.site.faviconUrl || "") || "";
    const siteDefaultShareImage =
      sanitizeAssetUrl(
        merged?.site?.defaultShareImage || defaultSiteSettings.site.defaultShareImage || "",
      ) || defaultSiteSettings.site.defaultShareImage;
    const siteDefaultShareImageAlt =
      String(
        merged?.site?.defaultShareImageAlt || defaultSiteSettings.site.defaultShareImageAlt || "",
      ).trim() || defaultSiteSettings.site.defaultShareImageAlt;
    merged.site = {
      ...(merged.site || {}),
      name: normalizedSiteName,
      logoUrl: symbolAssetUrl,
      faviconUrl: siteFaviconUrl,
      defaultShareImage: siteDefaultShareImage,
      defaultShareImageAlt: siteDefaultShareImageAlt,
    };
    merged.footer = {
      ...(merged.footer || {}),
      brandName: normalizedSiteName,
      brandLogoUrl: resolvedFooterSymbol,
    };
    const discordUrl =
      sanitizePublicHref(
        String(
          merged?.community?.discordUrl || defaultSiteSettings.community.discordUrl || "",
        ).trim(),
      ) ||
      sanitizePublicHref(String(defaultSiteSettings.community.discordUrl || "").trim()) ||
      "";
    const inviteCardPayload =
      merged?.community?.inviteCard && typeof merged.community.inviteCard === "object"
        ? merged.community.inviteCard
        : {};
    const inviteCardDefaults = defaultSiteSettings.community?.inviteCard || {};
    const inviteCardTitle =
      String(inviteCardPayload.title || inviteCardDefaults.title || "").trim() ||
      String(inviteCardDefaults.title || "").trim();
    const inviteCardSubtitle =
      String(inviteCardPayload.subtitle || inviteCardDefaults.subtitle || "").trim() ||
      String(inviteCardDefaults.subtitle || "").trim();
    const inviteCardPanelTitle =
      String(inviteCardPayload.panelTitle || inviteCardDefaults.panelTitle || "").trim() ||
      String(inviteCardDefaults.panelTitle || "").trim();
    const inviteCardPanelDescription =
      normalizeLegacyInviteCardText(
        String(inviteCardPayload.panelDescription || inviteCardDefaults.panelDescription || ""),
      ).trim() || String(inviteCardDefaults.panelDescription || "").trim();
    const inviteCardCtaLabel =
      String(inviteCardPayload.ctaLabel || inviteCardDefaults.ctaLabel || "").trim() ||
      String(inviteCardDefaults.ctaLabel || "").trim();
    const inviteCardCtaUrlRaw =
      sanitizePublicHref(String(inviteCardPayload.ctaUrl || "").trim()) || "";
    const inviteCardCtaUrl = inviteCardCtaUrlRaw || discordUrl;

    merged.community = {
      ...(merged.community || {}),
      discordUrl,
      inviteCard: {
        title: inviteCardTitle,
        subtitle: inviteCardSubtitle,
        panelTitle: inviteCardPanelTitle,
        panelDescription: inviteCardPanelDescription,
        ctaLabel: inviteCardCtaLabel,
        ctaUrl: inviteCardCtaUrl,
      },
    };

    if (discordUrl && Array.isArray(merged.footer?.socialLinks)) {
      merged.footer.socialLinks = merged.footer.socialLinks.map((link) => {
        if (String(link.label || "").toLowerCase() === "discord" && !link.href) {
          return { ...link, href: discordUrl };
        }
        return link;
      });
    }
    if (Array.isArray(merged?.downloads?.sources)) {
      merged.downloads.sources = merged.downloads.sources.map((source) => ({
        ...source,
        tintIcon: source?.tintIcon !== false,
      }));
    }
    if (Array.isArray(merged?.footer?.socialLinks)) {
      merged.footer.socialLinks = merged.footer.socialLinks
        .map((link) => ({
          ...link,
          label: String(link?.label || "").trim(),
          href: sanitizePublicHref(link?.href) || "",
        }))
        .filter((link) => link.label && link.href);
    }
    merged.seo = {
      ...(merged.seo && typeof merged.seo === "object" ? merged.seo : {}),
      redirects: normalizePublicRedirects(merged?.seo?.redirects),
    };
    const rawReaderProjectTypes =
      merged?.reader?.projectTypes && typeof merged.reader.projectTypes === "object"
        ? merged.reader.projectTypes
        : {};
    merged.reader = {
      projectTypes: {
        manga: mergeProjectReaderConfig(
          getProjectReaderPresetByType("manga"),
          rawReaderProjectTypes.manga,
          {
            projectType: "manga",
          },
        ),
        webtoon: mergeProjectReaderConfig(
          getProjectReaderPresetByType("webtoon"),
          rawReaderProjectTypes.webtoon,
          {
            projectType: "webtoon",
          },
        ),
      },
    };
    return normalizeUploadsDeep(merged);
  };

  const buildSiteSettingsStoragePayload = (settings) => {
    const normalized = normalizeUploadsDeep(fixMojibakeDeep(settings || {}));
    const next = {
      ...(normalized && typeof normalized === "object" ? normalized : {}),
    };

    if (next.branding && typeof next.branding === "object") {
      const branding = { ...next.branding };
      LEGACY_BRANDING_STORAGE_KEYS.forEach((key) => {
        delete branding[key];
      });
      next.branding = branding;
    }

    if (next.site && typeof next.site === "object") {
      const site = { ...next.site };
      LEGACY_SITE_STORAGE_KEYS.forEach((key) => {
        delete site[key];
      });
      next.site = site;
    }

    if (next.footer && typeof next.footer === "object") {
      const footer = { ...next.footer };
      LEGACY_FOOTER_STORAGE_KEYS.forEach((key) => {
        delete footer[key];
      });
      next.footer = footer;
    }

    return next;
  };

  return {
    buildSiteSettingsStoragePayload,
    normalizeSiteSettings,
    normalizeUploadsDeep,
  };
};

export default createSiteSettingsRuntimeHelpers;
