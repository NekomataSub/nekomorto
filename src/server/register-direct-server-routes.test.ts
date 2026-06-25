import { describe, expect, it, vi } from "vitest";

import { DIRECT_ROUTE_DEPENDENCY_KEYS } from "../../server/bootstrap/build-direct-route-dependencies.js";
import {
  DIRECT_SERVER_ROUTE_ORDER,
  registerDirectServerRoutes,
} from "../../server/bootstrap/register-direct-server-routes.js";

const createNamedValue = (key: string) => ({ key });

const buildScopeDependencies = (routeName: keyof typeof DIRECT_ROUTE_DEPENDENCY_KEYS) =>
  DIRECT_ROUTE_DEPENDENCY_KEYS[routeName].reduce<Record<string, unknown>>((scope, key) => {
    scope[key] = key === "app" ? { use: () => {} } : createNamedValue(key);
    return scope;
  }, {});

describe("registerDirectServerRoutes", () => {
  it("registers direct routes in the expected boot order", () => {
    const order: string[] = [];
    const registrars = Object.fromEntries(
      DIRECT_SERVER_ROUTE_ORDER.map((routeName) => [
        routeName,
        vi.fn((dependencies: Record<string, unknown>) => {
          order.push(routeName);
          expect(dependencies.app).toBeTruthy();
        }),
      ]),
    );

    registerDirectServerRoutes(
      {
        session: buildScopeDependencies("session"),
        operational: buildScopeDependencies("operational"),
        selfService: buildScopeDependencies("selfService"),
      },
      { registrars },
    );

    expect(order).toEqual(DIRECT_SERVER_ROUTE_ORDER);
  });

  it("fails fast before invoking a registrar when a required dependency is undefined", () => {
    const scopes = {
      session: buildScopeDependencies("session"),
      operational: buildScopeDependencies("operational"),
      selfService: buildScopeDependencies("selfService"),
    };
    scopes.session.apiContractVersion = undefined;

    const registrars = {
      session: vi.fn(),
      operational: vi.fn(),
      selfService: vi.fn(),
    };

    expect(() => registerDirectServerRoutes(scopes, { registrars })).toThrow(/apiContractVersion/);
    expect(registrars.session).not.toHaveBeenCalled();
    expect(registrars.operational).not.toHaveBeenCalled();
    expect(registrars.selfService).not.toHaveBeenCalled();
  });
});
