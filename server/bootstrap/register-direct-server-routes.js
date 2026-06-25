import { registerOperationalRoutes } from "../lib/register-operational-routes.js";
import { registerSelfServiceRoutes } from "../lib/register-self-service-routes.js";
import { registerSessionRoutes } from "../lib/register-session-routes.js";
import { assertRequiredDependencies } from "./assert-required-dependencies.js";
import { DIRECT_ROUTE_DEPENDENCY_KEYS } from "./build-direct-route-dependencies.js";

const DIRECT_ROUTE_REGISTRARS = {
  operational: registerOperationalRoutes,
  selfService: registerSelfServiceRoutes,
  session: registerSessionRoutes,
};

export const DIRECT_SERVER_ROUTE_ORDER = Object.freeze([
  "session",
  "operational",
  "selfService",
]);

const toScopeName = (routeName) =>
  `register${routeName.charAt(0).toUpperCase()}${routeName.slice(1)}Routes`;

const assertDirectRouteDependencies = (routeName, dependencies = {}) =>
  assertRequiredDependencies(
    toScopeName(routeName),
    dependencies,
    DIRECT_ROUTE_DEPENDENCY_KEYS[routeName] || [],
  );

export const registerDirectServerRoutes = (
  scopes = {},
  { registrars = DIRECT_ROUTE_REGISTRARS } = {},
) => {
  DIRECT_SERVER_ROUTE_ORDER.forEach((routeName) => {
    const registrar = registrars[routeName];
    if (typeof registrar !== "function") {
      throw new Error(`[bootstrap] missing direct route registrar: ${routeName}`);
    }
    registrar(assertDirectRouteDependencies(routeName, scopes[routeName] || {}));
  });
};

export default registerDirectServerRoutes;
