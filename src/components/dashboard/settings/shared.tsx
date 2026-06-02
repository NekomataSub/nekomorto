import {
  BadgeCheck,
  Camera,
  Check,
  Clock,
  Cloud,
  Code,
  Download,
  HardDrive,
  Languages,
  Layers,
  Link2,
  MessageCircle,
  Paintbrush,
  Palette,
  PenTool,
  Send,
  Sparkles,
  User,
  Users,
  Video,
  X,
} from "lucide-react";
import { dashboardPageLayoutTokens } from "@/components/dashboard/dashboard-page-tokens";
import { type DashboardSettingsLinkTypeItem } from "@/lib/dashboard-settings-cache";
import { DEFAULT_SITE_SHARE_IMAGE_ALT, resolveAssetAltText } from "@/lib/image-alt";
import type { SiteSettings } from "@/types/site-settings";
import {
  getProjectReaderPresetByType,
  mergeProjectReaderConfig,
} from "../../../../shared/project-reader.js";
export const roleIconOptions = [
  { id: "languages", label: "Languages" },
  { id: "check", label: "Check" },
  { id: "pen-tool", label: "Pen Tool" },
  { id: "sparkles", label: "Sparkles" },
  { id: "code", label: "Code" },
  { id: "paintbrush", label: "Paintbrush" },
  { id: "layers", label: "Layers" },
  { id: "video", label: "Video" },
  { id: "clock", label: "Clock" },
  { id: "badge", label: "Badge" },
  { id: "palette", label: "Palette" },
  { id: "user", label: "User" },
];

export const roleIconMap: Record<string, typeof User> = {
  languages: Languages,
  check: Check,
  "pen-tool": PenTool,
  sparkles: Sparkles,
  code: Code,
  paintbrush: Paintbrush,
  layers: Layers,
  video: Video,
  clock: Clock,
  badge: BadgeCheck,
  palette: Palette,
  user: User,
};

export const socialIconMap: Record<string, typeof Link2> = {
  "google-drive": Cloud,
  mega: HardDrive,
  torrent: Download,
  mediafire: HardDrive,
  telegram: Send,
  link: Link2,
  instagram: Camera,
  facebook: Users,
  twitter: X,
  discord: MessageCircle,
};

export const dashboardSettingsCardClassName = dashboardPageLayoutTokens.surfaceSolid;
export const dashboardSettingsInsetSurfaceClassName = dashboardPageLayoutTokens.groupedFieldSurface;
export const dashboardSettingsControlSurfaceClassName = dashboardPageLayoutTokens.controlSurface;
export const dashboardSettingsMetaTextClassName = dashboardPageLayoutTokens.cardMetaText;

export const responsiveSvgCardRowClass = `grid gap-3 ${dashboardSettingsInsetSurfaceClassName} p-3 shadow-sm md:items-center md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none`;
export const responsiveSvgCardPickerClusterClass =
  "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 md:contents";
export const responsiveSvgCardColorClass = `flex w-auto items-center justify-start ${dashboardSettingsControlSurfaceClassName} px-2.5 py-1.5 md:w-full md:justify-center md:border-0 md:bg-transparent md:px-0 md:py-0`;
export const responsiveSvgCardTintClass = `flex min-w-0 items-center justify-between gap-2 ${dashboardSettingsControlSurfaceClassName} px-3 py-1.5 md:w-auto md:justify-center md:gap-2 md:px-3 md:py-2`;
export const responsiveSvgCardTintLabelClass = `text-[9px] font-semibold uppercase tracking-[0.24em] ${dashboardSettingsMetaTextClassName} md:text-[10px] md:tracking-widest`;
export const responsiveSvgCardPreviewClass = `flex min-w-0 items-center gap-3 ${dashboardSettingsControlSurfaceClassName} px-3 py-2 text-xs ${dashboardSettingsMetaTextClassName}`;
export const responsiveSvgCardPreviewStatusClass = "min-w-0 flex-1 truncate";
export const responsiveSvgCardUploadActionClass =
  "ml-auto flex shrink-0 items-center gap-1.5 md:gap-2";
export const responsiveSvgCardUploadLabelClass =
  "inline-flex h-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-border/70 bg-background px-2.5 text-[10px] font-medium text-foreground transition hover:border-primary/50 md:h-8 md:px-3 md:text-[11px]";
export const responsiveSvgCardMobileRemoveButtonClass =
  "h-7 w-7 shrink-0 text-destructive hover:text-destructive md:hidden";
export const responsiveSvgCardDesktopRemoveButtonClass =
  "hidden text-destructive hover:text-destructive md:inline-flex md:justify-self-auto";
export const responsiveCompactRowDeleteButtonClass =
  "h-7 w-7 justify-self-end text-destructive hover:text-destructive md:h-10 md:w-10 md:justify-self-auto";
export const responsiveCompactSelfEndDeleteButtonClass =
  "h-7 w-7 self-end text-destructive hover:text-destructive md:h-10 md:w-10 md:self-auto";
export const responsiveCompactTextareaRowClass = `grid gap-3 ${dashboardSettingsInsetSurfaceClassName} p-3 shadow-sm md:grid-cols-[1fr_auto] md:items-start md:rounded-none md:border-0 md:bg-transparent md:p-0 md:shadow-none`;
export const responsiveFooterCardShellClass = `${dashboardSettingsInsetSurfaceClassName} p-3 space-y-3 md:p-4 md:space-y-4`;
export const responsiveFooterSocialGridClass =
  "grid gap-3 md:min-w-[720px] md:grid-cols-[auto_auto_minmax(180px,0.95fr)_minmax(260px,1.55fr)_auto] md:items-center";
export const responsiveFooterSocialTopRowClass =
  "grid grid-cols-[auto_1fr_auto] items-center gap-2 md:contents";
export const responsiveFooterSocialDragButtonClass = `inline-flex h-7 w-7 cursor-grab items-center justify-center rounded-md border border-border/70 bg-background text-foreground/70 transition hover:border-primary/40 hover:text-primary active:cursor-grabbing md:h-9 md:w-9`;
export const responsiveFooterSocialDesktopRemoveButtonClass =
  "hidden h-9 w-9 shrink-0 text-destructive hover:text-destructive md:inline-flex";
export const responsiveTranslationTableClass =
  "min-w-[560px] w-full table-fixed text-sm md:min-w-0 md:table-auto";
export const responsiveTranslationTermColClass = "w-[38%] md:w-auto";
export const responsiveTranslationValueColClass = "w-[50%] md:w-auto";
export const responsiveTranslationActionColClass = "w-[72px] md:w-auto";

export const normalizeLinkTypeId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const addIconCacheBust = (iconUrl: string | null | undefined, cacheVersion: number) => {
  const trimmed = String(iconUrl || "").trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("/uploads/")) {
    const parsed = new URL(trimmed, "http://localhost");
    parsed.searchParams.set("v", String(cacheVersion));
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (!parsed.pathname.startsWith("/uploads/")) {
      return trimmed;
    }
    parsed.searchParams.set("v", String(cacheVersion));
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

export const reorderItems = <T,>(items: T[], from: number, to: number) => {
  if (from === to) {
    return items;
  }
  if (from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (typeof moved === "undefined") {
    return items;
  }
  next.splice(to, 0, moved);
  return next;
};

export type LogoLibraryTarget =
  | "branding.assets.symbolUrl"
  | "branding.assets.wordmarkUrl"
  | "site.faviconUrl"
  | "site.defaultShareImage"
  | "branding.overrides.navbarWordmarkUrl"
  | "branding.overrides.footerWordmarkUrl"
  | "branding.overrides.navbarSymbolUrl"
  | "branding.overrides.footerSymbolUrl";

export type NavbarBrandMode = SiteSettings["branding"]["display"]["navbar"];
export type FooterBrandMode = SiteSettings["branding"]["display"]["footer"];

export type SettingsTabKey =
  | "geral"
  | "leitor"
  | "seo"
  | "downloads"
  | "equipe"
  | "layout"
  | "redes-usuarios"
  | "traducoes";

export const DASHBOARD_SETTINGS_DEFAULT_TAB: SettingsTabKey = "geral";
export const dashboardSettingsTabSet = new Set<SettingsTabKey>([
  "geral",
  "leitor",
  "seo",
  "downloads",
  "equipe",
  "layout",
  "redes-usuarios",
  "traducoes",
]);

export const isDashboardSettingsTab = (value: string): value is SettingsTabKey =>
  dashboardSettingsTabSet.has(value as SettingsTabKey);
export const parseDashboardSettingsTabParam = (value: string | null): SettingsTabKey => {
  const normalized = String(value || "").trim();
  if (normalized === "navbar" || normalized === "footer") {
    return "layout";
  }
  if (isDashboardSettingsTab(normalized)) {
    return normalized;
  }
  return DASHBOARD_SETTINGS_DEFAULT_TAB;
};

export type LinkTypeItem = DashboardSettingsLinkTypeItem;
export type ReaderProjectTypeKey = keyof SiteSettings["reader"]["projectTypes"];
export type TranslationsPayload = {
  tags: Record<string, string>;
  genres: Record<string, string>;
  staffRoles: Record<string, string>;
};

export const readerProjectTypeMeta: Array<{
  key: ReaderProjectTypeKey;
  title: string;
  description: string;
  projectType: string;
}> = [
  {
    key: "manga",
    title: "Mangá",
    description:
      "Preset global usado por projetos de mangá na leitura pública e nos previews editoriais.",
    projectType: "manga",
  },
  {
    key: "webtoon",
    title: "Webtoon",
    description:
      "Preset global usado por projetos de webtoon na leitura pública e nos previews editoriais.",
    projectType: "webtoon",
  },
];

export type LogoEditorField = {
  target: LogoLibraryTarget;
  label: string;
  description: string;
  frameClassName: string;
  imageClassName: string;
  optional?: boolean;
};

export const seoLogoFieldTargets = new Set<LogoLibraryTarget>([
  "site.faviconUrl",
  "site.defaultShareImage",
]);

export const logoEditorFields: LogoEditorField[] = [
  {
    target: "branding.assets.symbolUrl",
    label: "Símbolo da marca",
    description: "Ativo principal usado como base para logo da marca.",
    frameClassName: "h-16",
    imageClassName: "h-10 w-10 rounded bg-background object-contain",
  },
  {
    target: "branding.assets.wordmarkUrl",
    label: "Logotipo (wordmark)",
    description: "Tipografia principal da marca usada como base para header e footer.",
    frameClassName: "h-16",
    imageClassName: "h-10 w-full object-contain",
  },
  {
    target: "site.faviconUrl",
    label: "Favicon",
    description: "Ícone mostrado na aba do navegador.",
    frameClassName: "h-20",
    imageClassName: "h-10 w-10 rounded bg-background object-contain",
  },
  {
    target: "site.defaultShareImage",
    label: "Imagem de compartilhamento",
    description: "Imagem padrão de cards sociais quando a página não define uma própria.",
    frameClassName: "h-20",
    imageClassName: "h-full w-full rounded bg-background object-cover",
  },
  {
    target: "branding.overrides.navbarWordmarkUrl",
    label: "Override de wordmark da navbar",
    description: "Opcional. Se vazio, a navbar usa o logotipo principal.",
    frameClassName: "h-16",
    imageClassName: "h-10 w-full object-contain",
    optional: true,
  },
  {
    target: "branding.overrides.footerWordmarkUrl",
    label: "Override de wordmark do footer",
    description: "Opcional. Se vazio, o footer usa o logotipo principal.",
    frameClassName: "h-16",
    imageClassName: "h-10 w-full object-contain",
    optional: true,
  },
  {
    target: "branding.overrides.navbarSymbolUrl",
    label: "Override de símbolo da navbar",
    description: "Opcional. Se vazio, a navbar usa o símbolo principal.",
    frameClassName: "h-16",
    imageClassName: "h-10 w-10 rounded bg-background object-contain",
    optional: true,
  },
  {
    target: "branding.overrides.footerSymbolUrl",
    label: "Override de símbolo do footer",
    description: "Opcional. Se vazio, o footer usa o símbolo principal.",
    frameClassName: "h-16",
    imageClassName: "h-10 w-10 rounded bg-background object-contain",
    optional: true,
  },
];

export const brandingLogoEditorFields = logoEditorFields.filter(
  (field) => !seoLogoFieldTargets.has(field.target),
);

export const seoLogoEditorFields = logoEditorFields.filter((field) =>
  seoLogoFieldTargets.has(field.target),
);

export const readLogoField = (nextSettings: SiteSettings, target: LogoLibraryTarget) => {
  if (target === "branding.assets.symbolUrl") {
    return nextSettings.branding.assets.symbolUrl || "";
  }
  if (target === "branding.assets.wordmarkUrl") {
    return nextSettings.branding.assets.wordmarkUrl || "";
  }
  if (target === "site.faviconUrl") {
    return nextSettings.site.faviconUrl || "";
  }
  if (target === "site.defaultShareImage") {
    return nextSettings.site.defaultShareImage || "";
  }
  if (target === "branding.overrides.navbarWordmarkUrl") {
    return nextSettings.branding.overrides.navbarWordmarkUrl || "";
  }
  if (target === "branding.overrides.footerWordmarkUrl") {
    return nextSettings.branding.overrides.footerWordmarkUrl || "";
  }
  if (target === "branding.overrides.navbarSymbolUrl") {
    return nextSettings.branding.overrides.navbarSymbolUrl || "";
  }
  if (target === "branding.overrides.footerSymbolUrl") {
    return nextSettings.branding.overrides.footerSymbolUrl || "";
  }
  return "";
};

export const writeLogoField = (
  nextSettings: SiteSettings,
  target: LogoLibraryTarget,
  url: string,
) => {
  if (target === "branding.assets.symbolUrl") {
    return {
      ...nextSettings,
      branding: {
        ...nextSettings.branding,
        assets: { ...nextSettings.branding.assets, symbolUrl: url },
      },
    };
  }
  if (target === "branding.assets.wordmarkUrl") {
    return {
      ...nextSettings,
      branding: {
        ...nextSettings.branding,
        assets: { ...nextSettings.branding.assets, wordmarkUrl: url },
      },
    };
  }
  if (target === "site.faviconUrl") {
    return { ...nextSettings, site: { ...nextSettings.site, faviconUrl: url } };
  }
  if (target === "site.defaultShareImage") {
    return {
      ...nextSettings,
      site: { ...nextSettings.site, defaultShareImage: url },
    };
  }
  if (target === "branding.overrides.navbarWordmarkUrl") {
    return {
      ...nextSettings,
      branding: {
        ...nextSettings.branding,
        overrides: {
          ...nextSettings.branding.overrides,
          navbarWordmarkUrl: url,
        },
      },
    };
  }
  if (target === "branding.overrides.footerWordmarkUrl") {
    return {
      ...nextSettings,
      branding: {
        ...nextSettings.branding,
        overrides: {
          ...nextSettings.branding.overrides,
          footerWordmarkUrl: url,
        },
      },
    };
  }
  if (target === "branding.overrides.navbarSymbolUrl") {
    return {
      ...nextSettings,
      branding: {
        ...nextSettings.branding,
        overrides: { ...nextSettings.branding.overrides, navbarSymbolUrl: url },
      },
    };
  }
  if (target === "branding.overrides.footerSymbolUrl") {
    return {
      ...nextSettings,
      branding: {
        ...nextSettings.branding,
        overrides: { ...nextSettings.branding.overrides, footerSymbolUrl: url },
      },
    };
  }
  return nextSettings;
};

export const normalizeDefaultShareImageSettings = (value: SiteSettings): SiteSettings => {
  const defaultShareImage = String(value.site.defaultShareImage || "").trim();
  return {
    ...value,
    site: {
      ...value.site,
      defaultShareImage,
      defaultShareImageAlt: defaultShareImage
        ? resolveAssetAltText(value.site.defaultShareImageAlt, DEFAULT_SITE_SHARE_IMAGE_ALT)
        : "",
    },
  };
};

export const sanitizeReaderPresetForDashboardSave = (
  preset: SiteSettings["reader"]["projectTypes"][ReaderProjectTypeKey],
  projectType: ReaderProjectTypeKey,
) => ({
  ...mergeProjectReaderConfig(getProjectReaderPresetByType(projectType), preset, {
    projectType,
  }),
  previewLimit: null,
  purchaseUrl: "",
  purchasePrice: "",
});

export const sanitizeReaderProjectTypesForDashboardSave = (
  projectTypes: SiteSettings["reader"]["projectTypes"],
): SiteSettings["reader"]["projectTypes"] => ({
  manga: sanitizeReaderPresetForDashboardSave(projectTypes.manga, "manga"),
  webtoon: sanitizeReaderPresetForDashboardSave(projectTypes.webtoon, "webtoon"),
});
