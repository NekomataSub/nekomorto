import { SecurityEventSeverity as DefaultSecurityEventSeverity } from "../../lib/security-events.js";
import {
  buildLegacyManagedUser,
  buildLegacyManagedUserUpdate,
  buildManagedUserAuditChanges,
  buildManagedUserResponseContext,
  buildRbacManagedUser,
  buildRbacManagedUserUpdate,
  buildReorderedUsers,
  buildSelfResponseUser,
  buildUserApiSnapshot,
  canManageUsersAccessWithOwnerGovernance,
  getLegacyManagedUserDeleteError,
  getManagedUserDeleteAuthorizationError,
  getManagedUserUpdateAuthorizationError,
  hasChangedOwnerManagedUserOrder,
  hasManagedUserPrivilegeEscalation,
  loadNormalizedOwnerIds,
  rebuildUsersAfterDeletion,
  resolveManagedUserActorCapabilities,
  syncOwnerIdsAfterUserDeletion,
  buildGeneratedManagedUserId,
} from "./shared.js";

export const registerUserManagementRoutes = ({
  AccessRole,
  BASIC_PROFILE_FIELDS,
  PermissionId,
  SecurityEventSeverity,
  app,
  appendAuditLog,
  applyOwnerRole,
  buildUserProfileRevisionToken,
  can,
  defaultPermissionsForRole,
  emitSecurityEvent,
  ensureNoEditConflict,
  getPrimaryOwnerId,
  getUserAccessContextById,
  isAdminUser,
  isBasicProfileField,
  isOwner,
  isPrimaryOwner,
  isRbacV2Enabled,
  loadOwnerIds,
  loadUploads,
  loadUsers,
  normalizeAccessRole,
  normalizeAvatarDisplay,
  normalizeUsers,
  parseEditRevisionOptions,
  persistCurrentUsers,
  pickBasicProfilePatch,
  removeOwnerRoleLabel,
  requireAuth,
  resolveDiscordAvatarFallbackUrl,
  sanitizeFavoriteWorksByCategory,
  sanitizePermissionsForStorage,
  sanitizeSocials,
  shouldEmitSecurityRuleEvent,
  syncSessionUserDisplayProfile,
  userWithAccessForResponse,
  withEffectiveAvatarUrl,
  withUserProfileRevision,
  writeOwnerIds,
} = {}) => {
  const securityEventSeverity = {
    ...DefaultSecurityEventSeverity,
    ...(SecurityEventSeverity && typeof SecurityEventSeverity === "object"
      ? SecurityEventSeverity
      : {}),
  };

  app.post("/api/users", requireAuth, (req, res) => {
    const sessionUser = req.session.user;
    const {
      id,
      name,
      phrase,
      bio,
      email,
      discordUserID,
      avatarUrl,
      avatarDisplay,
      socials,
      favoriteWorks,
      status,
      permissions,
      roles,
      accessRole,
    } = req.body || {};

    if (!name) {
      return res.status(400).json({ error: "name_required" });
    }

    const trimmedId = String(id || "").trim();
    const trimmedEmail = String(email || "").trim();
    const trimmedDiscordId = String(discordUserID || "").trim();
    const targetId = trimmedId || buildGeneratedManagedUserId();

    if (!trimmedEmail && !trimmedDiscordId) {
      return res.status(400).json({ error: "email_or_discord_id_required" });
    }

    if (!targetId) {
      return res.status(500).json({ error: "user_id_generation_failed" });
    }

    if (!isRbacV2Enabled) {
      if (!isOwner(sessionUser?.id)) {
        return res.status(403).json({ error: "forbidden" });
      }

      let users = normalizeUsers(loadUsers());
      if (users.some((user) => user.id === targetId)) {
        return res.status(409).json({ error: "user_exists" });
      }

      const newUser = buildLegacyManagedUser({
        avatarDisplay,
        avatarUrl,
        bio,
        discordUserID,
        email,
        favoriteWorks,
        id: targetId,
        name,
        normalizeAvatarDisplay,
        order: users.length,
        permissions,
        phrase,
        roles,
        sanitizeFavoriteWorksByCategory,
        sanitizeSocials,
        socials,
        status,
      });

      users.push(newUser);
      persistCurrentUsers({ users, isLegacy: true });
      appendAuditLog(req, "users.create", "users", { id: newUser.id });
      return res.status(201).json({ user: withUserProfileRevision(newUser, loadUploads()) });
    }

    const actorContext = getUserAccessContextById(sessionUser?.id);
    const canCreateUsers = canManageUsersAccessWithOwnerGovernance({
      AccessRole,
      PermissionId,
      actorContext,
      can,
    });
    if (!canCreateUsers) {
      return res.status(403).json({ error: "forbidden" });
    }

    let users = normalizeUsers(loadUsers());
    if (users.some((user) => user.id === targetId)) {
      return res.status(409).json({ error: "user_exists" });
    }

    const normalizedAccessRole = normalizeAccessRole(accessRole, AccessRole.NORMAL);
    if (
      normalizedAccessRole === AccessRole.OWNER_PRIMARY ||
      normalizedAccessRole === AccessRole.OWNER_SECONDARY
    ) {
      return res.status(403).json({ error: "owner_role_requires_owner_governance" });
    }

    const newUser = buildRbacManagedUser({
      AccessRole,
      accessRole,
      avatarDisplay,
      avatarUrl,
      bio,
      defaultPermissionsForRole,
      discordUserID,
      email,
      favoriteWorks,
      id: targetId,
      name,
      normalizeAccessRole,
      normalizeAvatarDisplay,
      order: users.length,
      permissions: actorContext.accessRole === AccessRole.OWNER_PRIMARY ? permissions : [],
      phrase,
      removeOwnerRoleLabel,
      roles,
      sanitizeFavoriteWorksByCategory,
      sanitizePermissionsForStorage,
      sanitizeSocials,
      socials,
      status,
    });

    users.push(newUser);
    users = persistCurrentUsers({ users });

    const ownerIds = loadNormalizedOwnerIds(loadOwnerIds);
    const createdUser = users.find((user) => user.id === targetId) || newUser;
    const responseUser = buildUserApiSnapshot({
      applyOwnerRole,
      ownerIds,
      user: createdUser,
      userWithAccessForResponse,
    });
    appendAuditLog(req, "users.create", "users", {
      id: createdUser.id,
      after: responseUser,
    });
    return res.status(201).json({
      user: withUserProfileRevision(responseUser, loadUploads()),
    });
  });

  app.put("/api/users/reorder", requireAuth, (req, res) => {
    const sessionUser = req.session.user;
    const { orderedIds, retiredIds } = req.body || {};
    if (!Array.isArray(orderedIds) && !Array.isArray(retiredIds)) {
      return res.status(400).json({ error: "orderedIds_required" });
    }

    if (!isRbacV2Enabled) {
      if (!isAdminUser(sessionUser)) {
        return res.status(403).json({ error: "forbidden" });
      }

      let users = normalizeUsers(loadUsers());
      users = buildReorderedUsers({ users, orderedIds, retiredIds });
      persistCurrentUsers({ users, isLegacy: true });
      appendAuditLog(req, "users.reorder", "users", {});
      return res.json({ ok: true });
    }

    const actorContext = getUserAccessContextById(sessionUser?.id);
    const canReorderUsers = canManageUsersAccessWithOwnerGovernance({
      AccessRole,
      PermissionId,
      actorContext,
      can,
    });
    if (!canReorderUsers) {
      return res.status(403).json({ error: "forbidden" });
    }

    let users = normalizeUsers(loadUsers());
    const previousUsers = users;
    users = buildReorderedUsers({ users, orderedIds, retiredIds });

    if (
      actorContext.accessRole === AccessRole.OWNER_SECONDARY &&
      hasChangedOwnerManagedUserOrder({
        loadOwnerIds,
        previousUsers,
        users,
      })
    ) {
      return res.status(403).json({ error: "owner_reorder_forbidden" });
    }

    persistCurrentUsers({ users });
    appendAuditLog(req, "users.reorder", "users", {});
    return res.json({ ok: true });
  });

  app.put("/api/users/:id", requireAuth, (req, res) => {
    const options = parseEditRevisionOptions(req.body);
    const targetId = String(req.params.id);
    let users = normalizeUsers(loadUsers());
    const index = users.findIndex((user) => user.id === targetId);
    if (index === -1) {
      return res.status(404).json({ error: "not_found" });
    }

    const sessionUser = req.session.user;
    const update = req.body || {};
    const existing = users[index];
    const { currentRevision, currentUserSnapshot, ownerIds, responseUploads } =
      buildManagedUserResponseContext({
        applyOwnerRole,
        buildUserProfileRevisionToken,
        loadOwnerIds,
        loadUploads,
        user: existing,
        userWithAccessForResponse,
      });

    if (!isRbacV2Enabled) {
      const isOwnerRequest = isOwner(sessionUser.id);
      const canManageBadges = isAdminUser(sessionUser);

      if (!isOwnerRequest && !canManageBadges) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (!isOwnerRequest && canManageBadges) {
        const onlyRoles = Object.keys(update).length === 1 && Array.isArray(update.roles);
        if (!onlyRoles) {
          return res.status(403).json({ error: "roles_only" });
        }
      }

      const noConflict = ensureNoEditConflict({
        req,
        res,
        resourceType: "user",
        resourceId: targetId,
        current: currentUserSnapshot,
        currentRevision,
        options,
      });
      if (!noConflict) {
        return noConflict;
      }

      const updated = buildLegacyManagedUserUpdate({
        existing,
        normalizeAvatarDisplay,
        sanitizeFavoriteWorksByCategory,
        sanitizeSocials,
        update,
      });

      users[index] = updated;
      persistCurrentUsers({ users, isLegacy: true });

      const permissionsChanged =
        JSON.stringify(existing.permissions || []) !== JSON.stringify(updated.permissions || []);
      if (
        permissionsChanged &&
        shouldEmitSecurityRuleEvent("privilege_escalation_warning", `${sessionUser.id}:${targetId}`)
      ) {
        emitSecurityEvent({
          req,
          type: "privilege_escalation_warning",
          severity: securityEventSeverity.WARNING,
          riskScore: 75,
          actorUserId: sessionUser.id,
          targetUserId: targetId,
          data: {
            mode: "legacy",
            permissionsBefore: existing.permissions || [],
            permissionsAfter: updated.permissions || [],
          },
        });
      }

      appendAuditLog(req, "users.update", "users", { id: targetId });
      const responseUser = applyOwnerRole(updated);
      if (targetId === String(sessionUser?.id || "")) {
        syncSessionUserDisplayProfile(req, responseUser, responseUploads);
      }
      return res.json({
        user: buildSelfResponseUser({
          req,
          resolveDiscordAvatarFallbackUrl,
          responseUploads,
          targetId,
          user: responseUser,
          withEffectiveAvatarUrl,
          withUserProfileRevision,
        }),
      });
    }

    const actorContext = getUserAccessContextById(sessionUser.id, users);
    const targetContext = getUserAccessContextById(targetId, users);
    const actorCapabilities = resolveManagedUserActorCapabilities({
      AccessRole,
      PermissionId,
      actorContext,
      can,
    });
    const actorIsPrimary = actorCapabilities.actorIsPrimary;
    const actorIsSecondary = actorCapabilities.actorIsSecondary;
    const actorIsAdmin = actorCapabilities.actorIsAdmin;
    const authorizationError = getManagedUserUpdateAuthorizationError({
      AccessRole,
      actorCapabilities,
      actorContext,
      isBasicProfileField,
      targetContext,
      update,
    });
    if (authorizationError) {
      return res.status(403).json({ error: authorizationError });
    }

    const noConflict = ensureNoEditConflict({
      req,
      res,
      resourceType: "user",
      resourceId: targetId,
      current: currentUserSnapshot,
      currentRevision,
      options,
    });
    if (!noConflict) {
      return noConflict;
    }

    const basicPatch = pickBasicProfilePatch(update);
    const updated = buildRbacManagedUserUpdate({
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
    });

    const beforeSnapshot = currentUserSnapshot;
    users[index] = updated;
    users = persistCurrentUsers({ users });
    const persisted = users.find((user) => user.id === targetId) || updated;
    const afterSnapshot = buildUserApiSnapshot({
      applyOwnerRole,
      ownerIds,
      user: persisted,
      userWithAccessForResponse,
    });

    appendAuditLog(req, "users.update", "users", {
      id: targetId,
      before: beforeSnapshot,
      after: afterSnapshot,
      changes: buildManagedUserAuditChanges({
        BASIC_PROFILE_FIELDS,
        afterSnapshot,
        beforeSnapshot,
      }),
    });

    const hasPrivilegeEscalation = hasManagedUserPrivilegeEscalation({
      afterSnapshot,
      beforeSnapshot,
    });
    if (
      hasPrivilegeEscalation &&
      shouldEmitSecurityRuleEvent("privilege_escalation_warning", `${sessionUser.id}:${targetId}`)
    ) {
      emitSecurityEvent({
        req,
        type: "privilege_escalation_warning",
        severity: securityEventSeverity.WARNING,
        riskScore: 78,
        actorUserId: sessionUser.id,
        targetUserId: targetId,
        data: {
          accessRoleBefore: beforeSnapshot.accessRole || null,
          accessRoleAfter: afterSnapshot.accessRole || null,
          permissionsBefore: beforeSnapshot.permissions || [],
          permissionsAfter: afterSnapshot.permissions || [],
          statusBefore: beforeSnapshot.status || null,
          statusAfter: afterSnapshot.status || null,
        },
      });
    }

    if (targetId === String(sessionUser?.id || "")) {
      syncSessionUserDisplayProfile(req, afterSnapshot, responseUploads);
    }
    return res.json({
      user: buildSelfResponseUser({
        req,
        resolveDiscordAvatarFallbackUrl,
        responseUploads,
        targetId,
        user: afterSnapshot,
        withEffectiveAvatarUrl,
        withUserProfileRevision,
      }),
    });
  });

  app.delete("/api/users/:id", requireAuth, (req, res) => {
    const sessionUser = req.session.user;
    const targetId = String(req.params.id || "");
    const primaryOwnerId = getPrimaryOwnerId();

    if (!targetId) {
      return res.status(400).json({ error: "invalid_id" });
    }
    if (sessionUser?.id && String(sessionUser.id) === targetId) {
      return res.status(400).json({ error: "cannot_delete_self" });
    }

    if (!isRbacV2Enabled) {
      const legacyDeleteError = getLegacyManagedUserDeleteError({
        isOwner,
        isPrimaryOwner,
        primaryOwnerId,
        sessionUserId: sessionUser?.id,
        targetId,
      });
      if (legacyDeleteError) {
        return res.status(403).json({ error: legacyDeleteError });
      }

      let users = normalizeUsers(loadUsers());
      const index = users.findIndex((user) => user.id === targetId);
      if (index === -1) {
        return res.status(404).json({ error: "not_found" });
      }

      const removed = users[index];
      users = rebuildUsersAfterDeletion(users.filter((user) => user.id !== targetId));

      syncOwnerIdsAfterUserDeletion({
        loadOwnerIds,
        primaryOwnerId,
        targetId,
        writeOwnerIds,
      });

      persistCurrentUsers({ users, isLegacy: true });
      appendAuditLog(req, "users.delete", "users", {
        id: targetId,
        wasOwner: isOwner(removed.id),
      });
      return res.json({
        ok: true,
        ownerIds: loadOwnerIds(),
      });
    }

    let users = normalizeUsers(loadUsers());
    const index = users.findIndex((user) => user.id === targetId);
    if (index === -1) {
      return res.status(404).json({ error: "not_found" });
    }

    const removed = users[index];
    const actorContext = getUserAccessContextById(sessionUser?.id, users);
    const targetContext = getUserAccessContextById(targetId, users);
    const actorCapabilities = resolveManagedUserActorCapabilities({
      AccessRole,
      PermissionId,
      actorContext,
      can,
    });
    const deleteError = getManagedUserDeleteAuthorizationError({
      actorCapabilities,
      primaryOwnerId,
      targetContext,
      targetId,
    });
    if (deleteError) {
      return res.status(403).json({ error: deleteError });
    }

    users = rebuildUsersAfterDeletion(users.filter((user) => user.id !== targetId));

    const nextOwnerIds = syncOwnerIdsAfterUserDeletion({
      loadOwnerIds,
      primaryOwnerId,
      targetId,
      writeOwnerIds,
    });

    persistCurrentUsers({ users });
    appendAuditLog(req, "users.delete", "users", {
      id: targetId,
      wasOwner: targetContext.isOwner,
      before: buildUserApiSnapshot({
        applyOwnerRole,
        ownerIds: nextOwnerIds,
        user: removed,
        userWithAccessForResponse,
      }),
    });
    return res.json({
      ok: true,
      ownerIds: nextOwnerIds.map((id) => String(id)),
      primaryOwnerId: getPrimaryOwnerId() || null,
    });
  });
};

export default registerUserManagementRoutes;
