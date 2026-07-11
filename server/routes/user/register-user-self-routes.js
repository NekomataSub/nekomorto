import { diffUserFields, toUserApiResponse } from "./shared.js";

const resolveSelfUserIndex = (users, sessionUser) => {
  const normalizedSessionUserId = String(sessionUser?.id || "").trim();
  if (!normalizedSessionUserId) {
    return -1;
  }
  return users.findIndex((user) => user.id === normalizedSessionUserId);
};

export const registerUserSelfRoutes = ({
  BASIC_PROFILE_FIELDS,
  app,
  appendAuditLog,
  applyOwnerRole,
  buildUserProfileRevisionToken,
  ensureNoEditConflict,
  loadOwnerIds,
  loadUploads,
  loadUsers,
  normalizeAvatarDisplay,
  normalizeUsers,
  parseEditRevisionOptions,
  persistCurrentUsers,
  pickBasicProfilePatch,
  removeOwnerRoleLabel,
  requireAuth,
  resolveDiscordAvatarFallbackUrl,
  sanitizeFavoriteWorksByCategory,
  sanitizeSocials,
  syncSessionUserDisplayProfile,
  userWithAccessForResponse,
  withEffectiveAvatarUrl,
  withUserProfileRevision,
} = {}) => {
  app.put("/api/users/self", requireAuth, (req, res) => {
    const sessionUser = req.session.user;
    const options = parseEditRevisionOptions(req.body);
    let users = normalizeUsers(loadUsers());
    const index = resolveSelfUserIndex(users, sessionUser);
    if (index === -1) {
      appendAuditLog(req, "users.update_self.blocked", "users", {
        sessionUserId: String(sessionUser?.id || "").trim() || null,
        sessionEmailPresent: Boolean(String(sessionUser?.email || "").trim()),
        error: "self_user_not_found",
      });
      return res.status(404).json({ error: "self_user_not_found" });
    }

    const update = req.body || {};
    const existing = users[index];
    const targetUserId = String(existing.id || sessionUser.id || "").trim();
    if (!targetUserId) {
      return res.status(404).json({ error: "self_user_not_found" });
    }
    const targetSessionUser = {
      ...sessionUser,
      id: targetUserId,
      email: existing.email || sessionUser.email || null,
    };
    const ownerIds = loadOwnerIds().map((id) => String(id));
    const currentUserSnapshot = toUserApiResponse({
      applyOwnerRole,
      ownerIds,
      user: existing,
      userWithAccessForResponse,
    });
    const responseUploads = loadUploads();
    const currentRevision = buildUserProfileRevisionToken(currentUserSnapshot, responseUploads);
    const noConflict = ensureNoEditConflict({
      req,
      res,
      resourceType: "user",
      resourceId: targetUserId,
      current: currentUserSnapshot,
      currentRevision,
      options,
    });
    if (!noConflict) {
      return noConflict;
    }

    const basicPatch = pickBasicProfilePatch(update);
    const updated = {
      ...existing,
      name: basicPatch.name ?? existing.name,
      phrase: basicPatch.phrase ?? existing.phrase,
      bio: basicPatch.bio ?? existing.bio,
      avatarUrl: basicPatch.avatarUrl ?? existing.avatarUrl,
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
    };

    const isOwner = ownerIds.includes(targetUserId);
    if (isOwner && Array.isArray(update.roles)) {
      updated.roles = removeOwnerRoleLabel(update.roles);
    }

    const beforeSnapshot = currentUserSnapshot;
    users[index] = updated;
    users = persistCurrentUsers({ users });
    const persisted = users.find((user) => user.id === targetUserId) || updated;
    const afterSnapshot = toUserApiResponse({
      applyOwnerRole,
      ownerIds,
      user: persisted,
      userWithAccessForResponse,
    });

    const diffFields = isOwner && Array.isArray(update.roles)
      ? [...BASIC_PROFILE_FIELDS, "roles"]
      : BASIC_PROFILE_FIELDS;
    appendAuditLog(req, "users.update_self", "users", {
      id: targetUserId,
      before: beforeSnapshot,
      after: afterSnapshot,
      changes: diffUserFields(beforeSnapshot, afterSnapshot, diffFields),
    });
    req.session.user = targetSessionUser;
    syncSessionUserDisplayProfile(req, persisted, responseUploads);
    return res.json({
      user: withUserProfileRevision(
        withEffectiveAvatarUrl(
          afterSnapshot,
          resolveDiscordAvatarFallbackUrl(req.session?.user?.avatarUrl),
        ),
        responseUploads,
      ),
    });
  });
};

export default registerUserSelfRoutes;
