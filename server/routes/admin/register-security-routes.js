import crypto from "crypto";
import { filterByDateRange, filterExportEntries } from "../../lib/admin-exports.js";

const registerSecurityEventStatusRoute = ({
  app,
  appendAuditLog,
  canManageSecurityAdmin,
  requireAuth,
  routePath,
  status,
  auditAction,
  toSecurityEventApiResponse,
  updateSecurityEventStatus,
} = {}) => {
  app.post(routePath, requireAuth, (req, res) => {
    if (!canManageSecurityAdmin(req.session?.user?.id)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const event = updateSecurityEventStatus({
      eventId: req.params.id,
      status,
      actorUserId: req.session?.user?.id || "system",
    });
    if (!event) {
      return res.status(404).json({ error: "not_found" });
    }
    appendAuditLog(req, auditAction, "security", { id: event.id });
    return res.json({ ok: true, event: toSecurityEventApiResponse(event) });
  });
};

export const registerSecurityRoutes = ({
  SecurityEventSeverity,
  SecurityEventStatus,
  app,
  appendAuditLog,
  appendSecretRotation,
  canManageSecurityAdmin,
  dataEncryptionKeyring,
  resetBetterAuthPasskeysForUser,
  resetBetterAuthTotpForUser,
  emitSecurityEvent,
  isOwner,
  isPrimaryOwner,
  listActiveSessionsForUser,
  loadSecretRotations,
  loadSecurityEvents,
  loadUserSessionIndexRecords,
  loadUsers,
  normalizeExportFilters,
  normalizeUsers,
  requireAuth,
  revokeSessionBySid,
  sessionCookieConfig,
  toSecurityEventApiResponse,
  updateSecurityEventStatus,
} = {}) => {
  const authorizeCredentialReset = ({ req, res }) => {
    const actorId = String(req.session?.user?.id || "").trim();
    if (!isOwner(actorId)) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    const targetId = String(req.params.id || "").trim();
    if (!targetId) {
      res.status(400).json({ error: "invalid_target_id" });
      return null;
    }
    if (actorId === targetId) {
      res.status(400).json({ error: "cannot_reset_self" });
      return null;
    }
    const targetExists = normalizeUsers(loadUsers()).some(
      (entry) => String(entry?.id || "") === targetId,
    );
    if (!targetExists) {
      res.status(404).json({ error: "not_found" });
      return null;
    }
    if (isOwner(targetId) && !isPrimaryOwner(actorId)) {
      res.status(403).json({ error: "forbidden" });
      return null;
    }
    return { actorId, targetId };
  };

  app.get("/api/admin/security/events", requireAuth, (req, res) => {
    if (!canManageSecurityAdmin(req.session?.user?.id)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.max(Math.floor(limitRaw), 10), 200)
        : 50;
    const filters = normalizeExportFilters(req.query);
    let rows = loadSecurityEvents();
    rows = filterByDateRange(rows, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      tsAccessor: (entry) => entry.ts,
    });
    rows = filterExportEntries(rows, filters, {
      fieldAccessors: {
        actorUserId: (entry) => entry.actorUserId,
        targetUserId: (entry) => entry.targetUserId,
        severity: (entry) => entry.severity,
        status: (entry) => entry.status,
        action: (entry) => entry.type,
      },
    });
    rows.sort((a, b) => new Date(b.ts || 0).getTime() - new Date(a.ts || 0).getTime());
    const total = rows.length;
    const start = (page - 1) * limit;
    const paged = rows
      .slice(start, start + limit)
      .map((entry) => toSecurityEventApiResponse(entry));
    return res.json({ events: paged, page, limit, total });
  });

  registerSecurityEventStatusRoute({
    app,
    appendAuditLog,
    canManageSecurityAdmin,
    requireAuth,
    routePath: "/api/admin/security/events/:id/ack",
    status: SecurityEventStatus.ACK,
    auditAction: "security.event.ack",
    toSecurityEventApiResponse,
    updateSecurityEventStatus,
  });

  registerSecurityEventStatusRoute({
    app,
    appendAuditLog,
    canManageSecurityAdmin,
    requireAuth,
    routePath: "/api/admin/security/events/:id/resolve",
    status: SecurityEventStatus.RESOLVED,
    auditAction: "security.event.resolve",
    toSecurityEventApiResponse,
    updateSecurityEventStatus,
  });

  registerSecurityEventStatusRoute({
    app,
    appendAuditLog,
    canManageSecurityAdmin,
    requireAuth,
    routePath: "/api/admin/security/events/:id/ignore",
    status: SecurityEventStatus.IGNORED,
    auditAction: "security.event.ignore",
    toSecurityEventApiResponse,
    updateSecurityEventStatus,
  });

  app.get("/api/admin/security/rotation", requireAuth, (req, res) => {
    if (!isPrimaryOwner(req.session?.user?.id) && !canManageSecurityAdmin(req.session?.user?.id)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const recent = loadSecretRotations().slice(0, 50);
    return res.json({
      session: {
        acceptedSecretsCount: Number(sessionCookieConfig.acceptedSecretsCount || 0),
        activeSecretConfigured: Boolean(sessionCookieConfig.activeSecret),
      },
      encryption: {
        activeKeyId: dataEncryptionKeyring.activeKeyId || null,
        availableKeyIds: Object.keys(dataEncryptionKeyring.keys || {}),
      },
      recentRotations: recent,
    });
  });

  app.post("/api/admin/security/rotation", requireAuth, (req, res) => {
    if (!isPrimaryOwner(req.session?.user?.id)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const secretFamily = String(req.body?.secretFamily || "").trim();
    const keyId = String(req.body?.keyId || "").trim();
    if (!secretFamily || !keyId) {
      return res.status(400).json({ error: "secret_family_and_key_id_required" });
    }
    const entry = appendSecretRotation({
      id: crypto.randomUUID(),
      secretFamily,
      keyId,
      rotatedAt: new Date().toISOString(),
      rotatedBy: req.session?.user?.id || "system",
      notes: String(req.body?.notes || "").trim(),
      status: String(req.body?.status || "completed").trim() || "completed",
    });
    appendAuditLog(req, "security.rotation.record", "security", {
      secretFamily,
      keyId,
      id: entry?.id || null,
    });
    return res.status(201).json({ ok: true, rotation: entry });
  });

  app.post("/api/admin/users/:id/security/totp/reset", requireAuth, async (req, res, next) => {
    const authorized = authorizeCredentialReset({ req, res });
    if (!authorized) return;
    const { actorId, targetId } = authorized;
    try {
      const result = await resetBetterAuthTotpForUser(targetId);
      if (!result.userFound) {
        return res.status(404).json({ error: "auth_user_not_found" });
      }
      appendAuditLog(req, "auth.mfa.reset_admin", "users", { targetId, ...result });
      emitSecurityEvent({
        req,
        type: "mfa_reset_admin",
        severity: SecurityEventSeverity.WARNING,
        riskScore: 60,
        actorUserId: actorId || null,
        targetUserId: targetId,
        data: { targetId, ...result },
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/admin/users/:id/security/passkeys/reset", requireAuth, async (req, res, next) => {
    const authorized = authorizeCredentialReset({ req, res });
    if (!authorized) return;
    const { actorId, targetId } = authorized;
    try {
      const result = await resetBetterAuthPasskeysForUser(targetId);
      if (!result.userFound) {
        return res.status(404).json({ error: "auth_user_not_found" });
      }
      appendAuditLog(req, "auth.passkeys.reset_admin", "users", { targetId, ...result });
      emitSecurityEvent({
        req,
        type: "passkey_reset_admin",
        severity: SecurityEventSeverity.WARNING,
        riskScore: 65,
        actorUserId: actorId || null,
        targetUserId: targetId,
        data: { targetId, ...result },
      });
      return res.json({ ok: true, ...result });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/users/:id/sessions", requireAuth, async (req, res, next) => {
    const actorId = String(req.session?.user?.id || "").trim();
    if (!isOwner(actorId)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const targetId = String(req.params.id || "").trim();
    if (!targetId) {
      return res.status(400).json({ error: "invalid_target_id" });
    }
    try {
      const sessions = (await listActiveSessionsForUser(targetId)).map((entry) => ({
        sid: entry.sid,
        userId: entry.userId,
        createdAt: entry.createdAt || null,
        lastSeenAt: entry.lastSeenAt || null,
        lastIp: entry.lastIp || "",
        userAgent: entry.userAgent || "",
        current: false,
        isCurrent: false,
        revokedAt: entry.revokedAt || null,
        isPendingMfa: Boolean(entry.isPendingMfa),
      }));
      return res.json({ sessions });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/sessions/active", requireAuth, async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const actorId = String(req.session?.user?.id || "").trim();
    if (!isOwner(actorId)) {
      return res.status(403).json({ error: "forbidden" });
    }

    const pageRaw = Number(req.query.page);
    const limitRaw = Number(req.query.limit);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
    const limit =
      Number.isFinite(limitRaw) && limitRaw > 0
        ? Math.min(Math.max(Math.floor(limitRaw), 1), 500)
        : 100;

    const usersById = new Map(
      normalizeUsers(loadUsers()).map((entry) => [String(entry.id || ""), entry]),
    );
    const currentSid = String(req.sessionID || "");
    let rows = [];
    try {
      rows = (await loadUserSessionIndexRecords({ includeRevoked: false })).filter(
        (entry) => !entry.revokedAt,
      );
      const currentBetterAuthSession = req.betterAuthSession?.session || null;
      const currentBetterAuthToken = String(currentBetterAuthSession?.token || "").trim();
      const currentBetterAuthUserId = String(req.betterAuthSession?.user?.id || actorId).trim();
      if (
        currentBetterAuthToken &&
        currentBetterAuthUserId &&
        !rows.some((entry) => String(entry?.sid || "") === currentBetterAuthToken)
      ) {
        rows.push({
          sid: currentBetterAuthToken,
          userId: currentBetterAuthUserId,
          createdAt: currentBetterAuthSession.createdAt || null,
          lastSeenAt:
            currentBetterAuthSession.updatedAt || currentBetterAuthSession.createdAt || null,
          lastIp: currentBetterAuthSession.ipAddress || "",
          userAgent: currentBetterAuthSession.userAgent || "",
          revokedAt: null,
          isPendingMfa: false,
        });
      }
      rows.sort(
        (a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime(),
      );
    } catch (error) {
      return next(error);
    }
    const total = rows.length;
    const start = (page - 1) * limit;
    const sessions = rows.slice(start, start + limit).map((entry) => {
      const normalizedUserId = String(entry.userId || "").trim();
      const user = usersById.get(normalizedUserId) || null;
      return {
        sid: String(entry.sid || ""),
        userId: normalizedUserId,
        userName: String(user?.name || normalizedUserId || "usuario"),
        userAvatarUrl: user?.avatarUrl || null,
        createdAt: entry.createdAt || null,
        lastSeenAt: entry.lastSeenAt || null,
        lastIp: entry.lastIp || "",
        userAgent: entry.userAgent || "",
        isPendingMfa: Boolean(entry.isPendingMfa),
        currentForViewer: String(entry.sid || "") === currentSid,
      };
    });

    return res.json({
      sessions,
      page,
      limit,
      total,
    });
  });

  app.delete("/api/admin/users/:id/sessions/:sid", requireAuth, async (req, res, next) => {
    const actorId = String(req.session?.user?.id || "").trim();
    if (!isOwner(actorId)) {
      return res.status(403).json({ error: "forbidden" });
    }
    const targetId = String(req.params.id || "").trim();
    const sid = String(req.params.sid || "").trim();
    if (!targetId || !sid) {
      return res.status(400).json({ error: "invalid_params" });
    }
    try {
      const target = (await listActiveSessionsForUser(targetId)).find(
        (entry) => String(entry.sid || "") === sid,
      );
      if (!target) {
        return res.status(404).json({ error: "session_not_found" });
      }
      await revokeSessionBySid({
        sid,
        revokedBy: actorId || null,
        revokeReason: "admin_revoke",
      });
      appendAuditLog(req, "auth.sessions.admin_revoke", "users", {
        targetId,
        sid,
      });
      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  });
};
