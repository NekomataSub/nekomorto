import { describe, expect, it } from "vitest";

import { DIRECT_ROUTE_DEPENDENCY_KEYS } from "../../server/bootstrap/build-direct-route-dependencies.js";
import { buildRootRouteRegistrationDependencies } from "../../server/bootstrap/build-root-route-registration-dependencies.js";
import { SERVER_ROUTE_SOURCE_FRAGMENT_KEYS } from "../../server/bootstrap/build-server-route-source.js";
import { createRouteRuntimeGroups } from "../../server/bootstrap/create-route-runtime-groups.js";
import { createRootServerRouteContexts } from "../../server/bootstrap/register-root-server-routes.js";

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

const buildRouteGroups = () => {
  const serverSource = buildServerRouteSource();
  const publicMediaRuntime = Object.fromEntries(
    PUBLIC_MEDIA_RUNTIME_KEYS.map((key) => [key, createNamedValue(key)]),
  );

  return {
    adminExports: serverSource,
    authzLib: serverSource,
    dataRepositoryAdaptersRuntime: serverSource,
    userRuntime: serverSource,
    publicMediaRuntime,
    adminExportRuntime: serverSource,
    projectRuntime: serverSource,
    publicRuntime: serverSource,
    webhookRuntime: serverSource,
  };
};

const buildRootSource = () => {
  const routeGroups = buildRouteGroups();
  const serverSource = buildServerRouteSource();

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
    ...routeGroups,
  };
};

describe("buildRootRouteRegistrationDependencies", () => {
  it("builds explicit runtime groups and preserves the merged root source", () => {
    const routeGroups = buildRouteGroups();
    const routeRuntimeGroups = createRouteRuntimeGroups(routeGroups);
    const dependencies = buildRootRouteRegistrationDependencies({
      ...buildRootSource(),
      ...routeGroups,
      routeRuntimeGroups,
    });

    expect(dependencies.routeRuntimeGroups).toBe(routeRuntimeGroups);
    expect(dependencies.publicMediaRuntime).toBe(routeRuntimeGroups.publicMediaRuntime);
    expect(dependencies.getPostOgCachedRender).toEqual(createNamedValue("getPostOgCachedRender"));
  });

  it("fails fast when a required runtime group is undefined", () => {
    const routeGroups = buildRouteGroups();

    expect(() =>
      createRouteRuntimeGroups({
        ...routeGroups,
        publicRuntime: undefined,
      }),
    ).toThrow(/publicRuntime/);
  });

  it("produces a root dependency source that wires into route registration contexts", () => {
    const routeGroups = buildRouteGroups();
    const rootDependencies = buildRootRouteRegistrationDependencies({
      ...buildRootSource(),
      ...routeGroups,
      routeRuntimeGroups: createRouteRuntimeGroups(routeGroups),
      discordApi: undefined,
      discordClientId: undefined,
      discordClientSecret: undefined,
      metricsTokenNormalized: undefined,
      mfaRecoveryCodePepper: undefined,
      primaryAppOrigin: undefined,
      scopes: undefined,
      securityEventStatusOpen: undefined,
      userPreferencesMaxBytes: undefined,
    });

    const contexts = createRootServerRouteContexts(rootDependencies);

    expect(contexts.directRouteDependencies.selfService.mfaRecoveryCodePepper).toBe("pepper");
    expect(contexts.serverRouteDependencies.og.getProjectOgCachedRender).toEqual(
      createNamedValue("getProjectOgCachedRender"),
    );
    expect(contexts.serverRouteDependencies.upload.resolveRequestUploadAccessScope).toEqual(
      createNamedValue("resolveRequestUploadAccessScope"),
    );
  });
});
