import { describe, expect, it, vi } from "vitest";

import { registerAuthRoutes } from "../../server/lib/register-auth-routes.js";

const createAppCapture = () => {
  const routers: any[] = [];
  return {
    app: {
      use: (router: unknown) => {
        routers.push(router);
      },
    },
    getRouter: () => routers[0],
  };
};

const getRouteLayer = (router: any, method: string, path: string) =>
  router?.stack?.find(
    (layer: any) =>
      layer?.route?.path === path &&
      Boolean(layer.route.methods?.[String(method || "").toLowerCase()]),
  ) || null;

const createResponse = () => ({
  body: null as unknown,
  clearedCookies: [] as Array<{ name: string; options: Record<string, unknown> }>,
  headers: new Map<string, string>(),
  locals: {} as Record<string, unknown>,
  nextArgs: [] as unknown[],
  redirectUrl: "",
  statusCode: 200,
  clearCookie(name: string, options: Record<string, unknown>) {
    this.clearedCookies.push({ name, options });
    return this;
  },
  json(payload: unknown) {
    this.body = payload;
    return this;
  },
  redirect(target: string) {
    this.redirectUrl = target;
    return this;
  },
  setHeader(name: string, value: unknown) {
    this.headers.set(String(name).toLowerCase(), String(value));
    return this;
  },
  status(code: number) {
    this.statusCode = Number(code);
    return this;
  },
});

const invokeHandlers = async (
  handlers: Array<(...args: any[]) => unknown>,
  req: Record<string, unknown>,
) => {
  const res = createResponse();
  let index = 0;
  let nextChain: Promise<unknown> | null = null;
  const runHandler = async (arg?: unknown) => {
    if (arg !== undefined) {
      res.nextArgs.push(arg);
    }
    if (arg === "route" || arg === "router") {
      return;
    }
    const handler = handlers[index];
    index += 1;
    if (!handler) {
      return;
    }
    return handler(req, res, next);
  };
  const next = async (arg?: unknown) => {
    const p = runHandler(arg);
    nextChain = p;
    return p;
  };
  await runHandler();
  await nextChain;
  return res;
};

const invokeRoute = async (routeLayer: any, req: Record<string, unknown>) => {
  const handlers = Array.isArray(routeLayer?.route?.stack)
    ? routeLayer.route.stack.map((entry: any) => entry.handle)
    : [];
  return invokeHandlers(handlers, req);
};

const getRouteHandlerNames = (routeLayer: any) =>
  Array.isArray(routeLayer?.route?.stack)
    ? routeLayer.route.stack.map((entry: any) => entry.handle?.name || "<anonymous>")
    : [];

const createDependencies = (overrides: Record<string, unknown> = {}) => {
  const { app, getRouter } = createAppCapture();
  const appendAuditLog = vi.fn();
  const metricsRegistry = { inc: vi.fn() };
  const sessionIndexTouchTsBySid = new Map<string, string>();

  registerAuthRoutes({
    app,
    appendAuditLog,
    buildAuthRedirectUrl: vi.fn(({ appOrigin, path }) => `${appOrigin}${path}`),
    canAttemptAuth: vi.fn(async () => true),
    canVerifyMfa: vi.fn(async () => true),
    createDiscordAvatarUrl: vi.fn(() => "https://cdn.discordapp.com/avatars/user/hash.png"),
    discordApi: "https://discord.com/api",
    discordClientId: "client-id",
    discordClientSecret: "client-secret",
    googleClientId: "google-client-id",
    googleClientSecret: "google-client-secret",
    googleTokenApi: "https://oauth2.googleapis.com/token",
    googleUserinfoApi: "https://openidconnect.googleapis.com/v1/userinfo",
    googleScopes: ["openid", "email", "profile"],
    ensureOwnerUser: vi.fn(),
    establishAuthenticatedSession: vi.fn(async () => undefined),
    findUserIdentityRecord: vi.fn(() => null),
    findUserIdentityRecordsByEmail: vi.fn(() => []),
    flushPersistQueue: vi.fn(async () => {}),
    getRequestIp: vi.fn(() => "203.0.113.5"),
    loadOwnerIds: vi.fn(() => []),
    loadUserIdentityRecords: vi.fn(() => []),
    revokeSessionBySid: vi.fn(async () => undefined),
    writeAllowedUsers: vi.fn(),
    writeOwnerIds: vi.fn(),
    writeUserIdentityRecords: vi.fn(),
    writeUsers: vi.fn(),
    isTotpEnabledForUser: vi.fn(() => false),
    handleAuthFailureSecuritySignals: vi.fn(),
    handleMfaFailureSecuritySignals: vi.fn(),
    isAllowedOrigin: vi.fn(() => true),
    loadAllowedUsers: vi.fn(() => ["user-1"]),
    loadUsers: vi.fn(() => []),
    markMfaEnrollmentRequiredForSession: vi.fn(),
    metricsRegistry,
    maybeEmitExcessiveSessionsEvent: vi.fn(),
    maybeEmitNewNetworkLoginEvent: vi.fn(),
    primaryAppOrigin: "https://example.com",
    resolveAuthAppOrigin: vi.fn(() => "https://example.com"),
    resolveDiscordRedirectUri: vi.fn(() => "https://example.com/login"),
    resolveGoogleRedirectUri: vi.fn(() => "https://example.com/auth/google/callback"),
    revokeUserSessionIndexRecord: vi.fn(),
    saveSessionState: vi.fn(async () => undefined),
    scopes: ["identify"],
    sessionCookieConfig: {
      name: "__Host-rainbow.sid",
      cookie: {
        httpOnly: true,
        maxAge: 123,
        path: "/",
        priority: "high",
        sameSite: "lax",
        secure: true,
      },
    },
    sessionIndexTouchTsBySid,
    shouldRequireTotpEnrollmentForPasswordLogin: vi.fn(() => false),
    syncPersistedDiscordAvatarForLogin: vi.fn(),
    upsertUserIdentityRecord: vi.fn(),
    updateSessionIndexFromRequest: vi.fn(),
    verifyTotpOrRecoveryCode: vi.fn(() => ({ method: "totp", ok: true })),
    ...overrides,
  });

  return {
    appendAuditLog,
    metricsRegistry,
    router: getRouter(),
    sessionIndexTouchTsBySid,
    ...overrides,
  };
};

describe("registerAuthRoutes", () => {
  it("rate limits Discord auth before generating oauth state", async () => {
    const canAttemptAuth = vi.fn(async () => false);
    const saveSessionState = vi.fn(async () => undefined);
    const dependencies = createDependencies({
      canAttemptAuth,
      saveSessionState,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/discord");
    expect(getRouteHandlerNames(routeLayer)).toEqual([
      "<anonymous>",
      "enforceDiscordAuthAttemptRateLimit",
      "handleDiscordAuthStart",
    ]);
    const req = {
      query: {
        next: "/dashboard",
      },
      session: {},
    };

    const res = await invokeRoute(routeLayer, req);

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "rate_limited" });
    expect(canAttemptAuth).toHaveBeenCalledWith("203.0.113.5");
    expect(saveSessionState).not.toHaveBeenCalled();
    expect(req.session).not.toHaveProperty("oauthState");
  });

  it("skips the oauth callback limiter when /login has no callback params", async () => {
    const canAttemptAuth = vi.fn(async () => false);
    const dependencies = createDependencies({
      canAttemptAuth,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/login");
    expect(getRouteHandlerNames(routeLayer)).toEqual([
      "requireOAuthCallbackParams",
      "<anonymous>",
      "enforceLoginCallbackAuthAttemptRateLimit",
      "prepareLoginCallbackContext",
      "handleLoginOAuthCallback",
    ]);

    const res = await invokeRoute(routeLayer, {
      query: {},
      session: {},
    });

    expect(res.nextArgs).toEqual(["route"]);
    expect(canAttemptAuth).not.toHaveBeenCalled();
  });

  it("rate limits the oauth callback before contacting Discord", async () => {
    const canAttemptAuth = vi.fn(async () => false);
    const resolveDiscordRedirectUri = vi.fn(() => "https://example.com/login");
    const dependencies = createDependencies({
      canAttemptAuth,
      resolveDiscordRedirectUri,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/login");

    const res = await invokeRoute(routeLayer, {
      query: {
        code: "discord-code",
        state: "oauth-state",
      },
      session: {
        loginAppOrigin: "https://example.com",
        oauthState: "oauth-state",
      },
    });

    expect(res.redirectUrl).toBe("https://example.com/login");
    expect(canAttemptAuth).toHaveBeenCalledWith("203.0.113.5");
    expect(resolveDiscordRedirectUri).not.toHaveBeenCalled();
    expect(dependencies.appendAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      "auth.login.rate_limited",
      "auth",
      {},
    );
  });

  it("rate limits MFA verification before code validation", async () => {
    const canVerifyMfa = vi.fn(async () => false);
    const verifyTotpOrRecoveryCode = vi.fn();
    const dependencies = createDependencies({
      canVerifyMfa,
      verifyTotpOrRecoveryCode,
    });
    const routeLayer = getRouteLayer(dependencies.router, "post", "/api/auth/mfa/verify");
    expect(getRouteHandlerNames(routeLayer)).toEqual([
      "<anonymous>",
      "attachPendingMfaUser",
      "enforcePendingMfaVerifyRateLimit",
      "handlePendingMfaVerification",
    ]);

    const res = await invokeRoute(routeLayer, {
      body: { code: "123456" },
      session: {
        pendingMfaUser: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "rate_limited" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(canVerifyMfa).toHaveBeenCalledWith("203.0.113.5");
    expect(verifyTotpOrRecoveryCode).not.toHaveBeenCalled();
    expect(dependencies.metricsRegistry.inc).toHaveBeenCalledWith("auth_mfa_verify_total", {
      status: "rate_limited",
    });
    expect(dependencies.appendAuditLog).toHaveBeenCalledWith(
      expect.any(Object),
      "auth.mfa.rate_limited",
      "auth",
      expect.objectContaining({
        action: "verify",
        userId: "user-1",
      }),
    );
  });

  it("rejects MFA verification before the handler when no pending session exists", async () => {
    const canVerifyMfa = vi.fn(async () => true);
    const verifyTotpOrRecoveryCode = vi.fn();
    const dependencies = createDependencies({
      canVerifyMfa,
      verifyTotpOrRecoveryCode,
    });
    const routeLayer = getRouteLayer(dependencies.router, "post", "/api/auth/mfa/verify");

    const res = await invokeRoute(routeLayer, {
      body: { code: "123456" },
      session: {},
    });

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "mfa_not_pending" });
    expect(canVerifyMfa).not.toHaveBeenCalled();
    expect(verifyTotpOrRecoveryCode).not.toHaveBeenCalled();
  });

  it("returns gone for password login because the flow is disabled", async () => {
    const findUserLocalAuthRecordByIdentifier = vi.fn();
    const dependencies = createDependencies({
      findUserLocalAuthRecordByIdentifier,
    });
    const routeLayer = getRouteLayer(dependencies.router, "post", "/auth/password/login");
    expect(routeLayer).toBeTruthy();

    const res = await invokeRoute(routeLayer, {
      body: {
        identifier: "user@example.com",
        password: "wrong-password",
      },
      session: {},
    });

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({ error: "password_login_disabled" });
    expect(findUserLocalAuthRecordByIdentifier).not.toHaveBeenCalled();
  });

  it("returns gone for password login even when the identifier looks valid", async () => {
    const findUserLocalAuthRecordByIdentifier = vi.fn();
    const dependencies = createDependencies({
      findUserLocalAuthRecordByIdentifier,
    });
    const routeLayer = getRouteLayer(dependencies.router, "post", "/auth/password/login");

    const res = await invokeRoute(routeLayer, {
      body: {
        identifier: "userone",
        password: "secret-123",
      },
      session: {},
    });

    expect(res.statusCode).toBe(410);
    expect(res.body).toEqual({ error: "password_login_disabled" });
    expect(findUserLocalAuthRecordByIdentifier).not.toHaveBeenCalled();
  });

  it("starts Google auth with the resolved callback URI", async () => {
    const saveSessionState = vi.fn(async () => undefined);
    const resolveGoogleRedirectUri = vi.fn(() => "https://example.com/auth/google/callback");
    const dependencies = createDependencies({
      resolveGoogleRedirectUri,
      saveSessionState,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google");

    const res = await invokeRoute(routeLayer, {
      query: {
        next: "/dashboard",
      },
      session: {},
    });

    expect(resolveGoogleRedirectUri).toHaveBeenCalled();
    expect(saveSessionState).toHaveBeenCalled();
    expect(res.redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(res.redirectUrl).toContain(
      encodeURIComponent("https://example.com/auth/google/callback"),
    );
  });

  it("persists the resolved Google redirect URI in session before redirecting", async () => {
    const resolveGoogleRedirectUri = vi.fn(() => "https://example.com/auth/google/callback");
    const dependencies = createDependencies({
      resolveGoogleRedirectUri,
      saveSessionState: vi.fn(async () => undefined),
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google");
    const req = {
      query: {
        next: "/dashboard",
      },
      session: {} as Record<string, unknown>,
    };

    const res = await invokeRoute(routeLayer, req);

    expect(res.redirectUrl).toContain("https://accounts.google.com/o/oauth2/v2/auth?");
    expect(req.session.googleRedirectUri).toBe("https://example.com/auth/google/callback");
  });

  it("uses the session Google redirect URI during token exchange", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "google-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google-sub-1",
          email: "user@example.com",
          email_verified: true,
          name: "User One",
          picture: "https://example.com/avatar.png",
        }),
      });
    const dependencies = createDependencies({
      findUserIdentityRecord: vi.fn(() => ({
        id: "google:google-sub-1",
        userId: "user-1",
        provider: "google",
        providerSubject: "google-sub-1",
        emailNormalized: "user@example.com",
        data: {},
        linkedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
      loadUsers: vi.fn(() => [
        {
          id: "user-1",
          name: "User One",
          username: "userone",
          email: "user@example.com",
        },
      ]),
      upsertUserIdentityRecord: vi.fn(),
      resolveGoogleRedirectUri: vi.fn(() => "https://fallback.example.com/auth/google/callback"),
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google/callback");

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const res = await invokeRoute(routeLayer, {
      query: { code: "google-code", state: "google-state" },
      session: {
        googleOauthState: "google-state",
        googleRedirectUri: "https://example.com/auth/google/callback",
        loginNext: "/dashboard",
        loginAppOrigin: "https://example.com",
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });

    expect(fetchMock.mock.calls[0]?.[1]?.body?.toString()).toContain(
      "redirect_uri=https%3A%2F%2Fexample.com%2Fauth%2Fgoogle%2Fcallback",
    );
    expect(res.statusCode).toBe(200);
  });

  it("uses user_identities to resolve Google callback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "google-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google-sub-1",
          email: "user@example.com",
          email_verified: true,
          name: "User One",
          picture: "https://example.com/avatar.png",
        }),
      });
    const findUserIdentityRecord = vi.fn(() => ({
      id: "google:google-sub-1",
      userId: "user-1",
      provider: "google",
      providerSubject: "google-sub-1",
      emailNormalized: "user@example.com",
      data: {},
      linkedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    const loadUsers = vi.fn(() => [
      {
        id: "user-1",
        name: "User One",
        username: "userone",
        email: "user@example.com",
      },
    ]);
    const upsertUserIdentityRecord = vi.fn();
    const dependencies = createDependencies({
      findUserIdentityRecord,
      loadUsers,
      upsertUserIdentityRecord,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google/callback");

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const req = {
      query: { code: "google-code", state: "google-state" },
      session: {
        googleOauthState: "google-state",
        googleRedirectUri: "https://example.com/auth/google/callback",
        loginNext: "/dashboard",
        loginAppOrigin: "https://example.com",
      },
    };

    const res = await invokeRoute(routeLayer, req as Record<string, unknown>);

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });

    expect(findUserIdentityRecord).toHaveBeenCalledWith("google", "google-sub-1");
    expect(upsertUserIdentityRecord).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("rejects Google callback when email is not verified", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "google-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google-sub-1",
          email: "user@example.com",
          email_verified: false,
          name: "User One",
        }),
      });
    const findUserIdentityRecord = vi.fn(() => ({
      id: "google:google-sub-1",
      userId: "user-1",
      provider: "google",
      providerSubject: "google-sub-1",
    }));
    const dependencies = createDependencies({
      findUserIdentityRecord,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google/callback");

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const res = await invokeRoute(routeLayer, {
      query: { code: "google-code", state: "google-state" },
      session: {
        googleOauthState: "google-state",
        googleRedirectUri: "https://example.com/auth/google/callback",
        loginAppOrigin: "https://example.com",
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });

    expect(res.redirectUrl).toBe("https://example.com/login");
  });

  it("uses user_identities to resolve Discord callback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token_type: "Bearer", access_token: "discord-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "discord-user-1",
          username: "userone",
          global_name: "User One",
          email: "user@example.com",
          verified: true,
        }),
      });
    const findUserIdentityRecord = vi.fn(() => ({
      id: "discord:discord-user-1",
      userId: "user-1",
      provider: "discord",
      providerSubject: "discord-user-1",
      emailNormalized: "user@example.com",
      data: {},
      linkedAt: "2026-01-01T00:00:00.000Z",
      createdAt: "2026-01-01T00:00:00.000Z",
    }));
    const loadUsers = vi.fn(() => [
      {
        id: "user-1",
        name: "User One",
        username: "userone",
        email: "user@example.com",
      },
    ]);
    const upsertUserIdentityRecord = vi.fn();
    const dependencies = createDependencies({
      findUserIdentityRecord,
      loadAllowedUsers: vi.fn(() => ["user-1"]),
      loadUsers,
      upsertUserIdentityRecord,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/login");

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const res = await invokeRoute(routeLayer, {
      query: { code: "discord-code", state: "oauth-state" },
      session: {
        oauthState: "oauth-state",
        discordRedirectUri: "https://example.com/login",
        loginNext: "/dashboard",
        loginAppOrigin: "https://example.com",
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });

    expect(findUserIdentityRecord).toHaveBeenCalledWith("discord", "discord-user-1");
    expect(upsertUserIdentityRecord).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it("rejects Discord callback when identity is missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token_type: "Bearer", access_token: "discord-token" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "discord-user-1", username: "userone" }),
      });
    const dependencies = createDependencies({
      findUserIdentityRecord: vi.fn(() => null),
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/login");

    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: fetchMock,
    });

    const res = await invokeRoute(routeLayer, {
      query: { code: "discord-code", state: "oauth-state" },
      session: {
        oauthState: "oauth-state",
        discordRedirectUri: "https://example.com/login",
        loginAppOrigin: "https://example.com",
        destroy: vi.fn((callback?: () => void) => callback?.()),
      },
    });

    Object.defineProperty(globalThis, "fetch", {
      configurable: true,
      value: originalFetch,
    });

    expect(res.redirectUrl).toBe("https://example.com/login");
  });

  it("auto-links Google verified email only to a unique preprovisioned user", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "google-token" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google-sub-unique",
          email: "User@Example.com",
          email_verified: true,
          name: "User One",
        }),
      });
    const upsertUserIdentityRecord = vi.fn();
    const dependencies = createDependencies({
      findUserIdentityRecord: vi.fn(() => null),
      findUserIdentityRecordsByEmail: vi.fn(() => []),
      loadUsers: vi.fn(() => [{ id: "user-1", name: "User One", email: "user@example.com" }]),
      upsertUserIdentityRecord,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google/callback");
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const res = await invokeRoute(routeLayer, {
      query: { code: "google-code", state: "google-state" },
      session: {
        googleOauthState: "google-state",
        googleRedirectUri: "https://example.com/auth/google/callback",
        loginAppOrigin: "https://example.com",
      },
    });

    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });

    expect(res.statusCode).toBe(200);
    expect(upsertUserIdentityRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        provider: "google",
        providerSubject: "google-sub-unique",
        emailNormalized: "user@example.com",
        emailVerified: true,
      }),
    );
  });

  it("blocks Google verified email when multiple stored users match", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "google-token" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google-sub-ambiguous",
          email: "user@example.com",
          email_verified: true,
          name: "User One",
        }),
      });
    const upsertUserIdentityRecord = vi.fn();
    const dependencies = createDependencies({
      findUserIdentityRecord: vi.fn(() => null),
      loadUsers: vi.fn(() => [
        { id: "user-1", name: "User One", email: "user@example.com" },
        { id: "user-2", name: "User Two", email: "USER@example.com" },
      ]),
      upsertUserIdentityRecord,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google/callback");
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const res = await invokeRoute(routeLayer, {
      query: { code: "google-code", state: "google-state" },
      session: {
        googleOauthState: "google-state",
        googleRedirectUri: "https://example.com/auth/google/callback",
        loginAppOrigin: "https://example.com",
        destroy: vi.fn((callback?: () => void) => callback?.()),
      },
    });

    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });

    expect(res.redirectUrl).toBe("https://example.com/login");
    expect(upsertUserIdentityRecord).not.toHaveBeenCalled();
    expect(dependencies.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      "auth.identity.blocked",
      "auth",
      expect.objectContaining({ reason: "ambiguous_candidate", candidateCount: 2 }),
    );
  });

  it("blocks disabled provider identities", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "google-token" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sub: "google-sub-disabled",
          email: "user@example.com",
          email_verified: true,
          name: "User One",
        }),
      });
    const upsertUserIdentityRecord = vi.fn();
    const dependencies = createDependencies({
      findUserIdentityRecord: vi.fn(() => ({
        id: "google:google-sub-disabled",
        userId: "user-1",
        provider: "google",
        providerSubject: "google-sub-disabled",
        disabledAt: "2026-01-01T00:00:00.000Z",
      })),
      loadUsers: vi.fn(() => [{ id: "user-1", name: "User One", email: "user@example.com" }]),
      upsertUserIdentityRecord,
    });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/auth/google/callback");
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "fetch", { configurable: true, value: fetchMock });

    const res = await invokeRoute(routeLayer, {
      query: { code: "google-code", state: "google-state" },
      session: {
        googleOauthState: "google-state",
        googleRedirectUri: "https://example.com/auth/google/callback",
        loginAppOrigin: "https://example.com",
        destroy: vi.fn((callback?: () => void) => callback?.()),
      },
    });

    Object.defineProperty(globalThis, "fetch", { configurable: true, value: originalFetch });

    expect(res.redirectUrl).toBe("https://example.com/login");
    expect(upsertUserIdentityRecord).not.toHaveBeenCalled();
    expect(dependencies.appendAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      "auth.identity.blocked",
      "auth",
      expect.objectContaining({ reason: "disabled_identity", existingIdentityUserId: "user-1" }),
    );
  });

  it("clears the session cookie with the same secure attributes on logout", async () => {
    const revokeUserSessionIndexRecord = vi.fn();
    const dependencies = createDependencies({
      revokeUserSessionIndexRecord,
    });
    dependencies.sessionIndexTouchTsBySid.set("sid-1", "seen");
    const routeLayer = getRouteLayer(dependencies.router, "post", "/api/logout");
    const destroy = vi.fn((callback?: () => void) => callback?.());

    const res = await invokeRoute(routeLayer, {
      session: {
        destroy,
        pendingMfaUser: null,
        user: {
          id: "user-1",
        },
      },
      sessionID: "sid-1",
    });

    expect(destroy).toHaveBeenCalled();
    expect(revokeUserSessionIndexRecord).toHaveBeenCalledWith("sid-1", {
      revokedBy: "user-1",
      revokeReason: "logout",
    });
    expect(dependencies.sessionIndexTouchTsBySid.has("sid-1")).toBe(false);
    expect(res.clearedCookies).toEqual([
      {
        name: "__Host-rainbow.sid",
        options: {
          httpOnly: true,
          path: "/",
          priority: "high",
          sameSite: "lax",
          secure: true,
        },
      },
    ]);
    expect(res.body).toEqual({ ok: true });
  });
});
