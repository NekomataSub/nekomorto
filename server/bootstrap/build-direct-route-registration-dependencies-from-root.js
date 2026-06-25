import { buildApiContractV1 } from "../lib/api-contract-v1.js";
import { buildDirectRouteRegistrationDependencies } from "./build-direct-route-registration-dependencies.js";

export const buildDirectRouteRegistrationDependenciesFromRoot = (dependencies = {}) =>
  buildDirectRouteRegistrationDependencies({
    app: dependencies.app,
    apiContractVersion: dependencies.apiContractVersion ?? dependencies.API_CONTRACT_VERSION,
    appendAuditLog: dependencies.appendAuditLog,
    buildApiContractV1Payload:
      dependencies.buildApiContractV1Payload ??
      (() =>
        buildApiContractV1({
          capabilities: {
            project_epub_import_async: dependencies.isEpubImportJobStorageAvailable?.() ?? false,
            project_manga_import_async:
              dependencies.isProjectImageImportJobStorageAvailable?.() ?? false,
          },
        })),
    buildAuthRedirectUrl: dependencies.buildAuthRedirectUrl,
    buildMySecuritySummary: dependencies.buildMySecuritySummary,
    buildRuntimeMetadata: dependencies.buildRuntimeMetadata,
    buildUserPayload: dependencies.buildUserPayload,
    canAttemptAuth: dependencies.canAttemptAuth,
    canVerifyMfa: dependencies.canVerifyMfa,
    createDiscordAvatarUrl: dependencies.createDiscordAvatarUrl,
    discordApi: dependencies.discordApi ?? dependencies.DISCORD_API,
    discordClientId: dependencies.discordClientId ?? dependencies.DISCORD_CLIENT_ID,
    discordClientSecret: dependencies.discordClientSecret ?? dependencies.DISCORD_CLIENT_SECRET,
    ensureOwnerUser: dependencies.ensureOwnerUser,
    evaluateOperationalMonitoring: dependencies.evaluateOperationalMonitoring,
    findUserIdentityRecord: dependencies.findUserIdentityRecord,
    findUserIdentityRecordsByEmail: dependencies.findUserIdentityRecordsByEmail,
    flushPersistQueue: dependencies.flushPersistQueue,
    getPendingMfaEnrollmentState: dependencies.getPendingMfaEnrollmentState,
    googleClientId: dependencies.googleClientId ?? dependencies.GOOGLE_CLIENT_ID,
    googleClientSecret: dependencies.googleClientSecret ?? dependencies.GOOGLE_CLIENT_SECRET,
    googleTokenApi: dependencies.googleTokenApi ?? dependencies.GOOGLE_TOKEN_API,
    googleUserinfoApi: dependencies.googleUserinfoApi ?? dependencies.GOOGLE_USERINFO_API,
    googleScopes: dependencies.googleScopes ?? dependencies.GOOGLE_SCOPES,
    handleAuthFailureSecuritySignals: dependencies.handleAuthFailureSecuritySignals,
    isAllowedOrigin: dependencies.isAllowedOrigin,
    isMetricsEnabled: dependencies.isMetricsEnabled,
    isPlainObject: dependencies.isPlainObject,
    listActiveSessionsForUser: dependencies.listActiveSessionsForUser,
    loadAllowedUsers: dependencies.loadAllowedUsers,
    loadSecurityEvents: dependencies.loadSecurityEvents,
    loadOwnerIds: dependencies.loadOwnerIds,
    loadUserPreferences: dependencies.loadUserPreferences,
    loadUsers: dependencies.loadUsers,
    loadUserSessionIndexRecords: dependencies.loadUserSessionIndexRecords,
    markMfaEnrollmentRequiredForSession: dependencies.markMfaEnrollmentRequiredForSession,
    metricsRegistry: dependencies.metricsRegistry,
    metricsTokenNormalized:
      dependencies.metricsTokenNormalized ?? dependencies.METRICS_TOKEN_NORMALIZED,
    operationalHealthTokenNormalized:
      dependencies.operationalHealthTokenNormalized ??
      dependencies.OPERATIONAL_HEALTH_TOKEN_NORMALIZED,
    normalizeUserPreferences: dependencies.normalizeUserPreferences,
    primaryAppOrigin: dependencies.primaryAppOrigin ?? dependencies.PRIMARY_APP_ORIGIN,
    proxyDiscordAvatarRequest: dependencies.proxyDiscordAvatarRequest,
    requireAuth: dependencies.requireAuth,
    resolveAuthAppOrigin: dependencies.resolveAuthAppOrigin,
    revokeSessionBySid: dependencies.revokeSessionBySid,
    revokeUserSessionIndexRecord: dependencies.revokeUserSessionIndexRecord,
    scopes: dependencies.scopes ?? dependencies.SCOPES,
    securityEventStatusOpen:
      dependencies.securityEventStatusOpen ?? dependencies.SecurityEventStatus?.OPEN,
    sessionCookieConfig: dependencies.sessionCookieConfig,
    sessionIndexTouchTsBySid: dependencies.sessionIndexTouchTsBySid,
    syncPersistedDiscordAvatarForLogin: dependencies.syncPersistedDiscordAvatarForLogin,
    updateSessionIndexFromRequest: dependencies.updateSessionIndexFromRequest,
    userPreferencesMaxBytes:
      dependencies.userPreferencesMaxBytes ?? dependencies.USER_PREFERENCES_MAX_BYTES,
    writeAllowedUsers: dependencies.writeAllowedUsers,
    writeOwnerIds: dependencies.writeOwnerIds,
    writeUserPreferences: dependencies.writeUserPreferences,
    writeUsers: dependencies.writeUsers,
  });

export default buildDirectRouteRegistrationDependenciesFromRoot;
