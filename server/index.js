import "dotenv/config";
import connectPgSimple from "connect-pg-simple";
import crypto from "crypto";
import express from "express";
import session from "express-session";
import fs from "fs";
import multer from "multer";
import path from "path";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { deriveAniListMediaOrganization } from "../shared/anilist-media.js";
import {
  buildInstitutionalOgImageAlt,
  resolveInstitutionalOgPageKeyFromPath,
  resolveInstitutionalOgPagePath,
  resolveInstitutionalOgPageTitle,
  resolveInstitutionalOgSupportText,
} from "../shared/institutional-og-seo.js";
import {
  buildPostOgImageAlt,
  buildPostOgRevision,
  buildVersionedPostOgImagePath,
} from "../shared/post-og-seo.js";
import { buildPublicPostDetail } from "./routes/content/public-posts/shared.js";
import {
  getProjectEpisodePageCount,
  hasProjectEpisodePages,
  normalizeProjectEpisodeContentFormat,
  normalizeProjectEpisodePages,
  normalizeProjectReaderConfig,
  resolveProjectEpisodeContentFormat,
  normalizeProjectReaderPreferences,
  resolveProjectReaderConfig,
} from "../shared/project-reader.js";
import { buildAdminExportRuntimeDependencies } from "./bootstrap/build-admin-export-runtime-dependencies.js";
import { buildContentRuntimeDependencies } from "./bootstrap/build-content-runtime-dependencies.js";
import { buildMediaSupportRuntimeDependencies } from "./bootstrap/build-media-support-runtime-dependencies.js";
import { buildOperationalMonitoringRuntimeDependencies } from "./bootstrap/build-operational-monitoring-runtime-dependencies.js";
import { buildProjectRuntimeDependencies } from "./bootstrap/build-project-runtime-dependencies.js";
import { buildPublicRuntimeDependencies } from "./bootstrap/build-public-runtime-dependencies.js";
import { buildRootServerRegistrationSource } from "./bootstrap/build-root-server-registration-source.js";
import { buildServerBootConfig } from "./bootstrap/build-server-boot-config.js";
import { buildSiteConfigRuntimeDependencies } from "./bootstrap/build-site-config-runtime-dependencies.js";
import { buildSiteRenderingRuntimeDependencies } from "./bootstrap/build-site-rendering-runtime-dependencies.js";
import { buildUserRuntimeDependencies } from "./bootstrap/build-user-runtime-dependencies.js";
import { buildWebhookRuntimeDependencies } from "./bootstrap/build-webhook-runtime-dependencies.js";
import { createContentRuntimeBundle } from "./bootstrap/create-content-runtime-bundle.js";
import { createMediaSupportRuntimeBundle } from "./bootstrap/create-media-support-runtime-bundle.js";
import { createProjectRuntimeBundle } from "./bootstrap/create-project-runtime-bundle.js";
import { createPublicRuntimeBundle } from "./bootstrap/create-public-runtime-bundle.js";
import {
  createServerPlatformRuntime,
  getRequestIp as getTrustedRequestIp,
} from "./bootstrap/create-server-platform-runtime.js";
import { createSiteConfigRuntimeBundle } from "./bootstrap/create-site-config-runtime-bundle.js";
import { createSiteRenderingRuntimeBundle } from "./bootstrap/create-site-rendering-runtime-bundle.js";
import { createUserRuntimeBundle } from "./bootstrap/create-user-runtime-bundle.js";
import { createWebhookRuntimeBundle } from "./bootstrap/create-webhook-runtime-bundle.js";
import { registerDirectServerRoutes } from "./bootstrap/register-direct-server-routes.js";
import { createRootServerRouteContexts } from "./bootstrap/register-root-server-routes.js";
import { registerServerRoutes } from "./bootstrap/register-server-routes.js";
import { startServerJobs } from "./bootstrap/start-server-jobs.js";
import { createAdminExportRuntime } from "./lib/admin-export-runtime.js";
import * as adminExports from "./lib/admin-exports.js";
import {
  createAstroPublicRequestHandler,
  resolveAstroPublicRoutePayload,
} from "./lib/astro-public-runtime.js";
import {
  filterByDateRange,
  filterExportEntries,
  normalizeExportDataset,
  normalizeExportFilters,
  normalizeExportStatus,
  writeExportFile,
} from "./lib/admin-exports.js";
import { createAnalyticsStore } from "./lib/analytics-store.js";
import { ANILIST_API, fetchAniListMediaById } from "./lib/anilist-client.js";
import { API_CONTRACT_VERSION } from "./lib/api-contract-v1.js";
import { createAuditLogStore } from "./lib/audit-log-store.js";
import * as authzLib from "./lib/authz.js";
import {
  betterAuthSessionBridge,
  registerBetterAuthCompatibilityRoutes,
  registerBetterAuthHandler,
  resetBetterAuthPasskeysForUser,
  resetBetterAuthTotpForUser,
} from "./lib/better-auth-runtime.js";
import {
  AccessRole,
  addOwnerRoleLabel,
  can,
  computeEffectiveAccessRole,
  computeGrants,
  defaultPermissionsForRole,
  expandLegacyPermissions,
  normalizeAccessRole,
  PermissionId,
  removeOwnerRoleLabel,
  sanitizePermissionsForStorage,
} from "./lib/authz.js";
import {
  isUploadFolderAllowedInScope,
  resolveUploadScopeAccess,
  shouldIncludeUploadInHashDedupe,
} from "./lib/avatar-upload-scope.js";
import { getBuildMetadata } from "./lib/build-metadata.js";
import { deriveChapterSynopsis } from "./lib/chapter-synopsis.js";
import { buildCommentTargetInfo } from "./lib/comment-target-info.js";
import { bulkModeratePendingComments } from "./lib/comments-bulk-moderation.js";
import { selectRecentApprovedComments } from "./lib/dashboard-recent-comments.js";
import { createDataRepository } from "./lib/data-repository.js";
import { createDataRepositoryAdaptersRuntime } from "./lib/data-repository-adapters-runtime.js";
import { createDataRepositoryBasicRuntime } from "./lib/data-repository-basic-runtime.js";
import { withDatabaseStartupRetry } from "./lib/database-startup-retry.js";
import { proxyDiscordAvatarRequest } from "./lib/discord-avatar-proxy.js";
import { buildEditorialCalendarItems } from "./lib/editorial-calendar.js";
import { createGlobalErrorHandler } from "./lib/global-error-handler.js";
import { buildHealthStatusResponse } from "./lib/health-checks.js";
import {
  extractLocalStylesheetHrefs,
  injectBootstrapGlobals,
  injectHomeHeroShell,
  injectPreloadLinks,
} from "./lib/html-bootstrap.js";
import { applyHtmlCachingHeaders } from "./lib/html-cache-control.js";
import {
  readClientBuildManifest,
  resolvePublicRouteModulePreloads,
} from "./lib/client-build-manifest.js";
import { createIdempotencyStore } from "./lib/idempotency-store.js";
import {
  buildInstitutionalOgDeliveryHeaders,
  buildInstitutionalOgRevisionValue,
  buildVersionedInstitutionalOgImagePath,
  getInstitutionalOgCachedRender,
} from "./lib/institutional-og-delivery.js";
import { createJobQueue } from "./lib/job-queue.js";
import { updateLexicalPollVotes } from "./lib/lexical-poll-votes.js";
import { truncateMetaDescription } from "./lib/meta-description.js";
import { createMetricsRegistry } from "./lib/metrics.js";
import { createOgRenderCache } from "./lib/og-render-cache.js";
import {
  buildOperationalAlertsResponse,
  buildOperationalAlertsV1,
} from "./lib/operational-alerts.js";
import { createOperationalMonitoringRuntime } from "./lib/operational-monitoring-runtime.js";
import { resolveAuthAppOrigin } from "./lib/origin-config.js";
import { extractFirstImageFromPostContent, resolvePostCover } from "./lib/post-cover.js";
import { getPostOgCachedRender } from "./lib/post-og-delivery.js";
import { createSlug, createUniqueSlug } from "./lib/post-slug.js";
import { resolvePostStatus } from "./lib/post-status.js";
import { dedupePostVersionRecordsNewestFirst } from "./lib/post-version-dedupe.js";
import { prisma } from "./lib/prisma-client.js";
import { applyProjectChapterUpdate } from "./lib/project-chapter-editor.js";
import {
  applyEpisodePublicationMetadata,
  collectEpisodeUpdates as collectEpisodeUpdatesByVisibility,
  isEpisodePublic,
  resolveProjectUpdateUnitLabel,
} from "./lib/project-episode-updates.js";
import {
  findDuplicateEpisodeKey,
  findPublishedImageEpisodeWithoutPages,
  resolveEpisodeLookup,
} from "./lib/project-episodes.js";
import { exportProjectEpub } from "./lib/project-epub-export.js";
import { importProjectEpub } from "./lib/project-epub-import.js";
import { cleanupProjectEpubImportTempUploads } from "./lib/project-epub-import-cleanup.js";
import {
  deleteEpubImportJobResult,
  EPUB_IMPORT_JOB_RESULT_TTL_MS,
  readEpubImportJobResult,
  toEpubImportJobApiResponse,
  writeEpubImportJobResult,
} from "./lib/project-epub-import-jobs.js";
import {
  EPUB_IMPORT_MULTIPART_LIMITS,
  mapEpubImportExecutionError,
  mapEpubImportMultipartError,
} from "./lib/project-epub-import-request.js";
import { localizeProjectImageFields } from "./lib/project-image-localizer.js";
import {
  exportProjectImageChapter,
  exportProjectImageCollection,
  importProjectImageChapters,
  previewProjectImageImport,
} from "./lib/project-manga.js";
import {
  deleteProjectImageExportJobResult,
  deleteProjectImageImportJobResult,
  ensureProjectImageExportJobsDirectory,
  PROJECT_IMAGE_EXPORT_JOB_RESULT_TTL_MS,
  PROJECT_IMAGE_IMPORT_JOB_RESULT_TTL_MS,
  readProjectImageImportJobResult,
  toProjectImageExportJobApiResponse,
  toProjectImageImportJobApiResponse,
  writeProjectImageImportJobResult,
} from "./lib/project-manga-jobs.js";
import {
  mapProjectImageImportExecutionError,
  mapProjectImageImportMultipartError,
  PROJECT_IMAGE_IMPORT_MULTIPART_LIMITS,
  resolveProjectImageImportRequestInput,
} from "./lib/project-manga-request.js";
import {
  buildProjectOgDeliveryHeaders,
  buildProjectOgRevision,
  buildVersionedProjectOgImagePath,
  getProjectOgCachedRender,
  prewarmProjectOgCache,
} from "./lib/project-og-delivery.js";
import { buildProjectReadingOgCardModel } from "./lib/project-reading-og.js";
import {
  buildProjectReadingOgDeliveryHeaders,
  buildProjectReadingOgRevisionValue,
  buildVersionedProjectReadingOgImagePath,
  getProjectReadingOgCachedRender,
} from "./lib/project-reading-og-delivery.js";
import {
  createGetActiveProjectTypes,
  isChapterBasedType,
  normalizeTypeLookupKey,
} from "./lib/project-type-utils.js";
import { findDuplicateVolumeCover } from "./lib/project-volume-covers.js";
import { normalizeLegacyUpdateRecord } from "./lib/pt-legacy-normalization.js";
import { buildPublicBootstrapPayload } from "./lib/public-bootstrap.js";
import { buildPublicRoutePayload } from "./lib/public-bootstrap.js";
import { buildPublicDonationsRoutePayload } from "./lib/public-donations-qr.js";
import {
  resolveExistingPublicVariantUrl,
  resolveHomeHeroPreloadFromSlide,
  resolveProjectPosterPreload,
  resolvePublicPostCoverPreload,
  resolvePublicReaderHeroPreload,
  sanitizePublicMediaVariantEntry,
  shouldExposePublicUploadInMediaVariants,
} from "./lib/public-media-variants.js";
import { buildPublicReadableProjects, buildPublicVisibleProjects } from "./lib/public-projects.js";
import { resolvePublicProjectsListPreloads } from "./lib/public-projects-preloads.js";
import { createPublicReadCacheRuntime } from "./lib/public-read-cache-runtime.js";
import { resolvePublicRedirect } from "./lib/public-redirects.js";
import {
  buildPublicSearchSuggestions,
  normalizeSearchQuery,
  parseSearchLimit,
  parseSearchScope,
  publicSearchConfig,
} from "./lib/public-search.js";
import { serializePublicProjectCatalog } from "./lib/public-project-list.js";
import {
  PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
  PUBLIC_BOOTSTRAP_MODE_FULL,
  PUBLIC_BOOTSTRAP_MODE_SHELL,
} from "./lib/public-site-runtime.js";
import { resolvePublicTeamAvatarPreload } from "./lib/public-team-preloads.js";
import { PUBLIC_STATIC_PATHS as SITEMAP_STATIC_PUBLIC_PATHS } from "./lib/public-visibility-runtime.js";
import { createResolveBootstrapPwaEnabled } from "./lib/pwa-bootstrap-policy.js";
import { createRateLimitRuntime } from "./lib/rate-limit-runtime.js";
import { createRateLimiter } from "./lib/rate-limiter.js";
import { registerRuntimeMiddleware } from "./lib/register-runtime-middleware.js";
import { importRemoteImageFile } from "./lib/remote-image-import.js";
import { isPlainObject, parseEditRevisionOptions } from "./lib/request-runtime-helpers.js";
import { createResponseCache } from "./lib/response-cache.js";
import { createRevisionToken } from "./lib/revision-token.js";
import {
  createDiscordAvatarUrl,
  createRouteGuards,
  createRuntimeMetadataBuilder,
  normalizeTags,
} from "./lib/root-composition-helpers.js";
import { buildRssXml } from "./lib/rss-xml.js";
import { buildSchemaOrgPayload, serializeSchemaOrgEntry } from "./lib/schema-org.js";
import { decryptStringWithKeyring, encryptStringWithKeyring } from "./lib/security-crypto.js";
import {
  createSecurityEventPayload,
  createSlidingWindowCounter,
  getIpv4Network24,
  normalizeSecurityEventStatus,
  SecurityEventSeverity,
  SecurityEventStatus,
} from "./lib/security-events.js";
import { injectNonceIntoHtmlScripts } from "./lib/security-headers.js";
import {
  buildAuthRedirectUrl,
  establishAuthenticatedSession,
  saveSessionState,
} from "./lib/session-auth.js";
import { stripHtml } from "./lib/site-meta-builders.js";
import {
  defaultSiteSettings,
  fixMojibakeDeep,
  fixMojibakeText,
} from "./lib/site-settings-runtime-helpers.js";
import { buildSitemapXml } from "./lib/sitemap-xml.js";
import {
  PWA_MANIFEST_BASE,
  PWA_MANIFEST_CACHE_CONTROL,
  PWA_THEME_COLOR_DARK,
  PWA_THEME_COLOR_LIGHT,
  STATIC_DEFAULT_CACHE_CONTROL,
  setStaticCacheHeaders,
} from "./lib/static-runtime-policy.js";
import { createSystemAuditReqFactory } from "./lib/system-audit-req.js";
import { resolveThemeColor } from "./lib/theme-color.js";
import {
  buildOtpAuthUrl,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  verifyTotpCode,
} from "./lib/totp.js";
import {
  attachUploadMediaMetadata,
  buildStorageAreaSummary,
  computeBufferSha256,
  deriveFocalPointsFromCrops,
  findUploadByHash,
  getPrimaryFocalPoint,
  mergeUploadVariantPresetKeys,
  normalizeFocalCrops,
  normalizeFocalPoints,
  normalizeUploadVariantPresetKeys,
  normalizeVariants,
  resolveUploadAbsolutePath,
  resolveUploadVariantPresetKeysForArea,
} from "./lib/upload-media.js";
import {
  getUploadExtFromMime,
  getUploadMimeFromExtension,
  MAX_SVG_SIZE_BYTES,
  MAX_UPLOAD_SIZE_BYTES,
  normalizeAvatarDisplay,
  normalizeUploadMime,
  sanitizeSvg,
  sanitizeUploadBaseName,
  sanitizeUploadFolder,
  sanitizeUploadSlot,
  validateUploadImageBuffer,
} from "./lib/upload-runtime-helpers.js";
import {
  createUploadStorageService,
  getUploadVariantUrlPrefix,
  normalizeUploadStorageProvider,
  readUploadStorageProvider,
} from "./lib/upload-storage.js";
import { buildDiskStorageAreaSummary, runUploadsCleanup } from "./lib/uploads-cleanup.js";
import {
  invalidateUploadsCleanupPreviewCache,
  loadCachedUploadsCleanupPreview,
} from "./lib/uploads-cleanup-preview-cache.js";
import {
  extractUploadUrlsFromText,
  normalizeUploadUrl,
  runUploadsReorganization,
} from "./lib/uploads-reorganizer.js";
import {
  cleanupUploadStagingWorkspace,
  createUploadStagingWorkspace,
  materializeUploadEntrySourceToStaging,
  persistUploadEntryFromStaging,
  writeUploadBufferToStaging,
} from "./lib/uploads-storage-runtime.js";
import {
  sanitizeAssetUrl,
  sanitizeFavoriteWorksByCategory,
  sanitizeIconSource,
  sanitizePublicHref,
  sanitizeSocials,
} from "./lib/url-safety.js";
import {
  isDiscordAvatarUrl,
  resolveEffectiveUserAvatarUrl,
  resolveUserAvatarRenderVersion,
  shouldSyncDiscordAvatarToStoredUser,
} from "./lib/user-avatar.js";
import { createWebhookDeliveryRuntime } from "./lib/webhook-delivery-runtime.js";
import {
  buildWebhookAuditMeta,
  clampWebhookInteger,
  createResolveEditorialAuthorFromPost,
  createWebhookAuditReqFromContext as createWebhookAuditReqFromContextBase,
  resolveWebhookAuditActions as resolveWebhookAuditActionsBase,
} from "./lib/webhook-support.js";
import {
  computeWebhookRetryDelayMs,
  createWebhookWorkerId,
  summarizeWebhookDeliveries,
  toWebhookDeliveryApiResponse,
  WEBHOOK_DELIVERY_SCOPE,
  WEBHOOK_DELIVERY_STATUS,
} from "./lib/webhooks/delivery.js";
import { dispatchWebhookMessage } from "./lib/webhooks/dispatcher.js";
import {
  buildEditorialEventContext,
  buildEditorialMentions,
  migrateEditorialMentionPlaceholdersInSettings,
  normalizeEditorialWebhookSettings,
  renderWebhookTemplate,
  resolveEditorialEventChannel,
  resolveEditorialEventLabel,
  validateEditorialWebhookSettingsPlaceholders,
} from "./lib/webhooks/editorial.js";
import { toDiscordWebhookPayload } from "./lib/webhooks/providers/discord.js";
import {
  defaultOperationalWebhookSettings,
  defaultSecurityWebhookSettings,
  normalizeOperationalWebhookSettings,
  normalizeSecurityWebhookSettings,
  normalizeWebhookSettingsBundle,
  OPERATIONAL_WEBHOOK_INTERVAL_DEFAULT_MS,
  OPERATIONAL_WEBHOOK_INTERVAL_MAX_MS,
  OPERATIONAL_WEBHOOK_INTERVAL_MIN_MS,
} from "./lib/webhooks/settings.js";
import { buildOperationalAlertsWebhookNotification } from "./lib/webhooks/templates/operational-alerts.js";
import { diffOperationalAlertSets } from "./lib/webhooks/transitions.js";
import {
  buildWebhookTargetLabel,
  validateWebhookUrlForProvider,
} from "./lib/webhooks/validation.js";
import { registerAstroRoutes } from "./routes/register-astro-routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT_DIR = path.join(__dirname, "..");
const ASTRO_DIST_DIR = path.join(REPO_ROOT_DIR, "dist-astro");
const ASTRO_CLIENT_DIR = path.join(ASTRO_DIST_DIR, "client");
const ASTRO_CLIENT_ASSETS_DIR = path.join(ASTRO_CLIENT_DIR, "_astro");
const ASTRO_SERVER_ENTRY_PATH = path.join(ASTRO_DIST_DIR, "server", "entry.mjs");
const PUBLIC_UPLOADS_DIR = path.join(REPO_ROOT_DIR, "public", "uploads");
const uploadStorageService = createUploadStorageService({
  uploadsDir: PUBLIC_UPLOADS_DIR,
});

const app = express();
app.disable("x-powered-by");
const PgSessionStore = connectPgSimple(session);
let dataRepository = null;
const DEFAULT_PROJECT_TYPE_CATALOG = Object.freeze([
  "Anime",
  "Manga",
  "Mangá",
  "Webtoon",
  "Light Novel",
  "Filme",
  "OVA",
  "ONA",
  "Especial",
  "Spin-off",
]);

const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const AUDIT_MAX_ENTRIES = 20000;
const AUDIT_CSV_MAX_ROWS = 10000;
const AUDIT_META_STRING_MAX = 256;
const AUDIT_ENABLED_ACTION_PATTERN =
  /(^|\.)(create|update|delete|restore|reorder|login|logout|denied|failed|rate_limited|bootstrap|rebuild|image|rename|success|reorganize|sent|skipped|test)(\.|_|$)/i;
const AUDIT_DEFAULT_META_KEYS = [
  "error",
  "id",
  "slug",
  "resourceId",
  "projectId",
  "userId",
  "ownerId",
  "count",
  "targetId",
  "fromPrimaryId",
  "toPrimaryId",
  "fileName",
  "folder",
  "url",
  "wasOwner",
  "before",
  "after",
  "changes",
  "trigger",
  "moves",
  "rewrites",
  "failures",
  "durationMs",
  "usersSocialsDropped",
  "linkTypeIconsDropped",
  "siteLinksDropped",
  "uploadId",
  "hashSha256",
  "dedupeHit",
  "variantBytes",
  "altTextLength",
];
const AUDIT_META_ALLOWLIST = {
  "auth.login.failed": ["error"],
  "auth.login.success": ["userId"],
  "auth.logout": [],
  "auth.bootstrap.success": ["ownerId"],
  "auth.bootstrap.denied": ["error"],
  "auth.bootstrap.disabled": [],
  "auth.bootstrap.rate_limited": [],
  "uploads.image": [
    "uploadId",
    "fileName",
    "folder",
    "url",
    "hashSha256",
    "dedupeHit",
    "variantBytes",
  ],
  "uploads.image_from_url": [
    "uploadId",
    "fileName",
    "folder",
    "url",
    "remoteUrl",
    "hashSha256",
    "dedupeHit",
    "variantBytes",
  ],
  "uploads.rename": ["oldUrl", "newUrl", "updatedReferences", "replacements"],
  "uploads.alt_text.update": ["uploadId", "altTextLength"],
  "uploads.delete": ["url"],
  "uploads.cleanup_unused": [
    "deletedCount",
    "deletedUnusedUploadsCount",
    "deletedOrphanedVariantFilesCount",
    "deletedOrphanedVariantDirsCount",
    "quarantinedLooseOriginalFilesCount",
    "deletedQuarantineFilesCount",
    "deletedQuarantineDirsCount",
    "failedCount",
    "freedBytes",
    "quarantinedBytes",
    "purgedQuarantineBytes",
    "failures",
  ],
  "uploads.auto_reorganize.startup": ["trigger", "moves", "rewrites", "failures", "durationMs"],
  "uploads.auto_reorganize.post_save": ["trigger", "moves", "rewrites", "failures", "durationMs"],
  "uploads.auto_reorganize.project_save": [
    "trigger",
    "moves",
    "rewrites",
    "failures",
    "durationMs",
  ],
  "uploads.auto_reorganize.failed": [
    "trigger",
    "moves",
    "rewrites",
    "failures",
    "durationMs",
    "error",
  ],
  "posts.version.create": ["id", "slug", "versionId", "reason", "label"],
  "posts.rollback": [
    "id",
    "slug",
    "versionId",
    "targetVersionId",
    "backupVersionId",
    "rollbackVersionId",
    "slugAdjusted",
  ],
  "users.create": ["id", "after"],
  "users.update": ["id", "before", "after", "changes"],
  "users.update_self": ["id", "before", "after", "changes"],
  "users.delete": ["id", "wasOwner", "before"],
  "owners.update": ["count", "before", "after"],
  "owners.transfer_primary": [
    "targetId",
    "fromPrimaryId",
    "toPrimaryId",
    "before",
    "after",
    "changes",
  ],
  "security.update.sanitization_startup": [
    "usersSocialsDropped",
    "linkTypeIconsDropped",
    "siteLinksDropped",
  ],
  "editorial_webhook.queued": [
    "deliveryId",
    "scope",
    "channel",
    "eventKey",
    "eventLabel",
    "postId",
    "projectId",
    "attempt",
  ],
  "editorial_webhook.sent": [
    "deliveryId",
    "scope",
    "eventKey",
    "eventLabel",
    "channel",
    "status",
    "statusCode",
    "attempt",
    "durationMs",
    "nextAttemptAt",
    "postId",
    "projectId",
  ],
  "editorial_webhook.failed": [
    "deliveryId",
    "scope",
    "eventKey",
    "eventLabel",
    "channel",
    "status",
    "code",
    "statusCode",
    "attempt",
    "durationMs",
    "nextAttemptAt",
    "error",
    "postId",
    "projectId",
  ],
  "ops_alerts.webhook.queued": ["deliveryId", "scope", "eventLabel", "attempt"],
  "ops_alerts.webhook.sent": [
    "deliveryId",
    "scope",
    "eventLabel",
    "status",
    "statusCode",
    "attempt",
    "durationMs",
    "nextAttemptAt",
  ],
  "ops_alerts.webhook.failed": [
    "deliveryId",
    "scope",
    "eventLabel",
    "status",
    "code",
    "statusCode",
    "attempt",
    "durationMs",
    "nextAttemptAt",
    "error",
  ],
  "security.webhook.queued": ["deliveryId", "scope", "eventLabel", "securityEventId", "attempt"],
  "security.webhook.sent": [
    "deliveryId",
    "scope",
    "eventLabel",
    "securityEventId",
    "status",
    "statusCode",
    "attempt",
    "durationMs",
    "nextAttemptAt",
  ],
  "security.webhook.failed": [
    "deliveryId",
    "scope",
    "eventLabel",
    "securityEventId",
    "status",
    "code",
    "statusCode",
    "attempt",
    "durationMs",
    "nextAttemptAt",
    "error",
  ],
  "editorial_webhook.skipped": ["eventKey", "channel", "code", "postId", "projectId"],
  "integrations.webhooks_editorial.read": ["channel", "eventKey"],
  "integrations.webhooks_editorial.update": [
    "channel",
    "eventKey",
    "count",
    "postId",
    "projectId",
    "code",
  ],
  "integrations.webhooks_editorial.test": [
    "channel",
    "eventKey",
    "status",
    "code",
    "statusCode",
    "attempt",
    "postId",
    "projectId",
    "error",
  ],
  "integrations.webhooks.read": ["scope", "channel", "eventKey"],
  "integrations.webhooks.update": ["scope", "channel", "eventKey", "count", "code"],
  "integrations.webhooks.operational_test": ["status", "code", "statusCode", "attempt", "error"],
  "integrations.webhooks.security_test": [
    "status",
    "code",
    "statusCode",
    "attempt",
    "securityEventId",
    "error",
  ],
};

const { appendAuditLog, isAuditActionEnabled, loadAuditLog, parseAuditTs } = createAuditLogStore({
  auditDefaultMetaKeys: AUDIT_DEFAULT_META_KEYS,
  auditEnabledActionPattern: AUDIT_ENABLED_ACTION_PATTERN,
  auditMaxEntries: AUDIT_MAX_ENTRIES,
  auditMetaAllowlist: AUDIT_META_ALLOWLIST,
  auditMetaStringMax: AUDIT_META_STRING_MAX,
  auditRetentionMs: AUDIT_RETENTION_MS,
  crypto,
  fixMojibakeText,
  getDataRepository: () => dataRepository,
  getRequestIp: getTrustedRequestIp,
  getPrimaryAppOrigin: () => PRIMARY_APP_ORIGIN,
});

const DISCORD_API = "https://discord.com/api/v10";
const GOOGLE_TOKEN_API = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_API = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPES = ["identify", "email"];
const GOOGLE_SCOPES = ["openid", "email", "profile"];

const {
  ADMIN_EXPORT_TTL_HOURS,
  ANALYTICS_AGG_RETENTION_DAYS,
  ANALYTICS_COMPACTION_INTERVAL_MS,
  ANALYTICS_IP_SALT,
  ANALYTICS_RETENTION_DAYS,
  ALLOWED_ORIGINS,
  BOOTSTRAP_TOKEN,
  CONFIGURED_DISCORD_REDIRECT_URI,
  CONFIGURED_GOOGLE_REDIRECT_URI,
  DATABASE_URL,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  IDEMPOTENCY_TTL_MS,
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
  PUBLIC_READ_CACHE_MAX_ENTRIES,
  PUBLIC_READ_CACHE_TTL_MS,
  SESSION_SECRET,
  SESSION_TABLE,
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
  isPwaDevEnabled,
  isRbacV2AcceptLegacyStar,
  isRbacV2Enabled,
  normalizeSiteSettings,
  normalizeUploadsDeep,
  projectImageExportJobsDir,
  projectImageImportJobsDir,
  sessionCookieConfig,
} = buildServerBootConfig({
  repoRootDir: REPO_ROOT_DIR,
});

const metricsRegistry = createMetricsRegistry({
  defaultLabels: {
    service: "nekomorto",
  },
});
const authFailedByIpCounter = createSlidingWindowCounter();
const mfaFailedByUserCounter = createSlidingWindowCounter();
if (!String(DATABASE_URL || "").trim()) {
  throw new Error("DATABASE_URL is required");
}
const sessionStore = new PgSessionStore({
  pool: new Pool({ connectionString: DATABASE_URL }),
  tableName: String(SESSION_TABLE || "user_sessions"),
  createTableIfMissing: false,
  ttl: 60 * 60 * 24 * 7,
});
const AUTH_FAILED_BURST_WARNING = Object.freeze({ threshold: 8, windowMs: 5 * 60 * 1000 });
const AUTH_FAILED_BURST_CRITICAL = Object.freeze({ threshold: 20, windowMs: 15 * 60 * 1000 });
const MFA_FAILED_BURST_WARNING = Object.freeze({ threshold: 5, windowMs: 10 * 60 * 1000 });
const EXCESSIVE_SESSIONS_WARNING = 7;
const NEW_NETWORK_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_EXPORT_MAX_ROWS = 25_000;
const SESSION_INDEX_TOUCH_MIN_INTERVAL_MS = 30 * 1000;
const sessionIndexTouchTsBySid = new Map();
const createSystemAuditReq = createSystemAuditReqFactory({
  createRequestId: () => crypto.randomUUID(),
});

const ANALYTICS_SCHEMA_VERSION = 1;
const ANALYTICS_RETENTION_MS = ANALYTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const ANALYTICS_AGG_RETENTION_MS = ANALYTICS_AGG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const ANALYTICS_EVENT_TYPE_SET = new Set([
  "view",
  "chapter_view",
  "download_click",
  "comment_created",
  "comment_approved",
  "pwa_install_prompt_shown",
  "pwa_install_prompt_accepted",
  "pwa_install_prompt_dismissed",
  "pwa_installed",
]);
const ANALYTICS_COOLDOWN_EVENT_TYPE_SET = new Set(["view", "chapter_view"]);
const ANALYTICS_COOLDOWN_RESOURCE_SET = new Set(["post", "project", "chapter"]);
const ANALYTICS_VIEW_COOLDOWN_MS = 30 * 60 * 1000;
const ANALYTICS_META_STRING_MAX = 180;
const analyticsViewCooldown = new Map();
const PUBLIC_ANALYTICS_EVENT_TYPE_SET = new Set([
  "chapter_view",
  "download_click",
  "pwa_install_prompt_shown",
  "pwa_install_prompt_accepted",
  "pwa_install_prompt_dismissed",
  "pwa_installed",
]);
const PUBLIC_ANALYTICS_RESOURCE_TYPE_SET = new Set(["chapter", "pwa"]);
const DASHBOARD_WIDGET_IDS = new Set([
  "metrics_overview",
  "analytics_summary",
  "projects_rank",
  "recent_posts",
  "comments_queue",
  "ops_status",
  "projects_quick",
]);
const DASHBOARD_HOME_ROLE_IDS = new Set(["editor", "moderador", "admin"]);

const rateLimiter = createRateLimiter({
  onError: ({ label, error }) => {
    console.warn(
      `[rate-limit:${String(label || "unknown")}] ${String(error?.message || error || "error")}`,
    );
  },
});
const runtimeRateLimit = createRateLimitRuntime({
  isProduction,
  metricsRegistry,
  rateLimiter,
});
const idempotencyStore = createIdempotencyStore({
  ttlMs: IDEMPOTENCY_TTL_MS,
  maxEntries: 5000,
});
const publicReadCache = createResponseCache({
  defaultTtlMs: PUBLIC_READ_CACHE_TTL_MS,
  maxEntries: PUBLIC_READ_CACHE_MAX_ENTRIES,
});
const { invalidatePublicReadCacheTags, readPublicCachedJson, writePublicCachedJson } =
  createPublicReadCacheRuntime({
    publicReadCache,
  });
const ogRenderCache = createOgRenderCache({
  ttlMs: 5 * 60 * 1000,
  maxEntries: 256,
});
const backgroundJobQueue = createJobQueue({
  name: "backend",
  concurrency: 1,
  historySize: 200,
  onError: ({ type, error }) => {
    console.error(
      `[job-queue:${String(type || "job")}] ${String(error?.message || error || "failed")}`,
    );
  },
});

dataRepository = await withDatabaseStartupRetry(
  () =>
    createDataRepository({
      databaseUrl: DATABASE_URL,
      ownerIdsFallback: OWNER_IDS,
      analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION,
      analyticsRetentionDays: ANALYTICS_RETENTION_DAYS,
      analyticsAggRetentionDays: ANALYTICS_AGG_RETENTION_DAYS,
    }),
  {
    onRetry: ({ attempt, error, maxAttempts, retryDelayMs }) => {
      console.warn(
        `[startup:database] data repository bootstrap failed on attempt ${attempt}/${maxAttempts}: ${String(error?.message || error || "db_startup_failed")}. Retrying in ${retryDelayMs}ms.`,
      );
    },
  },
);

const dataRepositoryAdaptersRuntime = createDataRepositoryAdaptersRuntime({
  dataRepository,
});

const {
  claimWebhookDelivery,
  findUserIdentityRecord,
  findUserIdentityRecordsByEmail,
  isEpubImportJobStorageAvailable,
  isProjectImageImportJobStorageAvailable,
  loadAdminExportJobs,
  loadEpubImportJobs,
  loadProjectImageExportJobs,
  loadProjectImageImportJobs,
  loadSecurityEvents,
  loadWebhookState,
  upsertAdminExportJob,
  upsertEpubImportJob,
  upsertProjectImageExportJob,
  upsertProjectImageImportJob,
  upsertSecurityEvent,
  upsertUserIdentityRecord,
  upsertWebhookDelivery,
  writeUserIdentityRecords,
  writeWebhookState,
} = dataRepositoryAdaptersRuntime;

const {
  getPrimaryOwnerId,
  isOwner,
  isPrimaryOwner,
  loadAllowedUsers,
  loadLinkTypes,
  loadOwnerIds,
  loadUserIdentityRecords,
  loadUsers,
  normalizeLinkTypes,
  writeAllowedUsers,
  writeLinkTypes,
  writeOwnerIds,
  writeUsers,
} = createDataRepositoryBasicRuntime({
  dataRepository,
  getNormalizeUploadsDeep: () => normalizeUploadsDeep,
  getNormalizeUsers: () => normalizeUsers,
  ownerIds: OWNER_IDS,
  sanitizeIconSource,
});

const {
  clientDistDir,
  clientRootDir,
  getIndexHtml,
  getRequestIp,
  httpServer,
  isAllowedOrigin,
  resolveDiscordRedirectUri,
  resolveGoogleRedirectUri,
  toAbsoluteUrl,
  viteDevServer,
} = await createServerPlatformRuntime({
  app,
  fs,
  repoRootDir: REPO_ROOT_DIR,
  allowedOrigins: ALLOWED_ORIGINS,
  configuredDiscordRedirectUri: CONFIGURED_DISCORD_REDIRECT_URI,
  configuredGoogleRedirectUri: CONFIGURED_GOOGLE_REDIRECT_URI,
  primaryAppOrigin: PRIMARY_APP_ORIGIN,
  isProduction,
});

const clientBuildManifest = readClientBuildManifest({
  clientRootDir,
  clientDistDir,
});

const {
  appendAnalyticsEvent,
  buildAnalyticsRange,
  enqueueAnalyticsCompactionJob,
  filterAnalyticsEvents,
  getDayKeyFromTs,
  incrementCounter,
  loadAnalyticsEvents,
  normalizeAnalyticsTypeFilter,
  parseAnalyticsRangeDays,
  parseAnalyticsTs,
} = createAnalyticsStore({
  analyticsAggRetentionDays: ANALYTICS_AGG_RETENTION_DAYS,
  analyticsAggRetentionMs: ANALYTICS_AGG_RETENTION_MS,
  analyticsCooldownEventTypeSet: ANALYTICS_COOLDOWN_EVENT_TYPE_SET,
  analyticsCooldownResourceSet: ANALYTICS_COOLDOWN_RESOURCE_SET,
  analyticsEventTypeSet: ANALYTICS_EVENT_TYPE_SET,
  analyticsIpSalt: ANALYTICS_IP_SALT,
  analyticsMetaStringMax: ANALYTICS_META_STRING_MAX,
  analyticsRetentionDays: ANALYTICS_RETENTION_DAYS,
  analyticsRetentionMs: ANALYTICS_RETENTION_MS,
  analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION,
  analyticsViewCooldown,
  analyticsViewCooldownMs: ANALYTICS_VIEW_COOLDOWN_MS,
  backgroundJobQueue,
  crypto,
  getDataRepository: () => dataRepository,
  getRequestIp,
  primaryAppHost: PRIMARY_APP_HOST,
  primaryAppOrigin: PRIMARY_APP_ORIGIN,
  sessionSecret: SESSION_SECRET,
});

if (!SESSION_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("Missing SESSION_SECRET in env.");
}
if (!String(process.env.BETTER_AUTH_SECRET || "").trim() && process.env.NODE_ENV === "production") {
  throw new Error("Missing BETTER_AUTH_SECRET in env.");
}
if ((!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) && process.env.NODE_ENV === "production") {
  throw new Error("Missing DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET in env.");
}
const isGoogleOAuthConfigured = Boolean(
  String(GOOGLE_CLIENT_ID || "").trim() || String(GOOGLE_CLIENT_SECRET || "").trim(),
);
if (isGoogleOAuthConfigured) {
  if (!String(GOOGLE_CLIENT_ID || "").trim() || !String(GOOGLE_CLIENT_SECRET || "").trim()) {
    throw new Error("Google OAuth requires both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }
}
if (isProduction && !OWNER_IDS.length && !BOOTSTRAP_TOKEN) {
  throw new Error("Missing OWNER_IDS or BOOTSTRAP_TOKEN in env.");
}

registerRuntimeMiddleware({
  app,
  apiContractVersion: API_CONTRACT_VERSION,
  canReadPublicAsset: runtimeRateLimit.canReadPublicAsset,
  clientDistDir,
  clientRootDir,
  getRequestIp,
  idempotencyStore,
  idempotencyTtlMs: IDEMPOTENCY_TTL_MS,
  isAllowedOrigin,
  isMaintenanceMode,
  isMetricsEnabled,
  isProduction,
  isPwaDevEnabled,
  loadSiteSettings: () => loadSiteSettings(),
  loadUploads: () => loadUploads(),
  maybeEmitAdminActionFromNewNetwork: (req) => maybeEmitAdminActionFromNewNetwork(req),
  metricsRegistry,
  pwaManifestBase: PWA_MANIFEST_BASE,
  pwaManifestCacheControl: PWA_MANIFEST_CACHE_CONTROL,
  pwaThemeColorDark: PWA_THEME_COLOR_DARK,
  pwaThemeColorLight: PWA_THEME_COLOR_LIGHT,
  primaryAppHost: PRIMARY_APP_HOST,
  primaryAppOrigin: PRIMARY_APP_ORIGIN,
  registerBeforeBodyParsers: registerBetterAuthHandler,
  sessionCookieConfig,
  sessionStore,
  setStaticCacheHeaders,
  staticDefaultCacheControl: STATIC_DEFAULT_CACHE_CONTROL,
  updateSessionIndexFromRequest: (...args) => updateSessionIndexFromRequest(...args),
  uploadStorageService,
  viteDevServer,
});

app.use(betterAuthSessionBridge);
registerBetterAuthCompatibilityRoutes(app);

const USER_PREFERENCES_MAX_BYTES = 20 * 1024;
const USER_PREFERENCES_THEME_MODE_SET = new Set(["light", "dark", "system"]);
const USER_PREFERENCES_DENSITY_SET = new Set(["comfortable", "compact"]);

const ensureNoEditConflict = () => true;

const PUBLIC_READ_CACHE_TAGS = Object.freeze({
  BOOTSTRAP: "public:bootstrap",
  SEARCH: "public:search",
  POSTS: "public:posts",
  PROJECTS: "public:projects",
});

const contentRuntime = createContentRuntimeBundle(
  buildContentRuntimeDependencies({
    PUBLIC_READ_CACHE_TAGS,
    createSlug,
    createUniqueSlug,
    crypto,
    dataRepository,
    dedupePostVersionRecordsNewestFirst,
    getProjectEpisodePageCount,
    invalidatePublicReadCacheTags,
    normalizeLegacyUpdateRecord,
    normalizeProjectEpisodeContentFormat,
    normalizeProjectEpisodePages,
    normalizeProjectReaderConfig,
    normalizeUploadsDeep,
    readUploadStorageProvider,
    resolveEpisodeLookup,
    resolvePostStatus,
  }),
);

const {
  invalidateJsonFileCache,
  readJsonFileFromCache,
  writeJsonFileToCache,
  appendPostVersion,
  applyCommentCountToPosts,
  applyCommentCountToProjects,
  applyPostSnapshotForRollback,
  incrementPostViews,
  incrementProjectViews,
  isWithinRestoreWindow,
  listPostVersions,
  loadComments,
  loadPostVersions,
  loadPosts,
  loadProjects,
  loadUpdates,
  loadUploads,
  normalizePosts,
  normalizeProjects,
  postVersionReasonLabel,
  writeComments,
  writePosts,
  writeProjects,
  writeUpdates,
  writeUploads,
} = contentRuntime;

const siteConfigRuntime = createSiteConfigRuntimeBundle(
  buildSiteConfigRuntimeDependencies({
    DEFAULT_PROJECT_TYPE_CATALOG,
    OPS_ALERTS_WEBHOOK_INTERVAL_MS,
    OPS_ALERTS_WEBHOOK_PROVIDER,
    OPS_ALERTS_WEBHOOK_TIMEOUT_MS,
    OPS_ALERTS_WEBHOOK_URL,
    PUBLIC_READ_CACHE_TAGS,
    PUBLIC_UPLOADS_DIR,
    SecurityEventSeverity,
    SecurityEventStatus,
    appendAuditLog,
    buildSiteSettingsStoragePayload,
    createSecurityEventPayload,
    createSystemAuditReq,
    crypto,
    dataRepository,
    defaultOperationalWebhookSettings,
    defaultSecurityWebhookSettings,
    defaultSiteSettings,
    fixMojibakeDeep,
    invalidateJsonFileCache,
    invalidatePublicReadCacheTags,
    isAutoUploadReorganizationEnabled,
    isOpsAlertsWebhookEnabled,
    loadComments,
    loadPosts,
    loadProjects,
    loadUpdates,
    loadUploads,
    loadUsers,
    migrateEditorialMentionPlaceholdersInSettings,
    normalizeEditorialWebhookSettings,
    normalizeOperationalWebhookSettings,
    normalizeSecurityWebhookSettings,
    normalizeSiteSettings,
    normalizeUploadsDeep,
    normalizeWebhookSettingsBundle,
    readJsonFileFromCache,
    runUploadsReorganization,
    sanitizeIconSource,
    validateWebhookUrlForProvider,
    writeComments,
    writeJsonFileToCache,
    writePosts,
    writeProjects,
    writeUpdates,
    writeUploads,
    writeUsers,
  }),
);

const {
  buildOperationalWebhookTestTransition,
  buildSecurityWebhookTestEvent,
  ensureEditorialWebhookSettingsNoConflict,
  ensureWebhookSettingsNoConflict,
  loadIntegrationSettings,
  loadIntegrationSettingsSources,
  loadPages,
  loadSiteSettings,
  loadTagTranslations,
  normalizeUnifiedWebhookSettingsForRequest,
  runAutoUploadReorganization,
  validateEditorialWebhookChannelUrls,
  validateUnifiedWebhookSettingsUrls,
  writeIntegrationSettings,
  writePages,
  writeSiteSettings,
  writeTagTranslations,
} = siteConfigRuntime;

const mediaSupportRuntime = createMediaSupportRuntimeBundle(
  buildMediaSupportRuntimeDependencies({
    PRIMARY_APP_ORIGIN,
    PUBLIC_UPLOADS_DIR,
    STATIC_DEFAULT_CACHE_CONTROL,
    appendAuditLog,
    attachUploadMediaMetadata,
    backgroundJobQueue,
    buildDiskStorageAreaSummary,
    buildStorageAreaSummary,
    cleanupUploadStagingWorkspace,
    createSystemAuditReq,
    createUploadStagingWorkspace,
    crypto,
    dataRepository,
    deriveFocalPointsFromCrops,
    extractUploadUrlsFromText,
    fs,
    getPrimaryFocalPoint,
    getPublicVisibleProjects: () => getPublicVisibleProjects(),
    getUploadVariantUrlPrefix,
    isProduction,
    loadComments,
    loadIntegrationSettings,
    loadLinkTypes,
    loadPages,
    loadPosts,
    loadProjects,
    loadSiteSettings,
    loadTagTranslations,
    loadUpdates,
    loadUploads,
    loadUsers,
    materializeUploadEntrySourceToStaging,
    mergeUploadVariantPresetKeys,
    metricsRegistry,
    normalizeFocalCrops,
    normalizeFocalPoints,
    normalizeUploadStorageProvider,
    normalizeUploadUrl,
    normalizeUploadVariantPresetKeys,
    normalizeVariants,
    ogRenderCache,
    path,
    persistUploadEntryFromStaging,
    prewarmProjectOgCache,
    rateLimiter,
    readUploadStorageProvider,
    resolveExistingPublicVariantUrl,
    resolveUploadAbsolutePath,
    sanitizeIconSource,
    sanitizePublicHref,
    sanitizeSocials,
    sanitizePublicMediaVariantEntry,
    sanitizeUploadSlot,
    shouldExposePublicUploadInMediaVariants,
    uploadStorageService,
    writeUploads,
  }),
);

const {
  buildGravatarUrl,
  buildManagedStorageAreaSummary,
  buildPublicMediaVariants,
  canAttemptAuth,
  canBootstrap,
  canRegisterPollVote,
  canRegisterView,
  canSubmitComment,
  canUploadImage,
  createGravatarHash,
  deleteManagedUploadEntryAssets,
  deletePrivateUploadByUrl,
  ensureUploadEntryHasRequiredVariants,
  extractRequestedUploadFocalPayload,
  getUploadFolderFromUrlValue,
  hasOwnField,
  isPrivateUploadFolder,
  normalizeEmail,
  readUploadAltText,
  readUploadFocalState,
  readUploadSlot,
  readUploadSlotManaged,
  resolveGravatarAvatarUrl,
  resolveIncomingUploadFocalState,
  resolveMetaImageVariantUrl,
  runStartupSecuritySanitization,
  upsertUploadEntries,
} = mediaSupportRuntime;
const publicMediaRuntime = mediaSupportRuntime;

const siteRenderingRuntime = createSiteRenderingRuntimeBundle(
  buildSiteRenderingRuntimeDependencies({
    PRIMARY_APP_ORIGIN,
    applyHtmlCachingHeaders,
    buildInstitutionalOgImageAlt,
    buildInstitutionalOgRevisionValue,
    buildPostOgImageAlt,
    buildPostOgRevision,
    buildProjectOgRevision,
    buildProjectReadingOgCardModel,
    buildProjectReadingOgRevisionValue,
    buildVersionedInstitutionalOgImagePath,
    buildVersionedPostOgImagePath,
    buildVersionedProjectOgImagePath,
    buildVersionedProjectReadingOgImagePath,
    extractFirstImageFromPostContent,
    getIndexHtml,
    injectNonceIntoHtmlScripts,
    loadPages,
    loadSiteSettings,
    loadTagTranslations,
    resolveInstitutionalOgPagePath,
    resolveInstitutionalOgPageTitle,
    resolveInstitutionalOgSupportText,
    resolveMetaImageVariantUrl,
    resolvePostCover,
    serializeSchemaOrgEntry,
    toAbsoluteUrl,
    truncateMetaDescription,
    viteDevServer,
  }),
);
const {
  buildEditorialWebhookImageContext,
  buildInstitutionalPageMeta,
  buildPostMeta,
  buildProjectMeta,
  buildProjectReadingMeta,
  buildSiteMetaWithSettings,
  getPageTitleFromPath,
  renderMetaHtml,
  sendHtml,
} = siteRenderingRuntime;
const writePostsWithPublicPrerender = (...args) => {
  return writePosts(...args);
};
const writeProjectsWithPublicPrerender = (...args) => {
  return writeProjects(...args);
};
const writePagesWithPublicPrerender = (...args) => {
  return writePages(...args);
};
const writeSiteSettingsWithPublicPrerender = (...args) => {
  return writeSiteSettings(...args);
};
const writeTagTranslationsWithPublicPrerender = (...args) => {
  return writeTagTranslations(...args);
};
const runAutoUploadReorganizationWithPublicPrerender = async (...args) => {
  return await runAutoUploadReorganization(...args);
};

const getActiveProjectTypes = createGetActiveProjectTypes({
  defaultProjectTypeCatalog: DEFAULT_PROJECT_TYPE_CATALOG,
  loadProjects,
  normalizeProjects,
});
const { createWebhookAuditReqFromContext, enqueueWebhookDelivery, resolveWebhookAuditActions } =
  createWebhookDeliveryRuntime({
    buildWebhookTargetLabel,
    clampWebhookInteger,
    createRequestId: () => crypto.randomUUID(),
    createWebhookAuditReqFromContextBase,
    resolveWebhookAuditActionsBase,
    upsertWebhookDelivery,
    validateWebhookUrlForProvider,
    webhookDeliveryScope: WEBHOOK_DELIVERY_SCOPE,
    webhookDeliveryStatus: WEBHOOK_DELIVERY_STATUS,
  });

const userRuntime = createUserRuntimeBundle(
  buildUserRuntimeDependencies({
    AUTH_FAILED_BURST_CRITICAL,
    AUTH_FAILED_BURST_WARNING,
    AccessRole,
    DASHBOARD_HOME_ROLE_IDS,
    DASHBOARD_WIDGET_IDS,
    EXCESSIVE_SESSIONS_WARNING,
    MFA_ENROLLMENT_TTL_MS,
    MFA_FAILED_BURST_WARNING,
    MFA_ICON_URL,
    MFA_ISSUER,
    MFA_RECOVERY_CODE_PEPPER,
    NEW_NETWORK_LOOKBACK_MS,
    PRIMARY_APP_ORIGIN,
    PermissionId,
    SESSION_INDEX_TOUCH_MIN_INTERVAL_MS,
    SecurityEventSeverity,
    SecurityEventStatus,
    USER_PREFERENCES_DENSITY_SET,
    USER_PREFERENCES_THEME_MODE_SET,
    addOwnerRoleLabel,
    appendAuditLog,
    authFailedByIpCounter,
    buildAnalyticsRange,
    buildCommentTargetInfo,
    buildOtpAuthUrl,
    can,
    computeEffectiveAccessRole,
    computeGrants,
    createRevisionToken,
    createSecurityEventPayload,
    createSystemAuditReq,
    crypto,
    dataEncryptionKeyring,
    dataRepository,
    decryptStringWithKeyring,
    defaultPermissionsForRole,
    expandLegacyPermissions,
    filterAnalyticsEvents,
    generateTotpSecret,
    getDispatchCriticalSecurityEventWebhook: () => dispatchCriticalSecurityEventWebhook,
    getIpv4Network24,
    getRequestIp,
    hashRecoveryCode,
    isDiscordAvatarUrl,
    isOwner,
    isPlainObject,
    isPrimaryOwner,
    isRbacV2AcceptLegacyStar,
    isRbacV2Enabled,
    loadAnalyticsEvents,
    loadComments,
    loadOwnerIds,
    loadPosts,
    loadProjects,
    loadSecurityEvents,
    loadSiteSettings,
    loadUserIdentityRecords,
    loadUploads,
    loadUsers,
    metricsRegistry,
    mfaFailedByUserCounter,
    normalizeAccessRole,
    normalizeAnalyticsTypeFilter,
    normalizeAvatarDisplay,
    normalizePosts,
    normalizeProjectReaderPreferences,
    normalizeProjects,
    normalizeSecurityEventStatus,
    normalizeUploadsDeep,
    parseAnalyticsRangeDays,
    removeOwnerRoleLabel,
    resolveEffectiveUserAvatarUrl,
    resolveUploadScopeAccess,
    resolveUserAvatarRenderVersion,
    sanitizeAssetUrl,
    sanitizeFavoriteWorksByCategory,
    sanitizePermissionsForStorage,
    sanitizeSocials,
    selectRecentApprovedComments,
    sessionIndexTouchTsBySid,
    sessionStore,
    shouldSyncDiscordAvatarToStoredUser,
    upsertSecurityEvent,
    verifyTotpCode,
    writeAllowedUsers,
    writeUsers,
  }),
);

const {
  buildMySecuritySummary,
  buildPublicTeamMembers,
  buildUserPayload,
  clearEnrollmentFromSession,
  clearPendingMfaEnrollmentFromSession,
  clearPendingMfaEnrollmentRedirectTarget,
  completeRequiredMfaEnrollmentForSession,
  deleteUserMfaTotpRecord,
  getPendingMfaEnrollmentRedirectTarget,
  getPendingMfaEnrollmentState,
  isPendingMfaEnrollmentRequiredForUser,
  markMfaEnrollmentRequiredForSession,
  shouldRequireTotpEnrollmentForPasswordLogin,
  ensureOwnerUser,
  handleAuthFailureSecuritySignals,
  handleMfaFailureSecuritySignals,
  isTotpEnabledForUser,
  listActiveSessionsForUser,
  loadUserPreferences,
  loadUserSessionIndexRecords,
  maybeEmitAdminActionFromNewNetwork,
  maybeEmitExcessiveSessionsEvent,
  maybeEmitNewNetworkLoginEvent,
  normalizeUserPreferences,
  normalizeUsers,
  resolveEnrollmentFromSession,
  resolveMfaMetadata,
  revokeSessionBySid,
  revokeUserSessionIndexRecord,
  startTotpEnrollment,
  syncPersistedDiscordAvatarForLogin,
  updateSessionIndexFromRequest,
  verifyTotpOrRecoveryCode,
  writeUserMfaTotpRecord,
  writeUserPreferences,
} = userRuntime;

const { evaluateOperationalMonitoring } = createOperationalMonitoringRuntime(
  buildOperationalMonitoringRuntimeDependencies({
    OPS_ALERTS_DB_LATENCY_WARNING_MS,
    PUBLIC_UPLOADS_DIR,
    backgroundJobQueue,
    buildHealthStatusResponse,
    buildOperationalAlertsResponse,
    buildOperationalAlertsV1,
    dataRepository,
    fs,
    isMaintenanceMode,
    isProduction,
    prisma,
    rateLimiter,
    sessionCookieConfig,
  }),
);

const projectRuntime = createProjectRuntimeBundle(
  buildProjectRuntimeDependencies({
    EPUB_IMPORT_JOB_RESULT_TTL_MS,
    EPUB_IMPORT_MULTIPART_LIMITS,
    PROJECT_IMAGE_EXPORT_JOB_RESULT_TTL_MS,
    PROJECT_IMAGE_IMPORT_JOB_RESULT_TTL_MS,
    PROJECT_IMAGE_IMPORT_MULTIPART_LIMITS,
    PUBLIC_UPLOADS_DIR,
    backgroundJobQueue,
    deleteEpubImportJobResult,
    deleteProjectImageExportJobResult,
    deleteProjectImageImportJobResult,
    ensureProjectImageExportJobsDirectory,
    epubImportJobsDir,
    express,
    exportProjectImageCollection,
    findDuplicateEpisodeKey,
    findDuplicateVolumeCover,
    fs,
    importProjectEpub,
    importProjectImageChapters,
    loadEpubImportJobs,
    loadProjectImageExportJobs,
    loadProjectImageImportJobs,
    loadUploads,
    mapEpubImportExecutionError,
    mapEpubImportMultipartError,
    mapProjectImageImportExecutionError,
    mapProjectImageImportMultipartError,
    multer,
    normalizeProjects,
    path,
    projectImageExportJobsDir,
    projectImageImportJobsDir,
    upsertEpubImportJob,
    upsertProjectImageExportJob,
    upsertProjectImageImportJob,
    writeEpubImportJobResult,
    writeProjectImageImportJobResult,
    writeUploads,
  }),
);

const { recoverEpubImportJobsAfterRestart, recoverProjectImageJobsAfterRestart } = projectRuntime;

const buildRuntimeMetadata = createRuntimeMetadataBuilder({
  apiVersion: API_CONTRACT_VERSION,
  getBuildMetadata,
});

const WEBHOOK_WORKER_POLL_INTERVAL_MS = 5_000;
const OPERATIONAL_ALERTS_SCHEDULER_POLL_MS = 5_000;

const analyticsCompactionState = {
  timer: null,
};

const webhookRuntime = createWebhookRuntimeBundle(
  buildWebhookRuntimeDependencies({
    OPERATIONAL_WEBHOOK_INTERVAL_DEFAULT_MS,
    OPERATIONAL_WEBHOOK_INTERVAL_MAX_MS,
    OPERATIONAL_WEBHOOK_INTERVAL_MIN_MS,
    PRIMARY_APP_ORIGIN,
    WEBHOOK_DELIVERY_SCOPE,
    WEBHOOK_DELIVERY_STATUS,
    appendAuditLog,
    buildEditorialEventContext,
    buildEditorialMentions,
    buildEditorialWebhookImageContext,
    buildOperationalAlertsWebhookNotification,
    buildWebhookAuditMeta,
    buildWebhookTargetLabel,
    claimWebhookDelivery,
    clampWebhookInteger,
    computeWebhookRetryDelayMs,
    createResolveEditorialAuthorFromPost,
    createSystemAuditReq,
    createWebhookAuditReqFromContext,
    createWebhookWorkerId,
    crypto,
    deriveChapterSynopsis,
    diffOperationalAlertSets,
    dispatchWebhookMessage,
    enqueueWebhookDelivery,
    evaluateOperationalMonitoring,
    getActiveProjectTypes,
    getRequestIp,
    loadIntegrationSettings,
    loadProjects,
    loadSiteSettings,
    loadTagTranslations,
    loadUsers,
    loadWebhookState,
    normalizeEditorialWebhookSettings,
    normalizeProjects,
    normalizeTypeLookupKey,
    normalizeUsers,
    renderWebhookTemplate,
    resolveEditorialEventChannel,
    resolveEditorialEventLabel,
    resolveEpisodeLookup,
    resolveWebhookAuditActions,
    toDiscordWebhookPayload,
    upsertWebhookDelivery,
    validateWebhookUrlForProvider,
    writeWebhookState,
  }),
);

const {
  dispatchCriticalSecurityEventWebhook,
  operationalAlertsWebhookState,
  runOperationalAlertsSchedulerTick,
  runWebhookDeliveryWorkerTick,
  webhookDeliveryWorkerState,
} = webhookRuntime;

const { requireAuth, requirePrimaryOwner } = createRouteGuards({
  isOwner,
  isPrimaryOwner,
});

const adminExportRuntime = createAdminExportRuntime(
  buildAdminExportRuntimeDependencies({
    ADMIN_EXPORT_MAX_ROWS,
    ADMIN_EXPORT_TTL_HOURS,
    AccessRole,
    adminExportsDir,
    appendAuditLog,
    backgroundJobQueue,
    createSystemAuditReq,
    filterByDateRange,
    filterExportEntries,
    loadAdminExportJobs,
    loadAuditLog,
    loadOwnerIds,
    loadSecurityEvents,
    loadUserSessionIndexRecords,
    loadUsers,
    metricsRegistry,
    normalizeExportDataset,
    normalizeExportFilters,
    normalizeExportStatus,
    normalizeUsers,
    upsertAdminExportJob,
    writeExportFile,
  }),
);

recoverEpubImportJobsAfterRestart();
recoverProjectImageJobsAfterRestart();

const publicRuntime = createPublicRuntimeBundle(
  buildPublicRuntimeDependencies({
    BOOTSTRAP_PWA_ENABLED: isProduction || isPwaDevEnabled,
    PRIMARY_APP_ORIGIN,
    SITEMAP_STATIC_PUBLIC_PATHS,
    buildProjectOgRevision,
    buildPublicBootstrapPayload,
    buildPublicRoutePayload,
    buildPublicMediaVariants,
    buildPublicPostDetail,
    buildPublicReadableProjects,
    buildPublicTeamMembers,
    buildPublicVisibleProjects,
    buildUserPayload,
    createSlug,
    crypto,
    extractLocalStylesheetHrefs,
    injectBootstrapGlobals,
    injectHomeHeroShell,
    injectPreloadLinks,
    isEpisodePublic,
    loadLinkTypes,
    loadPages,
    loadPosts,
    loadProjects,
    loadSiteSettings,
    loadTagTranslations,
    loadUpdates,
    normalizePosts,
    normalizeProjects,
    resolveEpisodeLookup,
    resolveBootstrapPwaEnabled: createResolveBootstrapPwaEnabled({
      isProduction,
      isPwaDevEnabled,
    }),
    resolveHomeHeroPreloadFromSlide,
    resolveMetaImageVariantUrl,
    resolvePublicDonationsRoutePayload: buildPublicDonationsRoutePayload,
    resolvePostCover,
    resolveProjectPosterPreload,
    resolvePublicPostCoverPreload,
    resolvePublicProjectsListPreloads,
    resolvePublicReaderHeroPreload,
    resolvePublicRouteModulePreloads: (pathname) =>
      resolvePublicRouteModulePreloads({
        manifest: clientBuildManifest,
        pathname,
      }),
    resolvePublicTeamAvatarPreload,
    stripHtml,
  }),
);

const { getPublicReadableProjects, getPublicVisiblePosts, getPublicVisibleProjects } =
  publicRuntime;

const isAstroPublicBootstrapPathname = (pathname) => {
  const normalizedPathname = String(pathname || "").trim() || "/";
  return (
    normalizedPathname === "/" ||
    normalizedPathname === "/projetos" ||
    /^\/projeto\/[^/]+\/leitura\/[^/]+$/.test(normalizedPathname) ||
    /^\/projeto\/[^/]+$/.test(normalizedPathname) ||
    /^\/postagem\/[^/]+$/.test(normalizedPathname)
  );
};

const resolveAstroPublicRouteKind = (pathname) => {
  const normalizedPathname = String(pathname || "").trim() || "/";
  if (normalizedPathname === "/projetos") {
    return "projects-list";
  }
  if (/^\/projeto\/[^/]+\/leitura\/[^/]+$/.test(normalizedPathname)) {
    return "project-reading";
  }
  if (/^\/projeto\/[^/]+$/.test(normalizedPathname)) {
    return "project-detail";
  }
  if (normalizedPathname === "/equipe") {
    return "team";
  }
  if (normalizedPathname === "/doacoes") {
    return "donations";
  }
  return "";
};

const findAstroBootstrapProjectByRouteSlug = (projects, routeSlug) => {
  const rawRouteSlug = String(routeSlug || "").trim();
  if (!rawRouteSlug) {
    return null;
  }
  const normalizedRouteSlug = createSlug(rawRouteSlug);
  return (
    (Array.isArray(projects) ? projects : []).find((candidate) => {
      const candidateId = String(candidate?.id || "").trim();
      return (
        candidateId === rawRouteSlug ||
        createSlug(candidateId) === normalizedRouteSlug ||
        createSlug(candidate?.title || "") === normalizedRouteSlug
      );
    }) || null
  );
};

const buildAstroReadingRouteChapterPayload = ({ chapter, project, siteSettings }) => {
  const normalizedPages = normalizeProjectEpisodePages(chapter?.pages);
  const contentFormat = resolveProjectEpisodeContentFormat({
    contentFormat: chapter?.contentFormat,
    episode: chapter,
    pages: normalizedPages,
    projectType: project?.type,
  });
  const pageCount = getProjectEpisodePageCount({
    ...chapter,
    contentFormat,
    pages: normalizedPages,
  });
  return {
    number: Number.isFinite(Number(chapter?.number)) ? Number(chapter.number) : 0,
    volume: Number.isFinite(Number(chapter?.volume)) ? Number(chapter.volume) : undefined,
    title: String(chapter?.title || ""),
    entryKind:
      String(chapter?.entryKind || "")
        .trim()
        .toLowerCase() === "extra"
        ? "extra"
        : "main",
    entrySubtype: String(chapter?.entrySubtype || "").trim(),
    readingOrder: Number.isFinite(Number(chapter?.readingOrder))
      ? Number(chapter.readingOrder)
      : undefined,
    displayLabel: String(chapter?.displayLabel || "").trim(),
    synopsis: deriveChapterSynopsis(chapter),
    releaseDate: String(chapter?.releaseDate || ""),
    duration: String(chapter?.duration || ""),
    coverImageUrl: String(chapter?.coverImageUrl || normalizedPages[0]?.imageUrl || ""),
    coverImageAlt: String(chapter?.coverImageAlt || ""),
    sourceType: String(chapter?.sourceType || ""),
    sources: Array.isArray(chapter?.sources) ? chapter.sources : [],
    progressStage: String(chapter?.progressStage || ""),
    completedStages: Array.isArray(chapter?.completedStages) ? chapter.completedStages : [],
    chapterUpdatedAt: String(chapter?.chapterUpdatedAt || chapter?.updatedAt || ""),
    content: contentFormat === "lexical" ? String(chapter?.content || "") : "",
    contentFormat,
    pages: normalizedPages,
    pageCount,
    hasPages: hasProjectEpisodePages({
      ...chapter,
      contentFormat,
      pages: normalizedPages,
      pageCount,
    }),
    hasContent:
      contentFormat === "lexical"
        ? String(chapter?.content || "").trim().length > 0
        : normalizedPages.length > 0,
    readerConfig: resolveProjectReaderConfig({
      projectType: project?.type,
      siteSettings,
      projectReaderConfig: project?.readerConfig,
    }),
  };
};

const buildAstroProjectReadingRoutePayload = ({ req, siteSettings }) => {
  const project = findAstroBootstrapProjectByRouteSlug(
    getPublicReadableProjects(),
    req?.params?.id,
  );
  const chapterNumber = Number(req?.params?.chapter);
  if (!project || !Number.isFinite(chapterNumber)) {
    return null;
  }
  const routeVolume = Number(req?.query?.volume);
  const volume = Number.isFinite(routeVolume) ? routeVolume : undefined;
  const chapter =
    (Array.isArray(project?.episodeDownloads) ? project.episodeDownloads : []).find((entry) => {
      if (Number(entry?.number) !== chapterNumber) {
        return false;
      }
      if (volume === undefined) {
        return true;
      }
      return Number(entry?.volume) === volume;
    }) || null;
  if (!chapter) {
    return null;
  }
  const tagTranslations = loadTagTranslations();
  const chapterPayload = buildAstroReadingRouteChapterPayload({
    chapter,
    project,
    siteSettings,
  });
  const projectPayload = {
    ...project,
    readerConfig: chapterPayload.readerConfig,
  };
  return buildPublicRoutePayload({
    kind: "project-reading",
    project: projectPayload,
    chapter: chapterPayload,
    readerConfig: chapterPayload.readerConfig,
    tagTranslations,
    mediaVariants: buildPublicMediaVariants([projectPayload, chapterPayload]),
  });
};

const buildAstroRelationProjectLookup = (projects, relations) => {
  const relationKeys = new Set();
  (Array.isArray(relations) ? relations : []).forEach((relation) => {
    const projectId = String(relation?.projectId || "").trim();
    const anilistId = String(relation?.anilistId || "").trim();
    if (projectId) {
      relationKeys.add(projectId);
    }
    if (anilistId) {
      relationKeys.add(anilistId);
    }
  });
  if (relationKeys.size === 0) {
    return {};
  }
  return (Array.isArray(projects) ? projects : []).reduce((result, project) => {
    const projectId = String(project?.id || "").trim();
    const anilistId = String(project?.anilistId || "").trim();
    if (projectId && relationKeys.has(projectId)) {
      result[projectId] = projectId;
    }
    if (anilistId && relationKeys.has(anilistId)) {
      result[anilistId] = projectId;
    }
    return result;
  }, {});
};

const buildAstroRelationProjectCards = (projects, relations) => {
  const relationKeys = new Set();
  (Array.isArray(relations) ? relations : []).forEach((relation) => {
    const projectId = String(relation?.projectId || "").trim();
    const anilistId = String(relation?.anilistId || "").trim();
    if (projectId) {
      relationKeys.add(projectId);
    }
    if (anilistId) {
      relationKeys.add(anilistId);
    }
  });
  if (relationKeys.size === 0) {
    return {};
  }
  return (Array.isArray(projects) ? projects : []).reduce((result, project) => {
    const projectId = String(project?.id || "").trim();
    const anilistId = String(project?.anilistId || "").trim();
    if (!projectId) {
      return result;
    }
    const card = {
      id: projectId,
      title: String(project?.title || ""),
      cover: String(project?.cover || ""),
      coverAlt: String(project?.coverAlt || ""),
    };
    if (relationKeys.has(projectId)) {
      result[projectId] = card;
    }
    if (anilistId && relationKeys.has(anilistId)) {
      result[anilistId] = card;
    }
    return result;
  }, {});
};

const isAstroPublicRuntimeEnabled = isProduction;
const astroPublicRequestHandler = createAstroPublicRequestHandler({
  entryFilePath: ASTRO_SERVER_ENTRY_PATH,
  fs,
  injectAstroPublicHtml: async ({
    html,
    pathname,
    publicBootstrap,
    publicMe,
    publicRoutePayload,
    routeParams,
    routeQuery,
    settings,
  }) => {
    const injected = await publicRuntime.injectResolvedPublicDocumentHtml({
      html,
      includeHeroImagePreload: pathname === "/",
      includeHomeHeroShell: pathname === "/",
      includeProjectsImagePreloads: pathname === "/projetos",
      pages: loadPages(),
      pathname,
      publicBootstrap,
      publicMe: publicMe ? buildUserPayload(publicMe) : null,
      publicRoutePayload,
      routeParams,
      routeQuery,
      settings,
    });
    return injected.html;
  },
  injectNonceIntoHtmlScripts,
  isProduction,
  loadAstroFallbackRoutePayload: async ({ pathname, pages, req, routePayload, siteSettings }) => {
    if (pathname !== "/equipe" && pathname !== "/doacoes") {
      if (/^\/projeto\/[^/]+$/.test(pathname)) {
        const isCompleteProjectPayload =
          routePayload?.kind === "project-detail" &&
          routePayload.project &&
          typeof routePayload.project === "object";
        if (isCompleteProjectPayload) {
          return routePayload;
        }
      } else if (/^\/projeto\/[^/]+\/leitura\/[^/]+$/.test(pathname)) {
        const isCompleteReadingPayload =
          routePayload?.kind === "project-reading" &&
          routePayload.project &&
          typeof routePayload.project === "object" &&
          routePayload.chapter &&
          typeof routePayload.chapter === "object";
        if (isCompleteReadingPayload) {
          return routePayload;
        }
      } else {
        return routePayload;
      }
    }
    if (pathname === "/equipe") {
      const isCompleteTeamPayload =
        routePayload?.kind === "team" &&
        Array.isArray(routePayload.teamMembers) &&
        Array.isArray(routePayload.teamLinkTypes) &&
        routePayload.mediaVariants &&
        typeof routePayload.mediaVariants === "object";
      if (isCompleteTeamPayload) {
        return routePayload;
      }
    }
    if (pathname === "/doacoes") {
      const isCompleteDonationsPayload =
        routePayload?.kind === "donations" &&
        typeof routePayload.pixQrCodeUrl === "string" &&
        routePayload.cryptoQrCodeUrls &&
        typeof routePayload.cryptoQrCodeUrls === "object" &&
        !Array.isArray(routePayload.cryptoQrCodeUrls);
      if (isCompleteDonationsPayload) {
        return routePayload;
      }
    }
    return resolveAstroPublicRoutePayload({
      pathname,
      pages,
      req,
      siteSettings,
      buildPublicMediaVariants,
      buildPublicTeamMembers,
      loadLinkTypes,
      resolvePublicDonationsRoutePayload: buildPublicDonationsRoutePayload,
    });
  },
  loadAstroPublicBootstrap: ({ pathname, pages, req, siteSettings }) => {
    if (!isAstroPublicBootstrapPathname(pathname)) {
      return null;
    }
    if (pathname === "/projetos") {
      return null;
    }
    if (pathname === "/") {
      const cached = readPublicCachedJson(req);
      if (cached?.payload?.payloadMode === PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME) {
        return cached.payload;
      }
      const payload = publicRuntime.buildPublicBootstrapResponsePayload({
        pages,
        payloadMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
        settings: siteSettings,
      });
      writePublicCachedJson(req, payload, {
        tags: [PUBLIC_READ_CACHE_TAGS.BOOTSTRAP],
        ttlMs: PUBLIC_READ_CACHE_TTL_MS,
      });
      return payload;
    }
    const routeSlug = String(req?.params?.slug || "").trim();
    const currentPostDetail = routeSlug
      ? (() => {
          const post =
            getPublicVisiblePosts().find(
              (candidate) => String(candidate?.slug || "") === routeSlug,
            ) || null;
          return post ? buildPublicPostDetail({ post, resolvePostCover }) : null;
        })()
      : null;
    return publicRuntime.buildPublicBootstrapResponsePayload({
      currentPostDetail,
      pages,
      payloadMode: PUBLIC_BOOTSTRAP_MODE_FULL,
      settings: siteSettings,
    });
  },
  loadAstroRoutePayload: ({ pathname, pages, req, siteSettings }) =>
    resolveAstroPublicRoutePayload({
      pathname,
      pages,
      req,
      siteSettings,
      loadAstroPublicRoutePayload: () => {
        const routeKind = resolveAstroPublicRouteKind(pathname);
        if (!routeKind) {
          return null;
        }
        if (routeKind === "projects-list") {
          const projects = serializePublicProjectCatalog(getPublicVisibleProjects());
          return buildPublicRoutePayload({
            kind: "projects-list",
            projects,
            tagTranslations: loadTagTranslations(),
            mediaVariants: buildPublicMediaVariants(projects),
          });
        }
        if (routeKind === "project-detail") {
          const projects = getPublicVisibleProjects();
          const project = findAstroBootstrapProjectByRouteSlug(projects, req?.params?.id);
          if (!project) {
            return null;
          }
          const tagTranslations = loadTagTranslations();
          const projectPayload = { ...project };
          const relationProjectCards = buildAstroRelationProjectCards(projects, project?.relations);
          return buildPublicRoutePayload({
            kind: "project-detail",
            project: projectPayload,
            revision: buildProjectOgRevision({
              project: projectPayload,
              settings: siteSettings,
              translations: tagTranslations,
              origin: PRIMARY_APP_ORIGIN,
              resolveVariantUrl: resolveMetaImageVariantUrl,
            }),
            relationProjectLookup: buildAstroRelationProjectLookup(projects, project?.relations),
            relationProjectCards,
            tagTranslations,
            mediaVariants: buildPublicMediaVariants([
              projectPayload,
              projectPayload?.relations || [],
              Object.values(relationProjectCards),
            ]),
          });
        }
        if (routeKind === "project-reading") {
          return buildAstroProjectReadingRoutePayload({ req, siteSettings });
        }
        return undefined;
      },
    }),
  loadPages: () => loadPages(),
  loadSiteSettings: () => loadSiteSettings(),
  primaryAppOrigin: PRIMARY_APP_ORIGIN,
});

if (isAstroPublicRuntimeEnabled && fs.existsSync(ASTRO_CLIENT_ASSETS_DIR)) {
  app.use(
    "/_astro",
    express.static(ASTRO_CLIENT_ASSETS_DIR, {
      index: false,
      setHeaders: setStaticCacheHeaders,
    }),
  );
}

const rootRouteRegistrationDependencies = buildRootServerRegistrationSource({
  adminExports,
  authzLib,
  dataRepositoryAdaptersRuntime,
  userRuntime,
  publicMediaRuntime,
  adminExportRuntime,
  projectRuntime,
  publicRuntime,
  webhookRuntime,
  ANILIST_API,
  API_CONTRACT_VERSION,
  AUDIT_CSV_MAX_ROWS,
  BOOTSTRAP_TOKEN,
  DISCORD_API,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_TOKEN_API,
  GOOGLE_USERINFO_API,
  GOOGLE_SCOPES,
  MAX_SVG_SIZE_BYTES,
  MAX_UPLOAD_SIZE_BYTES,
  METRICS_TOKEN_NORMALIZED,
  OPERATIONAL_HEALTH_TOKEN_NORMALIZED,
  MFA_RECOVERY_CODE_PEPPER,
  PRIMARY_APP_ORIGIN,
  PUBLIC_ANALYTICS_EVENT_TYPE_SET,
  PUBLIC_ANALYTICS_RESOURCE_TYPE_SET,
  PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
  PUBLIC_BOOTSTRAP_MODE_FULL,
  PUBLIC_BOOTSTRAP_MODE_SHELL,
  PUBLIC_READ_CACHE_TAGS,
  PUBLIC_READ_CACHE_TTL_MS,
  PUBLIC_UPLOADS_DIR,
  SCOPES,
  STATIC_DEFAULT_CACHE_CONTROL,
  USER_PREFERENCES_MAX_BYTES,
  WEBHOOK_DELIVERY_STATUS,
  SecurityEventSeverity,
  SecurityEventStatus,
  app,
  appendAnalyticsEvent,
  appendAuditLog,
  appendPostVersion,
  applyCommentCountToPosts,
  applyCommentCountToProjects,
  applyEpisodePublicationMetadata,
  applyPostSnapshotForRollback,
  applyProjectChapterUpdate,
  attachUploadMediaMetadata,
  buildAnalyticsRange,
  buildAuthRedirectUrl,
  buildEditorialCalendarItems,
  buildGravatarUrl,
  buildInstitutionalOgDeliveryHeaders,
  buildInstitutionalPageMeta,
  buildManagedStorageAreaSummary,
  buildMySecuritySummary,
  buildOperationalWebhookTestTransition,
  buildPostMeta,
  buildProjectMeta,
  buildProjectOgDeliveryHeaders,
  buildProjectOgRevision,
  buildProjectReadingMeta,
  buildProjectReadingOgDeliveryHeaders,
  buildPublicSearchSuggestions,
  buildRssXml,
  buildRuntimeMetadata,
  buildSchemaOrgPayload,
  buildSecurityWebhookTestEvent,
  buildSiteMetaWithSettings,
  buildSitemapXml,
  buildUserPayload,
  bulkModeratePendingComments,
  canAttemptAuth,
  canBootstrap,
  canRegisterPollVote,
  canRegisterView,
  canSubmitComment,
  canUploadImage,
  cleanupProjectEpubImportTempUploads,
  cleanupUploadStagingWorkspace,
  clearEnrollmentFromSession,
  clearPendingMfaEnrollmentFromSession,
  clearPendingMfaEnrollmentRedirectTarget,
  collectEpisodeUpdatesByVisibility,
  completeRequiredMfaEnrollmentForSession,
  computeBufferSha256,
  createDiscordAvatarUrl,
  createGravatarHash,
  createRevisionToken,
  createSlug,
  createUniqueSlug,
  createUploadStagingWorkspace,
  crypto,
  dataEncryptionKeyring,
  deleteManagedUploadEntryAssets,
  deletePrivateUploadByUrl,
  deleteUserMfaTotpRecord,
  resetBetterAuthPasskeysForUser,
  resetBetterAuthTotpForUser,
  deriveAniListMediaOrganization,
  deriveChapterSynopsis,
  dispatchWebhookMessage,
  encryptStringWithKeyring,
  ensureEditorialWebhookSettingsNoConflict,
  ensureNoEditConflict,
  ensureOwnerUser,
  ensureUploadEntryHasRequiredVariants,
  ensureWebhookSettingsNoConflict,
  establishAuthenticatedSession,
  evaluateOperationalMonitoring,
  findUserIdentityRecord,
  upsertUserIdentityRecord,
  exportProjectEpub,
  exportProjectImageChapter,
  extractFirstImageFromPostContent,
  extractRequestedUploadFocalPayload,
  fetchAniListMediaById,
  filterAnalyticsEvents,
  findDuplicateEpisodeKey,
  findDuplicateVolumeCover,
  findPublishedImageEpisodeWithoutPages,
  findUploadByHash,
  generateRecoveryCodes,
  getActiveProjectTypes,
  getDayKeyFromTs,
  getIndexHtml,
  getInstitutionalOgCachedRender,
  getPageTitleFromPath,
  getPostOgCachedRender,
  getPrimaryOwnerId,
  getProjectEpisodePageCount,
  getProjectOgCachedRender,
  getProjectReadingOgCachedRender,
  getPendingMfaEnrollmentRedirectTarget,
  getPendingMfaEnrollmentState,
  getRequestIp,
  resolveGoogleRedirectUri,
  getUploadExtFromMime,
  getUploadFolderFromUrlValue,
  getUploadMimeFromExtension,
  getUploadVariantUrlPrefix,
  handleAuthFailureSecuritySignals,
  handleMfaFailureSecuritySignals,
  hashRecoveryCode,
  findUserIdentityRecordsByEmail,
  writeUserIdentityRecords,
  isPendingMfaEnrollmentRequiredForUser,
  markMfaEnrollmentRequiredForSession,
  shouldRequireTotpEnrollmentForPasswordLogin,
  hasOwnField,
  hasProjectEpisodePages,
  importProjectEpub,
  importRemoteImageFile,
  incrementCounter,
  incrementPostViews,
  incrementProjectViews,
  invalidateUploadsCleanupPreviewCache,
  isAllowedOrigin,
  isAuditActionEnabled,
  isChapterBasedType,
  isEpisodePublic,
  isEpubImportJobStorageAvailable,
  isHomeHeroShellEnabled,
  isMetricsEnabled,
  isOwner,
  isPlainObject,
  isPrimaryOwner,
  isPrivateUploadFolder,
  isProjectImageImportJobStorageAvailable,
  isRbacV2Enabled,
  isTotpEnabledForUser,
  isUploadFolderAllowedInScope,
  isWithinRestoreWindow,
  listActiveSessionsForUser,
  listPostVersions,
  loadAllowedUsers,
  loadAnalyticsEvents,
  loadAuditLog,
  loadCachedUploadsCleanupPreview,
  loadComments,
  loadIntegrationSettings,
  loadIntegrationSettingsSources,
  loadLinkTypes,
  loadOwnerIds,
  loadUserIdentityRecords,
  loadPages,
  loadPostVersions,
  loadPosts,
  loadProjects,
  loadSecurityEvents,
  loadSiteSettings,
  loadTagTranslations,
  loadUpdates,
  loadUploads,
  loadUserPreferences,
  loadUserSessionIndexRecords,
  loadUsers,
  localizeProjectImageFields,
  mapEpubImportExecutionError,
  mapProjectImageImportExecutionError,
  materializeUploadEntrySourceToStaging,
  maybeEmitExcessiveSessionsEvent,
  maybeEmitNewNetworkLoginEvent,
  metricsRegistry,
  migrateEditorialMentionPlaceholdersInSettings,
  normalizeAnalyticsTypeFilter,
  normalizeAvatarDisplay,
  normalizeEditorialWebhookSettings,
  normalizeEmail,
  normalizeLinkTypes,
  normalizePosts,
  normalizeProjectEpisodeContentFormat,
  normalizeProjectEpisodePages,
  normalizeProjects,
  normalizeSearchQuery,
  normalizeSiteSettings,
  normalizeTags,
  normalizeTypeLookupKey,
  normalizeUnifiedWebhookSettingsForRequest,
  normalizeUploadMime,
  normalizeUserPreferences,
  normalizeVariants,
  ogRenderCache,
  parseAnalyticsRangeDays,
  parseAnalyticsTs,
  parseAuditTs,
  parseEditRevisionOptions,
  parseSearchLimit,
  parseSearchScope,
  persistUploadEntryFromStaging,
  postVersionReasonLabel,
  previewProjectImageImport,
  proxyDiscordAvatarRequest,
  publicSearchConfig,
  readEpubImportJobResult,
  readProjectImageImportJobResult,
  readPublicCachedJson,
  readUploadAltText,
  readUploadFocalState,
  readUploadSlot,
  readUploadSlotManaged,
  readUploadStorageProvider,
  renderMetaHtml,
  requireAuth,
  requirePrimaryOwner,
  resolveAuthAppOrigin,
  resolveDiscordRedirectUri,
  resolveEditorialEventChannel,
  resolveEnrollmentFromSession,
  resolveEpisodeLookup,
  resolveGravatarAvatarUrl,
  resolveIncomingUploadFocalState,
  resolveInstitutionalOgPageKeyFromPath,
  resolveInstitutionalOgPageTitle,
  resolveMfaMetadata,
  resolvePostCover,
  resolvePostStatus,
  resolveProjectImageImportRequestInput,
  resolveProjectReaderConfig,
  resolveProjectUpdateUnitLabel,
  resolvePublicRedirect,
  resolveThemeColor,
  resolveUploadAbsolutePath,
  resolveUploadVariantPresetKeysForArea,
  revokeSessionBySid,
  revokeUserSessionIndexRecord,
  runAutoUploadReorganization,
  runUploadsCleanup,
  sanitizeFavoriteWorksByCategory,
  sanitizeSocials,
  sanitizeSvg,
  sanitizeUploadBaseName,
  sanitizeUploadFolder,
  sanitizeUploadSlot,
  saveSessionState,
  sendHtml,
  sessionCookieConfig,
  sessionIndexTouchTsBySid,
  shouldIncludeUploadInHashDedupe,
  startTotpEnrollment,
  summarizeWebhookDeliveries,
  syncPersistedDiscordAvatarForLogin,
  toAbsoluteUrl,
  toEpubImportJobApiResponse,
  toProjectImageExportJobApiResponse,
  toProjectImageImportJobApiResponse,
  toWebhookDeliveryApiResponse,
  updateLexicalPollVotes,
  updateSessionIndexFromRequest,
  upsertUploadEntries,
  uploadStorageService,
  validateEditorialWebhookChannelUrls,
  validateEditorialWebhookSettingsPlaceholders,
  validateUnifiedWebhookSettingsUrls,
  validateUploadImageBuffer,
  verifyTotpCode,
  verifyTotpOrRecoveryCode,
  writeComments,
  writeIntegrationSettings,
  writeAllowedUsers,
  writeLinkTypes,
  writeOwnerIds,
  writePages: writePagesWithPublicPrerender,
  writePosts: writePostsWithPublicPrerender,
  writeProjects: writeProjectsWithPublicPrerender,
  writePublicCachedJson,
  writeSiteSettings: writeSiteSettingsWithPublicPrerender,
  writeTagTranslations: writeTagTranslationsWithPublicPrerender,
  writeUpdates,
  writeUploadBufferToStaging,
  writeUploads,
  writeUserMfaTotpRecord,
  writeUserPreferences,
  writeUsers,
});

const rootRouteContexts = createRootServerRouteContexts(rootRouteRegistrationDependencies);

registerDirectServerRoutes(rootRouteContexts.directRouteDependencies);

if (isAstroPublicRuntimeEnabled) {
  registerAstroRoutes({
    app,
    handleAstroPublicRequest: astroPublicRequestHandler,
  });
}

registerServerRoutes(rootRouteContexts.serverRouteDependencies);
app.use(createGlobalErrorHandler());

const listenPort = Number(PORT);
startServerJobs({
  ANALYTICS_COMPACTION_INTERVAL_MS,
  OPERATIONAL_ALERTS_SCHEDULER_POLL_MS,
  WEBHOOK_WORKER_POLL_INTERVAL_MS,
  analyticsCompactionState,
  enqueueAnalyticsCompactionJob,
  httpServer,
  isAutoUploadReorganizationOnStartupEnabled,
  isMaintenanceMode,
  listenPort,
  operationalAlertsWebhookState,
  rateLimiter,
  runAutoUploadReorganization: runAutoUploadReorganizationWithPublicPrerender,
  runOperationalAlertsSchedulerTick,
  runStartupSecuritySanitization,
  runWebhookDeliveryWorkerTick,
  webhookDeliveryWorkerState,
});

const drainPersistQueueOnShutdown = async (signal) => {
  console.log(`[server] ${signal} received, draining persist queue...`);
  try {
    await dataRepositoryAdaptersRuntime.flushPersistQueue?.();
  } catch {
    // ignore drain errors during shutdown
  }
  process.exit(0);
};

process.on("SIGTERM", () => drainPersistQueueOnShutdown("SIGTERM"));
process.on("SIGINT", () => drainPersistQueueOnShutdown("SIGINT"));
