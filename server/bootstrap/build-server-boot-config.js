import path from "path";

import { isTruthyEnv } from "../lib/authz.js";
import { buildOriginConfig } from "../lib/origin-config.js";
import { parseDataEncryptionKeyring, resolveSessionSecrets } from "../lib/security-crypto.js";
import { buildSessionCookieConfig } from "../lib/session-cookie-config.js";
import { createSiteSettingsRuntimeHelpers } from "../lib/site-settings-runtime-helpers.js";

export const parseEnvInteger = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

export const buildServerBootConfig = ({ env = process.env, repoRootDir = process.cwd() } = {}) => {
  const {
    DATABASE_URL = "",
    MAINTENANCE_MODE: MAINTENANCE_MODE_ENV = "false",
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    APP_ORIGIN = "",
    ADMIN_ORIGINS = "",
    SESSION_SECRET,
    SESSION_SECRETS = "",
    DATA_ENCRYPTION_KEYS_JSON = "",
    SECURITY_RECOVERY_CODE_PEPPER = "",
    MFA_ISSUER = "Nekomata",
    TOTP_ICON_URL = "",
    MFA_ENROLLMENT_TTL_MS: MFA_ENROLLMENT_TTL_MS_ENV = "",
    ADMIN_EXPORTS_DIR = "",
    ADMIN_EXPORT_TTL_HOURS: ADMIN_EXPORT_TTL_HOURS_ENV = "",
    METRICS_ENABLED: METRICS_ENABLED_ENV = "false",
    METRICS_TOKEN = "",
    OPERATIONAL_HEALTH_TOKEN = "",
    PORT = 8080,
    OWNER_IDS: OWNER_IDS_ENV = "",
    BOOTSTRAP_TOKEN,
    ANALYTICS_IP_SALT = "",
    ANALYTICS_RETENTION_DAYS: ANALYTICS_RETENTION_DAYS_ENV = "",
    ANALYTICS_AGG_RETENTION_DAYS: ANALYTICS_AGG_RETENTION_DAYS_ENV = "",
    AUTO_UPLOAD_REORGANIZE = "true",
    AUTO_UPLOAD_REORGANIZE_ON_STARTUP: AUTO_UPLOAD_REORGANIZE_ON_STARTUP_ENV = "false",
    RBAC_V2_ENABLED: RBAC_V2_ENABLED_ENV = "false",
    RBAC_V2_ACCEPT_LEGACY_STAR: RBAC_V2_ACCEPT_LEGACY_STAR_ENV = "true",
    OPS_ALERTS_WEBHOOK_ENABLED: OPS_ALERTS_WEBHOOK_ENABLED_ENV = "false",
    OPS_ALERTS_WEBHOOK_PROVIDER: OPS_ALERTS_WEBHOOK_PROVIDER_ENV = "discord",
    OPS_ALERTS_WEBHOOK_URL: OPS_ALERTS_WEBHOOK_URL_ENV = "",
    OPS_ALERTS_WEBHOOK_TIMEOUT_MS: OPS_ALERTS_WEBHOOK_TIMEOUT_MS_ENV = "",
    OPS_ALERTS_WEBHOOK_INTERVAL_MS: OPS_ALERTS_WEBHOOK_INTERVAL_MS_ENV = "",
    OPS_ALERTS_DB_LATENCY_WARNING_MS: OPS_ALERTS_DB_LATENCY_WARNING_MS_ENV = "",
    RATE_LIMIT_PREFIX: RATE_LIMIT_PREFIX_ENV = "nekomorto:rate_limit",
    IDEMPOTENCY_TTL_MS: IDEMPOTENCY_TTL_MS_ENV = "",
    PUBLIC_READ_CACHE_TTL_MS: PUBLIC_READ_CACHE_TTL_MS_ENV = "",
    PUBLIC_READ_CACHE_MAX_ENTRIES: PUBLIC_READ_CACHE_MAX_ENTRIES_ENV = "",
    PUBLIC_PRERENDER_ENABLED: PUBLIC_PRERENDER_ENABLED_ENV = "",
    PUBLIC_PRERENDER_DIR: PUBLIC_PRERENDER_DIR_ENV = "",
    ANALYTICS_COMPACTION_INTERVAL_MS: ANALYTICS_COMPACTION_INTERVAL_MS_ENV = "",
    VITE_PWA_DEV_ENABLED: VITE_PWA_DEV_ENABLED_ENV = "false",
    HOME_HERO_SHELL_ENABLED: HOME_HERO_SHELL_ENABLED_ENV = "true",
    NODE_ENV = "",
  } = env;

  const isProduction = NODE_ENV === "production";
  const isMaintenanceMode = isTruthyEnv(MAINTENANCE_MODE_ENV, false);
  const isRbacV2Enabled = isTruthyEnv(RBAC_V2_ENABLED_ENV, false);
  const isRbacV2AcceptLegacyStar = isTruthyEnv(RBAC_V2_ACCEPT_LEGACY_STAR_ENV, true);
  const isAutoUploadReorganizationEnabled = !["0", "false", "no", "off"].includes(
    String(AUTO_UPLOAD_REORGANIZE || "")
      .trim()
      .toLowerCase(),
  );
  const isAutoUploadReorganizationOnStartupEnabled = isTruthyEnv(
    AUTO_UPLOAD_REORGANIZE_ON_STARTUP_ENV,
    false,
  );
  const isOpsAlertsWebhookEnabled = isTruthyEnv(OPS_ALERTS_WEBHOOK_ENABLED_ENV, false);
  const isMetricsEnabled = isTruthyEnv(METRICS_ENABLED_ENV, false);
  const isPwaDevEnabled = VITE_PWA_DEV_ENABLED_ENV === "true";
  const isHomeHeroShellEnabled = isTruthyEnv(HOME_HERO_SHELL_ENABLED_ENV, true);
  const isPublicPrerenderEnabled = isTruthyEnv(PUBLIC_PRERENDER_ENABLED_ENV, isProduction);
  const MFA_ENROLLMENT_TTL_MS = Number.isFinite(Number(MFA_ENROLLMENT_TTL_MS_ENV))
    ? Math.min(Math.max(Math.floor(Number(MFA_ENROLLMENT_TTL_MS_ENV)), 60_000), 24 * 60 * 60 * 1000)
    : 10 * 60 * 1000;
  const ADMIN_EXPORT_TTL_HOURS = Number.isFinite(Number(ADMIN_EXPORT_TTL_HOURS_ENV))
    ? Math.min(Math.max(Math.floor(Number(ADMIN_EXPORT_TTL_HOURS_ENV)), 1), 7 * 24)
    : 24;
  const OWNER_IDS = (OWNER_IDS_ENV || (isProduction ? "" : "380305493391966208"))
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const originConfig = buildOriginConfig({
    appOriginEnv: APP_ORIGIN,
    adminOriginsEnv: ADMIN_ORIGINS,
    isProduction,
  });
  const ALLOWED_ORIGINS = originConfig.allowedOrigins;
  const PRIMARY_APP_ORIGIN = originConfig.primaryAppOrigin;
  const PRIMARY_APP_HOST = originConfig.primaryAppHost;
  const { buildSiteSettingsStoragePayload, normalizeSiteSettings, normalizeUploadsDeep } =
    createSiteSettingsRuntimeHelpers({
      primaryAppOrigin: PRIMARY_APP_ORIGIN,
    });
  const OPS_ALERTS_WEBHOOK_PROVIDER =
    String(OPS_ALERTS_WEBHOOK_PROVIDER_ENV || "discord")
      .trim()
      .toLowerCase() || "discord";
  const OPS_ALERTS_WEBHOOK_URL = String(OPS_ALERTS_WEBHOOK_URL_ENV || "").trim();
  const adminExportsDir = path.resolve(
    repoRootDir,
    String(ADMIN_EXPORTS_DIR || "").trim() || path.join("backups", "admin-exports"),
  );
  const publicPrerenderDir = path.resolve(
    repoRootDir,
    String(PUBLIC_PRERENDER_DIR_ENV || "").trim() || path.join("backups", "public-prerender"),
  );
  const epubImportJobsDir = path.resolve(repoRootDir, path.join("backups", "epub-import-jobs"));
  const projectImageImportJobsDir = path.resolve(
    repoRootDir,
    path.join("backups", "project-image-import-jobs"),
  );
  const projectImageExportJobsDir = path.resolve(
    repoRootDir,
    path.join("backups", "project-image-export-jobs"),
  );
  const sessionSecretList = resolveSessionSecrets({
    sessionSecretsEnv: SESSION_SECRETS,
    sessionSecretFallback: SESSION_SECRET,
  });
  const dataEncryptionKeyring = parseDataEncryptionKeyring({
    dataEncryptionKeysJson: DATA_ENCRYPTION_KEYS_JSON,
    legacySecret: sessionSecretList[0] || SESSION_SECRET || "",
  });
  const sessionCookieConfig = buildSessionCookieConfig({
    isProduction,
    cookieBaseName: "rainbow.sid",
    sessionSecret: SESSION_SECRET,
    sessionSecrets: sessionSecretList.join(","),
  });
  const MFA_RECOVERY_CODE_PEPPER = String(SECURITY_RECOVERY_CODE_PEPPER || "").trim();
  const MFA_ICON_URL = String(TOTP_ICON_URL || "").trim();
  const METRICS_TOKEN_NORMALIZED = String(METRICS_TOKEN || "").trim();
  const OPERATIONAL_HEALTH_TOKEN_NORMALIZED = String(OPERATIONAL_HEALTH_TOKEN || "").trim();
  const OPS_ALERTS_WEBHOOK_TIMEOUT_MS = parseEnvInteger(
    OPS_ALERTS_WEBHOOK_TIMEOUT_MS_ENV,
    5000,
    1000,
    30000,
  );
  const OPS_ALERTS_WEBHOOK_INTERVAL_MS = parseEnvInteger(
    OPS_ALERTS_WEBHOOK_INTERVAL_MS_ENV,
    60000,
    10000,
    3600000,
  );
  const OPS_ALERTS_DB_LATENCY_WARNING_MS = parseEnvInteger(
    OPS_ALERTS_DB_LATENCY_WARNING_MS_ENV,
    1000,
    50,
    60000,
  );
  const RATE_LIMIT_PREFIX =
    String(RATE_LIMIT_PREFIX_ENV || "nekomorto:rate_limit").trim() || "nekomorto:rate_limit";
  const IDEMPOTENCY_TTL_MS = parseEnvInteger(
    IDEMPOTENCY_TTL_MS_ENV,
    24 * 60 * 60 * 1000,
    1000,
    7 * 24 * 60 * 60 * 1000,
  );
  const PUBLIC_READ_CACHE_TTL_MS = parseEnvInteger(
    PUBLIC_READ_CACHE_TTL_MS_ENV,
    30000,
    250,
    300000,
  );
  const PUBLIC_READ_CACHE_MAX_ENTRIES = parseEnvInteger(
    PUBLIC_READ_CACHE_MAX_ENTRIES_ENV,
    4000,
    100,
    50000,
  );
  const ANALYTICS_COMPACTION_INTERVAL_MS = parseEnvInteger(
    ANALYTICS_COMPACTION_INTERVAL_MS_ENV,
    30 * 60 * 1000,
    60 * 1000,
    24 * 60 * 60 * 1000,
  );
  const ANALYTICS_RETENTION_DAYS = parseEnvInteger(ANALYTICS_RETENTION_DAYS_ENV, 90, 7, 3650);
  const ANALYTICS_AGG_RETENTION_DAYS = parseEnvInteger(
    ANALYTICS_AGG_RETENTION_DAYS_ENV,
    365,
    30,
    3650,
  );

  return {
    ADMIN_EXPORT_TTL_HOURS,
    ANALYTICS_AGG_RETENTION_DAYS,
    ANALYTICS_COMPACTION_INTERVAL_MS,
    ANALYTICS_IP_SALT,
    ANALYTICS_RETENTION_DAYS,
    ALLOWED_ORIGINS,
    BOOTSTRAP_TOKEN,
    DATABASE_URL,
    DISCORD_CLIENT_ID,
    DISCORD_CLIENT_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    MFA_ENROLLMENT_TTL_MS,
    MFA_ICON_URL,
    MFA_ISSUER,
    MFA_RECOVERY_CODE_PEPPER,
    METRICS_TOKEN_NORMALIZED,
    OPERATIONAL_HEALTH_TOKEN_NORMALIZED,
    OPS_ALERTS_DB_LATENCY_WARNING_MS,
    OPS_ALERTS_WEBHOOK_INTERVAL_MS,
    OPS_ALERTS_WEBHOOK_PROVIDER,
    OPS_ALERTS_WEBHOOK_TIMEOUT_MS,
    OPS_ALERTS_WEBHOOK_URL,
    OWNER_IDS,
    PORT,
    PRIMARY_APP_HOST,
    PRIMARY_APP_ORIGIN,
    publicPrerenderDir,
    PUBLIC_READ_CACHE_MAX_ENTRIES,
    PUBLIC_READ_CACHE_TTL_MS,
    RATE_LIMIT_PREFIX,
    SESSION_SECRET,
    adminExportsDir,
    buildSiteSettingsStoragePayload,
    dataEncryptionKeyring,
    epubImportJobsDir,
    isAutoUploadReorganizationEnabled,
    isAutoUploadReorganizationOnStartupEnabled,
    isHomeHeroShellEnabled,
    isMaintenanceMode,
    isMetricsEnabled,
    isOpsAlertsWebhookEnabled,
    isProduction,
    isPublicPrerenderEnabled,
    isPwaDevEnabled,
    isRbacV2AcceptLegacyStar,
    isRbacV2Enabled,
    normalizeSiteSettings,
    normalizeUploadsDeep,
    projectImageExportJobsDir,
    projectImageImportJobsDir,
    sessionCookieConfig,
    sessionSecretList,
    IDEMPOTENCY_TTL_MS,
  };
};

export default buildServerBootConfig;
