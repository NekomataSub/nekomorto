import { passkey } from "@better-auth/passkey";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { admin, twoFactor } from "better-auth/plugins";
import { prisma } from "./prisma-client.js";
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
  const [allowed, owners, users] = await Promise.all([
    prisma.allowedUserRecord.findMany({ select: { userId: true } }),
    prisma.ownerIdRecord.findMany({
      select: { userId: true, position: true },
      orderBy: { position: "asc" },
    }),
    prisma.userRecord.findMany({ select: { id: true, accessRole: true, data: true } }),
  ]);
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
  const ownerIndex = owners.findIndex((entry) => String(entry.userId) === String(matches[0].id));
  return {
    ...matches[0],
    resolvedRole:
      ownerIndex === 0
        ? "owner_primary"
        : ownerIndex > 0
          ? "owner_secondary"
          : matches[0].accessRole,
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
  user: { modelName: "AuthUser" },
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
});

export const betterAuthSessionBridge = async (req, _res, next) => {
  if (!req.session) {
    return next();
  }
  const cookieHeader = String(req.headers?.cookie || "");
  if (!cookieHeader.includes("nekomorto-auth.session_token=")) {
    req.betterAuthSession = null;
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

const requireBetterAuthSession = (req, res, next) => {
  if (!req.betterAuthSession?.user?.id) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
};

export const registerBetterAuthCompatibilityRoutes = (app) => {
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
        prisma.authSession.findMany({ where: { userId } }),
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
        where: { userId: String(req.betterAuthSession.user.id) },
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
