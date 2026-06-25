import { describe, expect, it, vi } from "vitest";

import { DIRECT_ROUTE_DEPENDENCY_KEYS } from "../../server/bootstrap/build-direct-route-dependencies.js";
import { SERVER_ROUTE_SOURCE_FRAGMENT_KEYS } from "../../server/bootstrap/build-server-route-source.js";
import {
  createRootServerRouteContexts,
  registerRootServerRoutes,
} from "../../server/bootstrap/register-root-server-routes.js";

const PUBLIC_MEDIA_RUNTIME_KEYS = [
  "buildPublicMediaVariants",
  "collectDownloadIconUploads",
  "collectLinkTypeIconUploads",
  "enqueueProjectOgPrewarm",
  "getUsedUploadUrls",
  "logProjectOgDelivery",
  "resolveMetaImageVariantUrl",
];

const createNamedValue = (key: string) => ({ key });

const buildDirectRouteSource = (scopeName) =>
  (DIRECT_ROUTE_DEPENDENCY_KEYS[scopeName] as string[]).reduce<Record<string, unknown>>(
    (source, key) => {
      source[key] = key === "app" ? { use: () => {} } : createNamedValue(key);
      return source;
    },
    {},
  );

const buildServerRouteSource = () =>
  [...new Set((Object.values(SERVER_ROUTE_SOURCE_FRAGMENT_KEYS) as string[][]).flat())].reduce<
    Record<string, unknown>
  >(
    (source, key) => {
      source[key] = createNamedValue(key);
      return source;
    },
    { app: { use: () => {} } },
  );

const buildRootRouteSource = (): Record<string, any> => {
  const serverSource = buildServerRouteSource();
  const publicMediaRuntime = Object.fromEntries(
    PUBLIC_MEDIA_RUNTIME_KEYS.map((key) => [key, createNamedValue(key)]),
  );

  return {
    ...buildDirectRouteSource("session"),
    ...buildDirectRouteSource("operational"),
    ...buildDirectRouteSource("selfService"),
    ...serverSource,
    API_CONTRACT_VERSION: "v1",
    DISCORD_API: createNamedValue("DISCORD_API"),
    DISCORD_CLIENT_ID: "discord-client-id",
    DISCORD_CLIENT_SECRET: "discord-client-secret",
    METRICS_TOKEN_NORMALIZED: "metrics-token",
    MFA_RECOVERY_CODE_PEPPER: "pepper",
    PRIMARY_APP_ORIGIN: "https://example.com",
    SCOPES: ["identify"],
    USER_PREFERENCES_MAX_BYTES: 4096,
    SecurityEventSeverity: { WARNING: "warning" },
    SecurityEventStatus: { OPEN: "open" },
    adminExports: serverSource,
    adminExportRuntime: serverSource,
    authzLib: serverSource,
    dataRepositoryAdaptersRuntime: serverSource,
    projectRuntime: serverSource,
    publicMediaRuntime,
    publicRuntime: serverSource,
    userRuntime: serverSource,
    webhookRuntime: serverSource,
  };
};

describe("registerRootServerRoutes", () => {
  it("builds both direct-route and sectioned route contexts from the same root source", () => {
    const source = buildRootRouteSource();

    const contexts = createRootServerRouteContexts(source);

    expect(contexts.directRouteDependencies.session.apiContractVersion).toEqual(
      createNamedValue("apiContractVersion"),
    );
    expect(contexts.serverRouteDependencies.app).toBe(source.app);
    expect(contexts.serverRouteDependencies.og.getProjectOgCachedRender).toEqual(
      createNamedValue("getProjectOgCachedRender"),
    );
    expect(contexts.serverRouteDependencies.upload.resolveRequestUploadAccessScope).toEqual(
      createNamedValue("resolveRequestUploadAccessScope"),
    );
  });

  it("registers direct routes before grouped server routes", () => {
    const source = buildRootRouteSource();
    const registerDirectRoutes = vi.fn();
    const registerRoutes = vi.fn();

    const contexts = registerRootServerRoutes(source, {
      registerDirectRoutes,
      registerRoutes,
    });

    expect(registerDirectRoutes).toHaveBeenCalledTimes(1);
    expect(registerRoutes).toHaveBeenCalledTimes(1);
    expect(registerDirectRoutes.mock.invocationCallOrder[0]).toBeLessThan(
      registerRoutes.mock.invocationCallOrder[0],
    );
    expect(registerDirectRoutes).toHaveBeenCalledWith(contexts.directRouteDependencies);
    expect(registerRoutes).toHaveBeenCalledWith(contexts.serverRouteDependencies);
  });

  it("fails fast when a direct-route dependency resolves to undefined", () => {
    const source = buildRootRouteSource();
    source.startTotpEnrollment = undefined;

    expect(() => createRootServerRouteContexts(source)).toThrow(/startTotpEnrollment/);
  });

  it("fails fast when a grouped server-route dependency resolves to undefined", () => {
    const source = buildRootRouteSource();
    source.resolveMetaImageVariantUrl = undefined;
    source.publicMediaRuntime.resolveMetaImageVariantUrl = undefined;

    expect(() => createRootServerRouteContexts(source)).toThrow(/resolveMetaImageVariantUrl/);
  });
});
