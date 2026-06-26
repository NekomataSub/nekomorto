const REQUIRED_DEPENDENCY_KEYS = [
  "AccessRole",
  "addOwnerRoleLabel",
  "computeEffectiveAccessRole",
  "computeGrants",
  "createRevisionToken",
  "ensureOwnerUser",
  "enforceUserAccessInvariants",
  "isDiscordAvatarUrl",
  "isOwner",
  "loadOwnerIds",
  "loadUploads",
  "loadUsers",
  "normalizeAvatarDisplay",
  "normalizeUsers",
  "permissionsForRead",
  "resolveEffectiveUserAvatarUrl",
  "resolveUserAvatarRenderVersion",
  "shouldSyncDiscordAvatarToStoredUser",
  "syncAllowedUsers",
  "writeUsers",
];

const assertRequiredDependencies = (dependencies = {}) => {
  const missing = REQUIRED_DEPENDENCY_KEYS.filter((key) => dependencies[key] === undefined);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `[user-profile-runtime] missing required dependencies: ${missing.sort().join(", ")}`,
  );
};

export const createUserProfileRuntime = (dependencies = {}) => {
  assertRequiredDependencies(dependencies);

  const {
    AccessRole,
    addOwnerRoleLabel,
    computeEffectiveAccessRole,
    computeGrants,
    createRevisionToken,
    ensureOwnerUser,
    enforceUserAccessInvariants,
    getAuthAccessRecord,
    isDiscordAvatarUrl,
    isOwner,
    isRbacV2AcceptLegacyStar = false,
    isRbacV2Enabled = false,
    loadAuthOwnerIds,
    loadOwnerIds,
    loadUploads,
    loadUsers,
    normalizeAvatarDisplay,
    normalizeUsers,
    permissionsForRead,
    resolveEffectiveUserAvatarUrl,
    resolveUserAvatarRenderVersion,
    shouldSyncDiscordAvatarToStoredUser,
    syncAllowedUsers,
    writeUsers,
  } = dependencies;

  const syncPersistedDiscordAvatarForLogin = ({ userId, discordAvatarUrl }) => {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      return;
    }

    let users = normalizeUsers(loadUsers());
    const targetIndex = users.findIndex((user) => user.id === normalizedUserId);
    if (targetIndex === -1) {
      return;
    }

    const existing = users[targetIndex];
    if (
      !shouldSyncDiscordAvatarToStoredUser({
        storedAvatarUrl: existing?.avatarUrl,
        discordAvatarUrl,
      })
    ) {
      return;
    }

    users[targetIndex] = {
      ...existing,
      avatarUrl: String(discordAvatarUrl || "").trim() || null,
    };
    users = isRbacV2Enabled
      ? enforceUserAccessInvariants(users)
      : normalizeUsers(users).map((user) =>
          isOwner(user.id) ? { ...user, status: "active", permissions: ["*"] } : user,
        );
    users.sort((a, b) => a.order - b.order);
    writeUsers(users);
    syncAllowedUsers(users);
  };

  const withEffectiveAvatarUrl = (user, fallbackAvatarUrl = null) => {
    if (!user) {
      return user;
    }
    return {
      ...user,
      avatarUrl:
        resolveEffectiveUserAvatarUrl({
          storedAvatarUrl: user?.avatarUrl,
          fallbackAvatarUrl,
        }) || null,
    };
  };

  const resolveDiscordAvatarFallbackUrl = (value) =>
    isDiscordAvatarUrl(value) ? String(value || "").trim() : null;

  const buildUserProfileRevisionToken = (user, uploadsInput = null) =>
    createRevisionToken({
      id: String(user?.id || ""),
      name: String(user?.name || ""),
      username: String(user?.username || ""),
      avatarUrl: String(user?.avatarUrl || ""),
      avatarDisplay: normalizeAvatarDisplay(user?.avatarDisplay),
      avatarRenderVersion: resolveUserAvatarRenderVersion({
        avatarUrl: user?.avatarUrl,
        uploads: Array.isArray(uploadsInput) ? uploadsInput : loadUploads(),
      }),
    });

  const withUserProfileRevision = (user, uploadsInput = null) => ({
    ...user,
    revision: buildUserProfileRevisionToken(user, uploadsInput),
  });

  const normalizeNonOwnerAccessRole = (accessRole) => {
    if (
      accessRole === AccessRole.OWNER_PRIMARY ||
      accessRole === AccessRole.OWNER_SECONDARY
    ) {
      return AccessRole.NORMAL;
    }
    return accessRole || AccessRole.NORMAL;
  };

  const syncSessionUserDisplayProfile = (req, user, uploadsInput = null) => {
    if (!req?.session?.user || !user) {
      return;
    }
    const resolvedAvatarUrl =
      resolveEffectiveUserAvatarUrl({
        storedAvatarUrl: user?.avatarUrl,
        fallbackAvatarUrl: resolveDiscordAvatarFallbackUrl(req.session.user?.avatarUrl),
      }) || null;
    const nextSessionUser = {
      ...req.session.user,
      name: String(user?.name || req.session.user.name || ""),
      phrase: String(user?.phrase || ""),
      bio: String(user?.bio || ""),
      avatarUrl: resolvedAvatarUrl,
      avatarDisplay: normalizeAvatarDisplay(user?.avatarDisplay),
    };
    req.session.user = withUserProfileRevision(nextSessionUser, uploadsInput);
  };

  const buildUserPayload = (sessionUser) => {
    ensureOwnerUser(sessionUser);
    const users = normalizeUsers(loadUsers());
    const matched = users.find((user) => user.id === String(sessionUser.id));
    const uploads = loadUploads();
    const authAccess =
      typeof getAuthAccessRecord === "function" ? getAuthAccessRecord(sessionUser?.id) : null;
    const authOwnerIds =
      typeof loadAuthOwnerIds === "function" ? loadAuthOwnerIds().map((id) => String(id)) : [];
    const ownerIds = Array.from(
      new Set([...loadOwnerIds().map((id) => String(id)), ...authOwnerIds]),
    );
    const primaryOwnerId = ownerIds[0] ? String(ownerIds[0]) : null;
    const accessRole = computeEffectiveAccessRole({
      userId: sessionUser?.id,
      accessRole: normalizeNonOwnerAccessRole(
        authAccess?.accessRole || matched?.accessRole || AccessRole.NORMAL,
      ),
      ownerIds,
      primaryOwnerId,
    });
    const grants = computeGrants({
      userId: sessionUser?.id,
      accessRole,
      permissions: authAccess?.permissions || matched?.permissions,
      ownerIds,
      primaryOwnerId,
      acceptLegacyStar: isRbacV2AcceptLegacyStar,
    });
    const roles = addOwnerRoleLabel(
      matched?.roles || [],
      ownerIds.includes(String(sessionUser?.id || "")),
    );
    const avatarUrl =
      resolveEffectiveUserAvatarUrl({
        storedAvatarUrl: matched?.avatarUrl,
        fallbackAvatarUrl: resolveDiscordAvatarFallbackUrl(sessionUser?.avatarUrl),
      }) || null;
    const payload = {
      ...sessionUser,
      name: String(matched?.name || sessionUser?.name || ""),
      phrase: String(matched?.phrase || sessionUser?.phrase || ""),
      bio: String(matched?.bio || sessionUser?.bio || ""),
      avatarUrl,
      avatarDisplay: normalizeAvatarDisplay(matched?.avatarDisplay || sessionUser?.avatarDisplay),
      socials: matched?.socials || sessionUser?.socials || [],
      favoriteWorks: matched?.favoriteWorks || sessionUser?.favoriteWorks || {},
      status: matched?.status || sessionUser?.status || "active",
      permissions: permissionsForRead(authAccess?.permissions || matched?.permissions || []),
      roles,
      accessRole,
      ownerIds,
      primaryOwnerId,
      grants,
    };
    return withUserProfileRevision(payload, uploads);
  };

  return {
    buildUserPayload,
    buildUserProfileRevisionToken,
    resolveDiscordAvatarFallbackUrl,
    syncPersistedDiscordAvatarForLogin,
    syncSessionUserDisplayProfile,
    withEffectiveAvatarUrl,
    withUserProfileRevision,
  };
};

export default createUserProfileRuntime;
