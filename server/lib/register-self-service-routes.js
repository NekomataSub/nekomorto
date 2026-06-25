import { Router } from "express";

const setNoStore = (res) => {
  res.setHeader("Cache-Control", "no-store");
};

export const registerSelfServiceRoutes = ({
  app,
  buildMySecuritySummary,
  getPendingMfaEnrollmentState,
  isPlainObject,
  listActiveSessionsForUser,
  loadUserPreferences,
  metricsRegistry,
  normalizeUserPreferences,
  requireAuth,
  revokeSessionBySid,
  userPreferencesMaxBytes,
  writeUserPreferences,
}) => {
  const router = Router();

  const requireNoPendingMfaEnrollment = (req, res, next) => {
    if (!getPendingMfaEnrollmentState(req)?.pending) {
      return next();
    }
    setNoStore(res);
    return res.status(403).json({ error: "mfa_enrollment_required" });
  };

  const handleIdentityUnlink = async (req, res) => {
    setNoStore(res);
    return res.status(410).json({
      error: "legacy_identity_endpoint_removed",
      replacement: "better_auth_client",
    });
  };

  const buildConnectedIdentitiesResponse = (req, res) => {
    setNoStore(res);
    const userId = String(req.session?.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return res.json(buildMySecuritySummary({ req, userId }));
  };

  const handleIdentityLinkStart = (req, res) => {
    setNoStore(res);
    return res.status(410).json({
      error: "legacy_identity_endpoint_removed",
      replacement: "better_auth_client",
    });
  };

  const rejectLegacyTotpEndpoint = (_req, res) => {
    setNoStore(res);
    return res.status(410).json({
      error: "legacy_totp_endpoint_removed",
      replacement: "better_auth_client",
    });
  };

  router.get("/api/me/preferences", requireAuth, requireNoPendingMfaEnrollment, (req, res) => {
    setNoStore(res);
    const userId = String(req.session?.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return res.json({ preferences: loadUserPreferences(userId) });
  });

  router.put("/api/me/preferences", requireAuth, requireNoPendingMfaEnrollment, (req, res) => {
    setNoStore(res);
    const userId = String(req.session?.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const incoming =
      isPlainObject(req.body) && isPlainObject(req.body.preferences)
        ? req.body.preferences
        : req.body;
    const normalized = normalizeUserPreferences(incoming);
    const encoded = Buffer.byteLength(JSON.stringify(normalized), "utf8");
    if (encoded > userPreferencesMaxBytes) {
      return res.status(413).json({ error: "payload_too_large" });
    }
    const saved = writeUserPreferences(userId, normalized);
    appendAuditLog(req, "users.preferences.update", "users", { userId });
    return res.json({ ok: true, preferences: saved });
  });

  router.get("/api/me/security", requireAuth, requireNoPendingMfaEnrollment, (req, res) => {
    setNoStore(res);
    const userId = String(req.session?.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return res.json(buildMySecuritySummary({ req, userId }));
  });

  router.get(
    "/api/me/security/identities",
    requireAuth,
    requireNoPendingMfaEnrollment,
    buildConnectedIdentitiesResponse,
  );

  router.get(
    "/api/me/security/identities/:provider/link/start",
    requireAuth,
    requireNoPendingMfaEnrollment,
    handleIdentityLinkStart,
  );

  router.delete(
    "/api/me/security/identities/:provider",
    requireAuth,
    requireNoPendingMfaEnrollment,
    handleIdentityUnlink,
  );

  router.post(
    "/api/me/security/totp/enroll/start",
    rejectLegacyTotpEndpoint,
  );

  router.post(
    "/api/me/security/totp/enroll/confirm",
    rejectLegacyTotpEndpoint,
  );

  router.post(
    "/api/me/security/totp/enroll/cancel",
    rejectLegacyTotpEndpoint,
  );

  router.post(
    "/api/me/security/totp/disable",
    rejectLegacyTotpEndpoint,
  );

  router.get("/api/me/sessions", requireAuth, requireNoPendingMfaEnrollment, async (req, res) => {
    setNoStore(res);
    const userId = String(req.session?.user?.id || "").trim();
    if (!userId) {
      return res.status(401).json({ error: "unauthorized" });
    }
    const currentSid = String(req.sessionID || "");
    const sessions = (await listActiveSessionsForUser(userId)).map((entry) => ({
      sid: entry.sid,
      createdAt: entry.createdAt || null,
      lastSeenAt: entry.lastSeenAt || null,
      lastIp: entry.lastIp || "",
      userAgent: entry.userAgent || "",
      current: String(entry.sid || "") === currentSid,
      isCurrent: String(entry.sid || "") === currentSid,
      revokedAt: entry.revokedAt || null,
      isPendingMfa: Boolean(entry.isPendingMfa),
    }));
    metricsRegistry.setGauge("active_sessions_total", {}, sessions.length);
    return res.json({ sessions });
  });

  router.delete(
    "/api/me/sessions/others",
    requireAuth,
    requireNoPendingMfaEnrollment,
    async (req, res) => {
      setNoStore(res);
      const userId = String(req.session?.user?.id || "").trim();
      const currentSid = String(req.sessionID || "");
      const sessions = (await listActiveSessionsForUser(userId)).filter(
        (entry) => String(entry.sid || "") !== currentSid,
      );
      await Promise.all(
        sessions.map((entry) =>
          revokeSessionBySid({
            sid: entry.sid,
            revokedBy: userId,
            revokeReason: "self_revoke_others",
          }),
        ),
      );
      appendAuditLog(req, "auth.sessions.revoke_others", "auth", {
        userId,
        count: sessions.length,
      });
      return res.json({ ok: true, revokedCount: sessions.length });
    },
  );

  router.delete(
    "/api/me/sessions/:sid",
    requireAuth,
    requireNoPendingMfaEnrollment,
    async (req, res) => {
      setNoStore(res);
      const userId = String(req.session?.user?.id || "").trim();
      const targetSid = String(req.params.sid || "").trim();
      const currentSid = String(req.sessionID || "");
      if (!targetSid) {
        return res.status(400).json({ error: "invalid_sid" });
      }
      if (targetSid === currentSid) {
        return res.status(400).json({ error: "cannot_revoke_current_session" });
      }
      const target = (await listActiveSessionsForUser(userId)).find(
        (entry) => String(entry.sid || "") === targetSid,
      );
      if (!target) {
        return res.status(404).json({ error: "session_not_found" });
      }
      await revokeSessionBySid({
        sid: targetSid,
        revokedBy: userId,
        revokeReason: "self_revoke_single",
      });
      appendAuditLog(req, "auth.sessions.revoke_single", "auth", {
        userId,
        sid: targetSid,
      });
      return res.json({ ok: true });
    },
  );

  app.use(router);
};

export default registerSelfServiceRoutes;
