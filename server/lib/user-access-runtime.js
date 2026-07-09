const REQUIRED_DEPENDENCY_KEYS = [
  "AccessRole",
  "PermissionId",
  "addOwnerRoleLabel",
  "buildAnalyticsRange",
  "buildCommentTargetInfo",
  "can",
  "computeEffectiveAccessRole",
  "computeGrants",
  "createHash",
  "defaultPermissionsForRole",
  "expandLegacyPermissions",
  "filterAnalyticsEvents",
  "isOwner",
  "isPrimaryOwner",
  "loadAnalyticsEvents",
  "loadComments",
  "loadOwnerIds",
  "loadPosts",
  "loadProjects",
  "loadUsers",
  "normalizeAccessRole",
  "normalizeAnalyticsTypeFilter",
  "normalizeAvatarDisplay",
  "normalizePosts",
  "normalizeProjects",
  "normalizeUploadsDeep",
  "parseAnalyticsRangeDays",
  "primaryAppOrigin",
  "removeOwnerRoleLabel",
  "resolveUploadScopeAccess",
  "sanitizeFavoriteWorksByCategory",
  "sanitizePermissionsForStorage",
  "sanitizeSocials",
  "selectRecentApprovedComments",
  "writeAllowedUsers",
  "writeUsers",
];

const assertRequiredDependencies = (dependencies = {}) => {
  const missing = REQUIRED_DEPENDENCY_KEYS.filter((key) => dependencies[key] === undefined);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `[user-access-runtime] missing required dependencies: ${missing.sort().join(", ")}`,
  );
};

export const createUserAccessRuntime = (dependencies = {}) => {
  assertRequiredDependencies(dependencies);

  const {
    AccessRole,
    PermissionId,
    addOwnerRoleLabel,
    buildAnalyticsRange,
    buildCommentTargetInfo,
    can,
    computeEffectiveAccessRole,
    computeGrants,
    createHash,
    defaultPermissionsForRole,
    expandLegacyPermissions,
    filterAnalyticsEvents,
    getAuthAccessRecord,
    loadAuthOwnerIds,
    isOwner,
    isPrimaryOwner,
    isRbacV2AcceptLegacyStar = false,
    isRbacV2Enabled = false,
    loadAnalyticsEvents,
    loadComments,
    loadOwnerIds,
    loadPosts,
    loadProjects,
    loadUsers,
    normalizeAccessRole,
    normalizeAnalyticsTypeFilter,
    normalizeAvatarDisplay,
    normalizePosts,
    normalizeProjects,
    normalizeUploadsDeep,
    parseAnalyticsRangeDays,
    primaryAppOrigin,
    removeOwnerRoleLabel,
    resolveUploadScopeAccess,
    sanitizeFavoriteWorksByCategory,
    sanitizePermissionsForStorage,
    sanitizeSocials,
    selectRecentApprovedComments,
    writeAllowedUsers,
    writeUsers,
  } = dependencies;

  const resolveOwnerIds = () => {
    const authOwnerIds =
      typeof loadAuthOwnerIds === "function" ? loadAuthOwnerIds().map((id) => String(id)) : [];
    return Array.from(new Set([...loadOwnerIds().map((id) => String(id)), ...authOwnerIds]));
  };
  const resolvePrimaryOwnerId = (ownerIds = resolveOwnerIds()) =>
    ownerIds[0] ? String(ownerIds[0]) : null;
  const resolveAuthAccessRecord = (userId) =>
    typeof getAuthAccessRecord === "function" ? getAuthAccessRecord(userId) : null;
  const normalizeNonOwnerAccessRole = (accessRole) => {
    const normalizedRole = normalizeAccessRole(accessRole, AccessRole.NORMAL);
    if (
      normalizedRole === AccessRole.OWNER_PRIMARY ||
      normalizedRole === AccessRole.OWNER_SECONDARY
    ) {
      return AccessRole.NORMAL;
    }
    return normalizedRole;
  };
  const resolveEffectiveAccessRole = ({ userId, accessRole, ownerIds, primaryOwnerId }) =>
    computeEffectiveAccessRole({
      userId,
      accessRole: normalizeNonOwnerAccessRole(accessRole),
      ownerIds,
      primaryOwnerId,
    });

  const inferLegacyAccessRole = (user) => {
    const permissions = Array.isArray(user?.permissions)
      ? user.permissions.map((item) => String(item || ""))
      : [];
    if (permissions.includes("*")) {
      return AccessRole.ADMIN;
    }
    if (permissions.includes("usuarios")) {
      return AccessRole.ADMIN;
    }
    return AccessRole.NORMAL;
  };

  const normalizePermissionsRaw = (permissions) => {
    if (!Array.isArray(permissions)) {
      return [];
    }
    const next = [];
    permissions.forEach((permissionRaw) => {
      const permission = String(permissionRaw || "").trim();
      if (!permission) {
        return;
      }
      if (!next.includes(permission)) {
        next.push(permission);
      }
    });
    return next;
  };

  const normalizeUsers = (users, { useAuthAccess = true } = {}) => {
    const ownerIds = resolveOwnerIds();
    const primaryOwnerId = resolvePrimaryOwnerId(ownerIds);
    return users.map((user, index) => {
      const normalizedId = String(user.id || "");
      const legacyRole = inferLegacyAccessRole(user);
      const authAccess = useAuthAccess ? resolveAuthAccessRecord(normalizedId) : null;
      const accessRole = resolveEffectiveAccessRole({
        userId: normalizedId,
        accessRole: authAccess?.accessRole || normalizeAccessRole(user.accessRole, legacyRole),
        ownerIds,
        primaryOwnerId,
      });
      const normalizedEmail = String(user.email || "")
        .trim()
        .toLowerCase();
      return normalizeUploadsDeep({
        id: normalizedId,
        name: user.name || "Sem nome",
        phrase: user.phrase || "",
        bio: user.bio || "",
        email: normalizedEmail || null,
        discordUserID: String(user.discordUserID || "").trim() || null,
        avatarUrl: user.avatarUrl || null,
        socials: sanitizeSocials(user.socials),
        favoriteWorks: sanitizeFavoriteWorksByCategory(user.favoriteWorks),
        status: user.status === "retired" ? "retired" : "active",
        permissions: normalizePermissionsRaw(authAccess?.permissions || user.permissions),
        roles: removeOwnerRoleLabel(Array.isArray(user.roles) ? user.roles.filter(Boolean) : []),
        avatarDisplay: normalizeAvatarDisplay(user.avatarDisplay),
        accessRole,
        order: typeof user.order === "number" ? user.order : index,
      });
    });
  };

  const getUserAccessContextById = (userId, usersInput = null) => {
    const normalizedId = String(userId || "");
    if (!normalizedId) {
      const ownerIds = resolveOwnerIds();
      return {
        user: null,
        accessRole: AccessRole.NORMAL,
        grants: computeGrants(),
        isOwner: false,
        isPrimaryOwner: false,
        ownerIds,
        primaryOwnerId: resolvePrimaryOwnerId(ownerIds),
      };
    }
    const users = Array.isArray(usersInput) ? usersInput : normalizeUsers(loadUsers());
    const user = users.find((item) => item.id === normalizedId) || null;
    const ownerIds = resolveOwnerIds();
    const primaryOwnerId = resolvePrimaryOwnerId(ownerIds);
    const authAccess = resolveAuthAccessRecord(normalizedId);
    const accessRole = resolveEffectiveAccessRole({
      userId: normalizedId,
      accessRole: authAccess?.accessRole || user?.accessRole || AccessRole.NORMAL,
      ownerIds,
      primaryOwnerId,
    });
    const grants = computeGrants({
      userId: normalizedId,
      accessRole,
      permissions: authAccess?.permissions || user?.permissions,
      ownerIds,
      primaryOwnerId,
      acceptLegacyStar: isRbacV2AcceptLegacyStar,
    });
    return {
      user,
      accessRole,
      grants,
      isOwner: ownerIds.includes(normalizedId),
      isPrimaryOwner: Boolean(primaryOwnerId && normalizedId === primaryOwnerId),
      ownerIds,
      primaryOwnerId,
    };
  };

  const hasPermissionByUserId = (userId, permissionId) => {
    const context = getUserAccessContextById(userId);
    return can({ grants: context.grants, permissionId });
  };

  const findLegacyPermissionsByUserId = (userId) => {
    const authAccess = resolveAuthAccessRecord(userId);
    if (authAccess?.permissions) {
      return authAccess.permissions;
    }
    const user = normalizeUsers(loadUsers()).find((item) => item.id === String(userId));
    return Array.isArray(user?.permissions) ? user.permissions : [];
  };

  const isAdminUser = (user) => {
    if (!user?.id) {
      return false;
    }
    if (isRbacV2Enabled) {
      const context = getUserAccessContextById(user.id);
      return (
        context.accessRole === AccessRole.OWNER_PRIMARY ||
        context.accessRole === AccessRole.OWNER_SECONDARY ||
        context.accessRole === AccessRole.ADMIN
      );
    }
    if (isOwner(user.id)) {
      return true;
    }
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    return permissions.includes("*") || permissions.includes("usuarios");
  };

  const canManagePosts = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.POSTS);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return permissions.includes("*") || permissions.includes("posts");
  };

  const canManageProjects = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.PROJETOS);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return permissions.includes("*") || permissions.includes("projetos");
  };

  const canManageComments = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.COMENTARIOS);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return (
      permissions.includes("*") ||
      permissions.includes("comentarios") ||
      permissions.includes("posts") ||
      permissions.includes("projetos")
    );
  };

  const canManagePages = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.PAGINAS);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return permissions.includes("*") || permissions.includes("paginas");
  };

  const canManageSettings = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.CONFIGURACOES);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return permissions.includes("*") || permissions.includes("configuracoes");
  };

  const canManageUploads = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.UPLOADS);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return (
      permissions.includes("*") ||
      permissions.includes("posts") ||
      permissions.includes("projetos") ||
      permissions.includes("configuracoes")
    );
  };

  const canViewAnalytics = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.ANALYTICS);
    }
    return canManagePosts(userId) || canManageProjects(userId) || canManageComments(userId);
  };

  const buildDashboardOverviewResponsePayload = (userId) => {
    const canReadProjects = canManageProjects(userId);
    const canReadPosts = canManagePosts(userId);
    const canReadComments = canManageComments(userId);
    const canReadAnalytics = canViewAnalytics(userId);

    const projects = canReadProjects
      ? normalizeProjects(loadProjects()).sort((a, b) => a.order - b.order)
      : [];
    const posts = canReadPosts
      ? normalizePosts(loadPosts()).sort(
          (a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime(),
        )
      : [];
    const comments = canReadComments ? loadComments() : [];

    const totalProjects = projects.length;
    const totalMedia = projects.reduce(
      (sum, project) =>
        sum + (Array.isArray(project.episodeDownloads) ? project.episodeDownloads.length : 0),
      0,
    );
    const activeProjects = projects.filter((project) => {
      const status = String(project.status || "").toLowerCase();
      return status.includes("andamento") || status.includes("produ");
    }).length;
    const finishedProjects = projects.filter((project) => {
      const status = String(project.status || "").toLowerCase();
      return status.includes("complet") || status.includes("lan");
    }).length;
    const rankedProjects = projects
      .map((project) => ({
        id: project.id,
        title: String(project.title || ""),
        status: String(project.status || ""),
        views: Number(project.views || 0),
      }))
      .filter((project) => project.views > 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 3);
    const quickProjects = projects.slice(0, 3).map((project) => ({
      id: project.id,
      title: String(project.title || ""),
      status: String(project.status || ""),
    }));
    const recentPosts = posts
      .slice()
      .sort((a, b) => {
        const aDate = new Date(a.updatedAt || a.publishedAt || 0).getTime();
        const bDate = new Date(b.updatedAt || b.publishedAt || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 3)
      .map((post) => ({
        id: post.id,
        slug: String(post.slug || ""),
        title: String(post.title || ""),
        status: String(post.status || ""),
        views: Number(post.views || 0),
        publishedAt: String(post.publishedAt || ""),
        updatedAt: String(post.updatedAt || post.publishedAt || ""),
      }));
    const pendingCommentsCount = comments.filter((comment) => comment.status === "pending").length;
    const recentComments = selectRecentApprovedComments(comments, 3).map((comment) => {
      const target = buildCommentTargetInfo(comment, posts, projects, primaryAppOrigin);
      return {
        id: comment.id,
        author: String(comment.name || ""),
        message: String(comment.content || ""),
        page: target.label,
        createdAt: String(comment.createdAt || ""),
        url: target.url,
        status: String(comment.status || "approved"),
      };
    });

    let totalViewsLast7 = 0;
    let totalProjectViewsLast7 = 0;
    let totalPostViewsLast7 = 0;
    let analyticsSeries7d = [];
    if (canReadAnalytics) {
      const range = buildAnalyticsRange(parseAnalyticsRangeDays("7d"));
      const allEvents = filterAnalyticsEvents(
        loadAnalyticsEvents(),
        range.fromTs,
        range.toTs,
        normalizeAnalyticsTypeFilter("all"),
      );
      const projectEvents = filterAnalyticsEvents(
        loadAnalyticsEvents(),
        range.fromTs,
        range.toTs,
        normalizeAnalyticsTypeFilter("project"),
      );
      const postEvents = filterAnalyticsEvents(
        loadAnalyticsEvents(),
        range.fromTs,
        range.toTs,
        normalizeAnalyticsTypeFilter("post"),
      );
      totalViewsLast7 = allEvents.filter((event) => event.eventType === "view").length;
      totalProjectViewsLast7 = projectEvents.filter((event) => event.eventType === "view").length;
      totalPostViewsLast7 = postEvents.filter((event) => event.eventType === "view").length;
      analyticsSeries7d = range.dayKeys.map((day) => ({
        date: day,
        value: allEvents.filter((event) => {
          if (event.eventType !== "view") {
            return false;
          }
          return new Date(event.ts || event.createdAt || 0).toISOString().slice(0, 10) === day;
        }).length,
      }));
    }

    return {
      metrics: {
        totalProjects,
        totalMedia,
        activeProjects,
        finishedProjects,
        totalViewsLast7,
        totalProjectViewsLast7,
        totalPostViewsLast7,
      },
      analyticsSeries7d,
      rankedProjects,
      recentPosts,
      recentComments,
      pendingCommentsCount,
      quickProjects,
    };
  };

  const canViewAuditLog = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.AUDIT_LOG);
    }
    return isOwner(userId);
  };

  const canManageIntegrations = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.INTEGRACOES);
    }
    return canManageProjects(userId) || canManageSettings(userId);
  };

  const parseDashboardNotificationsLimit = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 30;
    }
    return Math.min(Math.max(Math.floor(parsed), 1), 100);
  };

  const toDashboardNotificationId = (value) =>
    createHash("sha256")
      .update(String(value || ""))
      .digest("hex")
      .slice(0, 16);

  const canManageUsers = (userId) => {
    if (!userId) {
      return false;
    }
    if (isRbacV2Enabled) {
      return hasPermissionByUserId(userId, PermissionId.USUARIOS);
    }
    if (isOwner(userId)) {
      return true;
    }
    const permissions = findLegacyPermissionsByUserId(userId);
    return permissions.includes("*") || permissions.includes("usuarios");
  };

  const canManageUsersBasic = canManageUsers;
  const canManageUsersAccess = canManageUsers;

  const canManageSecurityAdmin = (userId) => {
    if (!userId) {
      return false;
    }
    return canViewAuditLog(userId) || isPrimaryOwner(userId);
  };

  const normalizeUploadScopeUserId = (value) => String(value || "").trim();

  const resolveRequestUploadAccessScope = ({
    sessionUser,
    folder = "",
    listAll = false,
    scopeUserId = "",
  } = {}) =>
    resolveUploadScopeAccess({
      hasUploadManagement: canManageUploads(sessionUser?.id),
      canManagePosts: canManagePosts(sessionUser?.id),
      canManageProjects: canManageProjects(sessionUser?.id),
      canManageUsersBasic: canManageUsersBasic(sessionUser?.id),
      canManagePages: canManagePages(sessionUser?.id),
      canManageSettings: canManageSettings(sessionUser?.id),
      sessionUserId: String(sessionUser?.id || "").trim(),
      scopeUserId: normalizeUploadScopeUserId(scopeUserId),
      folder,
      listAll,
    });

  const enforceUserAccessInvariants = (usersInput) => {
    const ownerIds = resolveOwnerIds();
    const primaryOwnerId = resolvePrimaryOwnerId(ownerIds);
    return normalizeUsers(usersInput, { useAuthAccess: false }).map((user) => {
      const effectiveAccessRole = computeEffectiveAccessRole({
        userId: user.id,
        accessRole: user.accessRole,
        ownerIds,
        primaryOwnerId,
      });

      if (isRbacV2Enabled) {
        const sanitizedPermissions = sanitizePermissionsForStorage(user.permissions, {
          acceptLegacyStar: false,
          keepUnknown: true,
        });
        if (effectiveAccessRole === AccessRole.OWNER_PRIMARY) {
          return {
            ...user,
            status: "active",
            accessRole: AccessRole.OWNER_PRIMARY,
            permissions: [...defaultPermissionsForRole(AccessRole.OWNER_PRIMARY)],
          };
        }
        if (effectiveAccessRole === AccessRole.OWNER_SECONDARY) {
          return {
            ...user,
            status: "active",
            accessRole: AccessRole.OWNER_SECONDARY,
            permissions: sanitizedPermissions,
          };
        }
        return {
          ...user,
          accessRole: effectiveAccessRole,
          permissions: sanitizedPermissions,
        };
      }

      if (ownerIds.includes(user.id)) {
        return { ...user, status: "active", permissions: ["*"], accessRole: effectiveAccessRole };
      }
      return { ...user, accessRole: effectiveAccessRole };
    });
  };

  const permissionsForRead = (permissions) => {
    if (!isRbacV2Enabled) {
      return normalizePermissionsRaw(permissions);
    }
    const expanded = expandLegacyPermissions(permissions, {
      acceptLegacyStar: isRbacV2AcceptLegacyStar,
      keepUnknown: true,
    });
    return [...expanded.knownPermissions, ...expanded.unknownPermissions];
  };

  const userWithAccessForResponse = (user, ownerIdsInput = null) => {
    const ownerIds = Array.isArray(ownerIdsInput)
      ? ownerIdsInput.map((id) => String(id))
      : resolveOwnerIds();
    const primaryOwnerId = resolvePrimaryOwnerId(ownerIds);
    const accessRole = resolveEffectiveAccessRole({
      userId: user.id,
      accessRole: user.accessRole,
      ownerIds,
      primaryOwnerId,
    });
    const grants = computeGrants({
      userId: user.id,
      accessRole,
      permissions: user.permissions,
      ownerIds,
      primaryOwnerId,
      acceptLegacyStar: isRbacV2AcceptLegacyStar,
    });
    return {
      ...user,
      accessRole,
      permissions: permissionsForRead(user.permissions),
      grants,
    };
  };

  const applyOwnerRole = (user) => {
    const isOwnerUser = resolveOwnerIds().includes(String(user.id));
    return {
      ...user,
      roles: addOwnerRoleLabel(user.roles || [], isOwnerUser),
    };
  };

  const buildPublicTeamMembers = () => {
    const ownerIds = resolveOwnerIds();
    return normalizeUsers(loadUsers())
      .sort((a, b) => a.order - b.order)
      .map((user) => {
        const withAccess = userWithAccessForResponse(user, ownerIds);
        return {
          id: user.id,
          name: user.name,
          phrase: user.phrase,
          bio: user.bio,
          avatarUrl: user.avatarUrl,
          avatarDisplay: normalizeAvatarDisplay(user.avatarDisplay),
          socials: user.socials,
          favoriteWorks: user.favoriteWorks,
          roles: applyOwnerRole(user).roles,
          accessRole: withAccess.accessRole,
          isAdmin: withAccess.accessRole === AccessRole.ADMIN,
          status: user.status,
        };
      });
  };

  const syncAllowedUsers = (users) => {
    const activeIds = users.filter((user) => user.status === "active").map((user) => user.id);
    const unique = Array.from(new Set([...resolveOwnerIds(), ...activeIds]));
    writeAllowedUsers(unique);
  };

  const ensureOwnerUser = (sessionUser) => {
    if (!sessionUser || !resolveOwnerIds().includes(String(sessionUser.id))) {
      return;
    }

    let users = normalizeUsers(loadUsers());
    const ownerIds = resolveOwnerIds();
    const primaryOwnerId = resolvePrimaryOwnerId(ownerIds);
    const targetAccessRole = computeEffectiveAccessRole({
      userId: sessionUser.id,
      accessRole: AccessRole.OWNER_SECONDARY,
      ownerIds,
      primaryOwnerId,
    });
    if (!users.some((user) => user.id === String(sessionUser.id))) {
      users.push({
        id: String(sessionUser.id),
        name: sessionUser.name || "Administrador",
        phrase: "",
        bio: "",
        avatarUrl: sessionUser.avatarUrl || null,
        avatarDisplay: normalizeAvatarDisplay(null),
        socials: [],
        status: "active",
        permissions: isRbacV2Enabled ? [...defaultPermissionsForRole(targetAccessRole)] : ["*"],
        accessRole: targetAccessRole,
        order: users.length,
      });
    }

    users = enforceUserAccessInvariants(users);
    users.sort((a, b) => a.order - b.order);
    writeUsers(users);
    syncAllowedUsers(users);
  };

  return {
    applyOwnerRole,
    buildDashboardOverviewResponsePayload,
    buildPublicTeamMembers,
    canManageComments,
    canManageIntegrations,
    canManagePages,
    canManagePosts,
    canManageProjects,
    canManageSecurityAdmin,
    canManageSettings,
    canManageUploads,
    canManageUsersAccess,
    canManageUsersBasic,
    canViewAnalytics,
    canViewAuditLog,
    enforceUserAccessInvariants,
    ensureOwnerUser,
    getUserAccessContextById,
    isAdminUser,
    normalizeUsers,
    normalizeUploadScopeUserId,
    parseDashboardNotificationsLimit,
    permissionsForRead,
    resolveRequestUploadAccessScope,
    syncAllowedUsers,
    toDashboardNotificationId,
    userWithAccessForResponse,
  };
};

export default createUserAccessRuntime;
