import { buildDirectRouteDependencies } from "./build-direct-route-dependencies.js";
import { DIRECT_SERVER_ROUTE_ORDER } from "./register-direct-server-routes.js";

export const buildDirectRouteRegistrationDependencies = (dependencies = {}) =>
  buildDirectRouteDependencies(
    { routes: DIRECT_SERVER_ROUTE_ORDER },
    {
      app: dependencies.app,
      apiContractVersion: dependencies.apiContractVersion,
      buildApiContractV1Payload: dependencies.buildApiContractV1Payload,
      buildRuntimeMetadata: dependencies.buildRuntimeMetadata,
      buildUserPayload: dependencies.buildUserPayload,
      evaluateOperationalMonitoring: dependencies.evaluateOperationalMonitoring,
      isMetricsEnabled: dependencies.isMetricsEnabled,
      loadSecurityEvents: dependencies.loadSecurityEvents,
      loadUserSessionIndexRecords: dependencies.loadUserSessionIndexRecords,
      metricsRegistry: dependencies.metricsRegistry,
      metricsTokenNormalized: dependencies.metricsTokenNormalized,
      operationalHealthTokenNormalized: dependencies.operationalHealthTokenNormalized,
      proxyDiscordAvatarRequest: dependencies.proxyDiscordAvatarRequest,
      securityEventStatusOpen: dependencies.securityEventStatusOpen,
    },
    {
      app: dependencies.app,
      appendAuditLog: dependencies.appendAuditLog,
      buildMySecuritySummary: dependencies.buildMySecuritySummary,
      getPendingMfaEnrollmentState: dependencies.getPendingMfaEnrollmentState,
      isPlainObject: dependencies.isPlainObject,
      listActiveSessionsForUser: dependencies.listActiveSessionsForUser,
      loadUserPreferences: dependencies.loadUserPreferences,
      metricsRegistry: dependencies.metricsRegistry,
      buildAuthRedirectUrl: dependencies.buildAuthRedirectUrl,
      normalizeUserPreferences: dependencies.normalizeUserPreferences,
      requireAuth: dependencies.requireAuth,
      revokeSessionBySid: dependencies.revokeSessionBySid,
      userPreferencesMaxBytes: dependencies.userPreferencesMaxBytes,
      writeUserPreferences: dependencies.writeUserPreferences,
    },
  );

export default buildDirectRouteRegistrationDependencies;
