import { beforeEach, describe, expect, it, vi } from "vitest";

const buildBetterAuthMethodsMock = vi.hoisted(() => vi.fn());

vi.mock("../../server/lib/better-auth-runtime.js", () => ({
  buildBetterAuthMethods: (...args: unknown[]) => buildBetterAuthMethodsMock(...args),
}));

import { registerSessionRoutes } from "../../server/lib/register-session-routes.js";

const createRouterCapture = () => {
  let router = null;
  const app = {
    use: vi.fn((value) => {
      router = value;
    }),
  };

  return {
    app,
    getRouter: () => router,
  };
};

const getRoute = (router, method, path) =>
  router?.stack?.find(
    (layer) =>
      layer?.route?.path === path &&
      Boolean(layer?.route?.methods?.[String(method || "").toLowerCase()]),
  ) || null;

const createMockRes = () => ({
  statusCode: 200,
  body: null,
  headers: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
    return this;
  },
  type() {
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
  end() {
    return this;
  },
});

const invokeRoute = async (routeLayer, req) => {
  const res = createMockRes();
  const stack = Array.isArray(routeLayer?.route?.stack) ? routeLayer.route.stack : [];
  let index = 0;
  const next = async () => {
    const layer = stack[index];
    index += 1;
    if (!layer?.handle) {
      return;
    }
    await layer.handle(req, res, next);
  };
  await next();
  return res;
};

describe("registerSessionRoutes", () => {
  beforeEach(() => {
    buildBetterAuthMethodsMock.mockReset();
    buildBetterAuthMethodsMock.mockResolvedValue([
      { provider: "google", linked: true, hasPasskey: false },
      { provider: "passkey", linked: true, hasPasskey: true },
    ]);
  });

  it("guards /api/me before the handler while preserving pending MFA responses", async () => {
    const { app, getRouter } = createRouterCapture();
    const buildUserPayload = vi.fn((user) => ({ id: user.id, name: user.name }));

    registerSessionRoutes({
      app,
      apiContractVersion: "v1",
      buildApiContractV1Payload: () => ({ ok: true }),
      buildMySecuritySummary: vi.fn(() => ({ identities: [], passkeys: { count: 0 } })),
      buildRuntimeMetadata: () => ({ sha: "abc123" }),
      buildUserPayload,
      proxyDiscordAvatarRequest: vi.fn(),
    });

    const router = getRouter();
    const route = getRoute(router, "GET", "/api/me");
    expect(route).toBeTruthy();
    expect(route.route.stack).toHaveLength(2);

    const pendingMfaResponse = await invokeRoute(route, {
      session: {
        pendingMfaUser: {
          id: "user-1",
          name: "User One",
          username: "user.one",
          avatarUrl: "/avatar.png",
        },
      },
    });

    expect(pendingMfaResponse.statusCode).toBe(401);
    expect(pendingMfaResponse.body).toEqual({
      error: "mfa_required",
      pendingMfa: true,
      user: {
        id: "user-1",
        name: "User One",
        username: "user.one",
        avatarUrl: "/avatar.png",
        authMethods: [],
      },
    });

    const authenticatedResponse = await invokeRoute(route, {
      session: {
        user: {
          id: "user-2",
          name: "User Two",
        },
      },
    });

    expect(authenticatedResponse.statusCode).toBe(200);
    expect(authenticatedResponse.body).toEqual({
      id: "user-2",
      name: "User Two",
      authMethods: [],
    });
    expect(buildUserPayload).toHaveBeenCalledWith({
      id: "user-2",
      name: "User Two",
    });
  });

  it("rejects /api/me before the handler when no user session exists", async () => {
    const { app, getRouter } = createRouterCapture();
    const buildUserPayload = vi.fn((user) => ({ id: user.id }));

    registerSessionRoutes({
      app,
      apiContractVersion: "v1",
      buildApiContractV1Payload: () => ({ ok: true }),
      buildMySecuritySummary: vi.fn(() => ({ identities: [], passkeys: { count: 0 } })),
      buildRuntimeMetadata: () => ({ sha: "abc123" }),
      buildUserPayload,
      proxyDiscordAvatarRequest: vi.fn(),
    });

    const route = getRoute(getRouter(), "GET", "/api/me");
    const response = await invokeRoute(route, {
      session: {},
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).toEqual({ error: "unauthorized" });
    expect(buildUserPayload).not.toHaveBeenCalled();
  });

  it("preserves authorization fields from buildUserPayload for Better Auth sessions", async () => {
    const { app, getRouter } = createRouterCapture();
    const buildUserPayload = vi.fn((user) => ({
      id: user.id,
      name: user.name,
      accessRole: "owner_primary",
      ownerIds: [user.id],
      primaryOwnerId: user.id,
      permissions: ["*"],
      grants: { usuarios: true, configuracoes: true },
    }));

    registerSessionRoutes({
      app,
      apiContractVersion: "v1",
      buildApiContractV1Payload: () => ({ ok: true }),
      buildMySecuritySummary: vi.fn(() => ({ identities: [], passkeys: { count: 0 } })),
      buildRuntimeMetadata: () => ({ sha: "abc123" }),
      buildUserPayload,
      proxyDiscordAvatarRequest: vi.fn(),
    });

    const route = getRoute(getRouter(), "GET", "/api/me");
    const response = await invokeRoute(route, {
      betterAuthSession: {
        user: { id: "owner-1" },
      },
      session: {
        user: {
          id: "owner-1",
          name: "Owner One",
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      id: "owner-1",
      name: "Owner One",
      accessRole: "owner_primary",
      ownerIds: ["owner-1"],
      primaryOwnerId: "owner-1",
      permissions: ["*"],
      grants: { usuarios: true, configuracoes: true },
      authMethods: [
        { provider: "google", linked: true, hasPasskey: false },
        { provider: "passkey", linked: true, hasPasskey: true },
      ],
    });
    expect(buildUserPayload).toHaveBeenCalledWith({
      id: "owner-1",
      name: "Owner One",
    });
    expect(buildBetterAuthMethodsMock).toHaveBeenCalledWith("owner-1");
  });
});
