import DashboardShell from "@/components/DashboardShell";
import ReorderControls from "@/components/ReorderControls";
import ThemedSvgLogo from "@/components/ThemedSvgLogo";
import DashboardActionButton, {
  default as Button,
} from "@/components/dashboard/DashboardActionButton";
import DashboardEditorBackdrop from "@/components/dashboard/DashboardEditorBackdrop";
import DashboardFieldStack from "@/components/dashboard/DashboardFieldStack";
import DashboardPageBadge from "@/components/dashboard/DashboardPageBadge";
import { Combobox, Input, Textarea } from "@/components/dashboard/dashboard-form-controls";
import {
  dashboardAnimationDelay,
  dashboardClampedStaggerMs,
  dashboardMotionDelays,
} from "@/components/dashboard/dashboard-motion";
import {
  dashboardEditorDialogWidthClassName,
  dashboardPageLayoutTokens,
  dashboardStrongSurfaceHoverClassName,
  dashboardSubtleSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import ProjectEditorAccordionHeader from "@/components/dashboard/project-editor/ProjectEditorAccordionHeader";
import LazyImageLibraryDialog from "@/components/lazy/LazyImageLibraryDialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import AsyncState from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dropdownRichIconClassName } from "@/components/ui/dropdown-contract";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { useDashboardCurrentUser } from "@/hooks/use-dashboard-current-user";
import { useEditorScrollLock } from "@/hooks/use-editor-scroll-lock";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useSiteSettings } from "@/hooks/use-site-settings";
import {
  getFirstAllowedDashboardRoute,
  resolveAccessRole,
  resolveGrants,
  type AccessRole,
  permissionIds,
} from "@/lib/access-control";
import { getApiBase } from "@/lib/api-base";
import { apiFetch } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { buildAvatarRenderUrl } from "@/lib/avatar-render-url";
import { filterImageLibraryFoldersByAccess } from "@/lib/image-library-scope";
import {
  BadgeCheck,
  Camera,
  Check,
  Clock,
  Code,
  Globe,
  GripVertical,
  Languages,
  Layers,
  MessageCircle,
  Paintbrush,
  Palette,
  PenTool,
  Play,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const FAVORITE_WORK_CATEGORIES = ["manga", "anime"] as const;
const DEFAULT_ADMIN_PERMISSIONS: ReadonlyArray<(typeof permissionIds)[number]> = [
  "posts",
  "projetos",
  "comentarios",
  "paginas",
  "uploads",
  "analytics",
  "usuarios",
];
const DEFAULT_ADMIN_PERMISSION_SET: ReadonlySet<string> = new Set(DEFAULT_ADMIN_PERMISSIONS);
type FavoriteWorkCategory = (typeof FAVORITE_WORK_CATEGORIES)[number];
type FavoriteWorksByCategory = Record<FavoriteWorkCategory, string[]>;
type FavoriteWorksDraft = Record<FavoriteWorkCategory, [string, string, string]>;

type UserRecord = {
  id: string;
  name: string;
  phrase: string;
  bio: string;
  email?: string | null;
  avatarUrl?: string | null;
  revision?: string | null;
  socials?: Array<{ label: string; href: string }>;
  favoriteWorks?: FavoriteWorksByCategory;
  status: "active" | "retired";
  permissions: string[];
  roles?: string[];
  accessRole?: AccessRole;
  grants?: Partial<Record<string, boolean>>;
  isAdmin?: boolean;
  order: number;
};

const dashboardUsersLoadingSkeletonItems = ["first", "second", "third", "fourth"] as const;

const DashboardUsersLoadingSkeleton = () => (
  <div className="mt-6 grid gap-4 lg:grid-cols-2" data-testid="dashboard-users-loading-skeleton">
    {dashboardUsersLoadingSkeletonItems.map((item) => (
      <div
        key={item}
        className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm"
        data-testid="dashboard-users-loading-card"
      >
        <div className="flex gap-4">
          <Skeleton className="h-14 w-14 rounded-full" />
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

const hasLegacyAdminSignal = (
  user: Pick<UserRecord, "permissions" | "isAdmin"> | null | undefined,
) => {
  if (!user) {
    return false;
  }
  if (user.isAdmin === true) {
    return true;
  }
  const permissions = Array.isArray(user.permissions)
    ? user.permissions.map((permission) => String(permission || "").trim())
    : [];
  return permissions.includes("*") || permissions.includes("usuarios");
};

const buildSelfUserRecord = (
  currentUser:
    | {
        id: string;
        name: string;
        username: string;
        avatarUrl?: string | null;
        revision?: string | null;
        accessRole?: AccessRole;
        grants?: Partial<Record<string, boolean>>;
        permissions?: string[];
        ownerIds?: string[];
        primaryOwnerId?: string | null;
        isAdmin?: boolean;
        email?: string | null;
        phrase?: string;
        bio?: string;
        socials?: Array<{ label: string; href: string }>;
        favoriteWorks?: FavoriteWorksByCategory;
      }
    | null
    | undefined,
) => {
  if (!currentUser?.id) {
    return null;
  }

  const permissions = Array.isArray(currentUser.permissions) ? [...currentUser.permissions] : [];
  const accessRole =
    currentUser.accessRole === "admin" ||
    hasLegacyAdminSignal({
      isAdmin: currentUser.isAdmin,
      permissions,
    })
      ? "admin"
      : "normal";

  return {
    id: currentUser.id,
    name: currentUser.name,
    phrase: String(currentUser.phrase || ""),
    bio: String(currentUser.bio || ""),
    email: currentUser.email || null,
    avatarUrl: currentUser.avatarUrl || null,
    revision: currentUser.revision || null,
    socials: Array.isArray(currentUser.socials) ? [...currentUser.socials] : [],
    favoriteWorks: currentUser.favoriteWorks || { manga: [], anime: [] },
    status: "active" as const,
    permissions,
    roles: [],
    accessRole,
    grants: currentUser.grants,
    isAdmin: currentUser.isAdmin,
    order: 0,
  } satisfies UserRecord;
};

const isUsersListAccessDenied = (status: number, errorCode: string) =>
  status === 403 && errorCode === "forbidden";

const isSelfEditQuery = (searchParams: URLSearchParams) => searchParams.get("edit") === "me";

type SecuritySummary = {
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
  activeSessionsCount: number;
  issuer?: string;
  accountLabel?: string;
  iconUrl?: string;
  oauthEmailSuggested?: string | null;
  identities?: Array<{
    provider: string;
    linked: boolean;
    emailNormalized?: string | null;
    emailVerified?: boolean;
    displayName?: string | null;
    avatarUrl?: string | null;
    linkedAt?: string | null;
    lastUsedAt?: string | null;
    disabledAt?: string | null;
  }>;
  passkeys?: Array<{
    id: string;
    name: string;
    deviceType?: string;
    backedUp?: boolean;
    createdAt?: string | null;
  }>;
};

type SecuritySessionRow = {
  sid: string;
  createdAt: string | null;
  lastSeenAt: string | null;
  lastIp: string;
  userAgent: string;
  current?: boolean;
  isPendingMfa?: boolean;
};

type DashboardAvatarProps = {
  avatarUrl?: string | null;
  name: string;
  sizeClassName: string;
  frameClassName: string;
  fallbackClassName: string;
  fallbackText: string;
};

const DashboardAvatar = ({
  avatarUrl,
  name,
  sizeClassName,
  frameClassName,
  fallbackClassName,
  fallbackText,
}: DashboardAvatarProps) => {
  const [hasError, setHasError] = useState(false);
  const hasImage = Boolean(avatarUrl) && !hasError;
  const wrapperClassName = `${sizeClassName} ${frameClassName} relative shrink-0 overflow-hidden rounded-full`;

  useEffect(() => {
    setHasError(false);
  }, [avatarUrl]);

  return (
    <div className={wrapperClassName}>
      {hasImage ? (
        <img
          src={String(avatarUrl)}
          alt={name}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          className="h-full w-full object-cover"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center ${fallbackClassName}`}>
          {fallbackText}
        </div>
      )}
    </div>
  );
};

const createEmptyFavoriteWorksDraft = (): FavoriteWorksDraft => ({
  manga: ["", "", ""],
  anime: ["", "", ""],
});

const createEmptyForm = () => ({
  id: "",
  name: "",
  phrase: "",
  bio: "",
  email: "",
  avatarUrl: "",
  socials: [] as Array<{ label: string; href: string }>,
  favoriteWorksDraft: createEmptyFavoriteWorksDraft(),
  status: "active" as "active" | "retired",
  accessRole: "normal" as AccessRole,
  permissions: [] as string[],
  roles: [] as string[],
});

const deriveAvatarPreviewRevisionFromItem = (
  item?: { variantsVersion?: number; createdAt?: string } | null,
) => {
  const variantsVersion = Number(item?.variantsVersion);
  if (Number.isFinite(variantsVersion) && variantsVersion > 0) {
    return `variant-${Math.floor(variantsVersion)}`;
  }
  const createdAt = String(item?.createdAt || "").trim();
  if (!createdAt) {
    return "";
  }
  const createdAtTimestamp = new Date(createdAt).getTime();
  if (Number.isFinite(createdAtTimestamp) && createdAtTimestamp > 0) {
    return `created-${createdAtTimestamp}`;
  }
  return `created-${createdAt}`;
};

const permissionOptions: Array<{ id: (typeof permissionIds)[number]; label: string }> = [
  { id: "posts", label: "Posts" },
  { id: "projetos", label: "Projetos" },
  { id: "comentarios", label: "Comentários" },
  { id: "paginas", label: "Páginas" },
  { id: "uploads", label: "Uploads" },
  { id: "analytics", label: "Análises" },
  { id: "usuarios", label: "Usuários" },
  { id: "configuracoes", label: "Configurações" },
  { id: "audit_log", label: "Auditoria" },
  { id: "integracoes", label: "Integrações" },
];

const stripOwnerRole = (roles: string[]) =>
  roles.filter((role) => role.trim().toLowerCase() !== "dono");

const MAX_FAVORITE_WORKS = 3;
const MAX_FAVORITE_WORK_LENGTH = 80;

const normalizeFavoriteWorksList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const dedupe = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const title = String(item || "")
      .trim()
      .slice(0, MAX_FAVORITE_WORK_LENGTH);
    if (!title) {
      continue;
    }
    const dedupeKey = title.toLowerCase();
    if (dedupe.has(dedupeKey)) {
      continue;
    }
    dedupe.add(dedupeKey);
    output.push(title);
    if (output.length >= MAX_FAVORITE_WORKS) {
      break;
    }
  }
  return output;
};

const normalizeFavoriteWorksByCategory = (value: unknown): FavoriteWorksByCategory => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      manga: [],
      anime: [],
    };
  }
  const source = value as Partial<Record<FavoriteWorkCategory, unknown>>;
  return {
    manga: normalizeFavoriteWorksList(source.manga),
    anime: normalizeFavoriteWorksList(source.anime),
  };
};

const listToDraft = (value: unknown): [string, string, string] => {
  const source = Array.isArray(value) ? value : [];
  const result = source
    .slice(0, MAX_FAVORITE_WORKS)
    .map((item) => String(item ?? "").slice(0, MAX_FAVORITE_WORK_LENGTH));
  while (result.length < MAX_FAVORITE_WORKS) {
    result.push("");
  }
  return [result[0] || "", result[1] || "", result[2] || ""];
};

const toFavoriteWorksDraft = (value: unknown): FavoriteWorksDraft => {
  const normalized = normalizeFavoriteWorksByCategory(value);
  return {
    manga: listToDraft(normalized.manga),
    anime: listToDraft(normalized.anime),
  };
};

const buildFavoriteWorksPayloadFromDraft = (
  draft: FavoriteWorksDraft,
): FavoriteWorksByCategory => ({
  manga: normalizeFavoriteWorksList(draft.manga),
  anime: normalizeFavoriteWorksList(draft.anime),
});

const accessRoleOptions: Array<{ id: AccessRole; label: string }> = [
  { id: "normal", label: "Normal" },
  { id: "admin", label: "Administrador" },
];

const defaultRoleOptions = [
  "Tradutor",
  "Revisor",
  "Typesetter",
  "Qualidade",
  "Desenvolvedor",
  "Cleaner",
  "Redrawer",
  "Encoder",
  "K-Timer",
  "Logo Maker",
  "K-Maker",
];

const getDefaultUserEditorAccordionValue = (includeSecurity: boolean) =>
  includeSecurity
    ? ["dados-principais", "perfil-publico", "acesso-permissoes", "seguranca"]
    : ["dados-principais", "perfil-publico", "acesso-permissoes"];

const socialIconMap: Record<string, typeof Globe> = {
  instagram: Camera,
  twitter: X,
  x: X,
  youtube: Play,
  discord: MessageCircle,
  "message-circle": MessageCircle,
  globe: Globe,
  site: Globe,
};

const isIconUrl = (value?: string | null) => {
  if (!value) return false;
  return value.startsWith("http") || value.startsWith("data:") || value.startsWith("/uploads/");
};

const reorderItems = <T,>(items: T[], from: number, to: number) => {
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

const getOrderedUserBuckets = (items: UserRecord[]) => {
  const activeIds = items
    .filter((user) => user.status === "active")
    .sort((a, b) => a.order - b.order)
    .map((user) => user.id);
  const retiredIds = items
    .filter((user) => user.status === "retired")
    .sort((a, b) => a.order - b.order)
    .map((user) => user.id);
  return { activeIds, retiredIds };
};

const didUserOrderChange = (before: UserRecord[], after: UserRecord[]) => {
  const beforeBuckets = getOrderedUserBuckets(before);
  const afterBuckets = getOrderedUserBuckets(after);
  if (beforeBuckets.activeIds.length !== afterBuckets.activeIds.length) {
    return true;
  }
  if (beforeBuckets.retiredIds.length !== afterBuckets.retiredIds.length) {
    return true;
  }
  const activeChanged = beforeBuckets.activeIds.some(
    (id, index) => id !== afterBuckets.activeIds[index],
  );
  if (activeChanged) {
    return true;
  }
  return beforeBuckets.retiredIds.some((id, index) => id !== afterBuckets.retiredIds[index]);
};

const isCurrentSecuritySession = (session: SecuritySessionRow) => session.current === true;

const formatSecurityDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return parsed.toLocaleString("pt-BR");
};

const roleIconRegistry: Record<string, typeof Globe> = {
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
  user: UserRound,
};

const DashboardUsers = () => {
  usePageMeta({ title: "Usuários", noIndex: true });
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const apiBase = getApiBase();
  const { settings } = useSiteSettings();
  const roleOptions = useMemo(() => {
    const labels = settings.teamRoles.map((role) => role.label).filter(Boolean);
    return labels.length ? labels : defaultRoleOptions;
  }, [settings.teamRoles]);
  const roleIconMap = useMemo(
    () => new Map(settings.teamRoles.map((role) => [role.label, role.icon])),
    [settings.teamRoles],
  );
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const { currentUser, isLoadingUser, setCurrentUser } = useDashboardCurrentUser<{
    id: string;
    name: string;
    username: string;
    avatarUrl?: string | null;
    revision?: string | null;
    accessRole?: AccessRole;
    grants?: Partial<Record<string, boolean>>;
    permissions?: string[];
    ownerIds?: string[];
    primaryOwnerId?: string | null;
    email?: string | null;
    phrase?: string;
    bio?: string;
    socials?: Array<{ label: string; href: string }>;
    favoriteWorks?: FavoriteWorksByCategory;
  }>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadError, setHasLoadError] = useState(false);
  const [loadVersion, setLoadVersion] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragGroup, setDragGroup] = useState<"active" | "retired" | null>(null);
  const [dragUsersSnapshot, setDragUsersSnapshot] = useState<UserRecord[] | null>(null);
  const [socialDragIndex, setSocialDragIndex] = useState<number | null>(null);
  const [socialDragOverIndex, setSocialDragOverIndex] = useState<number | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditorDialogScrolled, setIsEditorDialogScrolled] = useState(false);
  const [editorAccordionValue, setEditorAccordionValue] = useState<string[]>(() =>
    getDefaultUserEditorAccordionValue(false),
  );
  useEditorScrollLock(isDialogOpen);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [formState, setFormState] = useState(createEmptyForm);
  const [ownerToggle, setOwnerToggle] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserRecord | null>(null);
  const [resetMfaTarget, setResetMfaTarget] = useState<UserRecord | null>(null);
  const [isResettingMfa, setIsResettingMfa] = useState(false);
  const [resetPasskeysTarget, setResetPasskeysTarget] = useState<UserRecord | null>(null);
  const [isResettingPasskeys, setIsResettingPasskeys] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [editorAvatarPreviewRevision, setEditorAvatarPreviewRevision] = useState<string | null>(
    null,
  );
  const [linkTypes, setLinkTypes] = useState<Array<{ id: string; label: string; icon: string }>>(
    [],
  );
  const [securitySummary, setSecuritySummary] = useState<SecuritySummary | null>(null);
  const [securitySessions, setSecuritySessions] = useState<SecuritySessionRow[]>([]);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);
  const [securityEnrollment, setSecurityEnrollment] = useState<{
    enrollmentToken: string;
    manualSecret: string;
    otpauthUrl: string;
    issuer?: string;
    accountLabel?: string;
    iconUrl?: string;
  } | null>(null);
  const [securityQrDataUrl, setSecurityQrDataUrl] = useState("");
  const [securityEnrollCode, setSecurityEnrollCode] = useState("");
  const [securityDisableCode, setSecurityDisableCode] = useState("");
  const [securityRecoveryCodes, setSecurityRecoveryCodes] = useState<string[]>([]);
  const [isAddingPasskey, setIsAddingPasskey] = useState(false);
  const [removePasskeyTarget, setRemovePasskeyTarget] = useState<
    NonNullable<SecuritySummary["passkeys"]>[number] | null
  >(null);
  const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
  const [isDisconnectingIdentityProvider, setIsDisconnectingIdentityProvider] = useState<
    string | null
  >(null);
  const fallbackLinkTypes = useMemo(
    () => [
      { id: "instagram", label: "Instagram", icon: "instagram" },
      { id: "x", label: "X", icon: "x" },
      { id: "youtube", label: "YouTube", icon: "youtube" },
      { id: "discord", label: "Discord", icon: "message-circle" },
      { id: "site", label: "Site", icon: "globe" },
    ],
    [],
  );
  const primaryOwnerId = useMemo(
    () => String(currentUser?.primaryOwnerId || ownerIds[0] || ""),
    [currentUser?.primaryOwnerId, ownerIds],
  );
  const resolveUserAccessRole = useCallback(
    (user: UserRecord | null | undefined): AccessRole => {
      if (!user) {
        return "normal";
      }
      if (user.id === primaryOwnerId) {
        return "owner_primary";
      }
      if (ownerIds.includes(user.id)) {
        return "owner_secondary";
      }
      return user.accessRole === "admin" || hasLegacyAdminSignal(user) ? "admin" : "normal";
    },
    [ownerIds, primaryOwnerId],
  );
  const actorAccessRole: AccessRole = useMemo(() => {
    if (!currentUser) {
      return "normal";
    }
    if (currentUser.id === primaryOwnerId) {
      return "owner_primary";
    }
    if (ownerIds.includes(currentUser.id)) {
      return "owner_secondary";
    }
    return currentUser.accessRole === "admin" ? "admin" : "normal";
  }, [currentUser, ownerIds, primaryOwnerId]);
  const isPrimaryOwnerActor = actorAccessRole === "owner_primary";
  const isSecondaryOwnerActor = actorAccessRole === "owner_secondary";
  const isAdminActor = actorAccessRole === "admin";
  const actorCanUsers = currentUser?.grants?.usuarios === true;
  const actorCanUploadManagement = currentUser?.grants?.uploads === true;
  const canManageUsers =
    actorCanUsers && (isPrimaryOwnerActor || isSecondaryOwnerActor || isAdminActor);
  const canUseUsersByIdEndpoint = canManageUsers;
  const allowSelfEditOnly = !actorCanUsers && isSelfEditQuery(searchParams);
  const canManageOwners = isPrimaryOwnerActor;
  const isOwnerUser = useCallback(
    (user: UserRecord | null | undefined) => {
      if (!user) {
        return false;
      }
      return ownerIds.includes(user.id);
    },
    [ownerIds],
  );
  const currentUserRecord = useMemo(() => {
    if (!currentUser) {
      return null;
    }
    return users.find((user) => user.id === currentUser.id) || buildSelfUserRecord(currentUser);
  }, [currentUser, users]);
  const currentUserRef = useRef(currentUser);
  const currentUserRecordRef = useRef(currentUserRecord);
  const usersRef = useRef(users);
  const ownerIdsRef = useRef(ownerIds);
  const linkTypesRef = useRef(linkTypes);
  currentUserRef.current = currentUser;
  currentUserRecordRef.current = currentUserRecord;
  usersRef.current = users;
  ownerIdsRef.current = ownerIds;
  linkTypesRef.current = linkTypes;
  const clearSocialDragState = useCallback(() => {
    setSocialDragIndex(null);
    setSocialDragOverIndex(null);
  }, []);
  const toAvatarRenderUrl = useCallback(
    (avatarUrl: string | null | undefined, revision: string | null | undefined = "") =>
      buildAvatarRenderUrl(avatarUrl, 128, revision),
    [],
  );
  const handleLibraryOpenChange = useCallback((nextOpen: boolean) => {
    setIsLibraryOpen(nextOpen);
  }, []);
  const openLibrary = () => {
    setIsLibraryOpen(true);
  };
  const handleLibrarySave = useCallback(
    ({
      urls,
      items,
    }: {
      urls: string[];
      items?: Array<{ variantsVersion?: number; createdAt?: string }> | undefined;
    }) => {
      const url = urls[0] || "";
      const selectedItem = Array.isArray(items) ? items[0] || null : null;
      setFormState((prev) => ({
        ...prev,
        avatarUrl: url,
      }));
      setEditorAvatarPreviewRevision((prev) => {
        if (!url) {
          return null;
        }
        return deriveAvatarPreviewRevisionFromItem(selectedItem) || prev || null;
      });
    },
    [],
  );
  const openEditDialog = useCallback(
    (user: UserRecord) => {
      const normalizedPermissions = Array.from(
        new Set(
          (Array.isArray(user.permissions) ? user.permissions : [])
            .map((permission) => String(permission || "").trim())
            .filter((permission) => permissionOptions.some((option) => option.id === permission)),
        ),
      ) as Array<(typeof permissionIds)[number]>;
      const normalizedRoles = stripOwnerRole(Array.isArray(user.roles) ? user.roles : []);
      const userAccessRole = resolveUserAccessRole(user);
      setEditingUser(user);
      setFormState({
        id: user.id,
        name: user.name,
        phrase: user.phrase,
        bio: user.bio,
        email: user.email || "",
        avatarUrl: user.avatarUrl || "",
        socials: user.socials ? [...user.socials] : [],
        favoriteWorksDraft: toFavoriteWorksDraft(user.favoriteWorks),
        status: user.status,
        accessRole: userAccessRole === "admin" ? "admin" : "normal",
        permissions: normalizedPermissions,
        roles: [...normalizedRoles],
      });
      setEditorAvatarPreviewRevision(user.revision || null);
      setOwnerToggle(isOwnerUser(user));
      setResetMfaTarget(null);
      setIsResettingMfa(false);
      setResetPasskeysTarget(null);
      setIsResettingPasskeys(false);
      const isSelf = Boolean(currentUser && user.id === currentUser.id);
      const canRecoverCredentials = Boolean(
        !isSelf && (isPrimaryOwnerActor || (isSecondaryOwnerActor && !isOwnerUser(user))),
      );
      setEditorAccordionValue([
        ...getDefaultUserEditorAccordionValue(isSelf),
        ...(canRecoverCredentials ? ["recuperacao-acesso"] : []),
      ]);
      setIsEditorDialogScrolled(false);
      clearSocialDragState();
      setIsDialogOpen(true);
    },
    [
      clearSocialDragState,
      currentUser,
      isOwnerUser,
      isPrimaryOwnerActor,
      isSecondaryOwnerActor,
      resolveUserAccessRole,
    ],
  );
  const clearSelfEditQuery = useCallback(() => {
    if (!isSelfEditQuery(searchParams)) {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");
    nextParams.set("self", "1");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const clearSelfEditRetentionQuery = useCallback(() => {
    if (searchParams.get("self") !== "1") {
      return;
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("self");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleEditorOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isLibraryOpen) {
        return;
      }
      if (!nextOpen && (resetMfaTarget || resetPasskeysTarget || removePasskeyTarget)) {
        return;
      }
      setIsDialogOpen(nextOpen);
      if (!nextOpen) {
        setIsEditorDialogScrolled(false);
        clearSelfEditRetentionQuery();
      }
    },
    [
      clearSelfEditRetentionQuery,
      isLibraryOpen,
      removePasskeyTarget,
      resetMfaTarget,
      resetPasskeysTarget,
    ],
  );

  const activeUsers = useMemo(
    () => users.filter((user) => user.status === "active").sort((a, b) => a.order - b.order),
    [users],
  );
  const retiredUsers = useMemo(
    () => users.filter((user) => user.status === "retired").sort((a, b) => a.order - b.order),
    [users],
  );
  const isOwnerRecord = editingUser ? isOwnerUser(editingUser) : false;
  const isPrimaryOwnerRecord = editingUser ? editingUser.id === primaryOwnerId : false;
  const effectivePermissions = useMemo(() => {
    return Array.from(new Set(formState.permissions)) as Array<(typeof permissionIds)[number]>;
  }, [formState.permissions]);
  const isAdminRecord = (user: UserRecord) => resolveUserAccessRole(user) === "admin";
  const isAdminForm = formState.accessRole === "admin";
  const isEditingSelf = Boolean(editingUser && currentUser && editingUser.id === currentUser.id);
  const showPrivateIdentityFields = isPrimaryOwnerActor || isSecondaryOwnerActor || isAdminActor;
  const showInternalIdField = showPrivateIdentityFields;
  const showAccessEmailField = showPrivateIdentityFields;
  const showEditorIdBadge = showPrivateIdentityFields;
  const avatarLibraryFolders = useMemo(
    () =>
      filterImageLibraryFoldersByAccess(["users", "posts", "projects"], {
        grants: currentUser?.grants,
        allowUsersSelf: isEditingSelf,
      }),
    [currentUser?.grants, isEditingSelf],
  );
  const showSelfSecuritySection = isEditingSelf && isDialogOpen;
  const supportsPasskeys =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
  const canCreateUsers = canManageUsers;
  const canEditBasicFields = !editingUser
    ? canCreateUsers
    : isEditingSelf ||
      (actorCanUsers &&
        (isPrimaryOwnerActor ||
          (isSecondaryOwnerActor && !isOwnerRecord) ||
          (isAdminActor && !isOwnerRecord)));
  const canEditRoles = !editingUser
    ? canCreateUsers
    : actorCanUsers &&
      (isPrimaryOwnerActor ||
        (isSecondaryOwnerActor && !isOwnerRecord) ||
        (isAdminActor && !isOwnerRecord));
  const canEditAccessControls = !editingUser
    ? canCreateUsers && isPrimaryOwnerActor
    : isPrimaryOwnerActor;
  const canEditStatus = canEditRoles && !isEditingSelf && !isPrimaryOwnerRecord;
  const basicProfileOnlyEdit = Boolean(editingUser && canEditBasicFields && !canEditAccessControls);
  const canResetManagedCredentials = Boolean(
    editingUser &&
      isDialogOpen &&
      !isEditingSelf &&
      (isPrimaryOwnerActor || (isSecondaryOwnerActor && !isOwnerRecord)),
  );

  useEffect(() => {
    let isActive = true;
    const hasWarmState =
      usersRef.current.length > 0 ||
      ownerIdsRef.current.length > 0 ||
      linkTypesRef.current.length > 0;
    const load = async () => {
      try {
        if (isActive) {
          setIsLoading(true);
          setHasLoadError(false);
        }
        const [usersRes, linkTypesRes] = await Promise.all([
          apiFetch(apiBase, "/api/users", { auth: true }),
          apiFetch(apiBase, "/api/link-types"),
        ]);

        if (!usersRes.ok) {
          let errorCode = "";
          try {
            const errorPayload = await usersRes.json();
            errorCode = String(errorPayload?.error || "").trim();
          } catch {
            errorCode = "";
          }

          if (allowSelfEditOnly && isUsersListAccessDenied(usersRes.status, errorCode)) {
            if (!isActive) {
              return;
            }
            const fallbackCurrentUser = currentUserRef.current;
            const fallbackCurrentUserRecord = currentUserRecordRef.current;
            setUsers(fallbackCurrentUserRecord ? [fallbackCurrentUserRecord] : []);
            setOwnerIds(
              Array.isArray(fallbackCurrentUser?.ownerIds)
                ? fallbackCurrentUser.ownerIds.map((id) => String(id))
                : fallbackCurrentUser?.primaryOwnerId
                  ? [String(fallbackCurrentUser.primaryOwnerId)]
                  : [],
            );
          } else {
            throw new Error("users_load_failed");
          }
        } else {
          const data = await usersRes.json();
          if (!isActive) {
            return;
          }
          setUsers(data.users || []);
          setOwnerIds(Array.isArray(data.ownerIds) ? data.ownerIds : []);
        }

        if (linkTypesRes.ok) {
          const linkTypePayload = await linkTypesRes.json();
          if (!isActive) {
            return;
          }
          setLinkTypes(Array.isArray(linkTypePayload.items) ? linkTypePayload.items : []);
        }
      } catch {
        if (!isActive) {
          return;
        }
        if (!hasWarmState) {
          setUsers([]);
          setOwnerIds([]);
        }
        setHasLoadError(true);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      isActive = false;
    };
  }, [allowSelfEditOnly, apiBase, currentUser?.id, loadVersion]);

  useEffect(() => {
    if (!isSelfEditQuery(searchParams)) {
      return;
    }
    if (!currentUserRecord || isDialogOpen) {
      return;
    }
    openEditDialog(currentUserRecord);
  }, [currentUserRecord, isDialogOpen, openEditDialog, searchParams]);

  useEffect(() => {
    if (!isDialogOpen) {
      return;
    }
    clearSelfEditQuery();
  }, [clearSelfEditQuery, isDialogOpen]);

  useEffect(() => {
    if (!allowSelfEditOnly || isDialogOpen || isSelfEditQuery(searchParams)) {
      return;
    }
    const target = getFirstAllowedDashboardRoute(resolveGrants(currentUser), {
      accessRole: resolveAccessRole(currentUser),
      allowUsersForSelf: true,
    });
    if (target !== "/dashboard/usuarios") {
      navigate(target, { replace: true });
    }
  }, [allowSelfEditOnly, currentUser, isDialogOpen, navigate, searchParams]);

  useEffect(() => {
    const createQuery = String(searchParams.get("create") || "").trim();
    if (createQuery !== "1") {
      return;
    }
    if (!canCreateUsers || isDialogOpen) {
      return;
    }
    setEditingUser(null);
    setFormState({ ...createEmptyForm(), accessRole: "normal", permissions: [] });
    setOwnerToggle(false);
    clearSocialDragState();
    setEditorAccordionValue(getDefaultUserEditorAccordionValue(false));
    setIsEditorDialogScrolled(false);
    setIsDialogOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("create");
    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  }, [canCreateUsers, clearSocialDragState, isDialogOpen, searchParams, setSearchParams]);

  useEffect(() => {
    if (!isDialogOpen) {
      setIsEditorDialogScrolled(false);
    }
  }, [isDialogOpen]);

  useEffect(() => {
    if (!showSelfSecuritySection || !editingUser?.id) {
      setSecuritySummary(null);
      setSecuritySessions([]);
      setSecurityEnrollment(null);
      setSecurityQrDataUrl("");
      setSecurityEnrollCode("");
      setSecurityDisableCode("");
      setSecurityRecoveryCodes([]);
      setIsDisconnectingIdentityProvider(null);
      return;
    }

    let active = true;
    const isRequestActive = () => active;
    setIsLoadingSecurity(true);
    void Promise.all([
      apiFetch(apiBase, "/api/me/security", { auth: true }),
      apiFetch(apiBase, "/api/me/sessions", { auth: true }),
    ])
      .then(async ([securityRes, sessionsRes]) => {
        if (!isRequestActive()) {
          return;
        }
        if (securityRes.ok) {
          const body = await securityRes.json();
          if (!isRequestActive()) {
            return;
          }
          setSecuritySummary(body);
        } else {
          setSecuritySummary(null);
        }

        if (sessionsRes.ok) {
          const body = await sessionsRes.json();
          if (!isRequestActive()) {
            return;
          }
          setSecuritySessions(Array.isArray(body.sessions) ? body.sessions : []);
        } else {
          setSecuritySessions([]);
        }
      })
      .catch(() => {
        if (!isRequestActive()) {
          return;
        }
        setSecuritySummary(null);
        setSecuritySessions([]);
      })
      .finally(() => {
        if (isRequestActive()) {
          setIsLoadingSecurity(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apiBase, editingUser?.id, showSelfSecuritySection]);

  useEffect(() => {
    if (!securityEnrollment?.otpauthUrl) {
      setSecurityQrDataUrl("");
      return;
    }
    let active = true;
    void QRCode.toDataURL(securityEnrollment.otpauthUrl, {
      width: 220,
      margin: 1,
      errorCorrectionLevel: "M",
    })
      .then((dataUrl) => {
        if (active) {
          setSecurityQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setSecurityQrDataUrl("");
        }
      });
    return () => {
      active = false;
    };
  }, [securityEnrollment?.otpauthUrl]);

  const refreshSelfSecurity = async () => {
    if (!showSelfSecuritySection) {
      return;
    }
    setIsLoadingSecurity(true);
    try {
      const [securityRes, sessionsRes] = await Promise.all([
        apiFetch(apiBase, "/api/me/security", { auth: true }),
        apiFetch(apiBase, "/api/me/sessions", { auth: true }),
      ]);
      if (securityRes.ok) {
        const body = await securityRes.json();
        setSecuritySummary(body);
      }
      if (sessionsRes.ok) {
        const body = await sessionsRes.json();
        setSecuritySessions(Array.isArray(body.sessions) ? body.sessions : []);
      }
    } finally {
      setIsLoadingSecurity(false);
    }
  };

  const startSelfEnrollment = async () => {
    const result = await authClient.twoFactor.enable({});
    if (result.error || !result.data?.totpURI) {
      toast({ title: "Falha ao iniciar V2F", variant: "destructive" });
      return;
    }
    const totpUrl = new URL(result.data.totpURI);
    setSecurityEnrollment({
      enrollmentToken: "better-auth",
      manualSecret: totpUrl.searchParams.get("secret") || "",
      otpauthUrl: result.data.totpURI,
      issuer: totpUrl.searchParams.get("issuer") || "Nekomorto",
      accountLabel: decodeURIComponent(totpUrl.pathname.split(":").slice(1).join(":")),
    });
    setSecurityEnrollCode("");
    setSecurityRecoveryCodes(Array.isArray(result.data.backupCodes) ? result.data.backupCodes : []);
  };

  const confirmSelfEnrollment = async () => {
    const enrollmentToken = String(securityEnrollment?.enrollmentToken || "").trim();
    const normalizedCode = String(securityEnrollCode || "")
      .trim()
      .replace(/\s+/g, "");
    if (!securityEnrollment || !enrollmentToken || !normalizedCode) {
      if (!enrollmentToken) {
        toast({
          title: "Sessão de ativação expirada",
          description: "Inicie novamente para confirmar a V2F.",
          variant: "destructive",
        });
      }
      return;
    }
    const result = await authClient.twoFactor.verifyTotp({ code: normalizedCode });
    if (result.error) {
      toast({ title: "Não foi possível confirmar a V2F", variant: "destructive" });
      return;
    }
    setSecurityEnrollment(null);
    setSecurityEnrollCode("");
    toast({ title: "V2F ativada" });
    await refreshSelfSecurity();
  };

  const disableSelfTotp = async () => {
    if (!securityDisableCode.trim()) {
      return;
    }
    const code = securityDisableCode.trim();
    const verification = /^\d{6}$/.test(code)
      ? await authClient.twoFactor.verifyTotp({ code })
      : await authClient.twoFactor.verifyBackupCode({ code });
    if (verification.error) {
      toast({ title: "Código de segurança inválido", variant: "destructive" });
      return;
    }
    const result = await authClient.twoFactor.disable({});
    if (result.error) {
      toast({ title: "Não foi possível desativar", variant: "destructive" });
      return;
    }
    setSecurityDisableCode("");
    setSecurityEnrollment(null);
    toast({ title: "V2F desativada" });
    await refreshSelfSecurity();
  };

  const addSelfPasskey = async () => {
    if (isAddingPasskey) return;
    setIsAddingPasskey(true);
    try {
      const result = await authClient.passkey.addPasskey({ name: "Passkey Nekomorto" });
      if (result.error) {
        toast({ title: "Não foi possível cadastrar a passkey", variant: "destructive" });
        return;
      }
      toast({ title: "Passkey cadastrada" });
      await refreshSelfSecurity();
    } finally {
      setIsAddingPasskey(false);
    }
  };

  const removeSelfPasskey = async (id: string) => {
    if (removingPasskeyId) return;
    setRemovingPasskeyId(id);
    try {
      const result = await authClient.$fetch("/passkey/delete-passkey", {
        method: "POST",
        body: { id },
      });
      if (result.error) {
        toast({ title: "Não foi possível remover a passkey", variant: "destructive" });
        return;
      }
      setRemovePasskeyTarget(null);
      toast({ title: "Passkey removida" });
      await refreshSelfSecurity();
    } finally {
      setRemovingPasskeyId(null);
    }
  };

  const revokeSelfSession = async (sid: string) => {
    const response = await apiFetch(apiBase, `/api/me/sessions/${encodeURIComponent(sid)}`, {
      method: "DELETE",
      auth: true,
    });
    if (!response.ok) {
      toast({ title: "Falha ao encerrar sessão", variant: "destructive" });
      return;
    }
    await refreshSelfSecurity();
  };

  const revokeSelfOthers = async () => {
    const response = await apiFetch(apiBase, "/api/me/sessions/others", {
      method: "DELETE",
      auth: true,
    });
    if (!response.ok) {
      toast({ title: "Falha ao encerrar outras sessões", variant: "destructive" });
      return;
    }
    await refreshSelfSecurity();
  };

  const connectIdentityProvider = async (provider: "google" | "discord") => {
    const result = await authClient.linkSocial({
      provider,
      callbackURL: "/dashboard/usuarios?edit=me",
    });
    if (result?.error) {
      toast({ title: "Não foi possível conectar a conta", variant: "destructive" });
    }
  };

  const disconnectIdentityProvider = async (provider: string) => {
    if (isDisconnectingIdentityProvider) {
      return;
    }
    setIsDisconnectingIdentityProvider(provider);
    try {
      const result = await authClient.unlinkAccount({ providerId: provider });
      if (result.error) {
        toast({ title: "Não foi possível desconectar a conta", variant: "destructive" });
        return;
      }
      toast({ title: `Conta ${provider} desconectada` });
      await refreshSelfSecurity();
    } finally {
      setIsDisconnectingIdentityProvider(null);
    }
  };

  const identityRows = useMemo(() => {
    const byProvider = new Map(
      (Array.isArray(securitySummary?.identities) ? securitySummary.identities : []).map(
        (entry) => [
          String(entry.provider || "")
            .trim()
            .toLowerCase(),
          entry,
        ],
      ),
    );
    return ["discord", "google"].map((provider) => ({
      provider,
      identity: byProvider.get(provider) || null,
    }));
  }, [securitySummary?.identities]);

  const linkedProvider = useMemo(
    () =>
      String(searchParams.get("linked") || "")
        .trim()
        .toLowerCase(),
    [searchParams],
  );
  const linkedProviderError = useMemo(
    () =>
      String(searchParams.get("error") || "")
        .trim()
        .toLowerCase(),
    [searchParams],
  );

  useEffect(() => {
    if ((!linkedProvider && !linkedProviderError) || !showSelfSecuritySection) {
      return;
    }
    if (linkedProviderError === "identity_already_linked") {
      toast({
        title: "Essa conta já está conectada a outro usuário",
        variant: "destructive",
      });
    } else if (linkedProvider) {
      const providerLabel =
        linkedProvider === "google"
          ? "Google"
          : linkedProvider === "discord"
            ? "Discord"
            : linkedProvider;
      toast({ title: `Conta ${providerLabel} conectada com sucesso` });
      void refreshSelfSecurity();
    }
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("linked");
    nextParams.delete("error");
    setSearchParams(nextParams, { replace: true });
  }, [
    linkedProvider,
    linkedProviderError,
    refreshSelfSecurity,
    searchParams,
    setSearchParams,
    showSelfSecuritySection,
  ]);

  const formatIdentityProviderLabel = (provider: string) =>
    provider === "google" ? "Google" : provider === "discord" ? "Discord" : provider;

  const formatIdentityStatusLabel = (identity?: { linked?: boolean } | null) =>
    identity?.linked ? "Conectada" : "Não conectada";

  const formatIdentityLastUsed = (value: string | null | undefined) =>
    formatSecurityDateTime(value);

  const formatIdentityLinkedAt = (value: string | null | undefined) =>
    formatSecurityDateTime(value);

  const renderConnectedAccountsCard = () => (
    <div
      className={`space-y-3 rounded-xl p-2.5 sm:rounded-2xl sm:p-3 ${subtleInsetSurfaceClassName}`}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">Métodos de acesso</p>
        <p className="text-xs text-muted-foreground">
          Conecte Google e Discord à sua conta para usar ambos como métodos de acesso.
        </p>
      </div>
      <div className="space-y-2">
        {identityRows.map(({ provider, identity }) => {
          const providerLabel = formatIdentityProviderLabel(provider);
          const isLinked = identity?.linked === true;
          const isDisconnecting = isDisconnectingIdentityProvider === provider;
          return (
            <div
              key={provider}
              className={`flex flex-wrap min-w-0 items-center justify-between gap-2 rounded-xl p-2.5 sm:p-3 ${subtleMutedSurfaceClassName}`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{providerLabel}</p>
                  <Badge className="bg-card/80 text-muted-foreground">
                    {formatIdentityStatusLabel(identity || { linked: false, provider })}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  E-mail: {identity?.emailNormalized || "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Vinculada em: {formatIdentityLinkedAt(identity?.linkedAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Último uso: {formatIdentityLastUsed(identity?.lastUsedAt)}
                </p>
              </div>
              {isLinked ? (
                <DashboardActionButton
                  size="sm"
                  tone="destructive"
                  onClick={() => void disconnectIdentityProvider(provider)}
                  disabled={Boolean(isDisconnectingIdentityProvider)}
                >
                  {isDisconnecting ? "Desconectando..." : "Desconectar"}
                </DashboardActionButton>
              ) : (
                <DashboardActionButton
                  size="sm"
                  tone="primary"
                  onClick={() => connectIdentityProvider(provider as "google" | "discord")}
                >
                  Conectar
                </DashboardActionButton>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const openNewDialog = () => {
    setEditingUser(null);
    setFormState({ ...createEmptyForm(), accessRole: "normal", permissions: [] });
    setEditorAvatarPreviewRevision(null);
    setOwnerToggle(false);
    clearSocialDragState();
    setEditorAccordionValue(getDefaultUserEditorAccordionValue(false));
    setIsEditorDialogScrolled(false);
    setIsDialogOpen(true);
  };

  const canOpenEdit = useCallback(
    (user: UserRecord) => {
      if (!currentUser) {
        return false;
      }
      if (currentUser.id === user.id) {
        return true;
      }
      if (!actorCanUsers) {
        return false;
      }
      const userIsOwner = isOwnerUser(user);
      if (isPrimaryOwnerActor) {
        return true;
      }
      if (isSecondaryOwnerActor) {
        return !userIsOwner;
      }
      if (isAdminActor) {
        return !userIsOwner;
      }
      return false;
    },
    [
      actorCanUsers,
      currentUser,
      isAdminActor,
      isPrimaryOwnerActor,
      isSecondaryOwnerActor,
      ownerIds,
      primaryOwnerId,
    ],
  );

  const handleUserCardClick = useCallback(
    (user: UserRecord) => {
      if (!canOpenEdit(user)) {
        return;
      }
      openEditDialog(user);
    },
    [canOpenEdit, openEditDialog],
  );

  const handleShellUserCardClick = useCallback(() => {
    if (!currentUserRecord) {
      return;
    }
    handleUserCardClick(currentUserRecord);
  }, [currentUserRecord, handleUserCardClick]);

  const handleSave = async () => {
    if (!canEditBasicFields) {
      return;
    }
    const normalizedPermissions = Array.from(new Set(formState.permissions));
    const normalizedAccessRole: AccessRole = formState.accessRole === "admin" ? "admin" : "normal";
    const basePayload = {
      id: formState.id.trim(),
      name: formState.name.trim(),
      phrase: formState.phrase.trim(),
      bio: formState.bio.trim(),
      email: formState.email.trim().toLowerCase() || null,
      avatarUrl: formState.avatarUrl.trim() || null,
      socials: formState.socials.filter((item) => item.label.trim() && item.href.trim()),
      favoriteWorks: buildFavoriteWorksPayloadFromDraft(formState.favoriteWorksDraft),
      roles: stripOwnerRole(formState.roles),
      accessRole: normalizedAccessRole,
      status: canEditStatus ? formState.status : "active",
      ...(canEditAccessControls ? { permissions: normalizedPermissions } : {}),
    };
    const payload = (() => {
      if (!editingUser) {
        return basePayload;
      }
      if (canEditAccessControls) {
        return basePayload;
      }
      if (canEditRoles || canEditStatus) {
        const rolePayload: Record<string, unknown> = {
          ...basePayload,
        };
        if (!canEditStatus) {
          rolePayload.status = "active";
        }
        return rolePayload;
      }
      return {
        name: basePayload.name,
        phrase: basePayload.phrase,
        bio: basePayload.bio,
        email: basePayload.email,
        avatarUrl: basePayload.avatarUrl,
        socials: basePayload.socials,
        favoriteWorks: basePayload.favoriteWorks,
      };
    })();

    if (!editingUser && !basePayload.name) {
      toast({
        title: "Informe pelo menos o nome do usuário",
        description: "O e-mail de acesso é obrigatório para a pré-criação da conta.",
        variant: "destructive",
      });
      return;
    }
    if (!editingUser && !basePayload.email) {
      toast({
        title: "Informe o e-mail de acesso",
        description: "O sistema gera o ID interno automaticamente ao salvar.",
        variant: "destructive",
      });
      return;
    }

    const requestPayload = !editingUser && !basePayload.id ? { ...payload, id: null } : payload;

    const method = editingUser ? "PUT" : "POST";
    const isSelfEdit = editingUser && currentUser?.id === editingUser.id;
    const path = isSelfEdit
      ? "/api/users/self"
      : editingUser
        ? canUseUsersByIdEndpoint
          ? `/api/users/${editingUser.id}`
          : "/api/users/self"
        : "/api/users";

    const response = await apiFetch(apiBase, path, {
      method,
      auth: true,
      json: requestPayload,
    });

    if (response.ok) {
      const data = await response.json();
      const targetId = editingUser ? editingUser.id : data.user?.id || basePayload.id;
      const isSelfSave = Boolean(currentUser && targetId === currentUser.id);
      const wasOwner = Boolean(editingUser && ownerIds.includes(editingUser.id));
      const shouldKeepOwner = Boolean(ownerToggle);
      if (canManageOwners && targetId) {
        const nextOwnerIds = shouldKeepOwner
          ? Array.from(new Set([...ownerIds, targetId]))
          : ownerIds.filter((id) => id !== targetId);
        if (nextOwnerIds.join(",") !== ownerIds.join(",")) {
          const ownersResponse = await apiFetch(apiBase, "/api/owners", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            auth: true,
            body: JSON.stringify({ ownerIds: nextOwnerIds }),
          });
          if (ownersResponse.ok) {
            const ownersData = await ownersResponse.json();
            setOwnerIds(Array.isArray(ownersData.ownerIds) ? ownersData.ownerIds : nextOwnerIds);
            if (!shouldKeepOwner) {
              setOwnerToggle(false);
            }
          } else {
            toast({
              title: shouldKeepOwner
                ? "Não foi possível promover para dono"
                : "Não foi possível rebaixar o dono",
              variant: "destructive",
            });
          }
        }
      }
      const nextUserRecord = data.user
        ? {
            ...(editingUser ||
              currentUserRecordRef.current ||
              buildSelfUserRecord(currentUserRef.current)),
            ...data.user,
          }
        : null;
      if (editingUser) {
        setUsers((prev) =>
          prev.map((user) =>
            user.id === editingUser.id ? ((nextUserRecord || data.user) as UserRecord) : user,
          ),
        );
      } else if (nextUserRecord) {
        setUsers((prev) => [...prev, nextUserRecord]);
      } else {
        setUsers((prev) => [...prev, data.user]);
      }
      setEditorAvatarPreviewRevision(data.user?.revision || null);
      if (isSelfSave) {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                ...data.user,
                username: prev.username,
              }
            : prev,
        );
      }
      if (isSelfSave && nextUserRecord) {
        setUsers((prev) =>
          prev.map((user) => (user.id === nextUserRecord.id ? nextUserRecord : user)),
        );
      }
      if (wasOwner && !shouldKeepOwner) {
        setFormState((prev) => ({
          ...prev,
          accessRole: "normal",
        }));
      }
      setIsDialogOpen(false);
      toast({
        title: editingUser ? "Usuário atualizado" : "Usuário criado",
        description: "As alterações foram salvas com sucesso.",
        intent: "success",
      });
      return;
    }
    let errorCode = "";
    try {
      const errorPayload = await response.json();
      errorCode = String(errorPayload?.error || "").trim();
    } catch {
      errorCode = "";
    }
    if (errorCode === "owner_role_requires_owner_governance") {
      toast({
        title: "A promoção para dono é aplicada separadamente",
        description:
          "Os dados do usuário são salvos primeiro e a governança de owners é atualizada em seguida.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Não foi possível salvar o usuário", variant: "destructive" });
  };

  const togglePermission = (permissionId: (typeof permissionIds)[number]) => {
    if (!canEditAccessControls) {
      return;
    }
    setFormState((prev) => {
      const basePermissions = prev.permissions;
      const hasPermission = basePermissions.includes(permissionId);
      return {
        ...prev,
        permissions: hasPermission
          ? basePermissions.filter((item) => item !== permissionId)
          : [...basePermissions, permissionId],
      };
    });
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) {
      return;
    }
    const response = await apiFetch(apiBase, `/api/users/${deleteTarget.id}`, {
      method: "DELETE",
      auth: true,
    });
    if (!response.ok) {
      toast({ title: "Não foi possível excluir o usuário", variant: "destructive" });
      return;
    }
    const data = await response.json();
    setUsers((prev) => prev.filter((user) => user.id !== deleteTarget.id));
    if (Array.isArray(data.ownerIds)) {
      setOwnerIds(data.ownerIds);
    }
    if (editingUser && editingUser.id === deleteTarget.id) {
      setIsDialogOpen(false);
    }
    setDeleteTarget(null);
    toast({ title: "Usuário excluído" });
  };

  const handleResetUserTotp = async () => {
    if (!resetMfaTarget || isResettingMfa) {
      return;
    }
    setIsResettingMfa(true);
    const targetName = resetMfaTarget.name;
    const response = await apiFetch(
      apiBase,
      `/api/admin/users/${encodeURIComponent(resetMfaTarget.id)}/security/totp/reset`,
      {
        method: "POST",
        auth: true,
      },
    );
    if (!response.ok) {
      setIsResettingMfa(false);
      toast({ title: "Não foi possível redefinir a V2F", variant: "destructive" });
      return;
    }
    setResetMfaTarget(null);
    setIsResettingMfa(false);
    toast({
      title: "V2F redefinida",
      description: `${targetName} pode entrar novamente sem o dispositivo anterior.`,
    });
  };

  const handleResetUserPasskeys = async () => {
    if (!resetPasskeysTarget || isResettingPasskeys) return;
    setIsResettingPasskeys(true);
    const targetName = resetPasskeysTarget.name;
    try {
      const response = await apiFetch(
        apiBase,
        `/api/admin/users/${encodeURIComponent(resetPasskeysTarget.id)}/security/passkeys/reset`,
        { method: "POST", auth: true },
      );
      if (!response.ok) {
        toast({ title: "Não foi possível remover as passkeys", variant: "destructive" });
        return;
      }
      const body = await response.json();
      setResetPasskeysTarget(null);
      toast({
        title: "Passkeys removidas",
        description: `${body.removedPasskeys || 0} passkey(s) removida(s) de ${targetName}; sessões ativas encerradas.`,
      });
    } finally {
      setIsResettingPasskeys(false);
    }
  };

  const toggleRole = (role: string) => {
    if (!canEditRoles) {
      return;
    }
    setFormState((prev) => {
      const hasRole = prev.roles.includes(role);
      return {
        ...prev,
        roles: hasRole ? prev.roles.filter((item) => item !== role) : [...prev.roles, role],
      };
    });
  };

  const handleSocialDragStart = (event: DragEvent<HTMLButtonElement>, index: number) => {
    if (!canEditBasicFields) {
      return;
    }
    setSocialDragIndex(index);
    setSocialDragOverIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };

  const handleSocialDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    if (!canEditBasicFields || socialDragIndex === null) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (socialDragOverIndex !== index) {
      setSocialDragOverIndex(index);
    }
  };

  const handleSocialDrop = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault();
    const from = socialDragIndex;
    if (!canEditBasicFields || from === null || from === index) {
      clearSocialDragState();
      return;
    }
    setFormState((prev) => ({
      ...prev,
      socials: reorderItems(prev.socials, from, index),
    }));
    clearSocialDragState();
  };
  const moveSocialLink = useCallback(
    (from: number, to: number) => {
      if (!canEditBasicFields || from === to) {
        return;
      }
      setFormState((prev) => ({
        ...prev,
        socials: reorderItems(prev.socials, from, to),
      }));
    },
    [canEditBasicFields],
  );

  const reorderUsers = (orderedActiveIds: string[], orderedRetiredIds: string[]) => {
    setUsers((prev) => {
      const activeMap = new Map(prev.filter((u) => u.status === "active").map((u) => [u.id, u]));
      const retiredMap = new Map(prev.filter((u) => u.status === "retired").map((u) => [u.id, u]));
      const reorderedActive = orderedActiveIds
        .map((id, index) => {
          const user = activeMap.get(id);
          return user ? { ...user, order: index } : null;
        })
        .filter(Boolean) as UserRecord[];
      const reorderedRetired = orderedRetiredIds
        .map((id, index) => {
          const user = retiredMap.get(id);
          return user ? { ...user, order: orderedActiveIds.length + index } : null;
        })
        .filter(Boolean) as UserRecord[];
      return [...reorderedActive, ...reorderedRetired];
    });
  };

  const handleDragOverActive = (event: React.DragEvent<HTMLDivElement>, overId: string) => {
    if (!canManageUsers || !dragId || dragGroup !== "active" || dragId === overId) {
      return;
    }
    event.preventDefault();
    const activeIds = activeUsers.map((user) => user.id);
    const retiredIds = retiredUsers.map((user) => user.id);
    const fromIndex = activeIds.indexOf(dragId);
    const toIndex = activeIds.indexOf(overId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    const nextActiveIds = [...activeIds];
    nextActiveIds.splice(fromIndex, 1);
    nextActiveIds.splice(toIndex, 0, dragId);
    reorderUsers(nextActiveIds, retiredIds);
  };

  const handleDragOverRetired = (event: React.DragEvent<HTMLDivElement>, overId: string) => {
    if (!canManageUsers || !dragId || dragGroup !== "retired" || dragId === overId) {
      return;
    }
    event.preventDefault();
    const activeIds = activeUsers.map((user) => user.id);
    const retiredIds = retiredUsers.map((user) => user.id);
    const fromIndex = retiredIds.indexOf(dragId);
    const toIndex = retiredIds.indexOf(overId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    const nextRetiredIds = [...retiredIds];
    nextRetiredIds.splice(fromIndex, 1);
    nextRetiredIds.splice(toIndex, 0, dragId);
    reorderUsers(activeIds, nextRetiredIds);
  };

  const persistUserOrder = useCallback(
    async (orderedIds: string[], retiredIds: string[], snapshot: UserRecord[]) => {
      try {
        const response = await apiFetch(apiBase, "/api/users/reorder", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          auth: true,
          body: JSON.stringify({ orderedIds, retiredIds }),
        });
        if (!response.ok) {
          setUsers(snapshot);
          toast({
            title: "Não foi possível salvar a nova ordem",
            description: "A lista foi restaurada para a ordem anterior.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Ordem dos usuários atualizada",
          description: "A nova ordenação foi salva.",
          intent: "success",
        });
      } catch {
        setUsers(snapshot);
        toast({
          title: "Não foi possível salvar a nova ordem",
          description: "A lista foi restaurada para a ordem anterior.",
          variant: "destructive",
        });
      }
    },
    [apiBase],
  );

  const moveUserWithinGroup = useCallback(
    (group: "active" | "retired", from: number, to: number) => {
      if (!canManageUsers || from === to) {
        return;
      }
      const snapshot = users.map((userItem) => ({ ...userItem }));
      const activeIds = activeUsers.map((user) => user.id);
      const retiredIds = retiredUsers.map((user) => user.id);
      const nextActiveIds = group === "active" ? reorderItems(activeIds, from, to) : activeIds;
      const nextRetiredIds = group === "retired" ? reorderItems(retiredIds, from, to) : retiredIds;
      reorderUsers(nextActiveIds, nextRetiredIds);
      void persistUserOrder(nextActiveIds, nextRetiredIds, snapshot);
    },
    [activeUsers, canManageUsers, persistUserOrder, retiredUsers, users],
  );

  const handleDragEnd = async () => {
    if (!canManageUsers) {
      setDragId(null);
      setDragGroup(null);
      setDragUsersSnapshot(null);
      return;
    }
    const snapshot = dragUsersSnapshot;
    const changed = snapshot ? didUserOrderChange(snapshot, users) : false;
    if (!changed) {
      setDragId(null);
      setDragGroup(null);
      setDragUsersSnapshot(null);
      return;
    }
    const orderedIds = activeUsers.map((user) => user.id);
    const retiredIds = retiredUsers.map((user) => user.id);
    if (snapshot) {
      await persistUserOrder(orderedIds, retiredIds, snapshot);
    }
    setDragId(null);
    setDragGroup(null);
    setDragUsersSnapshot(null);
  };

  const editorSectionClassName =
    "project-editor-section min-w-0 overflow-hidden rounded-2xl border border-border/60 bg-card/70 px-4";
  const editorSectionTriggerClassName =
    "project-editor-section-trigger flex min-w-0 w-full items-start gap-4 py-3.5 text-left hover:no-underline md:py-4";
  const editorSectionContentClassName = "project-editor-section-content min-w-0 px-1 pb-2.5";
  const subtleSummarySurfaceClassName = `border border-border/60 bg-card/65 ${dashboardSubtleSurfaceHoverClassName}`;
  const subtleSurfaceClassName = `border border-border/60 bg-card/60 ${dashboardSubtleSurfaceHoverClassName}`;
  const subtleInsetSurfaceClassName = `border border-border/60 bg-background/60 ${dashboardSubtleSurfaceHoverClassName}`;
  const subtleMutedSurfaceClassName = `border border-border/60 bg-card/50 ${dashboardSubtleSurfaceHoverClassName}`;
  const subtleReorderButtonClassName =
    "h-8 w-8 border-transparent bg-transparent text-muted-foreground/70 shadow-none hover:border-primary/40 hover:bg-background/60 hover:text-foreground focus-visible:ring-primary/60 [&_svg]:opacity-70";
  const editorUserLabel = editingUser ? "Usuário em edição" : "Novo usuário";
  const editorUserTitle = formState.name.trim() || "Sem nome";
  const editorUserId = formState.id.trim() || "Será definido ao salvar";
  const editorAccessRoleLabel =
    ownerToggle || isOwnerRecord ? "Dono" : formState.accessRole === "admin" ? "Admin" : "Normal";
  const editorStatusLabel = formState.status === "active" ? "Ativo" : "Aposentado";
  const editorDialogDescription = editingUser
    ? "Atualize as informações e permissões do usuário."
    : "Cadastre um novo usuário autorizado. O ID interno será gerado automaticamente ao salvar.";

  const renderUserCard = ({
    user,
    index,
    total,
    group,
  }: {
    user: UserRecord;
    index: number;
    total: number;
    group: "active" | "retired";
  }) => {
    const canEditUser = canOpenEdit(user);
    const isRetired = group === "retired";
    const isLoneLastCard = total % 2 === 1 && index === total - 1;
    const visibleRoles = ownerIds.includes(user.id)
      ? user.roles || []
      : stripOwnerRole(user.roles || []);
    const renderedAvatarUrl =
      user.id === currentUser?.id ? currentUser.avatarUrl || user.avatarUrl : user.avatarUrl;
    const renderedAvatarRevision =
      user.id === currentUser?.id ? currentUser.revision || user.revision : user.revision;
    const userCardClassName = [
      `relative min-w-0 overflow-hidden ${dashboardPageLayoutTokens.surfaceSolid} p-5 animate-slide-up`,
      !isRetired ? `transition ${dashboardStrongSurfaceHoverClassName} hover:bg-primary/5` : "",
      isLoneLastCard ? "lg:col-span-2 lg:mx-auto lg:w-[calc(50%-0.5rem)]" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        key={user.id}
        data-testid={`dashboard-user-card-${user.id}`}
        className={userCardClassName}
        style={dashboardAnimationDelay(dashboardClampedStaggerMs(index))}
        draggable={canManageUsers}
        onDragStart={() => {
          setDragUsersSnapshot((prev) =>
            prev ? prev : users.map((userItem) => ({ ...userItem })),
          );
          setDragId(user.id);
          setDragGroup(group);
        }}
        onDragOver={(event) =>
          group === "active"
            ? handleDragOverActive(event, user.id)
            : handleDragOverRetired(event, user.id)
        }
        onDragEnd={handleDragEnd}
      >
        {canEditUser ? (
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label={`Abrir usuário ${user.name}`}
            onClick={() => handleUserCardClick(user)}
          >
            <span className="sr-only">{`Abrir usuário ${user.name}`}</span>
          </button>
        ) : null}
        <div
          data-slot="user-card-shell"
          className="pointer-events-none flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
        >
          <div className={`relative min-w-0 flex-1 ${canEditUser ? "cursor-pointer" : ""}`}>
            <div
              data-slot="user-card-main"
              className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start"
            >
              <DashboardAvatar
                avatarUrl={toAvatarRenderUrl(renderedAvatarUrl, renderedAvatarRevision)}
                name={user.name}
                sizeClassName="h-14 w-14"
                frameClassName="border border-border/70 bg-background"
                fallbackClassName="bg-background text-sm text-foreground"
                fallbackText={user.name.slice(0, 2).toUpperCase()}
              />
              <div data-slot="user-card-summary" className="min-w-0 flex-1 space-y-2">
                <div
                  data-slot="user-card-title"
                  className="flex min-w-0 flex-wrap items-center gap-2"
                >
                  <h3 className="min-w-0 wrap-break-word text-lg font-semibold">{user.name}</h3>
                  {!isRetired && ownerIds.includes(user.id) ? (
                    <Badge className="bg-primary/20 text-primary">Dono</Badge>
                  ) : null}
                  {!isRetired && !ownerIds.includes(user.id) && isAdminRecord(user) ? (
                    <Badge className="bg-background text-foreground/70">Administrador</Badge>
                  ) : null}
                  {isRetired ? (
                    <Badge className="bg-background text-foreground/70">Aposentado</Badge>
                  ) : null}
                  {isRetired && isAdminRecord(user) ? (
                    <Badge className="bg-background text-foreground/70">Administrador</Badge>
                  ) : null}
                </div>
                <p className={`wrap-break-word text-sm ${dashboardPageLayoutTokens.cardMetaText}`}>
                  {user.phrase || "-"}
                </p>
                <p
                  data-slot="user-card-bio"
                  className={`min-h-0 overflow-hidden text-xs ${dashboardPageLayoutTokens.cardMetaText} line-clamp-2 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]`}
                >
                  {user.bio || "Sem biografia cadastrada."}
                </p>
                {visibleRoles.length > 0 ? (
                  <div data-slot="user-card-roles" className="flex min-w-0 flex-wrap gap-2">
                    {visibleRoles.map((role) => (
                      <Badge key={role} variant="secondary" className="text-[10px] uppercase">
                        {role}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div
            data-slot="user-card-controls"
            className="pointer-events-auto relative z-10 flex shrink-0 flex-wrap items-center gap-2 self-start lg:self-auto"
          >
            {canManageUsers ? (
              <ReorderControls
                label={`usuário ${user.name}`}
                index={index}
                total={total}
                onMove={(targetIndex) => moveUserWithinGroup(group, index, targetIndex)}
                buttonClassName={subtleReorderButtonClassName}
              />
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <DashboardShell
        currentUser={currentUser}
        isLoadingUser={isLoadingUser}
        onUserCardClick={currentUserRecord ? handleShellUserCardClick : undefined}
      >
        <main className="pt-24">
          <section className="mx-auto w-full max-w-6xl px-6 pb-20 md:px-10 reveal" data-reveal>
            <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <DashboardPageBadge>Usuários</DashboardPageBadge>
                <h1 className="mt-4 text-3xl font-semibold lg:text-4xl animate-slide-up">
                  Gestão de Usuários
                </h1>
                <p
                  className="mt-2 text-sm text-muted-foreground animate-slide-up"
                  style={dashboardAnimationDelay(dashboardMotionDelays.headerDescriptionMs)}
                >
                  Reordene arrastando ou pelos botões para refletir a ordem na página pública.
                </p>
              </div>
              {canManageUsers && (
                <DashboardActionButton
                  type="button"
                  size="toolbar"
                  className="animate-slide-up"
                  style={dashboardAnimationDelay(dashboardMotionDelays.headerActionsMs)}
                  onClick={openNewDialog}
                >
                  Adicionar usuário
                </DashboardActionButton>
              )}
            </header>

            <div className="mt-10">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Usuários ativos</h2>
                {isLoading ? (
                  <span className="inline-flex min-h-6 min-w-10 items-center justify-center">
                    <Skeleton
                      className="h-6 w-10 rounded-full"
                      data-testid="dashboard-users-active-count-loading"
                    />
                  </span>
                ) : (
                  <span
                    key={`active-count-${activeUsers.length}`}
                    className="inline-flex min-h-6 min-w-10 items-center justify-center animate-slide-up"
                    style={dashboardAnimationDelay(dashboardMotionDelays.sectionMetaMs)}
                  >
                    <Badge
                      variant="static"
                      className="min-w-10 justify-center bg-background text-foreground/70"
                      data-testid="dashboard-users-active-count-badge"
                    >
                      {activeUsers.length}
                    </Badge>
                  </span>
                )}
              </div>

              {isLoading ? (
                <DashboardUsersLoadingSkeleton />
              ) : hasLoadError ? (
                <AsyncState
                  kind="error"
                  title="Não foi possível carregar os usuários"
                  description="Tente novamente em alguns instantes."
                  className="mt-6"
                  action={
                    <DashboardActionButton
                      onClick={() => setLoadVersion((previous) => previous + 1)}
                    >
                      Tentar novamente
                    </DashboardActionButton>
                  }
                />
              ) : activeUsers.length === 0 ? (
                <AsyncState
                  kind="empty"
                  title="Nenhum usuário ativo"
                  description="Adicione um novo membro para começar."
                  className="mt-6"
                />
              ) : (
                <div
                  data-testid="dashboard-users-active-grid"
                  className="mt-6 grid gap-4 lg:grid-cols-2"
                >
                  {activeUsers.map((user, index) =>
                    renderUserCard({
                      user,
                      index,
                      total: activeUsers.length,
                      group: "active",
                    }),
                  )}
                </div>
              )}

              {!isLoading && retiredUsers.length > 0 && (
                <div className="mt-12">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Usuários aposentados</h2>
                    <span
                      key={`retired-count-${retiredUsers.length}`}
                      className="inline-flex min-h-6 min-w-10 items-center justify-center animate-slide-up"
                      style={dashboardAnimationDelay(dashboardMotionDelays.sectionMetaMs)}
                    >
                      <Badge
                        variant="static"
                        className="min-w-10 justify-center bg-background text-foreground/70"
                        data-testid="dashboard-users-retired-count-badge"
                      >
                        {retiredUsers.length}
                      </Badge>
                    </span>
                  </div>
                  <div
                    data-testid="dashboard-users-retired-grid"
                    className="mt-6 grid gap-4 lg:grid-cols-2"
                  >
                    {retiredUsers.map((user, index) =>
                      renderUserCard({
                        user,
                        index,
                        total: retiredUsers.length,
                        group: "retired",
                      }),
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </DashboardShell>
      <LazyImageLibraryDialog
        open={isLibraryOpen}
        onOpenChange={handleLibraryOpenChange}
        apiBase={apiBase}
        description="Selecione uma imagem já enviada para reutilizar ou envie um novo arquivo."
        uploadFolder="users"
        listFolders={avatarLibraryFolders}
        listAll={false}
        allowDeselect
        mode="single"
        cropAvatar
        cropTargetFolder="users"
        cropSlot={formState.id ? `avatar-${formState.id}` : undefined}
        currentSelectionUrls={formState.avatarUrl ? [formState.avatarUrl] : undefined}
        scopeUserId={isEditingSelf ? currentUser?.id : undefined}
        allowUploadManagementActions={actorCanUploadManagement}
        onSave={({ urls, items }) => handleLibrarySave({ urls, items })}
      />

      <Dialog open={isDialogOpen} onOpenChange={handleEditorOpenChange} modal={false}>
        {isDialogOpen ? <DashboardEditorBackdrop /> : null}
        <DialogContent
          className={`project-editor-dialog sm:w-auto sm:${dashboardEditorDialogWidthClassName} sm:max-w-[min(1760px,calc(100vw-1rem))] gap-0 p-0 ${
            isEditorDialogScrolled ? "editor-modal-scrolled" : ""
          }`}
          style={
            isMobile
              ? {
                  width: "95vw",
                  maxWidth: "500px",
                }
              : undefined
          }
          onPointerDownOutside={(event) => {
            if (isLibraryOpen) {
              event.preventDefault();
            }
          }}
          onInteractOutside={(event) => {
            if (isLibraryOpen) {
              event.preventDefault();
            }
          }}
        >
          <div className="project-editor-modal-frame flex max-h-[min(90vh,calc(100dvh-1.5rem))] min-h-0 w-full min-w-0 flex-col overflow-x-clip">
            <div
              className="project-editor-scroll-shell min-w-0 flex-1 overflow-y-auto no-scrollbar"
              onScroll={(event) => {
                const nextScrolled = event.currentTarget.scrollTop > 0;
                setIsEditorDialogScrolled((prev) => (prev === nextScrolled ? prev : nextScrolled));
              }}
            >
              <div className="project-editor-top sticky top-0 z-20 min-w-0 border-b border-border/60 bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
                <DialogHeader className="space-y-0 px-4 pb-2.5 pt-3.5 text-left md:px-6 lg:px-8">
                  <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase tracking-[0.12em]"
                        >
                          {editorUserLabel}
                        </Badge>
                        {ownerToggle || isOwnerRecord ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase tracking-[0.12em]"
                          >
                            Dono
                          </Badge>
                        ) : null}
                      </div>
                      <DialogTitle className="text-xl md:text-2xl">
                        {editingUser ? "Editar usuário" : "Adicionar usuário"}
                      </DialogTitle>
                      <DialogDescription className="max-w-2xl text-xs md:text-sm">
                        {editorDialogDescription}
                      </DialogDescription>
                    </div>
                    <div
                      className={`w-full min-w-0 rounded-xl px-3 py-1.5 text-left sm:w-auto sm:text-right ${subtleSummarySurfaceClassName}`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                        Usuário
                      </p>
                      <p className="min-w-0 max-w-[240px] truncate text-sm font-medium text-foreground">
                        {editorUserTitle}
                      </p>
                    </div>
                  </div>
                </DialogHeader>
                <div className="project-editor-status-bar flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden border-t border-border/60 px-4 py-1.5 md:px-6 lg:px-8">
                  {showEditorIdBadge ? (
                    <Badge
                      variant="outline"
                      className="w-full min-w-0 max-w-full truncate text-[10px] uppercase tracking-[0.12em] sm:w-auto"
                    >
                      <span className="truncate">ID {editorUserId}</span>
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                    {editorAccessRoleLabel}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                    {editorStatusLabel}
                  </Badge>
                  <span className="min-w-0 max-w-30 truncate text-[11px] text-muted-foreground">
                    {formState.socials.length} redes
                  </span>
                  <span className="min-w-0 max-w-36 truncate text-[11px] text-muted-foreground">
                    {stripOwnerRole(formState.roles).length} funções
                  </span>
                </div>
              </div>

              <div className="project-editor-layout grid min-w-0 gap-3.5 px-4 pb-4 pt-2.5 md:gap-4 md:px-6 md:pb-5 lg:gap-5 lg:px-8">
                {basicProfileOnlyEdit ? (
                  <div
                    className={`min-w-0 rounded-2xl px-4 py-3 text-xs text-muted-foreground ${subtleSurfaceClassName}`}
                  >
                    Você só pode alterar informações básicas deste usuário.
                  </div>
                ) : null}
                <Accordion
                  type="multiple"
                  value={editorAccordionValue}
                  onValueChange={setEditorAccordionValue}
                  className="project-editor-accordion min-w-0 space-y-2.5"
                >
                  <AccordionItem value="dados-principais" className={editorSectionClassName}>
                    <AccordionTrigger className={editorSectionTriggerClassName}>
                      <ProjectEditorAccordionHeader
                        title="Dados principais"
                        subtitle={editorUserTitle}
                      />
                    </AccordionTrigger>
                    <AccordionContent className={editorSectionContentClassName}>
                      <div className="grid gap-4 md:grid-cols-2">
                        {showInternalIdField ? (
                          <DashboardFieldStack>
                            <Label htmlFor="user-id">ID interno</Label>
                            <Input
                              id="user-id"
                              value={formState.id}
                              onChange={(event) =>
                                setFormState((prev) => ({ ...prev, id: event.target.value }))
                              }
                              placeholder={
                                editingUser ? "ID interno" : "Gerado automaticamente ao salvar"
                              }
                              disabled={Boolean(editingUser) || !canManageUsers}
                            />
                            {!editingUser ? (
                              <p className="text-xs text-muted-foreground">
                                Você pode deixar em branco para gerar o ID interno automaticamente.
                              </p>
                            ) : null}
                          </DashboardFieldStack>
                        ) : null}
                        <DashboardFieldStack>
                          <Label htmlFor="user-name">Nome</Label>
                          <Input
                            id="user-name"
                            value={formState.name}
                            onChange={(event) =>
                              setFormState((prev) => ({ ...prev, name: event.target.value }))
                            }
                            placeholder="Nome exibido"
                            disabled={!canEditBasicFields}
                          />
                        </DashboardFieldStack>
                        <DashboardFieldStack>
                          <Label htmlFor="user-phrase">Frase</Label>
                          <Input
                            id="user-phrase"
                            value={formState.phrase}
                            onChange={(event) =>
                              setFormState((prev) => ({ ...prev, phrase: event.target.value }))
                            }
                            placeholder="Frase curta"
                            disabled={!canEditBasicFields}
                          />
                        </DashboardFieldStack>
                        {showAccessEmailField ? (
                          <DashboardFieldStack>
                            <Label htmlFor="user-email">E-mail de acesso</Label>
                            <Input
                              id="user-email"
                              type="email"
                              value={formState.email}
                              onChange={(event) =>
                                setFormState((prev) => ({ ...prev, email: event.target.value }))
                              }
                              placeholder="usuario@exemplo.com"
                              disabled={!canEditBasicFields}
                            />
                          </DashboardFieldStack>
                        ) : null}
                        <DashboardFieldStack className="md:col-span-2">
                          <Label htmlFor="user-bio">Bio</Label>
                          <Textarea
                            id="user-bio"
                            value={formState.bio}
                            onChange={(event) =>
                              setFormState((prev) => ({ ...prev, bio: event.target.value }))
                            }
                            placeholder="Texto da bio"
                            rows={4}
                            disabled={!canEditBasicFields}
                          />
                        </DashboardFieldStack>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="perfil-publico" className={editorSectionClassName}>
                    <AccordionTrigger className={editorSectionTriggerClassName}>
                      <ProjectEditorAccordionHeader
                        title="Perfil público"
                        subtitle={`${formState.socials.length} redes • avatar e obras`}
                      />
                    </AccordionTrigger>
                    <AccordionContent className={editorSectionContentClassName}>
                      <div className="grid min-w-0 gap-4">
                        <div className="grid min-w-0 gap-3">
                          <Label>Obras favoritas (até 3 por categoria)</Label>
                          <div className="grid min-w-0 gap-4 md:grid-cols-2">
                            {FAVORITE_WORK_CATEGORIES.map((category) => {
                              const categoryLabel = category === "manga" ? "Mangá" : "Anime";
                              return (
                                <div
                                  key={category}
                                  className={`min-w-0 space-y-2 rounded-xl p-3 ${subtleSurfaceClassName}`}
                                >
                                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                    {categoryLabel}
                                  </p>
                                  <div className="grid min-w-0 gap-2">
                                    {formState.favoriteWorksDraft[category].map((value, index) => (
                                      <Input
                                        key={`${category}-${index}`}
                                        id={`user-favorite-works-${category}-${index + 1}`}
                                        aria-label={`${categoryLabel} ${index + 1}`}
                                        value={value}
                                        onChange={(event) =>
                                          setFormState((prev) => {
                                            const nextCategory = [
                                              ...prev.favoriteWorksDraft[category],
                                            ] as [string, string, string];
                                            nextCategory[index] = event.target.value;
                                            return {
                                              ...prev,
                                              favoriteWorksDraft: {
                                                ...prev.favoriteWorksDraft,
                                                [category]: nextCategory,
                                              },
                                            };
                                          })
                                        }
                                        placeholder={`${categoryLabel} ${index + 1}`}
                                        disabled={!canEditBasicFields}
                                      />
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Espaços e edição livre são preservados durante a digitação; a
                            normalização ocorre ao salvar.
                          </p>
                        </div>
                        <DashboardFieldStack className="min-w-0">
                          <Label>Avatar</Label>
                          <div className="flex flex-wrap items-center gap-3">
                            {formState.avatarUrl ? (
                              <DashboardAvatar
                                avatarUrl={toAvatarRenderUrl(
                                  formState.avatarUrl,
                                  editorAvatarPreviewRevision,
                                )}
                                name={formState.name || "Avatar"}
                                sizeClassName="h-12 w-12"
                                frameClassName={`border border-border/60 bg-card/60 ${dashboardSubtleSurfaceHoverClassName}`}
                                fallbackClassName="bg-card/60 text-xs text-foreground"
                                fallbackText={(formState.name || "U").slice(0, 1).toUpperCase()}
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-border/60 text-[10px] text-muted-foreground">
                                Sem imagem
                              </div>
                            )}
                            <DashboardActionButton
                              type="button"
                              size="sm"
                              onClick={openLibrary}
                              disabled={!canEditBasicFields}
                            >
                              Biblioteca
                            </DashboardActionButton>
                          </div>
                        </DashboardFieldStack>
                        <DashboardFieldStack className="min-w-0">
                          <Label>Links e redes</Label>
                          <div className="grid min-w-0 gap-3">
                            {formState.socials.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                Nenhum link adicionado.
                              </p>
                            ) : null}
                            {formState.socials.map((social, index) => {
                              const availableLinkTypes =
                                linkTypes.length > 0 ? linkTypes : fallbackLinkTypes;
                              const selectedOption =
                                availableLinkTypes.find((option) => option.id === social.label) ||
                                availableLinkTypes.find(
                                  (option) => option.label === social.label,
                                ) ||
                                null;
                              const selectedLabel = selectedOption?.label || "Selecione a rede";

                              return (
                                <div
                                  key={`${social.label}-${index}`}
                                  data-testid={`user-social-row-${index}`}
                                  className={`min-w-0 rounded-xl p-2 ${
                                    socialDragOverIndex === index
                                      ? `${subtleSurfaceClassName} border-primary/40 bg-primary/5`
                                      : subtleSurfaceClassName
                                  }`}
                                  onDragOver={(event) => handleSocialDragOver(event, index)}
                                  onDrop={(event) => handleSocialDrop(event, index)}
                                >
                                  <div className="grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]">
                                    <DashboardActionButton
                                      type="button"
                                      size="icon"
                                      draggable={canEditBasicFields}
                                      className="cursor-grab border-border/60 bg-background/60 text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:cursor-grabbing disabled:cursor-not-allowed"
                                      aria-label={`Arrastar rede ${social.label || index + 1}`}
                                      onDragStart={(event) => handleSocialDragStart(event, index)}
                                      onDragEnd={clearSocialDragState}
                                      disabled={!canEditBasicFields}
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </DashboardActionButton>
                                    <ReorderControls
                                      label={`rede ${social.label || index + 1}`}
                                      index={index}
                                      total={formState.socials.length}
                                      onMove={(targetIndex) => moveSocialLink(index, targetIndex)}
                                      disabled={!canEditBasicFields}
                                      buttonClassName={subtleReorderButtonClassName}
                                    />
                                    <Combobox
                                      value={social.label}
                                      onValueChange={(value) =>
                                        setFormState((prev) => {
                                          const next = [...prev.socials];
                                          next[index] = { ...next[index], label: value };
                                          return { ...prev, socials: next };
                                        })
                                      }
                                      disabled={!canEditBasicFields}
                                      ariaLabel={selectedLabel}
                                      options={availableLinkTypes.map((option) => {
                                        const isCustomIcon = isIconUrl(option.icon);
                                        const Icon = socialIconMap[option.icon] || Globe;
                                        return {
                                          value: option.id,
                                          label: option.label,
                                          icon: isCustomIcon ? (
                                            <ThemedSvgLogo
                                              url={option.icon}
                                              label={option.label}
                                              className={`${dropdownRichIconClassName} text-primary`}
                                            />
                                          ) : (
                                            Icon
                                          ),
                                        };
                                      })}
                                      placeholder="Rede"
                                      searchable
                                      searchPlaceholder="Buscar rede"
                                      emptyMessage="Nenhuma rede encontrada."
                                      className="col-span-2 h-10 min-w-0 max-w-full w-full justify-between gap-1 bg-background/60 px-2 sm:col-span-1 sm:min-w-38 sm:w-auto"
                                    />
                                    <Input
                                      className="col-span-4 min-w-0 max-w-full"
                                      value={social.href}
                                      onChange={(event) =>
                                        setFormState((prev) => {
                                          const next = [...prev.socials];
                                          next[index] = {
                                            ...next[index],
                                            href: event.target.value,
                                          };
                                          return { ...prev, socials: next };
                                        })
                                      }
                                      placeholder="https://"
                                      disabled={!canEditBasicFields}
                                    />
                                    <DashboardActionButton
                                      type="button"
                                      tone="destructive"
                                      size="icon"
                                      className="justify-self-end text-destructive hover:text-destructive sm:col-start-auto sm:shrink-0"
                                      aria-label={`Remover rede ${social.label || index + 1}`}
                                      onClick={() =>
                                        setFormState((prev) => ({
                                          ...prev,
                                          socials: prev.socials.filter((_, idx) => idx !== index),
                                        }))
                                      }
                                      disabled={!canEditBasicFields}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </DashboardActionButton>
                                  </div>
                                </div>
                              );
                            })}
                            <DashboardActionButton
                              type="button"
                              size="sm"
                              onClick={() =>
                                setFormState((prev) => ({
                                  ...prev,
                                  socials: [...prev.socials, { label: "", href: "" }],
                                }))
                              }
                              disabled={!canEditBasicFields}
                            >
                              Adicionar link
                            </DashboardActionButton>
                          </div>
                        </DashboardFieldStack>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {showSelfSecuritySection ? (
                    <AccordionItem value="seguranca" className={editorSectionClassName}>
                      <AccordionTrigger className={editorSectionTriggerClassName}>
                        <ProjectEditorAccordionHeader
                          title="Segurança"
                          subtitle={`V2F ${securitySummary?.totpEnabled ? "ativa" : "inativa"}`}
                        />
                      </AccordionTrigger>
                      <AccordionContent className={editorSectionContentClassName}>
                        <div
                          className={`grid gap-2.5 rounded-xl p-3 sm:rounded-2xl sm:p-4 ${subtleSurfaceClassName}`}
                        >
                          <div className="flex flex-wrap min-w-0 items-center justify-between gap-2">
                            <div className="space-y-1">
                              <Label className="text-sm font-medium">Segurança da conta</Label>
                              <p className="text-xs text-muted-foreground">
                                Configure a V2F e gerencie suas sessões ativas.
                              </p>
                            </div>
                            <DashboardActionButton
                              size="sm"
                              onClick={() => void refreshSelfSecurity()}
                            >
                              Atualizar
                            </DashboardActionButton>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="bg-card/80 text-muted-foreground">
                              V2F {securitySummary?.totpEnabled ? "Ativa" : "Inativa"}
                            </Badge>
                            <Badge className="bg-card/80 text-muted-foreground">
                              Recuperação: {securitySummary?.recoveryCodesRemaining ?? 0}
                            </Badge>
                            <Badge className="bg-card/80 text-muted-foreground">
                              Sessões: {securitySummary?.activeSessionsCount ?? 0}
                            </Badge>
                          </div>

                          {renderConnectedAccountsCard()}

                          <div
                            className={`space-y-2 rounded-xl p-2.5 sm:rounded-2xl sm:p-3 ${subtleInsetSurfaceClassName}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-medium">Passkeys</p>
                                <p className="text-xs text-muted-foreground">
                                  Login resistente a phishing, sem solicitar V2F adicional.
                                </p>
                              </div>
                              <DashboardActionButton
                                size="sm"
                                onClick={addSelfPasskey}
                                disabled={!supportsPasskeys || isAddingPasskey}
                              >
                                {isAddingPasskey ? "Adicionando..." : "Adicionar passkey"}
                              </DashboardActionButton>
                            </div>
                            {!supportsPasskeys ? (
                              <p role="status" className="text-xs text-amber-300">
                                Este navegador não oferece suporte a passkeys/WebAuthn.
                              </p>
                            ) : null}
                            {(securitySummary?.passkeys || []).length ? (
                              <div className="space-y-2">
                                {(securitySummary?.passkeys || []).map((passkey) => (
                                  <div
                                    key={passkey.id}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <Badge className="bg-card/80 text-muted-foreground">
                                      {passkey.name}
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground">
                                      {passkey.deviceType || "Dispositivo"} •{" "}
                                      {formatSecurityDateTime(passkey.createdAt || null)}
                                    </span>
                                    <DashboardActionButton
                                      size="sm"
                                      tone="destructive"
                                      onClick={() => setRemovePasskeyTarget(passkey)}
                                      disabled={Boolean(removingPasskeyId)}
                                    >
                                      Remover
                                    </DashboardActionButton>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                Nenhuma passkey cadastrada.
                              </p>
                            )}
                          </div>

                          {!securitySummary?.totpEnabled ? (
                            <div
                              className={`space-y-3 rounded-xl p-2.5 sm:rounded-2xl sm:p-3 ${subtleInsetSurfaceClassName}`}
                            >
                              <DashboardActionButton
                                size="sm"
                                tone="primary"
                                onClick={startSelfEnrollment}
                              >
                                Ativar V2F
                              </DashboardActionButton>
                              {securityEnrollment ? (
                                <div className="space-y-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    {securityEnrollment.iconUrl ? (
                                      <img
                                        src={securityEnrollment.iconUrl}
                                        alt="Ícone da conta"
                                        className="h-9 w-9 rounded-full border border-border/60 object-cover"
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : null}
                                    <p className="text-xs text-muted-foreground">
                                      {securityEnrollment.issuer ||
                                        securitySummary?.issuer ||
                                        "Nekomata"}
                                      :
                                      {securityEnrollment.accountLabel ||
                                        securitySummary?.accountLabel ||
                                        currentUser?.username ||
                                        currentUser?.name ||
                                        editingUser?.id}
                                    </p>
                                  </div>
                                  <div className="flex flex-col gap-4 sm:flex-row">
                                    {securityQrDataUrl ? (
                                      <img
                                        src={securityQrDataUrl}
                                        alt="QR code para configurar V2F"
                                        className="h-40 w-40 shrink-0 sm:h-48 sm:w-48 rounded-xl border border-border/60 bg-white p-2"
                                      />
                                    ) : (
                                      <div className="flex h-40 w-40 shrink-0 sm:h-48 sm:w-48 items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-muted-foreground">
                                        Gerando QR...
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1 space-y-2">
                                      <code className="block break-all rounded bg-card px-3 py-2 text-xs">
                                        {securityEnrollment.manualSecret}
                                      </code>
                                      <div className="flex flex-wrap gap-2">
                                        <DashboardActionButton
                                          size="sm"
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(
                                                securityEnrollment.manualSecret,
                                              );
                                              toast({ title: "Segredo copiado" });
                                            } catch {
                                              toast({
                                                title: "Não foi possível copiar",
                                                variant: "destructive",
                                              });
                                            }
                                          }}
                                        >
                                          Copiar segredo
                                        </DashboardActionButton>
                                        <DashboardActionButton
                                          size="sm"
                                          onClick={async () => {
                                            try {
                                              await navigator.clipboard.writeText(
                                                securityEnrollment.otpauthUrl,
                                              );
                                              toast({ title: "URL de V2F copiada" });
                                            } catch {
                                              toast({
                                                title: "Não foi possível copiar",
                                                variant: "destructive",
                                              });
                                            }
                                          }}
                                        >
                                          Copiar URL de V2F
                                        </DashboardActionButton>
                                        <DashboardActionButton
                                          size="sm"
                                          onClick={startSelfEnrollment}
                                        >
                                          Reiniciar ativação
                                        </DashboardActionButton>
                                      </div>
                                      <Input
                                        value={securityEnrollCode}
                                        onChange={(event) =>
                                          setSecurityEnrollCode(event.target.value)
                                        }
                                        placeholder="Código da V2F"
                                      />
                                      <DashboardActionButton
                                        size="sm"
                                        tone="primary"
                                        onClick={confirmSelfEnrollment}
                                        disabled={
                                          !securityEnrollCode.trim() ||
                                          !securityEnrollment.enrollmentToken
                                        }
                                      >
                                        Confirmar ativação
                                      </DashboardActionButton>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div
                              className={`space-y-2 rounded-xl p-2.5 sm:rounded-2xl sm:p-3 ${subtleInsetSurfaceClassName}`}
                            >
                              <Input
                                value={securityDisableCode}
                                onChange={(event) => setSecurityDisableCode(event.target.value)}
                                placeholder="Código da V2F ou código de recuperação"
                              />
                              <DashboardActionButton
                                size="sm"
                                tone="destructive"
                                onClick={disableSelfTotp}
                                disabled={!securityDisableCode.trim()}
                              >
                                Desativar V2F
                              </DashboardActionButton>
                            </div>
                          )}

                          {securityRecoveryCodes.length > 0 ? (
                            <div className="space-y-2 rounded-xl p-2.5 sm:rounded-2xl sm:p-3 border border-amber-500/30 bg-amber-500/10">
                              <p className="text-xs font-medium">
                                Salve estes códigos de recuperação agora:
                              </p>
                              <div className="grid gap-1 md:grid-cols-2">
                                {securityRecoveryCodes.map((code) => (
                                  <code key={code} className="rounded bg-card px-2 py-1 text-xs">
                                    {code}
                                  </code>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div
                            className={`space-y-2 rounded-xl p-2.5 sm:rounded-2xl sm:p-3 ${subtleInsetSurfaceClassName}`}
                          >
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <p className="text-sm font-medium">Sessões ativas</p>
                              <DashboardActionButton
                                size="sm"
                                tone="destructive"
                                onClick={revokeSelfOthers}
                                disabled={isLoadingSecurity}
                              >
                                Encerrar outras
                              </DashboardActionButton>
                            </div>
                            {isLoadingSecurity ? (
                              <div
                                className="space-y-2"
                                data-testid="dashboard-users-security-loading"
                                role="status"
                                aria-live="polite"
                                aria-busy="true"
                              >
                                {Array.from({ length: 2 }).map((_, index) => (
                                  <div
                                    key={`dashboard-users-security-loading-${index}`}
                                    className={`rounded-xl p-2 ${subtleMutedSurfaceClassName}`}
                                  >
                                    <div className="flex flex-col min-w-0 sm:flex-row sm:items-start sm:justify-between gap-2">
                                      <div className="space-y-2">
                                        <Skeleton className="h-3 w-24" />
                                        <Skeleton className="h-3 w-36" />
                                      </div>
                                      <Skeleton className="h-6 w-20 rounded-full" />
                                    </div>
                                  </div>
                                ))}
                                <span className="sr-only">Carregando sessões...</span>
                              </div>
                            ) : securitySessions.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhuma sessão ativa.</p>
                            ) : (
                              <div className="space-y-2">
                                {securitySessions.map((session) => (
                                  <div
                                    key={session.sid}
                                    className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 rounded-xl p-2 ${subtleMutedSurfaceClassName}`}
                                  >
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap min-w-0 items-center gap-2">
                                        <p className="text-xs font-medium">
                                          {isCurrentSecuritySession(session)
                                            ? "Sessão atual"
                                            : "Sessão remota"}
                                        </p>
                                        {isCurrentSecuritySession(session) ? (
                                          <Badge variant="accent">Atual</Badge>
                                        ) : null}
                                        {session.isPendingMfa ? (
                                          <Badge variant="warning">Pendente V2F</Badge>
                                        ) : null}
                                      </div>
                                      <p className="text-[11px] text-muted-foreground">
                                        Última atividade:{" "}
                                        {formatSecurityDateTime(session.lastSeenAt)}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        Criada em: {formatSecurityDateTime(session.createdAt)}
                                      </p>
                                      <p className="text-[11px] text-muted-foreground">
                                        IP: {session.lastIp || "-"}
                                      </p>
                                      <p className="max-w-[180px] truncate text-[11px] text-muted-foreground sm:max-w-[360px]">
                                        {session.userAgent || "-"}
                                      </p>
                                    </div>
                                    {!isCurrentSecuritySession(session) ? (
                                      <DashboardActionButton
                                        size="sm"
                                        tone="destructive"
                                        onClick={() => revokeSelfSession(session.sid)}
                                      >
                                        Encerrar
                                      </DashboardActionButton>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ) : null}
                  {canResetManagedCredentials ? (
                    <AccordionItem value="recuperacao-acesso" className={editorSectionClassName}>
                      <AccordionTrigger className={editorSectionTriggerClassName}>
                        <ProjectEditorAccordionHeader
                          title="Segurança"
                          subtitle="Recuperação de acesso"
                        />
                      </AccordionTrigger>
                      <AccordionContent className={editorSectionContentClassName}>
                        <div
                          className={`grid gap-3 rounded-xl p-3 sm:rounded-2xl sm:p-4 ${subtleSurfaceClassName}`}
                        >
                          <div className="space-y-1">
                            <Label className="text-sm font-medium">Recuperação de acesso</Label>
                            <p className="text-xs text-muted-foreground">
                              Use somente quando a pessoa perdeu acesso aos dispositivos. Cada ação
                              também encerra as sessões ativas da conta.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <DashboardActionButton
                              size="sm"
                              tone="destructive"
                              onClick={() => setResetMfaTarget(editingUser)}
                              disabled={isResettingMfa}
                            >
                              Redefinir V2F
                            </DashboardActionButton>
                            <DashboardActionButton
                              size="sm"
                              tone="destructive"
                              onClick={() => setResetPasskeysTarget(editingUser)}
                              disabled={isResettingPasskeys}
                            >
                              Remover todas as passkeys
                            </DashboardActionButton>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ) : null}
                  {canEditAccessControls ? (
                    <AccordionItem value="acesso-permissoes" className={editorSectionClassName}>
                      <AccordionTrigger className={editorSectionTriggerClassName}>
                        <ProjectEditorAccordionHeader
                          title="Acesso e permissões"
                          subtitle={`${editorAccessRoleLabel} • ${
                            stripOwnerRole(formState.roles).length
                          } funções`}
                        />
                      </AccordionTrigger>
                      <AccordionContent className={editorSectionContentClassName}>
                        <div className="grid gap-4">
                          <div className="grid gap-2">
                            <Label>Funções</Label>
                            {!canEditRoles && (
                              <p className="text-xs text-muted-foreground">
                                Apenas donos com permissão de acesso podem alterar funções de
                                equipe.
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {roleOptions.map((role) => {
                                const isSelected = formState.roles.includes(role);
                                const iconKey = roleIconMap.get(role);
                                const RoleIcon = iconKey
                                  ? roleIconRegistry[String(iconKey).toLowerCase()]
                                  : null;
                                return (
                                  <Button
                                    key={role}
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    onClick={() => toggleRole(role)}
                                    disabled={!canEditRoles}
                                  >
                                    {RoleIcon ? <RoleIcon className="h-4 w-4" /> : null}
                                    {role}
                                  </Button>
                                );
                              })}
                            </div>
                            {isOwnerRecord && (
                              <p className="text-xs text-muted-foreground">
                                A badge de dono é automática.
                              </p>
                            )}
                          </div>
                          <DashboardFieldStack>
                            <Label>Papel de acesso</Label>
                            <DashboardFieldStack density="compact">
                              <Combobox
                                value={formState.accessRole}
                                onValueChange={(value) =>
                                  setFormState((prev) => ({
                                    ...prev,
                                    accessRole: value === "admin" ? "admin" : "normal",
                                    permissions:
                                      value === "admin"
                                        ? Array.from(
                                            new Set([
                                              ...prev.permissions,
                                              ...permissionOptions
                                                .filter((option) =>
                                                  DEFAULT_ADMIN_PERMISSION_SET.has(option.id),
                                                )
                                                .map((option) => option.id),
                                            ]),
                                          )
                                        : prev.permissions.filter(
                                            (permission) =>
                                              !DEFAULT_ADMIN_PERMISSION_SET.has(permission),
                                          ),
                                  }))
                                }
                                disabled={!canEditAccessControls || isOwnerRecord}
                                ariaLabel="Selecionar papel de acesso"
                                options={accessRoleOptions.map((option) => ({
                                  value: option.id,
                                  label: option.label,
                                }))}
                                placeholder="Selecione um papel"
                                searchable={false}
                              />
                              {isOwnerRecord ? (
                                <p className="text-xs text-muted-foreground">
                                  O papel de dono é definido pela governança de owners.
                                </p>
                              ) : null}
                            </DashboardFieldStack>
                          </DashboardFieldStack>
                          <div className="grid gap-2">
                            <Label>Permissões</Label>
                            {isOwnerRecord && (
                              <Badge className="w-fit bg-primary/20 text-primary">
                                Acesso total
                              </Badge>
                            )}
                            {!isOwnerRecord && isAdminForm && (
                              <Badge className="w-fit bg-card/80 text-muted-foreground">
                                Administrador
                              </Badge>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {permissionOptions.map((permission) => {
                                const isSelected = effectivePermissions.includes(permission.id);
                                return (
                                  <Button
                                    key={permission.id}
                                    type="button"
                                    variant={isSelected ? "default" : "outline"}
                                    onClick={() => togglePermission(permission.id)}
                                    disabled={!canEditAccessControls || isOwnerRecord}
                                  >
                                    {permission.label}
                                  </Button>
                                );
                              })}
                            </div>
                            {!canEditAccessControls && (
                              <p className="text-xs text-muted-foreground">
                                Apenas donos com permissão de acesso podem alterar permissões de
                                acesso.
                              </p>
                            )}
                          </div>
                          {canManageUsers ? (
                            <DashboardFieldStack>
                              <Label>Dono</Label>
                              <DashboardFieldStack density="compact">
                                <div
                                  className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-3 ${subtleSurfaceClassName}`}
                                >
                                  <span className="text-sm text-muted-foreground">
                                    Permite acesso total ao painel e às configurações críticas.
                                  </span>
                                  <Switch
                                    checked={ownerToggle}
                                    onCheckedChange={setOwnerToggle}
                                    disabled={!canManageOwners || isPrimaryOwnerRecord}
                                  />
                                </div>
                                {!canManageOwners ? (
                                  <p className="text-xs text-muted-foreground">
                                    Apenas o primeiro dono pode promover ou rebaixar outros donos.
                                  </p>
                                ) : null}
                                {isPrimaryOwnerRecord ? (
                                  <p className="text-xs text-muted-foreground">
                                    O primeiro dono não pode ser rebaixado.
                                  </p>
                                ) : null}
                              </DashboardFieldStack>
                            </DashboardFieldStack>
                          ) : null}
                          <DashboardFieldStack>
                            <Label>Status</Label>
                            <div
                              className={`flex items-center justify-between gap-4 rounded-2xl px-4 py-3 ${subtleSurfaceClassName}`}
                            >
                              <span className="text-sm text-muted-foreground">
                                {formState.status === "active" ? "Ativo" : "Aposentado"}
                              </span>
                              <Switch
                                checked={formState.status === "active"}
                                onCheckedChange={(checked) =>
                                  setFormState((prev) => ({
                                    ...prev,
                                    status: checked ? "active" : "retired",
                                  }))
                                }
                                disabled={!canEditStatus}
                              />
                            </div>
                          </DashboardFieldStack>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ) : null}
                </Accordion>
              </div>
              <div className="project-editor-footer sticky bottom-0 z-20 flex items-center justify-end gap-2 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-sm supports-backdrop-filter:bg-background/80 md:px-6 md:py-3 lg:px-8">
                {editingUser ? (
                  <DashboardActionButton
                    size="icon"
                    tone="destructive"
                    onClick={() => setDeleteTarget(editingUser)}
                    disabled={
                      !canManageUsers ||
                      isPrimaryOwnerRecord ||
                      editingUser.id === currentUser?.id ||
                      (isOwnerRecord && !canManageOwners)
                    }
                    aria-label="Excluir usuário"
                  >
                    <Trash2 className="h-4 w-4" />
                  </DashboardActionButton>
                ) : null}
                <DashboardActionButton size="sm" onClick={() => handleEditorOpenChange(false)}>
                  Cancelar
                </DashboardActionButton>
                <DashboardActionButton size="sm" tone="primary" onClick={handleSave}>
                  Salvar
                </DashboardActionButton>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(resetMfaTarget)}
        onOpenChange={(open) => {
          if (!open && !isResettingMfa) {
            setResetMfaTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir V2F?</DialogTitle>
            <DialogDescription>
              {resetMfaTarget
                ? `Redefinir a V2F de "${resetMfaTarget.name}" para ajudar na recuperação de acesso?`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Essa ação remove a V2F atual. Se a pessoa estiver presa na etapa de V2F, ela precisará
            cancelar o login atual e entrar novamente.
          </p>
          <div className="flex justify-end gap-3">
            <DashboardActionButton
              size="sm"
              onClick={() => setResetMfaTarget(null)}
              disabled={isResettingMfa}
            >
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              size="sm"
              tone="destructive"
              onClick={handleResetUserTotp}
              disabled={isResettingMfa}
            >
              {isResettingMfa ? "Redefinindo..." : "Redefinir V2F"}
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(resetPasskeysTarget)}
        onOpenChange={(open) => {
          if (!open && !isResettingPasskeys) setResetPasskeysTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover todas as passkeys?</DialogTitle>
            <DialogDescription>
              {resetPasskeysTarget
                ? `Remover todas as passkeys de "${resetPasskeysTarget.name}"?`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A pessoa precisará entrar novamente por Discord ou Google e cadastrar novas passkeys.
            Todas as sessões ativas também serão encerradas.
          </p>
          <div className="flex justify-end gap-3">
            <DashboardActionButton
              size="sm"
              onClick={() => setResetPasskeysTarget(null)}
              disabled={isResettingPasskeys}
            >
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              size="sm"
              tone="destructive"
              onClick={handleResetUserPasskeys}
              disabled={isResettingPasskeys}
            >
              {isResettingPasskeys ? "Removendo..." : "Remover passkeys"}
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(removePasskeyTarget)}
        onOpenChange={(open) => {
          if (!open && !removingPasskeyId) setRemovePasskeyTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover passkey?</DialogTitle>
            <DialogDescription>
              {removePasskeyTarget ? `Remover "${removePasskeyTarget.name}" da sua conta?` : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Este dispositivo não poderá mais ser usado para entrar.
          </p>
          <div className="flex justify-end gap-3">
            <DashboardActionButton
              size="sm"
              onClick={() => setRemovePasskeyTarget(null)}
              disabled={Boolean(removingPasskeyId)}
            >
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton
              size="sm"
              tone="destructive"
              onClick={() => removePasskeyTarget && void removeSelfPasskey(removePasskeyTarget.id)}
              disabled={Boolean(removingPasskeyId)}
            >
              {removingPasskeyId ? "Removendo..." : "Remover passkey"}
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir usuário?</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Excluir "${deleteTarget.name}"? Esta ação não pode ser desfeita.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <DashboardActionButton size="sm" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton size="sm" tone="destructive" onClick={handleDeleteUser}>
              Excluir
            </DashboardActionButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DashboardUsers;
