import type { ProjectEpisode, ProjectEpisodePage } from "@/data/projects";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import { emptyPublicPagesConfig, type PublicPagesConfig } from "@/types/public-pages";
import type { PublicTeamLinkType, PublicTeamMember } from "@/types/public-team";
import type { SiteSettings } from "@/types/site-settings";

export type PublicBootstrapEpisode = {
  number: number;
  volume?: number;
  title: string;
  entryKind?: ProjectEpisode["entryKind"];
  entrySubtype?: string;
  readingOrder?: number;
  displayLabel?: string;
  synopsis?: string;
  content?: string;
  releaseDate: string;
  duration: string;
  coverImageUrl: string;
  coverImageAlt: string;
  sourceType: string;
  hash?: string;
  sizeBytes?: number;
  sources: Array<{ label: string; url: string }>;
  progressStage: string;
  completedStages: string[];
  chapterUpdatedAt: string;
  contentFormat?: "lexical" | "images";
  pages?: ProjectEpisodePage[];
  pageCount?: number;
  hasContent: boolean;
  hasPages?: boolean;
};

export type PublicBootstrapInProgressItem = {
  projectId: string;
  projectTitle: string;
  projectType: string;
  number: number;
  volume?: number;
  entryKind?: ProjectEpisode["entryKind"];
  displayLabel?: string;
  progressStage: string;
  completedStages: string[];
};

export type PublicBootstrapVolumeCover = {
  volume?: number;
  coverImageUrl: string;
  coverImageAlt: string;
};

export type PublicBootstrapVolumeEntry = {
  volume: number;
  synopsis: string;
  coverImageUrl: string;
  coverImageAlt: string;
};

export type PublicBootstrapProjectStaff = {
  role: string;
  members: string[];
};

export type PublicBootstrapProjectRelation = {
  relation: string;
  title: string;
  format: string;
  status: string;
  image: string;
  anilistId?: number;
  projectId?: string;
};

export type PublicBootstrapProject = {
  id: string;
  anilistId?: number | null;
  title: string;
  titleOriginal: string;
  titleEnglish: string;
  synopsis: string;
  description: string;
  type: string;
  status: string;
  year?: string;
  tags: string[];
  genres: string[];
  cover: string;
  coverAlt: string;
  banner: string;
  bannerAlt: string;
  season?: string;
  schedule?: string;
  rating?: string;
  country?: string;
  source?: string;
  heroImageUrl: string;
  heroImageAlt: string;
  heroLogoUrl: string;
  heroLogoAlt: string;
  forceHero: boolean;
  trailerUrl: string;
  studio: string;
  animationStudios: string[];
  episodes: string;
  producers: string[];
  score?: number | null;
  startDate?: string;
  endDate?: string;
  staff: PublicBootstrapProjectStaff[];
  animeStaff: PublicBootstrapProjectStaff[];
  relations?: PublicBootstrapProjectRelation[];
  readerConfig?: {
    direction?: "rtl" | "ltr";
    layout?: "single" | "double" | "scroll-vertical" | "scroll-horizontal";
    imageFit?: "both" | "none" | "width" | "height";
    background?: "theme" | "black" | "white";
    progressStyle?: "default" | "hidden";
    progressPosition?: "bottom" | "left" | "right";
    firstPageSingle?: boolean;
    chromeMode?: "default" | "cinema";
    viewportMode?: "viewport" | "natural";
    siteHeaderVariant?: "static" | "fixed";
    showSiteHeader?: boolean;
    showSiteFooter?: boolean;
    previewLimit?: number | null;
    purchaseUrl?: string;
    purchasePrice?: string;
    viewMode?: "page" | "scroll";
    allowSpread?: boolean;
    showFooter?: boolean;
    themePreset?: string;
  };
  volumeEntries?: PublicBootstrapVolumeEntry[];
  volumeCovers: PublicBootstrapVolumeCover[];
  episodeDownloads: PublicBootstrapEpisode[];
  views: number;
  viewsDaily: Record<string, number>;
  commentsCount?: number;
};

export type PublicBootstrapPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  coverImageUrl: string;
  coverAlt: string;
  projectId: string;
  tags: string[];
};

export type PublicBootstrapPostDetail = PublicBootstrapPost & {
  views: number;
  commentsCount: number;
  content: string;
  contentFormat?: "lexical";
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export type PublicBootstrapUpdate = {
  id: string;
  projectId: string;
  projectTitle: string;
  episodeNumber: number;
  volume?: number;
  kind: string;
  reason: string;
  updatedAt: string;
  image: string;
  unit: string;
};

export type PublicBootstrapHomeHeroSlide = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  image: string;
  projectId: string;
  trailerUrl: string;
  format: string;
  status: string;
  heroLogoUrl: string;
  heroLogoAlt: string;
};

export type PublicBootstrapHomeHero = {
  initialSlideId: string;
  latestSlideId: string;
  hasMultipleSlides: boolean;
  slides: PublicBootstrapHomeHeroSlide[];
};

export type PublicBootstrapPayloadMode = "full" | "critical-home" | "shell";

export type PublicRoutePayloadKind =
  | "projects-list"
  | "project-detail"
  | "project-reading"
  | "team"
  | "donations";

export type PublicRoutePayloadProjectLookup = Record<string, string>;

export type PublicRouteProjectsListPayload = {
  kind: "projects-list";
  generatedAt: string;
  projects: PublicBootstrapProject[];
  mediaVariants?: UploadMediaVariantsMap;
  tagTranslations: PublicBootstrapPayload["tagTranslations"];
};

export type PublicRouteProjectDetailPayload = {
  kind: "project-detail";
  generatedAt: string;
  project: PublicBootstrapProject | null;
  revision: string;
  mediaVariants?: UploadMediaVariantsMap;
  relationProjectLookup: PublicRoutePayloadProjectLookup;
  tagTranslations: PublicBootstrapPayload["tagTranslations"];
};

export type PublicRouteProjectReadingPayload = {
  kind: "project-reading";
  generatedAt: string;
  project: PublicBootstrapProject | null;
  chapter: PublicBootstrapEpisode | null;
  readerConfig?: PublicBootstrapProject["readerConfig"] | null;
  mediaVariants?: UploadMediaVariantsMap;
  tagTranslations: PublicBootstrapPayload["tagTranslations"];
};

export type PublicRouteTeamPayload = {
  kind: "team";
  generatedAt: string;
  teamMembers: PublicTeamMember[];
  teamLinkTypes: PublicTeamLinkType[];
  mediaVariants?: UploadMediaVariantsMap;
};

export type PublicRouteDonationsPayload = {
  kind: "donations";
  generatedAt: string;
  pixQrCodeUrl: string;
  cryptoQrCodeUrls: Record<string, string>;
};

export type PublicRoutePayload =
  | PublicRouteProjectsListPayload
  | PublicRouteProjectDetailPayload
  | PublicRouteProjectReadingPayload
  | PublicRouteTeamPayload
  | PublicRouteDonationsPayload;

export type PublicBootstrapPayload = {
  settings: SiteSettings;
  pages: PublicPagesConfig;
  projects: PublicBootstrapProject[];
  inProgressItems: PublicBootstrapInProgressItem[];
  posts: PublicBootstrapPost[];
  updates: PublicBootstrapUpdate[];
  teamMembers: PublicTeamMember[];
  teamLinkTypes: PublicTeamLinkType[];
  mediaVariants?: UploadMediaVariantsMap;
  tagTranslations: {
    tags: Record<string, string>;
    genres: Record<string, string>;
    staffRoles: Record<string, string>;
  };
  homeHero?: PublicBootstrapHomeHero | null;
  currentPostDetail?: PublicBootstrapPostDetail | null;
  generatedAt: string;
  payloadMode?: PublicBootstrapPayloadMode;
};

export const emptyPublicBootstrapPayload: PublicBootstrapPayload = {
  settings: {} as SiteSettings,
  pages: emptyPublicPagesConfig,
  projects: [],
  inProgressItems: [],
  posts: [],
  updates: [],
  teamMembers: [],
  teamLinkTypes: [],
  mediaVariants: {},
  tagTranslations: {
    tags: {},
    genres: {},
    staffRoles: {},
  },
  homeHero: null,
  currentPostDetail: null,
  generatedAt: "",
  payloadMode: "full",
};
