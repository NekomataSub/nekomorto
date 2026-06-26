import { passkey } from "@better-auth/passkey";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { admin, twoFactor } from "better-auth/plugins";
import { prisma } from "./prisma-client.js";
import {
  AccessRole,
  defaultPermissionsForRole,
  normalizeAccessRole,
  sanitizePermissionsForStorage,
} from "./authz.js";
import { betterAuthAccessControl, betterAuthRoles } from "./better-auth-access.js";
import { oauthTwoFactorGate } from "./better-auth-oauth-2fa.js";
import { resolveBetterAuthOriginConfig } from "./better-auth-origin.js";

const { baseURL: appOrigin, trustedOrigins } = resolveBetterAuthOriginConfig({
  appOriginEnv: process.env.APP_ORIGIN,
  adminOriginsEnv: process.env.ADMIN_ORIGINS,
  isProduction: process.env.NODE_ENV === "production",
});
const authSecret = String(
  process.env.BETTER_AUTH_SECRET || process.env.SESSION_SECRET || "",
).trim();
const authAccessCache = new Map();
const ownerIdsFromEnv = String(process.env.OWNER_IDS || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const normalizeAuthPermissions = (permissions, { fallbackRole = AccessRole.NORMAL } = {}) => {
  const sanitized = sanitizePermissionsForStorage(permissions, {
    acceptLegacyStar: true,
    keepUnknown: false,
  });
  if (Array.isArray(permissions)) {
    return sanitized;
  }
  return defaultPermissionsForRole(fallbackRole);
};

const resolveOwnerRole = (userId, owners = []) => {
  const ownerIndex = owners.findIndex((entry) => String(entry.userId) === String(userId));
  if (ownerIndex === 0) {
    return AccessRole.OWNER_PRIMARY;
  }
  if (ownerIndex > 0) {
    return AccessRole.OWNER_SECONDARY;
  }
  return null;
};

const resolveAccessRoleForAuthUser = ({ userId, accessRole, owners = [] } = {}) => {
  const ownerRole = resolveOwnerRole(userId, owners);
  if (ownerRole) {
    return ownerRole;
  }
  const normalizedRole = normalizeAccessRole(accessRole, AccessRole.NORMAL);
  if (
    normalizedRole === AccessRole.OWNER_PRIMARY ||
    normalizedRole === AccessRole.OWNER_SECONDARY
  ) {
    return AccessRole.NORMAL;
  }
  return normalizedRole;
};

const toAuthAccessRecord = (entry) => {
  const accessRole = normalizeAccessRole(entry?.role, AccessRole.NORMAL);
  return {
    id: String(entry?.id || ""),
    accessRole,
    permissions: normalizeAuthPermissions(entry?.permissions, { fallbackRole: accessRole }),
  };
};

const setAuthAccessCacheRecord = (entry) => {
  const record = toAuthAccessRecord(entry);
  if (!record.id) {
    return null;
  }
  authAccessCache.set(record.id, record);
  return record;
};

const socialProviders = {};
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  socialProviders.discord = {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    disableImplicitSignUp: false,
  };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    disableImplicitSignUp: false,
  };
}

const findApprovedUserByEmail = async (email) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  const [allowed, storedOwners, users] = await Promise.all([
    prisma.allowedUserRecord.findMany({ select: { userId: true } }),
    prisma.ownerIdRecord.findMany({
      select: { userId: true, position: true },
      orderBy: { position: "asc" },
    }),
    prisma.userRecord.findMany({ select: { id: true, accessRole: true, data: true } }),
  ]);
  const owners = [
    ...ownerIdsFromEnv.map((userId, position) => ({ userId, position })),
    ...storedOwners
      .filter((entry) => !ownerIdsFromEnv.includes(String(entry.userId)))
      .map((entry, index) => ({
        ...entry,
        position: ownerIdsFromEnv.length + index,
      })),
  ];
  const approvedIds = new Set([...allowed, ...owners].map((entry) => String(entry.userId)));
  const matches = users.filter((entry) => {
    const storedEmail = String(entry.data?.email || "")
      .trim()
      .toLowerCase();
    return approvedIds.has(String(entry.id)) && storedEmail === normalizedEmail;
  });
  if (matches.length !== 1) {
    return null;
  }
  const resolvedRole = resolveAccessRoleForAuthUser({
    userId: matches[0].id,
    accessRole: matches[0].accessRole,
    owners,
  });
  return {
    ...matches[0],
    resolvedRole,
    resolvedPermissions: normalizeAuthPermissions(matches[0].data?.permissions, {
      fallbackRole: resolvedRole,
    }),
  };
};

export const auth = betterAuth({
  appName: "Nekomorto",
  baseURL: appOrigin,
  basePath: "/api/auth",
  secret: authSecret || "development-only-better-auth-secret-change-me",
  trustedOrigins,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: false },
  socialProviders,
  user: {
    modelName: "AuthUser",
    additionalFields: {
      permissions: {
        type: "string[]",
        required: false,
        input: false,
        defaultValue: [],
      },
    },
  },
  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  account: {
    modelName: "AuthAccount",
    accountLinking: {
      enabled: true,
      allowDifferentEmails: false,
    },
  },
  verification: {
    modelName: "AuthVerification",
    storeInDatabase: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const approved = await findApprovedUserByEmail(user.email);
          if (!approved) {
            return false;
          }
          return {
            data: {
              ...user,
              id: approved.id,
              role: approved.resolvedRole || "normal",
              permissions: approved.resolvedPermissions || [],
            },
          };
        },
      },
    },
  },
  plugins: [
    admin({
      ac: betterAuthAccessControl,
      roles: betterAuthRoles,
      defaultRole: "normal",
      adminRoles: ["admin", "owner_secondary", "owner_primary"],
    }),
    twoFactor({
      issuer: process.env.MFA_ISSUER || "Nekomorto",
      allowPasswordless: true,
      twoFactorTable: "AuthTwoFactor",
    }),
    passkey({
      rpID: new URL(appOrigin).hostname,
      rpName: "Nekomorto",
      origin: appOrigin,
      schema: { passkey: { modelName: "AuthPasskey" } },
    }),
    oauthTwoFactorGate(),
  ],
  advanced: {
    cookiePrefix: "nekomorto-auth",
    useSecureCookies: process.env.NODE_ENV === "production",
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  },
});

export const registerBetterAuthHandler = (app) => {
  app.all("/api/auth/*splat", toNodeHandler(auth));
};

const toLegacySessionUser = (user) => ({
  id: String(user.id),
  name: String(user.name || ""),
  username: String(user.name || user.email || user.id),
  email: user.email || null,
  avatarUrl: user.image || null,
  accessRole: normalizeAccessRole(user.role, AccessRole.NORMAL),
  permissions: normalizeAuthPermissions(user.permissions, { fallbackRole: user.role }),
});

const createRequestSessionShim = () => ({
  user: null,
  pendingMfaUser: null,
  pendingMfaEnrollmentUser: null,
  save: (callback) => {
    if (typeof callback === "function") callback(null);
  },
  destroy: (callback) => {
    if (typeof callback === "function") callback(null);
  },
  regenerate: (callback) => {
    if (typeof callback === "function") callback(null);
  },
});

export const buildBetterAuthMethods = async (userId) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return [];
  }
  const [accounts, passkeyCount] = await Promise.all([
    prisma.authAccount.findMany({
      where: { userId: normalizedUserId },
      select: { providerId: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.authPasskey.count({ where: { userId: normalizedUserId } }),
  ]);
  const methods = accounts.map((account) => ({
    provider: String(account.providerId || "")
      .trim()
      .toLowerCase(),
    linked: true,
    emailNormalized: null,
    emailVerified: false,
    hasPasskey: false,
    linkedAt: account.createdAt,
    lastUsedAt: account.updatedAt,
  }));
  return passkeyCount > 0
    ? [...methods, { provider: "passkey", linked: true, hasPasskey: true }]
    : methods;
};

export const refreshBetterAuthAccessCache = async () => {
  if (!prisma.authUser || typeof prisma.authUser.findMany !== "function") {
    return authAccessCache;
  }
  const users = await prisma.authUser.findMany({
    select: { id: true, role: true, permissions: true },
    orderBy: { createdAt: "asc" },
  });
  authAccessCache.clear();
  users.forEach(setAuthAccessCacheRecord);
  return authAccessCache;
};

export const getBetterAuthAccessRecord = (userId) => {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return null;
  }
  return authAccessCache.get(normalizedId) || null;
};

export const loadBetterAuthOwnerIds = () => {
  const records = [...authAccessCache.values()];
  const primary = records
    .filter((entry) => entry.accessRole === AccessRole.OWNER_PRIMARY)
    .map((entry) => entry.id);
  const secondary = records
    .filter((entry) => entry.accessRole === AccessRole.OWNER_SECONDARY)
    .map((entry) => entry.id);
  return [...primary, ...secondary];
};

export const primeBetterAuthAccessCacheFromUsers = ({ users = [], ownerIds = [] } = {}) => {
  const owners = (Array.isArray(ownerIds) ? ownerIds : []).map((userId, position) => ({
    userId: String(userId),
    position,
  }));
  (Array.isArray(users) ? users : []).forEach((user) => {
    const userId = String(user?.id || "").trim();
    if (!userId) {
      return;
    }
    const accessRole = resolveAccessRoleForAuthUser({
      userId,
      accessRole: user?.accessRole,
      owners,
    });
    setAuthAccessCacheRecord({
      id: userId,
      role: accessRole,
      permissions: user?.permissions || [],
    });
  });
};

export const updateBetterAuthUserAccess = async ({ userId, accessRole, permissions } = {}) => {
  const normalizedId = String(userId || "").trim();
  if (!normalizedId) {
    return false;
  }
  const normalizedRole = normalizeAccessRole(accessRole, AccessRole.NORMAL);
  const normalizedPermissions = normalizeAuthPermissions(permissions, {
    fallbackRole: normalizedRole,
  });
  if (!prisma.authUser || typeof prisma.authUser.updateMany !== "function") {
    setAuthAccessCacheRecord({
      id: normalizedId,
      role: normalizedRole,
      permissions: normalizedPermissions,
    });
    return false;
  }
  const result = await prisma.authUser.updateMany({
    where: { id: normalizedId },
    data: {
      role: normalizedRole,
      permissions: normalizedPermissions,
    },
  });
  if (result.count > 0) {
    setAuthAccessCacheRecord({
      id: normalizedId,
      role: normalizedRole,
      permissions: normalizedPermissions,
    });
  }
  return result.count > 0;
};

export const syncBetterAuthAccessFromUsers = async ({ users = [], ownerIds = [] } = {}) => {
  if (!prisma.authUser || typeof prisma.authUser.findMany !== "function") {
    primeBetterAuthAccessCacheFromUsers({ users, ownerIds });
    return authAccessCache;
  }
  const owners = (Array.isArray(ownerIds) ? ownerIds : []).map((userId, position) => ({
    userId: String(userId),
    position,
  }));
  const usersById = new Map(
    (Array.isArray(users) ? users : []).map((user) => [String(user?.id || ""), user]),
  );
  const authUsers = await prisma.authUser.findMany({
    select: { id: true, role: true, permissions: true },
    orderBy: { createdAt: "asc" },
  });
  await Promise.all(
    authUsers.map((authUser) => {
      const profileUser = usersById.get(String(authUser.id));
      const accessRole = resolveAccessRoleForAuthUser({
        userId: authUser.id,
        accessRole: profileUser?.accessRole || AccessRole.NORMAL,
        owners,
      });
      return updateBetterAuthUserAccess({
        userId: authUser.id,
        accessRole,
        permissions: Array.isArray(profileUser?.permissions) ? profileUser.permissions : [],
      });
    }),
  );
  return refreshBetterAuthAccessCache();
};

export const betterAuthSessionBridge = async (req, _res, next) => {
  if (!req.session) {
    req.session = createRequestSessionShim();
  }
  const cookieHeader = String(req.headers?.cookie || "");
  if (!cookieHeader.includes("nekomorto-auth.session_token=")) {
    req.betterAuthSession = null;
    req.sessionID = "";
    if (req.session.user || req.session.pendingMfaUser || req.session.pendingMfaEnrollmentUser) {
      req.session.user = null;
      req.session.pendingMfaUser = null;
      req.session.pendingMfaEnrollmentUser = null;
    }
    return next();
  }
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    req.betterAuthSession = session || null;
    req.sessionID = session?.session?.token ? String(session.session.token) : "";
    req.session.user = session?.user ? toLegacySessionUser(session.user) : null;
    req.session.pendingMfaUser = null;
    req.session.pendingMfaEnrollmentUser = null;
  } catch (error) {
    req.session.user = null;
    return next(error);
  }
  return next();
};

export const resetBetterAuthTotpForUser = async (userId) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { userFound: false, removedFactors: 0, revokedSessions: 0 };
  }
  const user = await prisma.authUser.findUnique({ where: { id: normalizedUserId } });
  if (!user) {
    return { userFound: false, removedFactors: 0, revokedSessions: 0 };
  }
  const [removedFactors, _updatedUser, revokedSessions] = await prisma.$transaction([
    prisma.authTwoFactor.deleteMany({ where: { userId: normalizedUserId } }),
    prisma.authUser.update({
      where: { id: normalizedUserId },
      data: { twoFactorEnabled: false },
    }),
    prisma.authSession.deleteMany({ where: { userId: normalizedUserId } }),
  ]);
  return {
    userFound: true,
    removedFactors: removedFactors.count,
    revokedSessions: revokedSessions.count,
  };
};

export const resetBetterAuthPasskeysForUser = async (userId) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    return { userFound: false, removedPasskeys: 0, revokedSessions: 0 };
  }
  const user = await prisma.authUser.findUnique({ where: { id: normalizedUserId } });
  if (!user) {
    return { userFound: false, removedPasskeys: 0, revokedSessions: 0 };
  }
  const [removedPasskeys, revokedSessions] = await prisma.$transaction([
    prisma.authPasskey.deleteMany({ where: { userId: normalizedUserId } }),
    prisma.authSession.deleteMany({ where: { userId: normalizedUserId } }),
  ]);
  return {
    userFound: true,
    removedPasskeys: removedPasskeys.count,
    revokedSessions: revokedSessions.count,
  };
};

const toSessionIndexRecord = (entry, { currentToken = "" } = {}) => ({
  sid: entry.token,
  userId: entry.userId,
  createdAt: entry.createdAt,
  lastSeenAt: entry.updatedAt,
  lastIp: entry.ipAddress || "",
  userAgent: entry.userAgent || "",
  revokedAt: null,
  revokedBy: null,
  revokeReason: null,
  isPendingMfa: false,
  current: currentToken ? entry.token === currentToken : false,
  currentForViewer: currentToken ? entry.token === currentToken : false,
});

export const loadBetterAuthSessionIndexRecords = async ({
  userId = null,
  includeRevoked = false,
} = {}) => {
  const normalizedUserId = String(userId || "").trim();
  const sessions = await prisma.authSession.findMany({
    where: {
      ...(normalizedUserId ? { userId: normalizedUserId } : {}),
      ...(includeRevoked ? {} : { expiresAt: { gt: new Date() } }),
    },
    orderBy: { updatedAt: "desc" },
  });
  return sessions.map((entry) => toSessionIndexRecord(entry));
};

export const listBetterAuthActiveSessionsForUser = async (userId) =>
  loadBetterAuthSessionIndexRecords({ userId, includeRevoked: false });

export const revokeBetterAuthSessionBySid = async ({ sid } = {}) => {
  const token = String(sid || "").trim();
  if (!token) {
    return false;
  }
  const result = await prisma.authSession.deleteMany({ where: { token } });
  return result.count > 0;
};

export const touchBetterAuthSessionIndexFromRequest = () => {};

const requireBetterAuthSession = (req, res, next) => {
  if (!req.betterAuthSession?.user?.id) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
};

export const registerBetterAuthCompatibilityRoutes = (app) => {
  const redirectLegacyAuthEntry = (_req, res) =>
    res.redirect(302, "/login?error=legacy_auth_removed");

  app.get("/auth/discord", redirectLegacyAuthEntry);
  app.get("/auth/google", redirectLegacyAuthEntry);
  app.get("/auth/google/callback", redirectLegacyAuthEntry);

  app.post("/api/logout", async (req, res, next) => {
    try {
      const response = await auth.handler(
        new Request(`${appOrigin}/api/auth/sign-out`, {
          method: "POST",
          headers: new Headers(req.headers),
        }),
      );
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie?.() || [];
      cookies.forEach((cookie) => res.append("Set-Cookie", cookie));
      const payload = await response.text();
      return res
        .status(response.status)
        .type("application/json")
        .send(payload || "{}");
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/me/security", requireBetterAuthSession, async (req, res, next) => {
    try {
      const userId = String(req.betterAuthSession.user.id);
      const [user, twoFactorRecord, sessions, accounts, passkeys] = await Promise.all([
        prisma.authUser.findUnique({ where: { id: userId } }),
        prisma.authTwoFactor.findFirst({ where: { userId } }),
        prisma.authSession.findMany({ where: { userId, expiresAt: { gt: new Date() } } }),
        prisma.authAccount.findMany({ where: { userId } }),
        prisma.authPasskey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
      ]);
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        totpEnabled: user?.twoFactorEnabled === true && Boolean(twoFactorRecord?.verified),
        recoveryCodesRemaining: 0,
        activeSessionsCount: sessions.length,
        issuer: process.env.MFA_ISSUER || "Nekomorto",
        accountLabel: user?.email || null,
        identities: accounts.map((account) => ({
          provider: account.providerId,
          linked: true,
          emailNormalized: user?.email || null,
          emailVerified: user?.emailVerified === true,
          linkedAt: account.createdAt,
          lastUsedAt: account.updatedAt,
          disabledAt: null,
        })),
        passkeys: passkeys.map((entry) => ({
          id: entry.id,
          name: entry.name || "Passkey",
          deviceType: entry.deviceType,
          backedUp: entry.backedUp,
          createdAt: entry.createdAt,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/me/sessions", requireBetterAuthSession, async (req, res, next) => {
    try {
      const sessions = await prisma.authSession.findMany({
        where: { userId: String(req.betterAuthSession.user.id), expiresAt: { gt: new Date() } },
        orderBy: { updatedAt: "desc" },
      });
      const currentToken = String(req.betterAuthSession.session?.token || "");
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        sessions: sessions.map((entry) => ({
          sid: entry.token,
          createdAt: entry.createdAt,
          lastSeenAt: entry.updatedAt,
          lastIp: entry.ipAddress,
          userAgent: entry.userAgent,
          current: entry.token === currentToken,
          revokedAt: null,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.delete("/api/me/sessions/others", requireBetterAuthSession, async (req, res, next) => {
    try {
      const token = String(req.betterAuthSession.session?.token || "");
      const result = await prisma.authSession.deleteMany({
        where: {
          userId: String(req.betterAuthSession.user.id),
          ...(token ? { token: { not: token } } : {}),
        },
      });
      return res.json({ ok: true, revoked: result.count });
    } catch (error) {
      return next(error);
    }
  });

  app.delete("/api/me/sessions/:sid", requireBetterAuthSession, async (req, res, next) => {
    try {
      const result = await prisma.authSession.deleteMany({
        where: {
          userId: String(req.betterAuthSession.user.id),
          token: String(req.params.sid || ""),
        },
      });
      return result.count ? res.json({ ok: true }) : res.status(404).json({ error: "not_found" });
    } catch (error) {
      return next(error);
    }
  });
};
