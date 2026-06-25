import { describe, expect, it, vi } from "vitest";

import { registerSelfServiceRoutes } from "../../server/lib/register-self-service-routes.js";

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
  headers: new Map<string, string>(),
  locals: {} as Record<string, unknown>,
  statusCode: 200,
  json(payload: unknown) {
    this.body = payload;
    return this;
  },
  redirect(target: string) {
    this.body = { redirect: target };
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
  const dispatch = async (index: number): Promise<void> => {
    const handler = handlers[index];
    if (!handler) {
      return;
    }
    let nextPromise = Promise.resolve();
    const next = async () => {
      nextPromise = dispatch(index + 1);
      return nextPromise;
    };
    await handler(req, res, next);
    await nextPromise;
  };
  await dispatch(0);
  return res;
};

const invokeRoute = async (routeLayer: any, req: Record<string, unknown>) => {
  const handlers = Array.isArray(routeLayer?.route?.stack)
    ? routeLayer.route.stack.map((entry: any) => entry.handle)
    : [];
  return invokeHandlers(handlers, req);
};

const createDependencies = (overrides: Record<string, unknown> = {}) => {
  const { app, getRouter } = createAppCapture();
  const appendAuditLog = vi.fn();
  const metricsRegistry = { inc: vi.fn(), setGauge: vi.fn() };
  const requireAuth = vi.fn(async (_req, _res, next) => await next?.());

  registerSelfServiceRoutes({
    app,
    appendAuditLog,
    buildMySecuritySummary: vi.fn(() => ({
      totpEnabled: false,
      recoveryCodesRemaining: 0,
      activeSessionsCount: 0,
      oauthEmailSuggested: "user@example.com",
      identities: [],
    })),
    getPendingMfaEnrollmentState: vi.fn(() => ({
      pending: false,
      user: null,
      redirectTarget: "/dashboard",
    })),
    isPlainObject: vi.fn((value) => value && typeof value === "object" && !Array.isArray(value)),
    listActiveSessionsForUser: vi.fn(() => []),
    loadUserIdentityRecords: vi.fn(() => []),
    loadUserPreferences: vi.fn(() => ({})),
    metricsRegistry,
    normalizeUserPreferences: vi.fn((value) => value || {}),
    requireAuth,
    revokeSessionBySid: vi.fn(async () => undefined),
    userPreferencesMaxBytes: 1024,
    writeUserIdentityRecords: vi.fn(),
    writeUserPreferences: vi.fn((userId, value) => ({ userId, ...value })),
    upsertUserIdentityRecord: vi.fn(),
    ...overrides,
  });

  return {
    appendAuditLog,
    metricsRegistry,
    requireAuth,
    router: getRouter(),
    ...overrides,
  };
};

describe("registerSelfServiceRoutes", () => {
  it("expõe o resumo de segurança sem depender de local auth", async () => {
    const buildMySecuritySummary = vi.fn(() => ({
      totpEnabled: false,
      recoveryCodesRemaining: 0,
      activeSessionsCount: 2,
      oauthEmailSuggested: "user@example.com",
      identities: [],
    }));
    const dependencies = createDependencies({ buildMySecuritySummary });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/api/me/security");

    const res = await invokeRoute(routeLayer, {
      session: { user: { id: "user-1" } },
    });

    expect(res.statusCode).toBe(200);
    expect(buildMySecuritySummary).toHaveBeenCalledWith({
      req: expect.any(Object),
      userId: "user-1",
    });
    expect(res.body).toMatchObject({
      totpEnabled: false,
      activeSessionsCount: 2,
      oauthEmailSuggested: "user@example.com",
    });
  });

  it("rejeita o enrollment legado de TOTP", async () => {
    const dependencies = createDependencies();
    const routeLayer = getRouteLayer(
      dependencies.router,
      "post",
      "/api/me/security/totp/enroll/start",
    );

    const res = await invokeRoute(routeLayer, {
      body: {},
      session: { user: { id: "user-1", username: "admin" } },
    });

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({
      error: "legacy_totp_endpoint_removed",
      replacement: "better_auth_client",
    });
  });

  it("rejeita a confirmação legada de enrollment de TOTP", async () => {
    const dependencies = createDependencies();
    const routeLayer = getRouteLayer(
      dependencies.router,
      "post",
      "/api/me/security/totp/enroll/confirm",
    );

    const res = await invokeRoute(routeLayer, {
      body: {
        code: "123456",
        enrollmentToken: "token-1",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({
      error: "legacy_totp_endpoint_removed",
      replacement: "better_auth_client",
    });
  });

  it("rejeita a desativação legada de TOTP", async () => {
    const dependencies = createDependencies();
    const routeLayer = getRouteLayer(dependencies.router, "post", "/api/me/security/totp/disable");

    const res = await invokeRoute(routeLayer, {
      body: { code: "123456" },
      session: { user: { id: "user-1" } },
    });

    expect(res.statusCode).toBe(410);
    expect(res.body).toMatchObject({
      error: "legacy_totp_endpoint_removed",
      replacement: "better_auth_client",
    });
  });

  it("lista sessões ativas", async () => {
    const listActiveSessionsForUser = vi.fn(() => [
      {
        sid: "session-current",
        createdAt: "2026-04-12T21:44:00.000Z",
        lastSeenAt: "2026-04-12T21:45:09.000Z",
        lastIp: "203.0.113.42",
        userAgent: "Mozilla/5.0",
        revokedAt: null,
        isPendingMfa: false,
      },
    ]);
    const dependencies = createDependencies({ listActiveSessionsForUser });
    const routeLayer = getRouteLayer(dependencies.router, "get", "/api/me/sessions");

    const res = await invokeRoute(routeLayer, {
      session: { user: { id: "user-1" } },
      sessionID: "session-current",
    });

    expect(res.statusCode).toBe(200);
    expect(listActiveSessionsForUser).toHaveBeenCalledWith("user-1");
    expect(res.body).toMatchObject({
      sessions: [
        expect.objectContaining({
          sid: "session-current",
          current: true,
        }),
      ],
    });
  });

  it("não registra mais o endpoint de local auth", () => {
    const dependencies = createDependencies();
    const routeLayer = getRouteLayer(dependencies.router, "post", "/api/me/security/local-auth");
    expect(routeLayer).toBeNull();
  });
});
