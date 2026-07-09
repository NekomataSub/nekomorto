import { randomUUID } from "node:crypto";

export const sortUsersByOrder = (users) =>
  [...users].sort((left, right) => left.order - right.order);

export const buildGeneratedManagedUserId = () => `user_${randomUUID().replaceAll("-", "")}`;

const buildActiveRetiredOrder = (users) => {
  const activeUsers = users
    .filter((user) => user.status === "active")
    .sort((left, right) => left.order - right.order);
  const retiredUsers = users
    .filter((user) => user.status === "retired")
    .sort((left, right) => left.order - right.order);

  return { activeUsers, retiredUsers };
};

export const buildReorderedUsers = ({ users, orderedIds, retiredIds }) => {
  const { activeUsers, retiredUsers } = buildActiveRetiredOrder(users);
  const activeOrder = Array.isArray(orderedIds)
    ? orderedIds.map(String)
    : activeUsers.map((user) => user.id);
  const retiredOrder = Array.isArray(retiredIds)
    ? retiredIds.map(String)
    : retiredUsers.map((user) => user.id);

  const activeOrderMap = new Map(activeOrder.map((id, index) => [String(id), index]));
  const retiredOrderMap = new Map(retiredOrder.map((id, index) => [String(id), index]));

  return users.map((user) => {
    if (user.status === "active" && activeOrderMap.has(user.id)) {
      return { ...user, order: activeOrderMap.get(user.id) };
    }
    if (user.status === "retired" && retiredOrderMap.has(user.id)) {
      return { ...user, order: activeOrder.length + retiredOrderMap.get(user.id) };
    }
    return user;
  });
};

export const rebuildUsersAfterDeletion = (users) => {
  const { activeUsers, retiredUsers } = buildActiveRetiredOrder(users);
  let orderIndex = 0;
  return [
    ...activeUsers.map((user) => ({ ...user, order: orderIndex++ })),
    ...retiredUsers.map((user) => ({ ...user, order: orderIndex++ })),
  ];
};

const normalizeLegacyUsersAfterMutation = ({ users, isOwner, normalizeUsers }) =>
  normalizeUsers(users).map((user) =>
    isOwner(user.id) ? { ...user, status: "active", permissions: ["*"] } : user,
  );

export const persistUsers = ({
  users,
  isLegacy = false,
  enforceUserAccessInvariants,
  isOwner,
  normalizeUsers,
  syncAllowedUsers,
  writeUsers,
}) => {
  const nextUsers = isLegacy
    ? normalizeLegacyUsersAfterMutation({ users, isOwner, normalizeUsers })
    : enforceUserAccessInvariants(users);
  const sortedUsers = sortUsersByOrder(nextUsers);
  writeUsers(sortedUsers);
  syncAllowedUsers(sortedUsers);
  return sortedUsers;
};

export const loadNormalizedOwnerIds = (loadOwnerIds) =>
  (typeof loadOwnerIds === "function" ? loadOwnerIds() : []).map((entry) => String(entry));

export const toUserApiResponse = ({ applyOwnerRole, ownerIds, user, userWithAccessForResponse }) =>
  applyOwnerRole(userWithAccessForResponse(user, ownerIds));

export const buildUserApiSnapshot = ({
  applyOwnerRole,
  loadOwnerIds,
  ownerIds,
  user,
  userWithAccessForResponse,
}) =>
  toUserApiResponse({
    applyOwnerRole,
    ownerIds: Array.isArray(ownerIds) ? ownerIds : loadNormalizedOwnerIds(loadOwnerIds),
    user,
    userWithAccessForResponse,
  });

export const resolveManagedUserActorCapabilities = ({
  AccessRole,
  PermissionId,
  actorContext,
  can,
}) => {
  const accessRole = actorContext?.accessRole;

  const actorCanUsers = can({
    grants: actorContext?.grants,
    permissionId: PermissionId.USUARIOS,
  });

  return {
    actorIsAdmin: accessRole === AccessRole.ADMIN,
    actorIsPrimary: accessRole === AccessRole.OWNER_PRIMARY,
    actorIsSecondary: accessRole === AccessRole.OWNER_SECONDARY,
    actorCanUsersAccess: actorCanUsers,
    actorCanUsersBasic: actorCanUsers,
  };
};

export const canManageUsersAccessWithOwnerGovernance = ({
  AccessRole,
  PermissionId,
  actorContext,
  can,
}) => {
  const accessRole = actorContext?.accessRole;
  if (
    accessRole !== AccessRole.OWNER_PRIMARY &&
    accessRole !== AccessRole.OWNER_SECONDARY &&
    accessRole !== AccessRole.ADMIN
  ) {
    return false;
  }
  return can({
    grants: actorContext?.grants,
    permissionId: PermissionId.USUARIOS,
  });
};

export const hasChangedOwnerManagedUserOrder = ({ loadOwnerIds, previousUsers, users }) => {
  const ownerIds = new Set(loadNormalizedOwnerIds(loadOwnerIds));
  const previousOrderById = new Map(
    (Array.isArray(previousUsers) ? previousUsers : []).map((user) => [user.id, user.order]),
  );

  return (Array.isArray(users) ? users : []).some((user) => {
    if (!ownerIds.has(user.id)) {
      return false;
    }
    return user.order !== previousOrderById.get(user.id);
  });
};

export const buildManagedUserResponseContext = ({
  applyOwnerRole,
  buildUserProfileRevisionToken,
  loadOwnerIds,
  loadUploads,
  user,
  userWithAccessForResponse,
}) => {
  const ownerIds = loadNormalizedOwnerIds(loadOwnerIds);
  const responseUploads = loadUploads();
  const currentUserSnapshot = buildUserApiSnapshot({
    applyOwnerRole,
    ownerIds,
    user,
    userWithAccessForResponse,
  });

  return {
    currentRevision: buildUserProfileRevisionToken(currentUserSnapshot, responseUploads),
    currentUserSnapshot,
    ownerIds,
    responseUploads,
  };
};

export const diffUserFields = (beforeUser, afterUser, fields) => {
  const before = beforeUser || {};
  const after = afterUser || {};
  const keys = Array.isArray(fields) ? fields : [];
  const changes = {};

  keys.forEach((field) => {
    const beforeValue = before[field];
    const afterValue = after[field];
    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[field] = {
        from: beforeValue,
        to: afterValue,
      };
    }
  });

  return changes;
};

export const buildManagedUserAuditChanges = ({
  BASIC_PROFILE_FIELDS,
  afterSnapshot,
  beforeSnapshot,
}) =>
  diffUserFields(beforeSnapshot, afterSnapshot, [
    ...(Array.isArray(BASIC_PROFILE_FIELDS) ? BASIC_PROFILE_FIELDS : []),
    "status",
    "permissions",
    "roles",
    "accessRole",
  ]);

export const hasManagedUserPrivilegeEscalation = ({ afterSnapshot, beforeSnapshot }) =>
  JSON.stringify(beforeSnapshot?.permissions || []) !==
    JSON.stringify(afterSnapshot?.permissions || []) ||
  String(beforeSnapshot?.accessRole || "") !== String(afterSnapshot?.accessRole || "") ||
  String(beforeSnapshot?.status || "") !== String(afterSnapshot?.status || "");

export const getManagedUserUpdateAuthorizationError = ({
  AccessRole,
  actorCapabilities,
  actorContext,
  isBasicProfileField,
  targetContext,
  update,
}) => {
  const updateKeys = Object.keys(update || {});
  const touchesAccessFields = updateKeys.some((field) => !isBasicProfileField(field));
  const { actorCanUsersBasic, actorIsAdmin, actorIsPrimary, actorIsSecondary } = actorCapabilities;

  if (!actorCanUsersBasic) {
    return "users_permission_required";
  }
  if (targetContext?.isOwner && !actorIsPrimary) {
    return "owner_update_forbidden";
  }
  const touchesPermissionFields = updateKeys.includes("permissions");
  const touchesRoleFields = updateKeys.some((field) =>
    ["roles", "accessRole", "status"].includes(field),
  );
  const actorCanManageRoles = actorIsPrimary || actorIsSecondary || actorIsAdmin;
  if (touchesPermissionFields && !actorIsPrimary) {
    return "owner_permission_required";
  }
  if (touchesRoleFields && !actorCanManageRoles) {
    return "admin_role_required";
  }
  if (
    touchesAccessFields &&
    !touchesPermissionFields &&
    !touchesRoleFields &&
    !actorCanManageRoles
  ) {
    return "basic_fields_only";
  }

  if (targetContext?.isPrimaryOwner) {
    const actorUserId = actorContext?.user?.id || actorContext?.id;
    const isSelfEdit = actorUserId === targetContext.id;
    const updateKeys = Object.keys(update || {});
    const immutableFields = ["permissions", "status", "accessRole"].filter((field) =>
      updateKeys.includes(field),
    );

    if (immutableFields.length > 0) {
      if (!isSelfEdit) {
        return "primary_owner_immutable";
      }
      const isActuallyChanging = immutableFields.some((field) => {
        const currentValue = targetContext.user?.[field] ?? targetContext[field];
        const updateValue = update[field];
        return JSON.stringify(currentValue) !== JSON.stringify(updateValue);
      });
      if (isActuallyChanging) {
        return "primary_owner_immutable";
      }
    }
  }

  if (
    Object.prototype.hasOwnProperty.call(update || {}, "accessRole") &&
    String(update?.accessRole || "").includes("owner")
  ) {
    return "owner_role_requires_owner_governance";
  }

  return null;
};

export const getLegacyManagedUserDeleteError = ({
  isOwner,
  isPrimaryOwner,
  primaryOwnerId,
  sessionUserId,
  targetId,
}) => {
  if (!isOwner(sessionUserId)) {
    return "forbidden";
  }
  if (primaryOwnerId && String(primaryOwnerId) === targetId) {
    return "cannot_delete_primary_owner";
  }
  if (isOwner(targetId) && !isPrimaryOwner(sessionUserId)) {
    return "owner_delete_forbidden";
  }
  return null;
};

export const getManagedUserDeleteAuthorizationError = ({
  actorCapabilities,
  primaryOwnerId,
  targetContext,
  targetId,
}) => {
  const { actorCanUsersAccess, actorIsAdmin, actorIsPrimary, actorIsSecondary } = actorCapabilities;

  if (!actorCanUsersAccess || (!actorIsPrimary && !actorIsSecondary && !actorIsAdmin)) {
    return "forbidden";
  }
  if (targetContext?.isPrimaryOwner || (primaryOwnerId && String(primaryOwnerId) === targetId)) {
    return "cannot_delete_primary_owner";
  }
  if (targetContext?.isOwner && !actorIsPrimary) {
    return "owner_delete_forbidden";
  }
  return null;
};

export const buildLegacyManagedUser = ({
  avatarDisplay,
  avatarUrl,
  bio,
  discordUserID,
  favoriteWorks,
  id,
  name,
  normalizeAvatarDisplay,
  order,
  permissions,
  phrase,
  roles,
  sanitizeFavoriteWorksByCategory,
  sanitizeSocials,
  socials,
  status,
  email,
}) => ({
  id: String(id),
  name,
  phrase: phrase || "",
  bio: bio || "",
  email:
    String(email || "")
      .trim()
      .toLowerCase() || null,
  discordUserID:
    String(discordUserID || "")
      .trim() || null,
  avatarUrl: avatarUrl || null,
  avatarDisplay: normalizeAvatarDisplay(avatarDisplay),
  socials: sanitizeSocials(socials),
  favoriteWorks: sanitizeFavoriteWorksByCategory(favoriteWorks),
  status: status === "retired" ? "retired" : "active",
  permissions: Array.isArray(permissions) ? permissions : [],
  roles: Array.isArray(roles) ? roles.filter(Boolean) : [],
  order,
});

export const buildRbacManagedUser = ({
  AccessRole,
  accessRole,
  avatarDisplay,
  avatarUrl,
  bio,
  defaultPermissionsForRole,
  discordUserID,
  email,
  favoriteWorks,
  id,
  name,
  normalizeAccessRole,
  normalizeAvatarDisplay,
  order,
  permissions,
  phrase,
  removeOwnerRoleLabel,
  roles,
  sanitizeFavoriteWorksByCategory,
  sanitizePermissionsForStorage,
  sanitizeSocials,
  socials,
  status,
}) => {
  const normalizedAccessRole = normalizeAccessRole(accessRole, AccessRole.NORMAL);
  const nextAccessRole =
    normalizedAccessRole === AccessRole.ADMIN ? AccessRole.ADMIN : AccessRole.NORMAL;
  const sanitizedPermissions = Array.isArray(permissions)
    ? sanitizePermissionsForStorage(permissions, {
        acceptLegacyStar: false,
        keepUnknown: true,
      })
    : [...defaultPermissionsForRole(nextAccessRole)];

  return {
    id: String(id),
    name: String(name || "Sem nome"),
    phrase: phrase || "",
    bio: bio || "",
    email:
      String(email || "")
        .trim()
        .toLowerCase() || null,
    discordUserID:
      String(discordUserID || "")
        .trim() || null,
    avatarUrl: avatarUrl || null,
    avatarDisplay: normalizeAvatarDisplay(avatarDisplay),
    socials: sanitizeSocials(socials),
    favoriteWorks: sanitizeFavoriteWorksByCategory(favoriteWorks),
    status: status === "retired" ? "retired" : "active",
    permissions: sanitizedPermissions,
    roles: removeOwnerRoleLabel(Array.isArray(roles) ? roles.filter(Boolean) : []),
    accessRole: nextAccessRole,
    order,
  };
};

export const buildLegacyManagedUserUpdate = ({
  existing,
  normalizeAvatarDisplay,
  sanitizeFavoriteWorksByCategory,
  sanitizeSocials,
  update,
}) => ({
  ...existing,
  name: update.name ?? existing.name,
  phrase: update.phrase ?? existing.phrase,
  bio: update.bio ?? existing.bio,
  email: Object.prototype.hasOwnProperty.call(update, "email")
    ? String(update.email || "")
        .trim()
        .toLowerCase() || null
    : (existing.email ?? null),
  discordUserID: Object.prototype.hasOwnProperty.call(update, "discordUserID")
    ? String(update.discordUserID || "")
        .trim() || null
    : (existing.discordUserID ?? null),
  avatarUrl: update.avatarUrl ?? existing.avatarUrl,
  avatarDisplay:
    update.avatarDisplay !== undefined
      ? normalizeAvatarDisplay(update.avatarDisplay)
      : normalizeAvatarDisplay(existing.avatarDisplay),
  socials: Array.isArray(update.socials) ? sanitizeSocials(update.socials) : existing.socials,
  favoriteWorks: Object.prototype.hasOwnProperty.call(update, "favoriteWorks")
    ? sanitizeFavoriteWorksByCategory(update.favoriteWorks)
    : existing.favoriteWorks,
  status: update.status === "retired" ? "retired" : "active",
  permissions: Array.isArray(update.permissions) ? update.permissions : existing.permissions,
  roles: Array.isArray(update.roles) ? update.roles : existing.roles,
});

export const buildRbacManagedUserUpdate = ({
  AccessRole,
  actorIsAdmin,
  actorIsPrimary,
  actorIsSecondary,
  basicPatch,
  defaultPermissionsForRole,
  existing,
  normalizeAccessRole,
  normalizeAvatarDisplay,
  removeOwnerRoleLabel,
  sanitizeFavoriteWorksByCategory,
  sanitizePermissionsForStorage,
  sanitizeSocials,
  targetContext,
  update,
}) => {
  const updated = {
    ...existing,
    ...basicPatch,
    email: Object.prototype.hasOwnProperty.call(basicPatch, "email")
      ? String(basicPatch.email || "")
          .trim()
          .toLowerCase() || null
      : (existing.email ?? null),
    discordUserID: Object.prototype.hasOwnProperty.call(basicPatch, "discordUserID")
      ? String(basicPatch.discordUserID || "")
          .trim() || null
      : (existing.discordUserID ?? null),
    avatarDisplay:
      basicPatch.avatarDisplay !== undefined
        ? normalizeAvatarDisplay(basicPatch.avatarDisplay)
        : normalizeAvatarDisplay(existing.avatarDisplay),
    socials: Array.isArray(basicPatch.socials)
      ? sanitizeSocials(basicPatch.socials)
      : existing.socials,
    favoriteWorks: Object.prototype.hasOwnProperty.call(basicPatch, "favoriteWorks")
      ? sanitizeFavoriteWorksByCategory(basicPatch.favoriteWorks)
      : existing.favoriteWorks,
    roles: Array.isArray(update.roles) ? removeOwnerRoleLabel(update.roles) : existing.roles,
    status:
      update.status === "retired"
        ? "retired"
        : update.status === "active"
          ? "active"
          : existing.status,
    accessRole: Object.prototype.hasOwnProperty.call(update, "accessRole")
      ? normalizeAccessRole(update.accessRole, existing.accessRole || AccessRole.NORMAL)
      : existing.accessRole || AccessRole.NORMAL,
    permissions: Array.isArray(update.permissions)
      ? sanitizePermissionsForStorage(update.permissions, {
          acceptLegacyStar: false,
          keepUnknown: true,
        })
      : existing.permissions,
  };

  if (
    Object.prototype.hasOwnProperty.call(update, "accessRole") &&
    !Array.isArray(update.permissions) &&
    !targetContext.isOwner
  ) {
    updated.permissions = [...defaultPermissionsForRole(updated.accessRole)];
  }
  if ((actorIsPrimary || actorIsSecondary) && targetContext.isOwner) {
    updated.accessRole = existing.accessRole;
  }
  if (
    updated.accessRole === AccessRole.OWNER_PRIMARY ||
    updated.accessRole === AccessRole.OWNER_SECONDARY
  ) {
    updated.accessRole = existing.accessRole;
  }
  if (!actorIsPrimary && !actorIsSecondary && !actorIsAdmin) {
    updated.permissions = existing.permissions;
    updated.accessRole = existing.accessRole;
    updated.status = existing.status;
    updated.roles = existing.roles;
  }
  if (!actorIsPrimary) {
    updated.permissions = existing.permissions;
  }

  return updated;
};

export const syncOwnerIdsAfterUserDeletion = ({
  loadOwnerIds,
  primaryOwnerId,
  targetId,
  writeOwnerIds,
}) => {
  let nextOwnerIds = loadNormalizedOwnerIds(loadOwnerIds);
  if (!nextOwnerIds.includes(targetId)) {
    return nextOwnerIds;
  }

  nextOwnerIds = nextOwnerIds.filter((id) => id !== targetId);
  if (nextOwnerIds.length === 0 && primaryOwnerId) {
    nextOwnerIds = [String(primaryOwnerId)];
  }
  writeOwnerIds(nextOwnerIds);
  return nextOwnerIds;
};

export const buildSelfResponseUser = ({
  req,
  responseUploads,
  targetId,
  user,
  withEffectiveAvatarUrl,
  withUserProfileRevision,
  resolveDiscordAvatarFallbackUrl,
}) => {
  if (targetId !== String(req.session?.user?.id || "")) {
    return withUserProfileRevision(user, responseUploads);
  }

  return withUserProfileRevision(
    withEffectiveAvatarUrl(user, resolveDiscordAvatarFallbackUrl(req.session?.user?.avatarUrl)),
    responseUploads,
  );
};
