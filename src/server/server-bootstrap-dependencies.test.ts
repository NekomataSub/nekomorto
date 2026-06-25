import { describe, expect, it, vi } from "vitest";
import { buildAdminExportRuntimeDependencies } from "../../server/bootstrap/build-admin-export-runtime-dependencies.js";
import {
  buildDirectRouteDependencies,
  DIRECT_ROUTE_DEPENDENCY_KEYS,
} from "../../server/bootstrap/build-direct-route-dependencies.js";
import { buildDirectRouteRegistrationDependenciesFromRoot } from "../../server/bootstrap/build-direct-route-registration-dependencies-from-root.js";
import { buildDirectRouteRegistrationDependencies } from "../../server/bootstrap/build-direct-route-registration-dependencies.js";
import { buildOperationalMonitoringRuntimeDependencies } from "../../server/bootstrap/build-operational-monitoring-runtime-dependencies.js";
import { buildProjectRuntimeDependencies } from "../../server/bootstrap/build-project-runtime-dependencies.js";
import { buildPublicRuntimeDependencies } from "../../server/bootstrap/build-public-runtime-dependencies.js";
import { buildServerRouteContextSourceFromRoot } from "../../server/bootstrap/build-server-route-context-source-from-root.js";
import {
  buildServerRouteDependencySource,
  SERVER_ROUTE_DEPENDENCY_KEYS,
} from "../../server/bootstrap/build-server-route-dependency-source.js";
import { buildServerRouteLocalDependencies } from "../../server/bootstrap/build-server-route-local-dependencies.js";
import {
  buildServerRouteContextSource,
  buildServerRouteSourceFragments,
  SERVER_ROUTE_SOURCE_FRAGMENT_KEYS,
} from "../../server/bootstrap/build-server-route-source.js";
import { buildUserRuntimeDependencies } from "../../server/bootstrap/build-user-runtime-dependencies.js";
import { buildWebhookRuntimeDependencies } from "../../server/bootstrap/build-webhook-runtime-dependencies.js";
import { createContentRuntimeBundle } from "../../server/bootstrap/create-content-runtime-bundle.js";
import { createMediaSupportRuntimeBundle } from "../../server/bootstrap/create-media-support-runtime-bundle.js";
import { createSiteConfigRuntimeBundle } from "../../server/bootstrap/create-site-config-runtime-bundle.js";
import { createSiteRenderingRuntimeBundle } from "../../server/bootstrap/create-site-rendering-runtime-bundle.js";

const createNamedValue = (key: string) => ({ key });
const PUBLIC_MEDIA_RUNTIME_KEYS = [
  "buildPublicMediaVariants",
  "collectDownloadIconUploads",
  "collectLinkTypeIconUploads",
  "enqueueProjectOgPrewarm",
  "getUsedUploadUrls",
  "logProjectOgDelivery",
  "resolveMetaImageVariantUrl",
];

const buildDirectRouteSource = (scopeName) => {
  const keys = DIRECT_ROUTE_DEPENDENCY_KEYS[scopeName] as string[];
  return keys.reduce<Record<string, unknown>>((source, key) => {
    source[key] = key === "app" ? { use: () => {} } : createNamedValue(key);
    return source;
  }, {});
};

const buildDirectRouteRegistrationSource = () => ({
  ...buildDirectRouteSource("session"),
  ...buildDirectRouteSource("operational"),
  ...buildDirectRouteSource("selfService"),
});

const buildServerRouteSource = () =>
  SERVER_ROUTE_DEPENDENCY_KEYS.reduce<Record<string, unknown>>(
    (source, key) => {
      source[key] = createNamedValue(key);
      return source;
    },
    { app: { use: () => {} } },
  );

const buildServerRouteFragmentSource = () =>
  [...new Set((Object.values(SERVER_ROUTE_SOURCE_FRAGMENT_KEYS) as string[][]).flat())].reduce<
    Record<string, unknown>
  >(
    (source, key) => {
      source[key] = createNamedValue(key);
      return source;
    },
    {
      app: { use: () => {} },
      publicMediaRuntime: Object.fromEntries(
        PUBLIC_MEDIA_RUNTIME_KEYS.map((key) => [key, createNamedValue(key)]),
      ),
    },
  );

describe("server bootstrap dependency builders", () => {
  it("builds the requested direct route dependency scopes", () => {
    const sessionSource = buildDirectRouteSource("session");
    const selfServiceSource = buildDirectRouteSource("selfService");

    const dependencies = buildDirectRouteDependencies(
      { routes: ["session", "selfService"] },
      sessionSource,
      selfServiceSource,
      { ignored: true },
    );

    expect(dependencies.session.apiContractVersion).toEqual(createNamedValue("apiContractVersion"));
    expect(dependencies.selfService.listActiveSessionsForUser).toEqual(
      createNamedValue("listActiveSessionsForUser"),
    );
    expect(dependencies).not.toHaveProperty("operational");
  });

  it("fails fast when a required direct route dependency is undefined", () => {
    const selfServiceSource = buildDirectRouteSource("selfService");
    selfServiceSource.listActiveSessionsForUser = undefined;

    expect(() => buildDirectRouteDependencies({ routes: ["selfService"] }, selfServiceSource)).toThrow(
      /listActiveSessionsForUser/,
    );
  });

  it("builds the high-level direct route registration dependencies", () => {
    const source = buildDirectRouteRegistrationSource();

    const dependencies = buildDirectRouteRegistrationDependencies({
      ...source,
      ignored: true,
    });

    expect(dependencies.session.apiContractVersion).toEqual(createNamedValue("apiContractVersion"));
    expect(dependencies.operational.metricsTokenNormalized).toEqual(
      createNamedValue("metricsTokenNormalized"),
    );
    expect(dependencies.selfService.listActiveSessionsForUser).toEqual(
      createNamedValue("listActiveSessionsForUser"),
    );
    expect(dependencies.selfService).not.toHaveProperty("ignored");
  });

  it("builds direct route registration dependencies from root aliases and capability getters", () => {
    const source = buildDirectRouteRegistrationSource();

    const dependencies = buildDirectRouteRegistrationDependenciesFromRoot({
      ...source,
      API_CONTRACT_VERSION: "v1",
      DISCORD_API: createNamedValue("discordApi"),
      DISCORD_CLIENT_ID: "discord-client-id",
      DISCORD_CLIENT_SECRET: "discord-client-secret",
      METRICS_TOKEN_NORMALIZED: "metrics-token",
      MFA_RECOVERY_CODE_PEPPER: "pepper",
      PRIMARY_APP_ORIGIN: "https://app.example.com",
      SCOPES: ["identify"],
      SecurityEventStatus: { OPEN: "open" },
      USER_PREFERENCES_MAX_BYTES: 4096,
      apiContractVersion: undefined,
      buildApiContractV1Payload: undefined,
      buildRuntimeMetadata: createNamedValue("buildRuntimeMetadata"),
      buildUserPayload: createNamedValue("buildUserPayload"),
      discordApi: undefined,
      discordClientId: undefined,
      discordClientSecret: undefined,
      isEpubImportJobStorageAvailable: () => true,
      isProjectImageImportJobStorageAvailable: () => false,
      metricsTokenNormalized: undefined,
      primaryAppOrigin: undefined,
      proxyDiscordAvatarRequest: createNamedValue("proxyDiscordAvatarRequest"),
      scopes: undefined,
      securityEventStatusOpen: undefined,
      userPreferencesMaxBytes: undefined,
    });

    expect(dependencies.session.apiContractVersion).toBe("v1");
    expect(dependencies.session.buildApiContractV1Payload()).toEqual(
      expect.objectContaining({
        capabilities: expect.objectContaining({
          project_epub_import_async: true,
          project_manga_import_async: false,
        }),
      }),
    );
    expect(dependencies.operational.metricsTokenNormalized).toBe("metrics-token");
    expect(dependencies.selfService.userPreferencesMaxBytes).toBe(4096);
  });

  it("builds the server route dependency source from multiple fragments without leaking extras", () => {
    const source = buildServerRouteSource();
    const midPoint = Math.floor(SERVER_ROUTE_DEPENDENCY_KEYS.length / 2);
    const firstHalf = Object.fromEntries(
      SERVER_ROUTE_DEPENDENCY_KEYS.slice(0, midPoint).map((key) => [key, source[key]]),
    );
    const secondHalf = Object.fromEntries(
      SERVER_ROUTE_DEPENDENCY_KEYS.slice(midPoint).map((key) => [key, source[key]]),
    );

    const dependencies = buildServerRouteDependencySource(
      { app: source.app, ignoredRoot: true },
      firstHalf,
      secondHalf,
      { ignoredTail: true },
    );

    expect(dependencies.app).toBe(source.app);
    expect(dependencies.PRIMARY_APP_ORIGIN).toEqual(createNamedValue("PRIMARY_APP_ORIGIN"));
    expect(dependencies.resolveMetaImageVariantUrl).toEqual(
      createNamedValue("resolveMetaImageVariantUrl"),
    );
    expect(dependencies).not.toHaveProperty("ignoredRoot");
    expect(dependencies).not.toHaveProperty("ignoredTail");
  });

  it("fails fast when a required server route dependency is omitted", () => {
    const source = buildServerRouteSource();
    delete source.resolveMetaImageVariantUrl;

    expect(() => buildServerRouteDependencySource(source)).toThrow(/resolveMetaImageVariantUrl/);
  });

  it("builds the semantic server route source fragments without leaking extras", () => {
    const source = buildServerRouteFragmentSource();
    const fragments = buildServerRouteSourceFragments(
      { app: source.app, publicMediaRuntime: source.publicMediaRuntime, ignoredRoot: true },
      source,
      { ignoredTail: true },
    );

    expect(fragments.constant.ADMIN_EXPORT_DATASETS).toEqual(
      createNamedValue("ADMIN_EXPORT_DATASETS"),
    );
    expect(fragments.build.buildAnalyticsRange).toEqual(createNamedValue("buildAnalyticsRange"));
    expect(fragments.resolve.resolveThemeColor).toEqual(createNamedValue("resolveThemeColor"));
    expect(fragments.misc.sendHtml).toEqual(createNamedValue("sendHtml"));
    expect(fragments.constant).not.toHaveProperty("ignoredRoot");
    expect(fragments.misc).not.toHaveProperty("ignoredTail");
  });

  it("builds the server route context source from merged semantic fragments", () => {
    const source = buildServerRouteFragmentSource();

    const dependencies = buildServerRouteContextSource(
      { app: source.app, publicMediaRuntime: source.publicMediaRuntime },
      source,
      { ignored: true },
    );

    expect(dependencies.app).toBe(source.app);
    expect(dependencies.PUBLIC_UPLOADS_DIR).toEqual(createNamedValue("PUBLIC_UPLOADS_DIR"));
    expect(dependencies.resolveMetaImageVariantUrl).toEqual(
      createNamedValue("resolveMetaImageVariantUrl"),
    );
    expect(dependencies.collectDownloadIconUploads).toEqual(
      createNamedValue("collectDownloadIconUploads"),
    );
    expect(dependencies.sendHtml).toEqual(createNamedValue("sendHtml"));
    expect(dependencies).not.toHaveProperty("ignored");
    expect(dependencies).not.toHaveProperty("publicMediaRuntime");
  });

  it("builds the server route context source from root-style grouped sources", () => {
    const source = buildServerRouteFragmentSource();

    const dependencies = buildServerRouteContextSourceFromRoot({
      ...source,
      ADMIN_EXPORT_DATASETS: undefined,
      AccessRole: undefined,
      BASIC_PROFILE_FIELDS: undefined,
      PermissionId: undefined,
      buildUserProfileRevisionToken: undefined,
      adminExports: source,
      authzLib: source,
      dataRepositoryAdaptersRuntime: source,
      publicMediaRuntime: source.publicMediaRuntime,
      userRuntime: source,
      adminExportRuntime: source,
      projectRuntime: source,
      publicRuntime: source,
      webhookRuntime: source,
    });

    expect(dependencies.app).toBe(source.app);
    expect(dependencies.ADMIN_EXPORT_DATASETS).toEqual(createNamedValue("ADMIN_EXPORT_DATASETS"));
    expect(dependencies.AccessRole).toEqual(createNamedValue("AccessRole"));
    expect(dependencies.BASIC_PROFILE_FIELDS).toEqual(createNamedValue("BASIC_PROFILE_FIELDS"));
    expect(dependencies.PermissionId).toEqual(createNamedValue("PermissionId"));
    expect(dependencies.buildUserProfileRevisionToken).toEqual(
      createNamedValue("buildUserProfileRevisionToken"),
    );
    expect(dependencies.resolveMetaImageVariantUrl).toEqual(
      createNamedValue("resolveMetaImageVariantUrl"),
    );
  });

  it("fails fast when a required semantic fragment dependency is undefined", () => {
    const source = buildServerRouteFragmentSource();
    source.buildAnalyticsRange = undefined;

    expect(() =>
      buildServerRouteSourceFragments(
        { app: source.app, publicMediaRuntime: source.publicMediaRuntime },
        source,
      ),
    ).toThrow(/buildAnalyticsRange/);
  });

  it("builds local server route dependencies with bootstrap token normalization", () => {
    const dependencies = buildServerRouteLocalDependencies({
      app: { use: () => {} },
      BOOTSTRAP_TOKEN: undefined,
      collectEpisodeUpdatesByVisibility: "collectEpisodeUpdatesByVisibility",
      resolveEpisodeLookup: "resolveEpisodeLookup",
    });

    expect(dependencies.app).toBeTruthy();
    expect(dependencies.BOOTSTRAP_TOKEN).toBe("");
    expect(dependencies.collectEpisodeUpdatesByVisibility).toBe(
      "collectEpisodeUpdatesByVisibility",
    );
    expect(dependencies.resolveEpisodeLookup).toBe("resolveEpisodeLookup");
  });

  it("builds user runtime dependencies with lazy repository-backed preferences helpers", () => {
    const crypto = {
      createHash: vi.fn((algorithm) => ({ algorithm })),
      randomUUID: vi.fn(() => "uuid-1"),
    };
    const dataRepository = {
      loadUserPreferences: vi.fn((userId) => ({ userId, density: "compact" })),
      writeUserPreferences: vi.fn(),
    };

    const dependencies = buildUserRuntimeDependencies({
      AUTH_FAILED_BURST_CRITICAL: 9,
      DASHBOARD_HOME_ROLE_IDS: ["owner"],
      MFA_RECOVERY_CODE_PEPPER: "pepper",
      PRIMARY_APP_ORIGIN: "https://example.com",
      SESSION_INDEX_TOUCH_MIN_INTERVAL_MS: 5000,
      SecurityEventSeverity: { WARNING: "warning" },
      SecurityEventStatus: { OPEN: "open" },
      USER_PREFERENCES_DENSITY_SET: new Set(["compact"]),
      USER_PREFERENCES_THEME_MODE_SET: new Set(["dark"]),
      crypto,
      dataRepository,
      getDispatchCriticalSecurityEventWebhook: () => "dispatch",
      loadSiteSettings: () => ({ title: "Site" }),
    });

    expect(dependencies.authFailedBurstCritical).toBe(9);
    expect(dependencies.dashboardHomeRoleIds).toEqual(["owner"]);
    expect(dependencies.primaryAppOrigin).toBe("https://example.com");
    expect(dependencies.securityEventStatus).toEqual({ OPEN: "open" });
    expect(dependencies.createEnrollmentToken()).toBe("uuid-1");
    expect(dependencies.createHash("sha256")).toEqual({ algorithm: "sha256" });
    expect(dependencies.loadStoredUserPreferences("user-1")).toEqual({
      density: "compact",
      userId: "user-1",
    });

    dependencies.writeStoredUserPreferences("user-1", { theme: "dark" });
    expect(dataRepository.writeUserPreferences).toHaveBeenCalledWith("user-1", {
      theme: "dark",
    });
  });

  it("builds project runtime dependencies with fs/path aliases and ttl normalization", () => {
    const dependencies = buildProjectRuntimeDependencies({
      EPUB_IMPORT_JOB_RESULT_TTL_MS: 11,
      PROJECT_IMAGE_EXPORT_JOB_RESULT_TTL_MS: 22,
      PROJECT_IMAGE_IMPORT_JOB_RESULT_TTL_MS: 33,
      PUBLIC_UPLOADS_DIR: "/uploads",
      fs: { writeFileSync: createNamedValue("writeFileSync") },
      path: {
        basename: createNamedValue("basename"),
        join: createNamedValue("join"),
      },
    });

    expect(dependencies.epubImportResultTtlMs).toBe(11);
    expect(dependencies.projectImageExportResultTtlMs).toBe(22);
    expect(dependencies.projectImageImportResultTtlMs).toBe(33);
    expect(dependencies.publicUploadsDir).toBe("/uploads");
    expect(dependencies.fsWriteFileSync).toEqual(createNamedValue("writeFileSync"));
    expect(dependencies.pathBasename).toEqual(createNamedValue("basename"));
    expect(dependencies.pathJoin).toEqual(createNamedValue("join"));
  });

  it("builds public runtime dependencies with origin and sitemap normalization", () => {
    const crypto = {
      randomUUID: vi.fn(() => "guid-1"),
    };
    const resolveBootstrapPwaEnabled = vi.fn(() => true);

    const dependencies = buildPublicRuntimeDependencies({
      BOOTSTRAP_PWA_ENABLED: true,
      PRIMARY_APP_ORIGIN: "https://app.example.com",
      SITEMAP_STATIC_PUBLIC_PATHS: ["/", "/sobre"],
      crypto,
      resolveBootstrapPwaEnabled,
      stripHtml: createNamedValue("stripHtml"),
    });

    expect(dependencies.bootstrapPwaEnabled).toBe(true);
    expect(dependencies.primaryAppOrigin).toBe("https://app.example.com");
    expect(dependencies.sitemapStaticPublicPaths).toEqual(["/", "/sobre"]);
    expect(dependencies.resolveBootstrapPwaEnabled).toBe(resolveBootstrapPwaEnabled);
    expect(dependencies.createGuid()).toBe("guid-1");
    expect(dependencies.stripHtml).toEqual(createNamedValue("stripHtml"));
  });

  it("builds webhook runtime dependencies with request id and resolver normalization", () => {
    const crypto = {
      randomUUID: vi.fn(() => "request-1"),
    };

    const dependencies = buildWebhookRuntimeDependencies({
      OPERATIONAL_WEBHOOK_INTERVAL_DEFAULT_MS: 1000,
      PRIMARY_APP_ORIGIN: "https://app.example.com",
      WEBHOOK_DELIVERY_SCOPE: { SECURITY: "security" },
      WEBHOOK_DELIVERY_STATUS: { QUEUED: "queued" },
      createResolveEditorialAuthorFromPost: createNamedValue(
        "createResolveEditorialAuthorFromPost",
      ),
      crypto,
    });

    expect(dependencies.OPERATIONAL_WEBHOOK_INTERVAL_DEFAULT_MS).toBe(1000);
    expect(dependencies.PRIMARY_APP_ORIGIN).toBe("https://app.example.com");
    expect(dependencies.resolveWebhookDeliveryAuthorFromPost).toEqual(
      createNamedValue("createResolveEditorialAuthorFromPost"),
    );
    expect(dependencies.createRequestId()).toBe("request-1");
  });

  it("builds admin export runtime dependencies with env-backed defaults", () => {
    const dependencies = buildAdminExportRuntimeDependencies({
      ADMIN_EXPORT_MAX_ROWS: 123,
      ADMIN_EXPORT_TTL_HOURS: 48,
      writeExportFile: createNamedValue("writeExportFile"),
    });

    expect(dependencies.adminExportMaxRows).toBe(123);
    expect(dependencies.adminExportTtlHours).toBe(48);
    expect(dependencies.writeExportFile).toEqual(createNamedValue("writeExportFile"));
  });

  it("builds operational monitoring runtime dependencies with fs and env aliases", async () => {
    const fs = {
      constants: createNamedValue("constants"),
      promises: {
        access: vi.fn(async () => "ok"),
      },
    };

    const dependencies = buildOperationalMonitoringRuntimeDependencies({
      OPS_ALERTS_DB_LATENCY_WARNING_MS: 250,
      PUBLIC_UPLOADS_DIR: "/uploads",
      fs,
    });

    expect(dependencies.dbLatencyWarningMs).toBe(250);
    expect(dependencies.publicUploadsDir).toBe("/uploads");
    expect(dependencies.fsConstants).toEqual(createNamedValue("constants"));
    await expect(dependencies.fsAccess("/tmp/file", 0)).resolves.toBe("ok");
    expect(fs.promises.access).toHaveBeenCalledWith("/tmp/file", 0);
  });

  it("fails fast when a required content runtime bundle dependency is missing", () => {
    expect(() => createContentRuntimeBundle({})).toThrow(/createSlug/);
  });

  it("fails fast when a required site config runtime bundle dependency is missing", () => {
    expect(() => createSiteConfigRuntimeBundle({})).toThrow(/DEFAULT_PROJECT_TYPE_CATALOG/);
  });

  it("fails fast when a required media support runtime bundle dependency is missing", () => {
    expect(() => createMediaSupportRuntimeBundle({})).toThrow(/PRIMARY_APP_ORIGIN/);
  });

  it("fails fast when a required site rendering runtime bundle dependency is missing", () => {
    expect(() => createSiteRenderingRuntimeBundle({})).toThrow(/PRIMARY_APP_ORIGIN/);
  });
});
