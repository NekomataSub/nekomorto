import {
  BadgeDollarSign,
  Banknote,
  Bitcoin,
  CircleDollarSign,
  Coins,
  DollarSign,
  Flame,
  GripVertical,
  HandCoins,
  Heart,
  HeartHandshake,
  HelpCircle,
  Info,
  Landmark,
  Languages,
  Layers,
  Paintbrush,
  PenTool,
  PiggyBank,
  Plus,
  QrCode,
  Rocket,
  ScanText,
  Server,
  Shield,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash2,
  Users,
  Video,
  Wallet,
  Wallet2,
  WalletCards,
  WalletMinimal,
  Wand2,
  Zap,
} from "lucide-react";
import {
  type DragEvent,
  type FocusEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import DashboardAutosaveStatus from "@/components/DashboardAutosaveStatus";
import DashboardShell from "@/components/DashboardShell";
import DashboardActionButton, {
  default as Button,
} from "@/components/dashboard/DashboardActionButton";
import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import DashboardPageBadge from "@/components/dashboard/DashboardPageBadge";
import { Combobox, Input, Textarea } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardAnimationDelay,
  dashboardMotionDelays,
} from "@/components/dashboard/dashboard-motion";
import {
  dashboardPageLayoutTokens,
  dashboardSubtleSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import LazyImageLibraryDialog from "@/components/lazy/LazyImageLibraryDialog";
import ReorderControls from "@/components/ReorderControls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import AsyncState from "@/components/ui/async-state";
import { Card, CardContent } from "@/components/ui/card";
import type { ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import {
  autosaveRuntimeConfig,
  autosaveStorageKeys,
  readAutosavePreference,
  writeAutosavePreference,
} from "@/config/autosave";
import { useAutosave } from "@/hooks/use-autosave";
import { useDashboardCurrentUser } from "@/hooks/use-dashboard-current-user";
import { useDashboardRefreshToast } from "@/hooks/use-dashboard-refresh-toast";
import { usePageMeta } from "@/hooks/use-page-meta";
import { usePixQrCode } from "@/hooks/use-pix-qr-code";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { normalizeAssetUrl } from "@/lib/asset-url";
import { applyBeforeUnloadCompatibility } from "@/lib/before-unload";
import {
  DEFAULT_DONATIONS_CRYPTO_ICON,
  emptyDonationsCryptoService,
  normalizeDonationsCryptoServices,
} from "@/lib/donations-crypto";
import {
  finalizeMonthlyGoalAmountInput,
  normalizeMonthlyGoalAmountInput,
  sanitizeMonthlyGoalSupportersInput,
} from "@/lib/donations-monthly-goal";
import { getShareImageAltFallback, resolveAssetAltText } from "@/lib/image-alt";
import { filterImageLibraryFoldersByAccess } from "@/lib/image-library-scope";
import { comparePtBr } from "@/lib/search-ranking";
import type { DonationsCryptoService } from "@/types/public-pages";

type AboutHighlight = DashboardPagesEditorRecord & { label: string; text: string; icon: string };
type AboutValue = DashboardPagesEditorRecord & { title: string; description: string; icon: string };
type AboutPillar = DashboardPagesEditorRecord & {
  title: string;
  description: string;
  icon: string;
};
type DashboardPagesEditorRecord = { _editorKey?: string };
type DonationsCost = DashboardPagesEditorRecord & {
  title: string;
  description: string;
  icon: string;
};
type Donor = DashboardPagesEditorRecord & {
  name: string;
  amount: string;
  goal: string;
  date: string;
};
type CryptoService = DonationsCryptoService & DashboardPagesEditorRecord;
type FAQItem = DashboardPagesEditorRecord & { question: string; answer: string };
type FAQGroup = DashboardPagesEditorRecord & { title: string; icon: string; items: FAQItem[] };
type FAQIntro = DashboardPagesEditorRecord & {
  title: string;
  icon: string;
  text: string;
  note: string;
};
type RecruitmentRole = DashboardPagesEditorRecord & {
  title: string;
  description: string;
  icon: string;
};
type PageWithShareImage = { shareImage: string; shareImageAlt: string };
type PublicPageKey = "about" | "donations" | "faq" | "team" | "recruitment";
type ShareImagePageKey = "home" | "projects" | PublicPageKey;
type DashboardPagesTabKey = PublicPageKey | "preview";

type PagesConfig = {
  home: PageWithShareImage;
  projects: PageWithShareImage;
  about: PageWithShareImage & {
    heroBadge: string;
    heroTitle: string;
    heroSubtitle: string;
    heroBadges: string[];
    highlights: AboutHighlight[];
    manifestoTitle: string;
    manifestoIcon: string;
    manifestoParagraphs: string[];
    pillars: AboutPillar[];
    values: AboutValue[];
  };
  donations: PageWithShareImage & {
    heroTitle: string;
    heroSubtitle: string;
    costs: DonationsCost[];
    reasonTitle: string;
    reasonIcon: string;
    reasonText: string;
    reasonNote: string;
    monthlyGoalRaised: string;
    monthlyGoalTarget: string;
    monthlyGoalSupporters: string;
    monthlyGoalNote: string;
    cryptoTitle: string;
    cryptoSubtitle: string;
    cryptoServices: CryptoService[];
    pixKey: string;
    pixNote: string;
    pixCity: string;
    qrCustomUrl: string;
    pixIcon: string;
    donorsIcon: string;
    donors: Donor[];
  };
  faq: PageWithShareImage & {
    heroTitle: string;
    heroSubtitle: string;
    introCards: FAQIntro[];
    groups: FAQGroup[];
  };
  team: PageWithShareImage & {
    heroBadge: string;
    heroTitle: string;
    heroSubtitle: string;
    retiredTitle: string;
    retiredSubtitle: string;
  };
  recruitment: PageWithShareImage & {
    heroBadge: string;
    heroTitle: string;
    heroSubtitle: string;
    roles: RecruitmentRole[];
    ctaTitle: string;
    ctaSubtitle: string;
    ctaButtonLabel: string;
  };
};

const iconOptions = [
  "Heart",
  "Sparkles",
  "Users",
  "Wand2",
  "Flame",
  "Zap",
  "Server",
  "PiggyBank",
  "Coins",
  "HandCoins",
  "Wallet",
  "Wallet2",
  "WalletCards",
  "WalletMinimal",
  "BadgeDollarSign",
  "Landmark",
  "Banknote",
  "CircleDollarSign",
  "DollarSign",
  "Bitcoin",
  "HeartHandshake",
  "QrCode",
  "HelpCircle",
  "Info",
  "Rocket",
  "Shield",
  "Languages",
  "ScanText",
  "PenTool",
  "Video",
  "Paintbrush",
  "Layers",
  "Timer",
  "ShieldCheck",
];

const editorIconMap: Record<string, typeof Heart> = {
  Heart,
  Sparkles,
  Users,
  Wand2,
  Flame,
  Zap,
  Server,
  PiggyBank,
  Coins,
  HandCoins,
  Wallet,
  Wallet2,
  WalletCards,
  WalletMinimal,
  BadgeDollarSign,
  Landmark,
  Banknote,
  CircleDollarSign,
  DollarSign,
  Bitcoin,
  HeartHandshake,
  QrCode,
  HelpCircle,
  Info,
  Rocket,
  Shield,
  Languages,
  ScanText,
  PenTool,
  Video,
  Paintbrush,
  Layers,
  Timer,
  ShieldCheck,
};

const emptyPages: PagesConfig = {
  home: {
    shareImage: "",
    shareImageAlt: "",
  },
  projects: {
    shareImage: "",
    shareImageAlt: "",
  },
  about: {
    shareImage: "",
    shareImageAlt: "",
    heroBadge: "",
    heroTitle: "",
    heroSubtitle: "",
    heroBadges: [],
    highlights: [],
    manifestoTitle: "",
    manifestoIcon: "Flame",
    manifestoParagraphs: [],
    pillars: [],
    values: [],
  },
  donations: {
    shareImage: "",
    shareImageAlt: "",
    heroTitle: "",
    heroSubtitle: "",
    costs: [],
    reasonTitle: "",
    reasonIcon: "HeartHandshake",
    reasonText: "",
    reasonNote: "",
    monthlyGoalRaised: "",
    monthlyGoalTarget: "",
    monthlyGoalSupporters: "",
    monthlyGoalNote: "",
    cryptoTitle: "",
    cryptoSubtitle: "",
    cryptoServices: [],
    pixKey: "",
    pixNote: "",
    pixCity: "",
    qrCustomUrl: "",
    pixIcon: "QrCode",
    donorsIcon: "PiggyBank",
    donors: [],
  },
  faq: {
    shareImage: "",
    shareImageAlt: "",
    heroTitle: "",
    heroSubtitle: "",
    introCards: [],
    groups: [],
  },
  team: {
    shareImage: "",
    shareImageAlt: "",
    heroBadge: "",
    heroTitle: "",
    heroSubtitle: "",
    retiredTitle: "",
    retiredSubtitle: "",
  },
  recruitment: {
    shareImage: "",
    shareImageAlt: "",
    heroBadge: "",
    heroTitle: "",
    heroSubtitle: "",
    roles: [],
    ctaTitle: "",
    ctaSubtitle: "",
    ctaButtonLabel: "",
  },
};

const defaultPages: PagesConfig = emptyPages;
const DASHBOARD_PAGES_CACHE_TTL_MS = 60_000;

type DashboardPagesCacheEntry = {
  pages: PagesConfig;
  expiresAt: number;
};

let dashboardPagesCache: DashboardPagesCacheEntry | null = null;

const clonePagesConfig = (value: PagesConfig) => JSON.parse(JSON.stringify(value)) as PagesConfig;

const generateDashboardPagesEditorLocalId = () => {
  const alpha = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  const random = Math.random().toString(36).slice(2, 9);
  const stamp = Date.now().toString(36).slice(-3);
  return `${alpha}${random}${stamp}`;
};

const resolveDashboardPagesEditorLocalKey = (
  currentKey: string | null | undefined,
  fallbackKey?: string | null,
) => {
  const normalizedCurrentKey = String(currentKey || "").trim();
  if (normalizedCurrentKey) {
    return normalizedCurrentKey;
  }
  const normalizedFallbackKey = String(fallbackKey || "").trim();
  if (normalizedFallbackKey) {
    return normalizedFallbackKey;
  }
  return generateDashboardPagesEditorLocalId();
};

const withDashboardPagesEditorKeys = <T extends DashboardPagesEditorRecord>(
  items: T[] | null | undefined,
  previousItems?: Array<DashboardPagesEditorRecord | null | undefined>,
) => {
  if (!Array.isArray(items)) {
    return [] as T[];
  }

  return items.map((item, index) => ({
    ...item,
    _editorKey: resolveDashboardPagesEditorLocalKey(
      item?._editorKey,
      previousItems?.[index]?._editorKey,
    ),
  }));
};

const stripDashboardPagesEditorKeys = <T extends object>(items: T[] | null | undefined) => {
  if (!Array.isArray(items)) {
    return [] as Array<Omit<T, "_editorKey">>;
  }

  return items.map((item) => {
    const { _editorKey: _ignoredEditorKey, ...nextItem } = item as T & DashboardPagesEditorRecord;
    return nextItem as Omit<T, "_editorKey">;
  });
};

const normalizeDonationsCryptoServicesForSave = (
  services: CryptoService[] | null | undefined,
): DonationsCryptoService[] =>
  stripDashboardPagesEditorKeys(normalizeDonationsCryptoServices(services));

const readDashboardPagesCache = () => {
  if (!dashboardPagesCache) {
    return null;
  }
  if (dashboardPagesCache.expiresAt <= Date.now()) {
    dashboardPagesCache = null;
    return null;
  }
  return clonePagesConfig(dashboardPagesCache.pages);
};

const writeDashboardPagesCache = (value: PagesConfig) => {
  dashboardPagesCache = {
    pages: clonePagesConfig(value),
    expiresAt: Date.now() + DASHBOARD_PAGES_CACHE_TTL_MS,
  };
};

const mergePagesConfig = (value: Partial<PagesConfig> | null | undefined): PagesConfig => {
  const incoming = value || {};
  return {
    ...defaultPages,
    ...incoming,
    home: { ...defaultPages.home, ...(incoming.home || {}) },
    projects: { ...defaultPages.projects, ...(incoming.projects || {}) },
    about: { ...defaultPages.about, ...(incoming.about || {}) },
    donations: { ...defaultPages.donations, ...(incoming.donations || {}) },
    faq: { ...defaultPages.faq, ...(incoming.faq || {}) },
    team: { ...defaultPages.team, ...(incoming.team || {}) },
    recruitment: {
      ...defaultPages.recruitment,
      ...(incoming.recruitment || {}),
    },
  };
};

const pageLabels: Record<PublicPageKey, string> = {
  about: "Sobre",
  donations: "Doações",
  faq: "FAQ",
  team: "Equipe",
  recruitment: "Recrutamento",
};

const orderedPageTabs = [
  ...(Object.entries(pageLabels) as Array<[PublicPageKey, string]>)
    .sort(([, labelA], [, labelB]) => comparePtBr(labelA, labelB))
    .map(([key, label]) => ({ key, label })),
  { key: "preview", label: "Prévia" },
] as const satisfies Array<{ key: DashboardPagesTabKey; label: string }>;

const shareImagePageKeys: ShareImagePageKey[] = [
  "home",
  "projects",
  "about",
  "donations",
  "faq",
  "team",
  "recruitment",
];

const shareImagePageLabels: Record<ShareImagePageKey, string> = {
  home: "Início",
  projects: "Projetos",
  about: "Sobre",
  donations: "Doações",
  faq: "FAQ",
  team: "Equipe",
  recruitment: "Recrutamento",
};

const normalizePageShareImage = <T extends PageWithShareImage>(
  page: T,
  pageKey: ShareImagePageKey,
): T => {
  const shareImage = String(page.shareImage || "").trim();
  const shareImageAlt = String(page.shareImageAlt || "").trim();
  return {
    ...page,
    shareImage,
    shareImageAlt: shareImage ? shareImageAlt || getShareImageAltFallback(pageKey) : "",
  };
};

const normalizePagesShareImages = (pages: PagesConfig): PagesConfig => ({
  ...pages,
  home: normalizePageShareImage(pages.home, "home"),
  projects: normalizePageShareImage(pages.projects, "projects"),
  about: normalizePageShareImage(pages.about, "about"),
  donations: normalizePageShareImage(pages.donations, "donations"),
  faq: normalizePageShareImage(pages.faq, "faq"),
  team: normalizePageShareImage(pages.team, "team"),
  recruitment: normalizePageShareImage(pages.recruitment, "recruitment"),
});

const normalizeDonationsMonthlyGoalFields = (
  donations: PagesConfig["donations"],
): PagesConfig["donations"] => ({
  ...donations,
  costs: stripDashboardPagesEditorKeys(donations.costs),
  monthlyGoalRaised: finalizeMonthlyGoalAmountInput(donations.monthlyGoalRaised),
  monthlyGoalTarget: finalizeMonthlyGoalAmountInput(donations.monthlyGoalTarget),
  monthlyGoalSupporters: sanitizeMonthlyGoalSupportersInput(donations.monthlyGoalSupporters),
  monthlyGoalNote: String(donations.monthlyGoalNote || "").trim(),
  cryptoTitle: String(donations.cryptoTitle || "").trim(),
  cryptoSubtitle: String(donations.cryptoSubtitle || "").trim(),
  cryptoServices: normalizeDonationsCryptoServicesForSave(donations.cryptoServices),
  donors: stripDashboardPagesEditorKeys(donations.donors),
});

const stripEditorKeysFromAbout = (about: PagesConfig["about"]): PagesConfig["about"] => ({
  ...about,
  highlights: stripDashboardPagesEditorKeys(about.highlights),
  pillars: stripDashboardPagesEditorKeys(about.pillars),
  values: stripDashboardPagesEditorKeys(about.values),
});

const stripEditorKeysFromFaq = (faq: PagesConfig["faq"]): PagesConfig["faq"] => ({
  ...faq,
  introCards: stripDashboardPagesEditorKeys(faq.introCards),
  groups: faq.groups.map((group) => ({
    ...group,
    _editorKey: undefined,
    items: stripDashboardPagesEditorKeys(group.items),
  })),
});

const stripEditorKeysFromRecruitment = (
  recruitment: PagesConfig["recruitment"],
): PagesConfig["recruitment"] => ({
  ...recruitment,
  roles: stripDashboardPagesEditorKeys(recruitment.roles),
});

const normalizePagesConfigForSave = (pages: PagesConfig): PagesConfig => ({
  ...pages,
  about: stripEditorKeysFromAbout(pages.about),
  donations: normalizeDonationsMonthlyGoalFields(pages.donations),
  faq: stripEditorKeysFromFaq(pages.faq),
  recruitment: stripEditorKeysFromRecruitment(pages.recruitment),
});

const normalizeDonationsEditorCollections = (
  donations: PagesConfig["donations"],
  previousDonations?: PagesConfig["donations"] | null,
): PagesConfig["donations"] => ({
  ...donations,
  costs: withDashboardPagesEditorKeys(donations.costs, previousDonations?.costs),
  cryptoServices: withDashboardPagesEditorKeys(
    donations.cryptoServices,
    previousDonations?.cryptoServices,
  ),
  donors: withDashboardPagesEditorKeys(donations.donors, previousDonations?.donors),
});

const normalizeAboutEditorCollections = (
  about: PagesConfig["about"],
  previousAbout?: PagesConfig["about"] | null,
): PagesConfig["about"] => ({
  ...about,
  highlights: withDashboardPagesEditorKeys(about.highlights, previousAbout?.highlights),
  pillars: withDashboardPagesEditorKeys(about.pillars, previousAbout?.pillars),
  values: withDashboardPagesEditorKeys(about.values, previousAbout?.values),
});

const normalizeFaqEditorCollections = (
  faq: PagesConfig["faq"],
  previousFaq?: PagesConfig["faq"] | null,
): PagesConfig["faq"] => ({
  ...faq,
  introCards: withDashboardPagesEditorKeys(faq.introCards, previousFaq?.introCards),
  groups: withDashboardPagesEditorKeys(faq.groups, previousFaq?.groups).map((group) => ({
    ...group,
    items: withDashboardPagesEditorKeys(
      group.items,
      previousFaq?.groups?.find((g) => g._editorKey === group._editorKey)?.items,
    ),
  })),
});

const normalizeRecruitmentEditorCollections = (
  recruitment: PagesConfig["recruitment"],
  previousRecruitment?: PagesConfig["recruitment"] | null,
): PagesConfig["recruitment"] => ({
  ...recruitment,
  roles: withDashboardPagesEditorKeys(recruitment.roles, previousRecruitment?.roles),
});

const normalizePagesConfigForState = (
  pages: PagesConfig,
  previousPages?: PagesConfig | null,
): PagesConfig => {
  const normalizedPages = normalizePagesShareImages(normalizePagesConfigForSave(pages));
  return {
    ...normalizedPages,
    about: normalizeAboutEditorCollections(normalizedPages.about, previousPages?.about),
    donations: normalizeDonationsEditorCollections(
      normalizedPages.donations,
      previousPages?.donations,
    ),
    faq: normalizeFaqEditorCollections(normalizedPages.faq, previousPages?.faq),
    recruitment: normalizeRecruitmentEditorCollections(
      normalizedPages.recruitment,
      previousPages?.recruitment,
    ),
  };
};

const DASHBOARD_PAGES_DEFAULT_TAB: DashboardPagesTabKey = "donations";
const DASHBOARD_PAGES_TAB_SET = new Set<DashboardPagesTabKey>(
  orderedPageTabs.map((tab) => tab.key),
);
const isDashboardPagesTab = (value: string): value is DashboardPagesTabKey =>
  DASHBOARD_PAGES_TAB_SET.has(value as DashboardPagesTabKey);
const buildDashboardPagesTabSearchParams = (
  currentParams: URLSearchParams,
  tab: DashboardPagesTabKey,
) => {
  const nextParams = new URLSearchParams(currentParams);
  if (tab === DASHBOARD_PAGES_DEFAULT_TAB) {
    nextParams.delete("tab");
  } else {
    nextParams.set("tab", tab);
  }
  return nextParams;
};

const buildDashboardPagesTabUrl = (
  pathname: string,
  hash: string,
  currentParams: URLSearchParams,
  tab: DashboardPagesTabKey,
) => {
  const nextParams = buildDashboardPagesTabSearchParams(currentParams, tab);
  const nextSearch = nextParams.toString();
  return `${pathname}${nextSearch ? `?${nextSearch}` : ""}${hash}`;
};

const parseDashboardPagesTabParam = (value: string | null): DashboardPagesTabKey => {
  const normalized = String(value || "").trim();
  if (normalized === "preview-paginas") {
    return "preview";
  }
  if (isDashboardPagesTab(normalized)) {
    return normalized;
  }
  return DASHBOARD_PAGES_DEFAULT_TAB;
};

const reorder = <T,>(items: T[], from: number, to: number) => {
  const next = [...items];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
};

const dashboardPagesCardClassName = dashboardPageLayoutTokens.surfaceSolid;
const dashboardPagesInsetSurfaceClassName = dashboardPageLayoutTokens.groupedFieldSurface;
const dashboardPagesControlSurfaceClassName = dashboardPageLayoutTokens.controlSurface;
const dashboardPagesReorderableSurfaceClassName = `${dashboardPagesControlSurfaceClassName} ${dashboardSubtleSurfaceHoverClassName}`;
const dashboardPagesMetaTextClassName = dashboardPageLayoutTokens.cardMetaText;

type DashboardPagesContentProps = {
  currentUser: ReturnType<typeof useDashboardCurrentUser>["currentUser"];
};

const dashboardPageIconOptions: ComboboxOption[] = iconOptions.map((icon) => ({
  value: icon,
  label: icon,
  icon: editorIconMap[icon] || Sparkles,
}));

const IconSelect = ({
  value,
  onChange,
  ariaLabel = "Selecionar ícone",
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
}) => {
  return (
    <Combobox
      ariaLabel={ariaLabel}
      value={value}
      options={dashboardPageIconOptions}
      onValueChange={onChange}
      searchable={false}
      className="h-9 border-border/70 bg-background"
    />
  );
};

const DashboardPagesContent = ({ currentUser }: DashboardPagesContentProps) => {
  const apiBase = getApiBase();
  const { settings } = useSiteSettings();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const initialAutosaveEnabledRef = useRef(
    autosaveRuntimeConfig.enabledByDefault &&
      readAutosavePreference(autosaveStorageKeys.pages, true),
  );
  const initialCacheRef = useRef(readDashboardPagesCache());
  const [pages, setPages] = useState<PagesConfig>(() =>
    normalizePagesConfigForState(initialCacheRef.current ?? defaultPages, initialCacheRef.current),
  );
  const [isInitialLoading, setIsInitialLoading] = useState(!initialCacheRef.current);
  const [isRefreshing, setIsRefreshing] = useState(Boolean(initialCacheRef.current));
  const [hasLoadedOnce, setHasLoadedOnce] = useState(Boolean(initialCacheRef.current));
  const [hasResolvedPages, setHasResolvedPages] = useState(Boolean(initialCacheRef.current));
  const [hasLoadError, setHasLoadError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<DashboardPagesTabKey>(() =>
    parseDashboardPagesTabParam(searchParams.get("tab")),
  );
  const [dragState, setDragState] = useState<{
    list: string;
    index: number;
  } | null>(null);
  const [dragOverState, setDragOverState] = useState<{
    list: string;
    index: number;
  } | null>(null);
  const [isPreviewLibraryOpen, setIsPreviewLibraryOpen] = useState(false);
  const [previewLibraryTarget, setPreviewLibraryTarget] = useState<ShareImagePageKey>("home");
  const requestIdRef = useRef(0);
  const hasLoadedOnceRef = useRef(hasLoadedOnce);
  const pagesRef = useRef(pages);
  const tabUrlSyncTimeoutRef = useRef<number | null>(null);

  const merchantName =
    String(settings.site.name || settings.footer.brandName || "Nekomata").trim() || "Nekomata";
  const previewLibraryFolders = useMemo(
    () =>
      filterImageLibraryFoldersByAccess(["shared", "posts", "projects"], {
        grants: currentUser?.grants,
      }),
    [currentUser?.grants],
  );
  const qrPreview = usePixQrCode({
    pixKey: pages.donations.pixKey,
    pixNote: pages.donations.pixNote,
    pixCity: pages.donations.pixCity?.trim() || "CIDADE",
    qrCustomUrl: pages.donations.qrCustomUrl,
    merchantName,
  });

  const clearPendingTabUrlSync = useCallback(() => {
    if (tabUrlSyncTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(tabUrlSyncTimeoutRef.current);
    tabUrlSyncTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    clearPendingTabUrlSync();
    const nextTab = parseDashboardPagesTabParam(searchParams.get("tab"));
    setActiveTab((previous) => (previous === nextTab ? previous : nextTab));
    const nextUrl = buildDashboardPagesTabUrl(
      location.pathname,
      location.hash,
      searchParams,
      nextTab,
    );
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  }, [clearPendingTabUrlSync, location.hash, location.pathname, searchParams]);

  const setDashboardPagesTab = useCallback(
    (value: string) => {
      if (!isDashboardPagesTab(value)) {
        return;
      }
      setActiveTab((previous) => (previous === value ? previous : value));
      clearPendingTabUrlSync();
      const nextUrl = buildDashboardPagesTabUrl(
        location.pathname,
        location.hash,
        new URLSearchParams(window.location.search),
        value,
      );
      const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (nextUrl === currentUrl) {
        return;
      }
      tabUrlSyncTimeoutRef.current = window.setTimeout(() => {
        window.history.replaceState(window.history.state, "", nextUrl);
        tabUrlSyncTimeoutRef.current = null;
      }, 0);
    },
    [clearPendingTabUrlSync, location.hash, location.pathname],
  );

  useEffect(() => clearPendingTabUrlSync, [clearPendingTabUrlSync]);

  useEffect(() => {
    hasLoadedOnceRef.current = hasLoadedOnce;
  }, [hasLoadedOnce]);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    const load = async () => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const background = hasLoadedOnceRef.current;
      try {
        setHasLoadError(false);
        if (background) {
          setIsRefreshing(true);
        } else {
          setIsInitialLoading(true);
          setHasResolvedPages(false);
        }
        const response = await apiFetch(apiBase, "/api/pages", { auth: true });
        if (requestIdRef.current !== requestId) {
          return;
        }
        if (!response.ok) {
          setHasLoadError(true);
          return;
        }
        const data = await response.json();
        const nextPages = normalizePagesConfigForState(
          mergePagesConfig(data.pages),
          pagesRef.current,
        );
        setPages(nextPages);
        setHasLoadedOnce(true);
        setHasResolvedPages(true);
        writeDashboardPagesCache(nextPages);
      } catch {
        if (requestIdRef.current === requestId) {
          if (!hasLoadedOnceRef.current) {
            setPages(defaultPages);
            setHasResolvedPages(false);
          }
          setHasLoadError(true);
        }
      } finally {
        if (requestIdRef.current === requestId) {
          setIsInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    };
    void load();
  }, [apiBase, loadVersion]);

  const savePages = useCallback(
    async (nextPages: PagesConfig) => {
      const normalizedNextPages = normalizePagesConfigForState(nextPages, pagesRef.current);
      const payloadPages = normalizePagesConfigForSave(normalizedNextPages);
      const response = await apiFetch(apiBase, "/api/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        auth: true,
        body: JSON.stringify({ pages: payloadPages }),
      });
      if (!response.ok) {
        throw new Error("save_failed");
      }
      const data = await response.json().catch(() => null);
      const normalizedPages = normalizePagesConfigForState(
        mergePagesConfig((data?.pages as Partial<PagesConfig> | undefined) || payloadPages),
        normalizedNextPages,
      );
      setPages(normalizedPages);
      writeDashboardPagesCache(normalizedPages);
      return normalizedPages;
    },
    [apiBase],
  );

  const pagesAutosave = useAutosave<PagesConfig>({
    value: pages,
    onSave: savePages,
    isReady: hasResolvedPages,
    enabled: initialAutosaveEnabledRef.current,
    debounceMs: autosaveRuntimeConfig.debounceMs,
    retryMax: autosaveRuntimeConfig.retryMax,
    retryBaseMs: autosaveRuntimeConfig.retryBaseMs,
    onError: (_error, payload) => {
      if (payload.source === "auto" && payload.consecutiveErrors === 1) {
        toast({
          title: "Falha no autosave",
          description: "Não foi possível salvar as páginas automaticamente.",
          variant: "destructive",
        });
      }
    },
  });

  useEffect(() => {
    writeAutosavePreference(autosaveStorageKeys.pages, pagesAutosave.enabled);
  }, [pagesAutosave.enabled]);

  const hasPendingChanges =
    pagesAutosave.isDirty ||
    pagesAutosave.status === "pending" ||
    pagesAutosave.status === "saving";

  useEffect(() => {
    if (!hasResolvedPages || !hasPendingChanges) {
      return;
    }
    const handler = (event: BeforeUnloadEvent) => {
      applyBeforeUnloadCompatibility(event);
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasPendingChanges, hasResolvedPages]);

  const handleSave = useCallback(async () => {
    if (!hasResolvedPages) {
      return;
    }
    const ok = await pagesAutosave.flushNow();
    if (!ok) {
      toast({
        title: "Falha ao salvar",
        description: "Não foi possível salvar as alterações agora.",
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Páginas salvas",
      description: "As alterações foram aplicadas com sucesso.",
      intent: "success",
    });
  }, [hasResolvedPages, pagesAutosave]);

  const updateAbout = (patch: Partial<PagesConfig["about"]>) =>
    setPages((prev) => ({ ...prev, about: { ...prev.about, ...patch } }));
  const updateDonations = (patch: Partial<PagesConfig["donations"]>) =>
    setPages((prev) => ({
      ...prev,
      donations: { ...prev.donations, ...patch },
    }));
  const updateMonthlyGoalAmount = (
    field: "monthlyGoalRaised" | "monthlyGoalTarget",
    value: string,
  ) =>
    updateDonations({
      [field]: normalizeMonthlyGoalAmountInput(value),
    } as Pick<PagesConfig["donations"], typeof field>);
  const finalizeMonthlyGoalAmountField = (
    field: "monthlyGoalRaised" | "monthlyGoalTarget",
    value?: string,
  ) => {
    const sourceValue = typeof value === "string" ? value : pages.donations[field];
    const normalizedValue = finalizeMonthlyGoalAmountInput(sourceValue);
    if (normalizedValue === sourceValue) {
      return;
    }
    updateDonations({
      [field]: normalizedValue,
    } as Pick<PagesConfig["donations"], typeof field>);
  };
  const updateMonthlyGoalSupporters = (value: string) =>
    updateDonations({
      monthlyGoalSupporters: sanitizeMonthlyGoalSupportersInput(value),
    });
  const updateCryptoServiceAt = (index: number, patch: Partial<CryptoService>) => {
    const next = [...pages.donations.cryptoServices];
    next[index] = {
      ...next[index],
      ...patch,
    };
    updateDonations({ cryptoServices: next });
  };
  const removeCryptoServiceAt = (index: number) =>
    updateDonations({
      cryptoServices: pages.donations.cryptoServices.filter((_, itemIndex) => itemIndex !== index),
    });
  const updateFaq = (patch: Partial<PagesConfig["faq"]>) =>
    setPages((prev) => ({ ...prev, faq: { ...prev.faq, ...patch } }));
  const updateTeam = (patch: Partial<PagesConfig["team"]>) =>
    setPages((prev) => ({ ...prev, team: { ...prev.team, ...patch } }));
  const updateRecruitment = (patch: Partial<PagesConfig["recruitment"]>) =>
    setPages((prev) => ({
      ...prev,
      recruitment: { ...prev.recruitment, ...patch },
    }));
  const readPageShareImage = useCallback(
    (pageKey: ShareImagePageKey) => String(pages[pageKey]?.shareImage || "").trim(),
    [pages],
  );
  const updatePageShareImage = useCallback((pageKey: ShareImagePageKey, shareImage: string) => {
    setPages((prev) => ({
      ...prev,
      [pageKey]: {
        ...prev[pageKey],
        shareImage,
      },
    }));
  }, []);
  const applyPageShareImage = useCallback(
    (pageKey: ShareImagePageKey, shareImage: string, altText?: string) => {
      const normalizedShareImage = String(shareImage || "").trim();
      setPages((prev) => ({
        ...prev,
        [pageKey]: {
          ...prev[pageKey],
          shareImage: normalizedShareImage,
          shareImageAlt: normalizedShareImage
            ? resolveAssetAltText(altText, getShareImageAltFallback(pageKey))
            : "",
        },
      }));
    },
    [],
  );
  const openPreviewLibrary = useCallback((pageKey: ShareImagePageKey) => {
    setPreviewLibraryTarget(pageKey);
    setIsPreviewLibraryOpen(true);
  }, []);
  const currentPreviewLibrarySelection = useMemo(
    () => readPageShareImage(previewLibraryTarget),
    [previewLibraryTarget, readPageShareImage],
  );

  const handleDragStart = (list: string, index: number) => {
    setDragState({ list, index });
    setDragOverState(null);
  };

  const clearDragState = useCallback(() => {
    setDragState(null);
    setDragOverState(null);
  }, []);

  const handleDragOver = (event: DragEvent<HTMLElement>, list: string, index: number) => {
    event.preventDefault();
    if (!dragState || dragState.list !== list || dragState.index === index) {
      setDragOverState(null);
      return;
    }
    setDragOverState((prev) =>
      prev?.list === list && prev.index === index ? prev : { list, index },
    );
  };

  const moveListItem = (list: string, from: number, to: number) => {
    if (from === to) {
      return;
    }
    if (list === "about.highlights") {
      updateAbout({ highlights: reorder(pages.about.highlights, from, to) });
    } else if (list === "about.values") {
      updateAbout({ values: reorder(pages.about.values, from, to) });
    } else if (list === "about.pillars") {
      updateAbout({ pillars: reorder(pages.about.pillars, from, to) });
    } else if (list === "donations.costs") {
      updateDonations({ costs: reorder(pages.donations.costs, from, to) });
    } else if (list === "donations.cryptoServices") {
      updateDonations({
        cryptoServices: reorder(pages.donations.cryptoServices, from, to),
      });
    } else if (list === "donations.donors") {
      updateDonations({ donors: reorder(pages.donations.donors, from, to) });
    } else if (list === "faq.intro") {
      updateFaq({ introCards: reorder(pages.faq.introCards, from, to) });
    } else if (list === "faq.groups") {
      updateFaq({ groups: reorder(pages.faq.groups, from, to) });
    } else if (list === "recruitment.roles") {
      updateRecruitment({ roles: reorder(pages.recruitment.roles, from, to) });
    } else if (list.startsWith("faq.items.")) {
      const groupIndex = Number(list.split(".")[2]);
      if (!Number.isNaN(groupIndex)) {
        const groups = [...pages.faq.groups];
        groups[groupIndex] = {
          ...groups[groupIndex],
          items: reorder(groups[groupIndex].items, from, to),
        };
        updateFaq({ groups });
      }
    }
  };

  const handleDrop = (list: string, index: number) => {
    if (!dragState || dragState.list !== list) {
      setDragOverState(null);
      return;
    }
    moveListItem(list, dragState.index, index);
    clearDragState();
  };

  const isDragOverTarget = (list: string, index: number) =>
    dragState?.list === list &&
    dragState.index !== index &&
    dragOverState?.list === list &&
    dragOverState.index === index;

  const getReorderableSurfaceClassName = (list: string, index: number, paddingClassName: string) =>
    `${dashboardPagesReorderableSurfaceClassName} ${paddingClassName} ${
      isDragOverTarget(list, index) ? "border-primary/40 bg-primary/5" : ""
    }`;

  const handleMainBlurCapture = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const nextTarget = event.relatedTarget as Node | null;
      if (nextTarget && event.currentTarget.contains(nextTarget)) {
        return;
      }
      if (pagesAutosave.enabled) {
        void pagesAutosave.flushNow();
      }
    },
    [pagesAutosave],
  );

  const hasBlockingLoadError = !hasLoadedOnce && hasLoadError;
  const hasRetainedLoadError = hasLoadedOnce && hasLoadError;

  useDashboardRefreshToast({
    active: isRefreshing && hasLoadedOnce,
    title: "Atualizando páginas",
    description: "Buscando a configuração pública mais recente.",
  });

  return (
    <>
      <main className="pt-24" onBlurCapture={handleMainBlurCapture}>
        <section className="mx-auto w-full max-w-6xl px-6 pb-20 md:px-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DashboardPageBadge>Páginas</DashboardPageBadge>
              <h1 className="mt-4 text-3xl font-semibold lg:text-4xl animate-slide-up">
                Gerenciar páginas
              </h1>
              <p
                className={`mt-2 text-sm ${dashboardPagesMetaTextClassName} animate-slide-up`}
                style={dashboardAnimationDelay(dashboardMotionDelays.headerDescriptionMs)}
              >
                Edite textos e previews de compartilhamento das páginas públicas.
              </p>
            </div>
            <div
              className="w-full animate-slide-up sm:w-auto"
              style={dashboardAnimationDelay(dashboardMotionDelays.headerActionsMs)}
              data-testid="dashboard-pages-autosave-reveal"
            >
              <DashboardAutosaveStatus
                title="Autosave das páginas"
                status={pagesAutosave.status}
                enabled={pagesAutosave.enabled}
                onEnabledChange={(nextEnabled) => {
                  if (!autosaveRuntimeConfig.enabledByDefault) {
                    return;
                  }
                  pagesAutosave.setEnabled(nextEnabled);
                }}
                toggleDisabled={!autosaveRuntimeConfig.enabledByDefault}
                lastSavedAt={pagesAutosave.lastSavedAt}
                errorMessage={
                  pagesAutosave.status === "error"
                    ? "As alterações continuam pendentes até um novo salvamento."
                    : null
                }
                onManualSave={() => {
                  void handleSave();
                }}
                manualActionLabel={
                  pagesAutosave.status === "saving" ? "Salvando..." : "Salvar alterações"
                }
                manualActionDisabled={!hasResolvedPages || pagesAutosave.status === "saving"}
              />
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={setDashboardPagesTab}
            activationMode="manual"
            className="mt-8 animate-slide-up"
            style={dashboardAnimationDelay(dashboardMotionDelays.sectionLeadMs)}
          >
            <TabsList className="no-scrollbar flex w-full flex-nowrap justify-start overflow-x-auto overscroll-x-contain md:grid md:grid-cols-6 md:overflow-visible">
              {orderedPageTabs.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key} className="shrink-0 md:w-full">
                  <span>{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
            {hasBlockingLoadError ? (
              <div className="mt-6">
                <AsyncState
                  kind="error"
                  title="Não foi possível carregar as páginas"
                  description="Tente novamente em alguns instantes."
                  action={
                    <Button
                      variant="outline"
                      onClick={() => setLoadVersion((previous) => previous + 1)}
                    >
                      Tentar novamente
                    </Button>
                  }
                />
              </div>
            ) : (
              <>
                {hasRetainedLoadError ? (
                  <Alert className="mt-6">
                    <AlertTitle>Atualização parcial indisponível</AlertTitle>
                    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                      <span>Mantendo a última configuração pública carregada.</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLoadVersion((previous) => previous + 1)}
                      >
                        Tentar novamente
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : null}
                {isInitialLoading ? (
                  <Card
                    lift={false}
                    className={`mt-6 ${dashboardPagesCardClassName}`}
                    data-testid="dashboard-pages-skeleton-surface"
                  >
                    <CardContent className="space-y-6 p-6">
                      <div className="space-y-2">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-72" />
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {Array.from({ length: 4 }).map((_, index) => (
                          <div
                            key={`pages-skeleton-${index}`}
                            className={`${dashboardPagesInsetSurfaceClassName} p-4 space-y-3`}
                          >
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="h-32 w-full rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                            <Skeleton className="h-10 w-full rounded-xl" />
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {activeTab === "preview" ? (
                      <TabsContent
                        forceMount
                        value="preview"
                        className="mt-6 space-y-6 data-[state=inactive]:hidden"
                      >
                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-6 p-6">
                            <div>
                              <h2 className="text-lg font-semibold">Prévias de compartilhamento</h2>
                              <p className={`text-xs ${dashboardPagesMetaTextClassName}`}>
                                Defina a imagem OG de cada página para links compartilhados.
                              </p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                              {shareImagePageKeys.map((pageKey) => {
                                const shareImage = readPageShareImage(pageKey);
                                return (
                                  <div
                                    key={pageKey}
                                    className={`${dashboardPagesInsetSurfaceClassName} p-4 space-y-3`}
                                  >
                                    <div className="space-y-1">
                                      <p className="text-sm font-semibold">
                                        {shareImagePageLabels[pageKey]}
                                      </p>
                                      <p className={`text-xs ${dashboardPagesMetaTextClassName}`}>
                                        Imagem exibida no card social ao compartilhar essa URL.
                                      </p>
                                    </div>

                                    {shareImage ? (
                                      <div className="space-y-2">
                                        <div className="overflow-hidden rounded-lg border border-border/70 bg-background">
                                          <img
                                            src={normalizeAssetUrl(shareImage)}
                                            alt={`Prévia de ${shareImagePageLabels[pageKey]}`}
                                            className="aspect-3/2 w-full object-cover"
                                            loading="lazy"
                                          />
                                        </div>
                                        <p
                                          className={`text-xs ${dashboardPagesMetaTextClassName} break-all`}
                                        >
                                          {shareImage}
                                        </p>
                                      </div>
                                    ) : (
                                      <p className={`text-xs ${dashboardPagesMetaTextClassName}`}>
                                        Sem imagem de preview definida.
                                      </p>
                                    )}

                                    <div className="space-y-2">
                                      <Label htmlFor={`page-preview-${pageKey}`}>
                                        URL da imagem
                                      </Label>
                                      <Input
                                        id={`page-preview-${pageKey}`}
                                        value={shareImage}
                                        placeholder="/uploads/shared/og-pagina.jpg"
                                        onChange={(event) =>
                                          updatePageShareImage(
                                            pageKey,
                                            String(event.target.value || "").trim(),
                                          )
                                        }
                                      />
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                      <DashboardActionButton
                                        type="button"
                                        size="sm"
                                        onClick={() => openPreviewLibrary(pageKey)}
                                      >
                                        Biblioteca
                                      </DashboardActionButton>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        disabled={!shareImage}
                                        onClick={() => {
                                          applyPageShareImage(pageKey, "");
                                        }}
                                      >
                                        Limpar
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ) : null}

                    {activeTab === "about" ? (
                      <TabsContent
                        forceMount
                        value="about"
                        className="mt-6 space-y-6 data-[state=inactive]:hidden"
                      >
                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Badge</Label>
                              <Input
                                value={pages.about.heroBadge}
                                onChange={(e) => updateAbout({ heroBadge: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Título</Label>
                              <Input
                                value={pages.about.heroTitle}
                                onChange={(e) => updateAbout({ heroTitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Subtítulo</Label>
                              <Textarea
                                value={pages.about.heroSubtitle}
                                onChange={(e) => updateAbout({ heroSubtitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Badges do topo</Label>
                              <div className="flex flex-wrap gap-2">
                                {pages.about.heroBadges.map((badge, index) => (
                                  <div
                                    key={`about-heroBadge-${index}`}
                                    className="flex items-center gap-2"
                                  >
                                    <Input
                                      value={badge}
                                      onChange={(e) => {
                                        const next = [...pages.about.heroBadges];
                                        next[index] = e.target.value;
                                        updateAbout({ heroBadges: next });
                                      }}
                                    />
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => {
                                        const next = pages.about.heroBadges.filter(
                                          (_, i) => i !== index,
                                        );
                                        updateAbout({ heroBadges: next });
                                      }}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                ))}
                                <DashboardActionButton
                                  type="button"
                                  size="sm"
                                  onClick={() =>
                                    updateAbout({
                                      heroBadges: [...pages.about.heroBadges, "Nova badge"],
                                    })
                                  }
                                >
                                  <Plus className="h-4 w-4" />
                                  Adicionar badge
                                </DashboardActionButton>
                              </div>
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Destaques
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateAbout({
                                    highlights: [
                                      ...pages.about.highlights,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        label: "Novo destaque",
                                        text: "",
                                        icon: "Sparkles",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4">
                              {pages.about.highlights.map((item, index) => (
                                <div
                                  key={item._editorKey || `about-highlight-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("about.highlights", index)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "about.highlights", index)
                                  }
                                  onDrop={() => handleDrop("about.highlights", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "about.highlights",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`destaque ${index + 1}`}
                                        index={index}
                                        total={pages.about.highlights.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("about.highlights", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateAbout({
                                            highlights: pages.about.highlights.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <Input
                                      value={item.label}
                                      onChange={(e) => {
                                        const next = [...pages.about.highlights];
                                        next[index] = {
                                          ...item,
                                          label: e.target.value,
                                        };
                                        updateAbout({ highlights: next });
                                      }}
                                    />
                                    <Textarea
                                      value={item.text}
                                      onChange={(e) => {
                                        const next = [...pages.about.highlights];
                                        next[index] = {
                                          ...item,
                                          text: e.target.value,
                                        };
                                        updateAbout({ highlights: next });
                                      }}
                                    />
                                    <div className="grid gap-2">
                                      <Label>Ícone</Label>
                                      <IconSelect
                                        value={item.icon || "Sparkles"}
                                        onChange={(nextIcon) => {
                                          const next = [...pages.about.highlights];
                                          next[index] = {
                                            ...item,
                                            icon: nextIcon,
                                          };
                                          updateAbout({ highlights: next });
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <DashboardFieldStack>
                              <Label>Título do manifesto</Label>
                              <Input
                                value={pages.about.manifestoTitle}
                                onChange={(e) =>
                                  updateAbout({
                                    manifestoTitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Ícone do manifesto</Label>
                              <IconSelect
                                value={pages.about.manifestoIcon || "Flame"}
                                onChange={(nextIcon) => updateAbout({ manifestoIcon: nextIcon })}
                              />
                            </DashboardFieldStack>
                            <div className="grid gap-3">
                              {pages.about.manifestoParagraphs.map((paragraph, index) => (
                                <div
                                  key={`about-manifesto-paragraph-${index}`}
                                  className="flex gap-2"
                                >
                                  <Textarea
                                    value={paragraph}
                                    onChange={(e) => {
                                      const next = [...pages.about.manifestoParagraphs];
                                      next[index] = e.target.value;
                                      updateAbout({
                                        manifestoParagraphs: next,
                                      });
                                    }}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      const next = pages.about.manifestoParagraphs.filter(
                                        (_, i) => i !== index,
                                      );
                                      updateAbout({
                                        manifestoParagraphs: next,
                                      });
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateAbout({
                                    manifestoParagraphs: [...pages.about.manifestoParagraphs, ""],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar parágrafo
                              </DashboardActionButton>
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Pilares
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateAbout({
                                    pillars: [
                                      ...pages.about.pillars,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        title: "Novo pilar",
                                        description: "",
                                        icon: "Sparkles",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              {pages.about.pillars.map((item, index) => (
                                <div
                                  key={item._editorKey || `about-pillar-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("about.pillars", index)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "about.pillars", index)
                                  }
                                  onDrop={() => handleDrop("about.pillars", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "about.pillars",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`pilar ${index + 1}`}
                                        index={index}
                                        total={pages.about.pillars.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("about.pillars", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateAbout({
                                            pillars: pages.about.pillars.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <Input
                                      value={item.title}
                                      onChange={(e) => {
                                        const next = [...pages.about.pillars];
                                        next[index] = {
                                          ...item,
                                          title: e.target.value,
                                        };
                                        updateAbout({ pillars: next });
                                      }}
                                    />
                                    <Textarea
                                      value={item.description}
                                      onChange={(e) => {
                                        const next = [...pages.about.pillars];
                                        next[index] = {
                                          ...item,
                                          description: e.target.value,
                                        };
                                        updateAbout({ pillars: next });
                                      }}
                                    />
                                    <DashboardFieldStack>
                                      <Label>Ícone</Label>
                                      <IconSelect
                                        value={item.icon}
                                        onChange={(nextIcon) => {
                                          const next = [...pages.about.pillars];
                                          next[index] = {
                                            ...item,
                                            icon: nextIcon,
                                          };
                                          updateAbout({ pillars: next });
                                        }}
                                      />
                                    </DashboardFieldStack>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Valores
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateAbout({
                                    values: [
                                      ...pages.about.values,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        title: "Novo valor",
                                        description: "",
                                        icon: "Heart",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              {pages.about.values.map((item, index) => (
                                <div
                                  key={item._editorKey || `about-value-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("about.values", index)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "about.values", index)
                                  }
                                  onDrop={() => handleDrop("about.values", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "about.values",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`valor ${index + 1}`}
                                        index={index}
                                        total={pages.about.values.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("about.values", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateAbout({
                                            values: pages.about.values.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <Input
                                      value={item.title}
                                      onChange={(e) => {
                                        const next = [...pages.about.values];
                                        next[index] = {
                                          ...item,
                                          title: e.target.value,
                                        };
                                        updateAbout({ values: next });
                                      }}
                                    />
                                    <Textarea
                                      value={item.description}
                                      onChange={(e) => {
                                        const next = [...pages.about.values];
                                        next[index] = {
                                          ...item,
                                          description: e.target.value,
                                        };
                                        updateAbout({ values: next });
                                      }}
                                    />
                                    <DashboardFieldStack>
                                      <Label>Ícone</Label>
                                      <IconSelect
                                        value={item.icon}
                                        onChange={(nextIcon) => {
                                          const next = [...pages.about.values];
                                          next[index] = {
                                            ...item,
                                            icon: nextIcon,
                                          };
                                          updateAbout({ values: next });
                                        }}
                                      />
                                    </DashboardFieldStack>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ) : null}

                    {activeTab === "donations" ? (
                      <TabsContent
                        forceMount
                        value="donations"
                        className="mt-6 space-y-6 data-[state=inactive]:hidden"
                      >
                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Título</Label>
                              <Input
                                value={pages.donations.heroTitle}
                                onChange={(e) => updateDonations({ heroTitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Subtítulo</Label>
                              <Textarea
                                value={pages.donations.heroSubtitle}
                                onChange={(e) =>
                                  updateDonations({
                                    heroSubtitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Custos
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateDonations({
                                    costs: [
                                      ...pages.donations.costs,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        title: "Novo custo",
                                        description: "",
                                        icon: "Server",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              {pages.donations.costs.map((item, index) => (
                                <div
                                  key={item._editorKey || `donations-cost-${index}`}
                                  data-testid={`donations-cost-item-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("donations.costs", index)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "donations.costs", index)
                                  }
                                  onDrop={() => handleDrop("donations.costs", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "donations.costs",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`custo ${index + 1}`}
                                        index={index}
                                        total={pages.donations.costs.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("donations.costs", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateDonations({
                                            costs: pages.donations.costs.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <Input
                                      value={item.title}
                                      onChange={(e) => {
                                        const next = [...pages.donations.costs];
                                        next[index] = {
                                          ...item,
                                          title: e.target.value,
                                        };
                                        updateDonations({ costs: next });
                                      }}
                                    />
                                    <Textarea
                                      value={item.description}
                                      onChange={(e) => {
                                        const next = [...pages.donations.costs];
                                        next[index] = {
                                          ...item,
                                          description: e.target.value,
                                        };
                                        updateDonations({ costs: next });
                                      }}
                                    />
                                    <DashboardFieldStack>
                                      <Label>Ícone</Label>
                                      <IconSelect
                                        value={item.icon}
                                        onChange={(nextIcon) => {
                                          const next = [...pages.donations.costs];
                                          next[index] = {
                                            ...item,
                                            icon: nextIcon,
                                          };
                                          updateDonations({ costs: next });
                                        }}
                                      />
                                    </DashboardFieldStack>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Título do bloco</Label>
                              <Input
                                value={pages.donations.reasonTitle}
                                onChange={(e) =>
                                  updateDonations({
                                    reasonTitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Ícone do bloco</Label>
                              <IconSelect
                                value={pages.donations.reasonIcon || "HeartHandshake"}
                                onChange={(nextIcon) => updateDonations({ reasonIcon: nextIcon })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Texto</Label>
                              <Textarea
                                value={pages.donations.reasonText}
                                onChange={(e) =>
                                  updateDonations({
                                    reasonText: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Nota</Label>
                              <Textarea
                                value={pages.donations.reasonNote}
                                onChange={(e) =>
                                  updateDonations({
                                    reasonNote: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label htmlFor="donations-monthly-goal-raised">
                                Arrecadado no mês
                              </Label>
                              <Input
                                id="donations-monthly-goal-raised"
                                value={pages.donations.monthlyGoalRaised}
                                onChange={(e) =>
                                  updateMonthlyGoalAmount("monthlyGoalRaised", e.target.value)
                                }
                                onBlur={(e) =>
                                  finalizeMonthlyGoalAmountField(
                                    "monthlyGoalRaised",
                                    e.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="0,00"
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label htmlFor="donations-monthly-goal-target">Meta do mês</Label>
                              <Input
                                id="donations-monthly-goal-target"
                                value={pages.donations.monthlyGoalTarget}
                                onChange={(e) =>
                                  updateMonthlyGoalAmount("monthlyGoalTarget", e.target.value)
                                }
                                onBlur={(e) =>
                                  finalizeMonthlyGoalAmountField(
                                    "monthlyGoalTarget",
                                    e.target.value,
                                  )
                                }
                                inputMode="decimal"
                                placeholder="0,00"
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label htmlFor="donations-monthly-goal-supporters">
                                Apoiadores no mês
                              </Label>
                              <Input
                                id="donations-monthly-goal-supporters"
                                value={pages.donations.monthlyGoalSupporters}
                                onChange={(e) => updateMonthlyGoalSupporters(e.target.value)}
                                onBlur={(e) => updateMonthlyGoalSupporters(e.target.value)}
                                inputMode="numeric"
                                placeholder="0"
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label htmlFor="donations-monthly-goal-note">Nota da meta</Label>
                              <Textarea
                                id="donations-monthly-goal-note"
                                value={pages.donations.monthlyGoalNote}
                                onChange={(e) =>
                                  updateDonations({
                                    monthlyGoalNote: e.target.value,
                                  })
                                }
                                placeholder="Ex.: Meta para pagar VPS + domínio."
                              />
                            </DashboardFieldStack>
                            <p
                              className={`text-xs ${dashboardPagesMetaTextClassName} md:col-span-2`}
                            >
                              Aceita vírgula ou ponto. Deixe a meta vazia para ocultar a barra na
                              página pública.
                            </p>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-[1.2fr_0.8fr]">
                            <div className="space-y-4">
                              <DashboardFieldStack>
                                <Label>Ícone do Pix</Label>
                                <IconSelect
                                  value={pages.donations.pixIcon || "QrCode"}
                                  onChange={(nextIcon) => updateDonations({ pixIcon: nextIcon })}
                                />
                              </DashboardFieldStack>
                              <DashboardFieldStack>
                                <Label>Chave Pix</Label>
                                <Input
                                  value={pages.donations.pixKey}
                                  onChange={(e) => updateDonations({ pixKey: e.target.value })}
                                />
                              </DashboardFieldStack>
                              <DashboardFieldStack>
                                <Label>Descrição no QR (opcional)</Label>
                                <Input
                                  value={pages.donations.pixNote}
                                  onChange={(e) => updateDonations({ pixNote: e.target.value })}
                                />
                              </DashboardFieldStack>
                              <DashboardFieldStack>
                                <Label>Cidade do recebedor (opcional)</Label>
                                <DashboardFieldStack density="compact">
                                  <Input
                                    value={pages.donations.pixCity}
                                    onChange={(e) =>
                                      updateDonations({
                                        pixCity: e.target.value,
                                      })
                                    }
                                    placeholder="CIDADE"
                                  />
                                  <p className={`text-xs ${dashboardPagesMetaTextClassName}`}>
                                    Se vazio, o QR Pix usa CIDADE como fallback.
                                  </p>
                                </DashboardFieldStack>
                              </DashboardFieldStack>
                              <DashboardFieldStack>
                                <Label>QR Code (URL customizada)</Label>
                                <Input
                                  value={pages.donations.qrCustomUrl}
                                  onChange={(e) =>
                                    updateDonations({
                                      qrCustomUrl: e.target.value,
                                    })
                                  }
                                  placeholder="Opcional"
                                />
                              </DashboardFieldStack>
                            </div>
                            <div
                              className={`flex items-center justify-center ${dashboardPagesControlSurfaceClassName} p-4`}
                            >
                              <img
                                src={qrPreview}
                                alt="Prévia QR Code"
                                className="h-40 w-40 object-cover"
                              />
                            </div>
                          </CardContent>
                        </Card>

                        <Card
                          lift={false}
                          className={dashboardPagesCardClassName}
                          data-testid="donations-crypto-editor"
                        >
                          <CardContent className="space-y-4 p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <h2
                                  className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                                >
                                  Criptomoedas
                                </h2>
                                <p className={`mt-1 text-xs ${dashboardPagesMetaTextClassName}`}>
                                  A seção pública aparece quando pelo menos um serviço tiver nome e
                                  endereço.
                                </p>
                              </div>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateDonations({
                                    cryptoServices: [
                                      ...pages.donations.cryptoServices,
                                      {
                                        ...emptyDonationsCryptoService,
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        icon: DEFAULT_DONATIONS_CRYPTO_ICON,
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>

                            <div className="grid gap-4">
                              {pages.donations.cryptoServices.map((service, index) => {
                                const PreviewIcon = editorIconMap[service.icon] || Coins;

                                return (
                                  <div
                                    key={service._editorKey || `donations-crypto-service-${index}`}
                                    data-testid={`donations-crypto-item-${index}`}
                                    draggable
                                    onDragStart={() =>
                                      handleDragStart("donations.cryptoServices", index)
                                    }
                                    onDragOver={(event) =>
                                      handleDragOver(event, "donations.cryptoServices", index)
                                    }
                                    onDrop={() => handleDrop("donations.cryptoServices", index)}
                                    onDragEnd={clearDragState}
                                    className={getReorderableSurfaceClassName(
                                      "donations.cryptoServices",
                                      index,
                                      "p-4",
                                    )}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div
                                        className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                      >
                                        <GripVertical className="h-4 w-4" />
                                        Arraste para reordenar
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <ReorderControls
                                          label={`serviço cripto ${index + 1}`}
                                          index={index}
                                          total={pages.donations.cryptoServices.length}
                                          onMove={(targetIndex) =>
                                            moveListItem(
                                              "donations.cryptoServices",
                                              index,
                                              targetIndex,
                                            )
                                          }
                                        />
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          aria-label={`Remover serviço cripto ${index + 1}`}
                                          onClick={() => removeCryptoServiceAt(index)}
                                        >
                                          <Trash2 className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    </div>

                                    <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px]">
                                      <div className="grid gap-4 md:grid-cols-2">
                                        <DashboardFieldStack>
                                          <Label htmlFor={`donations-crypto-name-${index}`}>
                                            Nome do serviço
                                          </Label>
                                          <Input
                                            id={`donations-crypto-name-${index}`}
                                            aria-label={`Nome do serviço cripto ${index + 1}`}
                                            value={service.name}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                name: e.target.value,
                                              })
                                            }
                                            placeholder="Bitcoin"
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label htmlFor={`donations-crypto-ticker-${index}`}>
                                            Ticker
                                          </Label>
                                          <Input
                                            id={`donations-crypto-ticker-${index}`}
                                            aria-label={`Ticker do serviço cripto ${index + 1}`}
                                            value={service.ticker}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                ticker: e.target.value,
                                              })
                                            }
                                            placeholder="BTC"
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label htmlFor={`donations-crypto-network-${index}`}>
                                            Rede
                                          </Label>
                                          <Input
                                            id={`donations-crypto-network-${index}`}
                                            aria-label={`Rede do serviço cripto ${index + 1}`}
                                            value={service.network}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                network: e.target.value,
                                              })
                                            }
                                            placeholder="Bitcoin"
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label htmlFor={`donations-crypto-action-label-${index}`}>
                                            Rótulo da ação externa
                                          </Label>
                                          <Input
                                            id={`donations-crypto-action-label-${index}`}
                                            aria-label={`Rótulo da ação externa do serviço cripto ${index + 1}`}
                                            value={service.actionLabel}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                actionLabel: e.target.value,
                                              })
                                            }
                                            placeholder="Abrir carteira"
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack className="md:col-span-2">
                                          <Label htmlFor={`donations-crypto-address-${index}`}>
                                            Endereço para cópia
                                          </Label>
                                          <Textarea
                                            id={`donations-crypto-address-${index}`}
                                            aria-label={`Endereço para cópia do serviço cripto ${index + 1}`}
                                            value={service.address}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                address: e.target.value,
                                              })
                                            }
                                            placeholder="bc1..."
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack className="md:col-span-2">
                                          <Label htmlFor={`donations-crypto-qr-value-${index}`}>
                                            Valor para QR (opcional)
                                          </Label>
                                          <Input
                                            id={`donations-crypto-qr-value-${index}`}
                                            aria-label={`Valor para QR do serviço cripto ${index + 1}`}
                                            value={service.qrValue}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                qrValue: e.target.value,
                                              })
                                            }
                                            placeholder="Se vazio, usa o endereço"
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack>
                                          <Label htmlFor={`donations-crypto-action-url-${index}`}>
                                            URL da ação externa
                                          </Label>
                                          <Input
                                            id={`donations-crypto-action-url-${index}`}
                                            aria-label={`URL da ação externa do serviço cripto ${index + 1}`}
                                            value={service.actionUrl}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                actionUrl: e.target.value,
                                              })
                                            }
                                            placeholder="https://..."
                                          />
                                        </DashboardFieldStack>
                                        <DashboardFieldStack className="md:col-span-2">
                                          <Label htmlFor={`donations-crypto-note-${index}`}>
                                            Nota
                                          </Label>
                                          <Textarea
                                            id={`donations-crypto-note-${index}`}
                                            aria-label={`Nota do serviço cripto ${index + 1}`}
                                            value={service.note}
                                            onChange={(e) =>
                                              updateCryptoServiceAt(index, {
                                                note: e.target.value,
                                              })
                                            }
                                            placeholder="Ex.: ERC-20, sem memo."
                                          />
                                        </DashboardFieldStack>
                                      </div>

                                      <div
                                        className={`${dashboardPagesControlSurfaceClassName} flex flex-col gap-4 p-4`}
                                      >
                                        <DashboardFieldStack>
                                          <Label htmlFor={`donations-crypto-icon-${index}`}>
                                            Ícone padrão
                                          </Label>
                                          <IconSelect
                                            value={service.icon || DEFAULT_DONATIONS_CRYPTO_ICON}
                                            onChange={(nextIcon) =>
                                              updateCryptoServiceAt(index, {
                                                icon: nextIcon,
                                              })
                                            }
                                            ariaLabel={`Selecionar ícone do serviço cripto ${index + 1}`}
                                          />
                                        </DashboardFieldStack>
                                        <div className="space-y-2">
                                          <p
                                            className={`text-xs ${dashboardPagesMetaTextClassName}`}
                                          >
                                            Prévia da página pública
                                          </p>
                                          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-3">
                                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-background">
                                              <PreviewIcon className="h-6 w-6 text-primary" />
                                            </div>
                                            <div className="min-w-0">
                                              <p className="truncate text-sm font-medium text-foreground">
                                                {service.name || "Serviço sem nome"}
                                              </p>
                                              <p
                                                className={`truncate text-xs ${dashboardPagesMetaTextClassName}`}
                                              >
                                                {service.ticker ||
                                                  service.network ||
                                                  "Sem metadados extras"}
                                              </p>
                                            </div>
                                          </div>
                                          <p
                                            className={`text-xs ${dashboardPagesMetaTextClassName}`}
                                          >
                                            Moedas sem ícone dedicado usam o fallback genérico.
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Doadores
                              </h2>
                              <div className="w-full md:w-56">
                                <IconSelect
                                  value={pages.donations.donorsIcon || "PiggyBank"}
                                  onChange={(nextIcon) => updateDonations({ donorsIcon: nextIcon })}
                                />
                              </div>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateDonations({
                                    donors: [
                                      ...pages.donations.donors,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        name: "Novo doador",
                                        amount: "",
                                        goal: "",
                                        date: "",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4">
                              {pages.donations.donors.map((donor, index) => (
                                <div
                                  key={donor._editorKey || `donations-donor-${index}`}
                                  data-testid={`donations-donor-item-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("donations.donors", index)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "donations.donors", index)
                                  }
                                  onDrop={() => handleDrop("donations.donors", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "donations.donors",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`doador ${index + 1}`}
                                        index={index}
                                        total={pages.donations.donors.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("donations.donors", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateDonations({
                                            donors: pages.donations.donors.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 md:grid-cols-4">
                                    <Input
                                      value={donor.name}
                                      onChange={(e) => {
                                        const next = [...pages.donations.donors];
                                        next[index] = {
                                          ...donor,
                                          name: e.target.value,
                                        };
                                        updateDonations({ donors: next });
                                      }}
                                      placeholder="Doador"
                                    />
                                    <Input
                                      value={donor.amount}
                                      onChange={(e) => {
                                        const next = [...pages.donations.donors];
                                        next[index] = {
                                          ...donor,
                                          amount: e.target.value,
                                        };
                                        updateDonations({ donors: next });
                                      }}
                                      placeholder="Valor"
                                    />
                                    <Input
                                      value={donor.goal}
                                      onChange={(e) => {
                                        const next = [...pages.donations.donors];
                                        next[index] = {
                                          ...donor,
                                          goal: e.target.value,
                                        };
                                        updateDonations({ donors: next });
                                      }}
                                      placeholder="Objetivo"
                                    />
                                    <Input
                                      value={donor.date}
                                      onChange={(e) => {
                                        const next = [...pages.donations.donors];
                                        next[index] = {
                                          ...donor,
                                          date: e.target.value,
                                        };
                                        updateDonations({ donors: next });
                                      }}
                                      placeholder="Mês/Ano"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ) : null}

                    {activeTab === "faq" ? (
                      <TabsContent
                        forceMount
                        value="faq"
                        className="mt-6 space-y-6 data-[state=inactive]:hidden"
                      >
                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Título</Label>
                              <Input
                                value={pages.faq.heroTitle}
                                onChange={(e) => updateFaq({ heroTitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Subtítulo</Label>
                              <Textarea
                                value={pages.faq.heroSubtitle}
                                onChange={(e) => updateFaq({ heroSubtitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Cards introdutórios
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateFaq({
                                    introCards: [
                                      ...pages.faq.introCards,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        title: "Novo card",
                                        icon: "Info",
                                        text: "",
                                        note: "",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              {pages.faq.introCards.map((card, index) => (
                                <div
                                  key={card._editorKey || `faq-introCard-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("faq.intro", index)}
                                  onDragOver={(event) => handleDragOver(event, "faq.intro", index)}
                                  onDrop={() => handleDrop("faq.intro", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "faq.intro",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`card introdutorio ${index + 1}`}
                                        index={index}
                                        total={pages.faq.introCards.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("faq.intro", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateFaq({
                                            introCards: pages.faq.introCards.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <Input
                                      value={card.title}
                                      onChange={(e) => {
                                        const next = [...pages.faq.introCards];
                                        next[index] = {
                                          ...card,
                                          title: e.target.value,
                                        };
                                        updateFaq({ introCards: next });
                                      }}
                                    />
                                    <Textarea
                                      value={card.text}
                                      onChange={(e) => {
                                        const next = [...pages.faq.introCards];
                                        next[index] = {
                                          ...card,
                                          text: e.target.value,
                                        };
                                        updateFaq({ introCards: next });
                                      }}
                                    />
                                    <Textarea
                                      value={card.note}
                                      onChange={(e) => {
                                        const next = [...pages.faq.introCards];
                                        next[index] = {
                                          ...card,
                                          note: e.target.value,
                                        };
                                        updateFaq({ introCards: next });
                                      }}
                                    />
                                    <IconSelect
                                      value={card.icon}
                                      onChange={(nextIcon) => {
                                        const next = [...pages.faq.introCards];
                                        next[index] = {
                                          ...card,
                                          icon: nextIcon,
                                        };
                                        updateFaq({ introCards: next });
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Grupos de FAQ
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateFaq({
                                    groups: [
                                      ...pages.faq.groups,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        title: "Novo grupo",
                                        icon: "Info",
                                        items: [],
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar grupo
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4">
                              {pages.faq.groups.map((group, groupIndex) => (
                                <div
                                  key={group._editorKey || `faq-group-${groupIndex}`}
                                  draggable
                                  onDragStart={() => handleDragStart("faq.groups", groupIndex)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "faq.groups", groupIndex)
                                  }
                                  onDrop={() => handleDrop("faq.groups", groupIndex)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "faq.groups",
                                    groupIndex,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`grupo de faq ${groupIndex + 1}`}
                                        index={groupIndex}
                                        total={pages.faq.groups.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("faq.groups", groupIndex, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateFaq({
                                            groups: pages.faq.groups.filter(
                                              (_, i) => i !== groupIndex,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <Input
                                      value={group.title}
                                      onChange={(e) => {
                                        const next = [...pages.faq.groups];
                                        next[groupIndex] = {
                                          ...group,
                                          title: e.target.value,
                                        };
                                        updateFaq({ groups: next });
                                      }}
                                    />
                                    <IconSelect
                                      value={group.icon}
                                      onChange={(nextIcon) => {
                                        const next = [...pages.faq.groups];
                                        next[groupIndex] = {
                                          ...group,
                                          icon: nextIcon,
                                        };
                                        updateFaq({ groups: next });
                                      }}
                                    />
                                  </div>
                                  <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <span
                                        className={`text-xs font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                                      >
                                        Perguntas
                                      </span>
                                      <DashboardActionButton
                                        type="button"
                                        size="sm"
                                        onClick={() => {
                                          const next = [...pages.faq.groups];
                                          next[groupIndex] = {
                                            ...group,
                                            items: [
                                              ...group.items,
                                              {
                                                _editorKey: generateDashboardPagesEditorLocalId(),
                                                question: "Nova pergunta",
                                                answer: "",
                                              },
                                            ],
                                          };
                                          updateFaq({ groups: next });
                                        }}
                                      >
                                        <Plus className="h-4 w-4" />
                                        Adicionar
                                      </DashboardActionButton>
                                    </div>
                                    <div className="grid gap-3">
                                      {group.items.map((item, itemIndex) => (
                                        <div
                                          key={
                                            item._editorKey || `faq-item-${groupIndex}-${itemIndex}`
                                          }
                                          draggable
                                          onDragStart={(event) => {
                                            // Avoid parent FAQ group dragstart overriding item drag state.
                                            event.stopPropagation();
                                            handleDragStart(`faq.items.${groupIndex}`, itemIndex);
                                          }}
                                          onDragOver={(event) => {
                                            event.stopPropagation();
                                            handleDragOver(
                                              event,
                                              `faq.items.${groupIndex}`,
                                              itemIndex,
                                            );
                                          }}
                                          onDrop={(event) => {
                                            event.stopPropagation();
                                            handleDrop(`faq.items.${groupIndex}`, itemIndex);
                                          }}
                                          onDragEnd={clearDragState}
                                          className={getReorderableSurfaceClassName(
                                            `faq.items.${groupIndex}`,
                                            itemIndex,
                                            "p-3",
                                          )}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <div
                                              className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                            >
                                              <GripVertical className="h-4 w-4" />
                                              Arraste para reordenar
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <ReorderControls
                                                label={`pergunta ${itemIndex + 1}`}
                                                index={itemIndex}
                                                total={group.items.length}
                                                onMove={(targetIndex) =>
                                                  moveListItem(
                                                    `faq.items.${groupIndex}`,
                                                    itemIndex,
                                                    targetIndex,
                                                  )
                                                }
                                              />
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => {
                                                  const next = [...pages.faq.groups];
                                                  const items = group.items.filter(
                                                    (_, i) => i !== itemIndex,
                                                  );
                                                  next[groupIndex] = {
                                                    ...group,
                                                    items,
                                                  };
                                                  updateFaq({ groups: next });
                                                }}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </div>
                                          <div className="mt-2 grid gap-2">
                                            <Input
                                              value={item.question}
                                              onChange={(e) => {
                                                const next = [...pages.faq.groups];
                                                const items = [...group.items];
                                                items[itemIndex] = {
                                                  ...item,
                                                  question: e.target.value,
                                                };
                                                next[groupIndex] = {
                                                  ...group,
                                                  items,
                                                };
                                                updateFaq({ groups: next });
                                              }}
                                            />
                                            <Textarea
                                              value={item.answer}
                                              onChange={(e) => {
                                                const next = [...pages.faq.groups];
                                                const items = [...group.items];
                                                items[itemIndex] = {
                                                  ...item,
                                                  answer: e.target.value,
                                                };
                                                next[groupIndex] = {
                                                  ...group,
                                                  items,
                                                };
                                                updateFaq({ groups: next });
                                              }}
                                            />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ) : null}

                    {activeTab === "team" ? (
                      <TabsContent
                        forceMount
                        value="team"
                        className="mt-6 space-y-6 data-[state=inactive]:hidden"
                      >
                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Badge</Label>
                              <Input
                                value={pages.team.heroBadge}
                                onChange={(e) => updateTeam({ heroBadge: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Título</Label>
                              <Input
                                value={pages.team.heroTitle}
                                onChange={(e) => updateTeam({ heroTitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Subtítulo</Label>
                              <Textarea
                                value={pages.team.heroSubtitle}
                                onChange={(e) => updateTeam({ heroSubtitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Título aposentados</Label>
                              <Input
                                value={pages.team.retiredTitle}
                                onChange={(e) => updateTeam({ retiredTitle: e.target.value })}
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Subtítulo aposentados</Label>
                              <Textarea
                                value={pages.team.retiredSubtitle}
                                onChange={(e) =>
                                  updateTeam({
                                    retiredSubtitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ) : null}

                    {activeTab === "recruitment" ? (
                      <TabsContent
                        forceMount
                        value="recruitment"
                        className="mt-6 space-y-6 data-[state=inactive]:hidden"
                      >
                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Badge</Label>
                              <Input
                                value={pages.recruitment.heroBadge}
                                onChange={(e) =>
                                  updateRecruitment({
                                    heroBadge: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Título</Label>
                              <Input
                                value={pages.recruitment.heroTitle}
                                onChange={(e) =>
                                  updateRecruitment({
                                    heroTitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Subtítulo</Label>
                              <Textarea
                                value={pages.recruitment.heroSubtitle}
                                onChange={(e) =>
                                  updateRecruitment({
                                    heroSubtitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="space-y-4 p-6">
                            <div className="flex items-center justify-between">
                              <h2
                                className={`text-sm font-semibold uppercase tracking-widest ${dashboardPagesMetaTextClassName}`}
                              >
                                Funções
                              </h2>
                              <DashboardActionButton
                                type="button"
                                size="sm"
                                onClick={() =>
                                  updateRecruitment({
                                    roles: [
                                      ...pages.recruitment.roles,
                                      {
                                        _editorKey: generateDashboardPagesEditorLocalId(),
                                        title: "Nova função",
                                        description: "",
                                        icon: "Sparkles",
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar
                              </DashboardActionButton>
                            </div>
                            <div className="grid gap-4">
                              {pages.recruitment.roles.map((role, index) => (
                                <div
                                  key={role._editorKey || `recruitment-role-${index}`}
                                  draggable
                                  onDragStart={() => handleDragStart("recruitment.roles", index)}
                                  onDragOver={(event) =>
                                    handleDragOver(event, "recruitment.roles", index)
                                  }
                                  onDrop={() => handleDrop("recruitment.roles", index)}
                                  onDragEnd={clearDragState}
                                  className={getReorderableSurfaceClassName(
                                    "recruitment.roles",
                                    index,
                                    "p-4",
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div
                                      className={`flex items-center gap-2 text-xs ${dashboardPagesMetaTextClassName}`}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                      Arraste para reordenar
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <ReorderControls
                                        label={`funcao ${index + 1}`}
                                        index={index}
                                        total={pages.recruitment.roles.length}
                                        onMove={(targetIndex) =>
                                          moveListItem("recruitment.roles", index, targetIndex)
                                        }
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                          updateRecruitment({
                                            roles: pages.recruitment.roles.filter(
                                              (_, i) => i !== index,
                                            ),
                                          })
                                        }
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                                    <Input
                                      value={role.title}
                                      onChange={(e) => {
                                        const next = [...pages.recruitment.roles];
                                        next[index] = {
                                          ...role,
                                          title: e.target.value,
                                        };
                                        updateRecruitment({ roles: next });
                                      }}
                                    />
                                    <IconSelect
                                      value={role.icon}
                                      onChange={(nextIcon) => {
                                        const next = [...pages.recruitment.roles];
                                        next[index] = {
                                          ...role,
                                          icon: nextIcon,
                                        };
                                        updateRecruitment({ roles: next });
                                      }}
                                    />
                                    <Textarea
                                      className="md:col-span-2"
                                      value={role.description}
                                      onChange={(e) => {
                                        const next = [...pages.recruitment.roles];
                                        next[index] = {
                                          ...role,
                                          description: e.target.value,
                                        };
                                        updateRecruitment({ roles: next });
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>

                        <Card lift={false} className={dashboardPagesCardClassName}>
                          <CardContent className="grid gap-4 p-6 md:grid-cols-2">
                            <DashboardFieldStack>
                              <Label>Título do CTA</Label>
                              <Input
                                value={pages.recruitment.ctaTitle}
                                onChange={(e) =>
                                  updateRecruitment({
                                    ctaTitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack>
                              <Label>Texto do CTA</Label>
                              <Input
                                value={pages.recruitment.ctaSubtitle}
                                onChange={(e) =>
                                  updateRecruitment({
                                    ctaSubtitle: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                            <DashboardFieldStack className="md:col-span-2">
                              <Label>Texto do botão</Label>
                              <Input
                                value={pages.recruitment.ctaButtonLabel}
                                onChange={(e) =>
                                  updateRecruitment({
                                    ctaButtonLabel: e.target.value,
                                  })
                                }
                              />
                            </DashboardFieldStack>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    ) : null}
                  </>
                )}
              </>
            )}
          </Tabs>
        </section>
      </main>
      <LazyImageLibraryDialog
        open={isPreviewLibraryOpen}
        onOpenChange={setIsPreviewLibraryOpen}
        apiBase={apiBase}
        description="Escolha uma imagem para o preview de compartilhamento da página."
        uploadFolder="shared"
        listFolders={previewLibraryFolders}
        listAll={false}
        includeProjectImages
        projectImagesView="by-project"
        allowDeselect
        mode="single"
        currentSelectionUrls={
          currentPreviewLibrarySelection ? [currentPreviewLibrarySelection] : []
        }
        onSave={({ urls, items }) =>
          applyPageShareImage(previewLibraryTarget, String(urls[0] || "").trim(), items[0]?.altText)
        }
      />
    </>
  );
};

const DashboardPages = () => {
  usePageMeta({ title: "Páginas", noIndex: true });
  const { currentUser, isLoadingUser } = useDashboardCurrentUser();
  const navigate = useNavigate();
  const handleUserCardClick = useCallback(() => {
    navigate("/dashboard/usuarios?edit=me");
  }, [navigate]);

  return (
    <DashboardShell
      currentUser={currentUser}
      isLoadingUser={isLoadingUser}
      onUserCardClick={handleUserCardClick}
    >
      <DashboardPagesContent currentUser={currentUser} />
    </DashboardShell>
  );
};

export const __testing = {
  clearDashboardPagesCache: () => {
    dashboardPagesCache = null;
  },
};

export default DashboardPages;
