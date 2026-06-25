import { Router } from "express";
import { buildBetterAuthMethods } from "./better-auth-runtime.js";

const setNoStore = (res) => {
  res.setHeader("Cache-Control", "no-store");
};

const requireUserSessionOrPendingAuth = (req, res, next) => {
  if (
    req.session?.user ||
    req.session?.pendingMfaUser?.id ||
    req.session?.pendingMfaEnrollmentUser?.id
  ) {
    return next();
  }
  setNoStore(res);
  return res.status(401).json({ error: "unauthorized" });
};

const buildAuthMethods = (summary) => {
  const identities = Array.isArray(summary?.identities) ? summary.identities : [];
  const methods = identities.map((entry) => ({
    provider: String(entry?.provider || "")
      .trim()
      .toLowerCase(),
    linked: entry?.linked === true,
    emailNormalized: entry?.emailNormalized || null,
    emailVerified: entry?.emailVerified === true,
    hasPasskey: false,
  }));
  return summary?.passkeys?.count > 0
    ? [...methods, { provider: "passkey", linked: true, hasPasskey: true }]
    : methods;
};

const buildSessionUserPayload = ({ buildMySecuritySummary, buildUserPayload, user }) => {
  const base = buildUserPayload(user);
  if (!user?.id || typeof buildMySecuritySummary !== "function") {
    return base;
  }
  const securitySummary = buildMySecuritySummary(String(user.id));
  return {
    ...base,
    authMethods: buildAuthMethods(securitySummary),
  };
};

const buildBetterAuthSessionUserPayload = async ({ buildUserPayload, user }) => {
  const base = buildUserPayload(user);
  return {
    ...base,
    authMethods: await buildBetterAuthMethods(user?.id),
  };
};

const buildPendingSessionUserPayload = ({ buildMySecuritySummary, user }) => {
  const base = {
    id: user?.id,
    name: user?.name || "",
    username: user?.username || "",
    avatarUrl: user?.avatarUrl || null,
  };
  if (!user?.id || typeof buildMySecuritySummary !== "function") {
    return base;
  }
  const securitySummary = buildMySecuritySummary(String(user.id));
  return {
    ...base,
    authMethods: buildAuthMethods(securitySummary),
  };
};

export const registerSessionRoutes = ({
  app,
  apiContractVersion,
  buildApiContractV1Payload,
  buildMySecuritySummary,
  buildRuntimeMetadata,
  buildUserPayload,
  proxyDiscordAvatarRequest,
}) => {
  const router = Router();

  router.get("/api/me", requireUserSessionOrPendingAuth, async (req, res, next) => {
    setNoStore(res);
    if (!req.session?.user && req.session?.pendingMfaUser?.id) {
      return res.status(401).json({
        error: "mfa_required",
        pendingMfa: true,
        user: buildPendingSessionUserPayload({
          buildMySecuritySummary,
          user: req.session.pendingMfaUser,
        }),
      });
    }
    if (!req.session?.user && req.session?.pendingMfaEnrollmentUser?.id) {
      return res.status(401).json({
        error: "mfa_enrollment_required",
        pendingMfaEnrollment: true,
        user: buildPendingSessionUserPayload({
          buildMySecuritySummary,
          user: req.session.pendingMfaEnrollmentUser,
        }),
      });
    }

    try {
      if (req.betterAuthSession?.user?.id) {
        return res.json(
          await buildBetterAuthSessionUserPayload({
            buildUserPayload,
            user: req.session.user,
          }),
        );
      }
      return res.json(
        buildSessionUserPayload({
          buildMySecuritySummary,
          buildUserPayload,
          user: req.session.user,
        }),
      );
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/public/me", async (req, res, next) => {
    setNoStore(res);
    if (!req.session?.user) {
      return res.json({
        user: null,
        pendingMfa: Boolean(req.session?.pendingMfaUser?.id),
        pendingMfaEnrollment: Boolean(req.session?.pendingMfaEnrollmentUser?.id),
      });
    }

    try {
      if (req.betterAuthSession?.user?.id) {
        return res.json({
          user: await buildBetterAuthSessionUserPayload({
            buildUserPayload,
            user: req.session.user,
          }),
        });
      }
      return res.json({
        user: buildSessionUserPayload({
          buildMySecuritySummary,
          buildUserPayload,
          user: req.session.user,
        }),
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/api/public/discord-avatar/:userId/:avatarFile", async (req, res) => {
    const result = await proxyDiscordAvatarRequest({
      userId: req.params.userId,
      avatarFile: req.params.avatarFile,
      size: req.query.size,
    });

    if (!result.ok) {
      setNoStore(res);
      return res.status(result.status).end();
    }

    res.setHeader("Cache-Control", result.cacheControl);
    res.setHeader("Content-Length", String(result.body.length));
    return res.status(200).type(result.contentType).send(result.body);
  });

  router.get("/api/version", (_req, res) => {
    setNoStore(res);
    return res.json({
      apiVersion: apiContractVersion,
      contractUrl: `/api/contracts/${apiContractVersion}.json`,
      build: buildRuntimeMetadata(),
    });
  });

  router.get("/api/contracts", (_req, res) => {
    setNoStore(res);
    return res.json({
      versions: [apiContractVersion],
      latest: apiContractVersion,
      links: {
        [apiContractVersion]: `/api/contracts/${apiContractVersion}.json`,
      },
    });
  });

  router.get(["/api/contracts/v1", "/api/contracts/v1.json"], (_req, res) => {
    setNoStore(res);
    return res.json(buildApiContractV1Payload());
  });

  app.use(router);
};
