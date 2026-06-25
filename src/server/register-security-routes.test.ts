import { describe, expect, it, vi } from "vitest";

import { registerSecurityRoutes } from "../../server/routes/admin/register-security-routes.js";

const createAppRecorder = () => {
  const routes: Array<{
    method: string;
    path: string;
    handlers: Array<(...args: any[]) => unknown>;
  }> = [];
  const register =
    (method: string) =>
    (path: string, ...handlers: Array<(...args: any[]) => unknown>) => {
      routes.push({
        method,
        path,
        handlers,
      });
    };

  return {
    app: {
      delete: register("DELETE"),
      get: register("GET"),
      post: register("POST"),
    },
    routes,
  };
};

const getRoute = (routes, method, path) =>
  routes.find((route) => route.method === method && route.path === path);

const createMockRes = () => ({
  body: null as any,
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const invokeFinalHandler = async (route, req) => {
  const res = createMockRes();
  await route.handlers[route.handlers.length - 1](req, res);
  return res;
};

const createDependencies = ({ app, overrides = {} }) => ({
  SecurityEventSeverity: { WARNING: "warning" },
  SecurityEventStatus: {
    ACK: "ack",
    IGNORED: "ignored",
    RESOLVED: "resolved",
  },
  app,
  appendAuditLog: vi.fn(),
  appendSecretRotation: vi.fn(),
  canManageSecurityAdmin: vi.fn(() => false),
  dataEncryptionKeyring: { currentKeyId: "key-1", secretKeys: [] },
  deleteUserMfaTotpRecord: vi.fn(),
  resetBetterAuthPasskeysForUser: vi.fn(async () => ({
    userFound: true,
    removedPasskeys: 2,
    revokedSessions: 1,
  })),
  resetBetterAuthTotpForUser: vi.fn(async () => ({
    userFound: true,
    removedFactors: 1,
    revokedSessions: 1,
  })),
  emitSecurityEvent: vi.fn(),
  isOwner: vi.fn(() => false),
  isPrimaryOwner: vi.fn(() => false),
  listActiveSessionsForUser: vi.fn(() => []),
  loadSecretRotations: vi.fn(() => []),
  loadSecurityEvents: vi.fn(() => []),
  loadUserSessionIndexRecords: vi.fn(() => []),
  loadUsers: vi.fn(() => []),
  normalizeExportFilters: vi.fn(() => ({})),
  normalizeUsers: vi.fn((users) => users),
  requireAuth: vi.fn((_req, _res, next) => next?.()),
  revokeSessionBySid: vi.fn(),
  sessionCookieConfig: { name: "sid" },
  toSecurityEventApiResponse: vi.fn((entry) => entry),
  updateSecurityEventStatus: vi.fn(),
  ...overrides,
});

describe("registerSecurityRoutes", () => {
  it("keeps the admin TOTP reset route forbidden for non-owners", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({ app });

    registerSecurityRoutes(dependencies);

    const route = getRoute(routes, "POST", "/api/admin/users/:id/security/totp/reset");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      params: { id: "user-2" },
      session: { user: { id: "admin-1" } },
    });

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
    expect(dependencies.deleteUserMfaTotpRecord).not.toHaveBeenCalled();
    expect(dependencies.appendAuditLog).not.toHaveBeenCalled();
    expect(dependencies.emitSecurityEvent).not.toHaveBeenCalled();
  });

  it("prevents a secondary owner from resetting another owner", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        isOwner: vi.fn((id) => ["owner-1", "owner-2"].includes(id)),
        isPrimaryOwner: vi.fn((id) => id === "owner-1"),
        loadUsers: vi.fn(() => [{ id: "owner-1" }, { id: "owner-2" }]),
      },
    });
    registerSecurityRoutes(dependencies);

    const route = getRoute(routes, "POST", "/api/admin/users/:id/security/passkeys/reset");
    const res = await invokeFinalHandler(route, {
      params: { id: "owner-1" },
      session: { user: { id: "owner-2" } },
    });

    expect(res.statusCode).toBe(403);
    expect(dependencies.resetBetterAuthPasskeysForUser).not.toHaveBeenCalled();
  });

  it("prevents owners from using the administrative reset against themselves", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        isOwner: vi.fn(() => true),
        isPrimaryOwner: vi.fn(() => true),
        loadUsers: vi.fn(() => [{ id: "owner-1" }]),
      },
    });
    registerSecurityRoutes(dependencies);

    const route = getRoute(routes, "POST", "/api/admin/users/:id/security/passkeys/reset");
    const res = await invokeFinalHandler(route, {
      params: { id: "owner-1" },
      session: { user: { id: "owner-1" } },
    });

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "cannot_reset_self" });
  });

  it("lets the primary owner remove passkeys and records security signals", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        isOwner: vi.fn((id) => id === "owner-1"),
        isPrimaryOwner: vi.fn((id) => id === "owner-1"),
        loadUsers: vi.fn(() => [{ id: "owner-1" }, { id: "user-2" }]),
      },
    });
    registerSecurityRoutes(dependencies);

    const route = getRoute(routes, "POST", "/api/admin/users/:id/security/passkeys/reset");
    const req = {
      params: { id: "user-2" },
      session: { user: { id: "owner-1" } },
    };
    const res = await invokeFinalHandler(route, req);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      userFound: true,
      removedPasskeys: 2,
      revokedSessions: 1,
    });
    expect(dependencies.resetBetterAuthPasskeysForUser).toHaveBeenCalledWith("user-2");
    expect(dependencies.appendAuditLog).toHaveBeenCalledWith(
      req,
      "auth.passkeys.reset_admin",
      "users",
      expect.objectContaining({ targetId: "user-2", removedPasskeys: 2 }),
    );
    expect(dependencies.emitSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "passkey_reset_admin", targetUserId: "user-2" }),
    );
  });
});
