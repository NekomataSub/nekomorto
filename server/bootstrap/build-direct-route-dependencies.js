import {
  assertRequiredDependencies,
  mergeDependencySources,
  pickDependencyKeys,
} from "./assert-required-dependencies.js";

export const DIRECT_ROUTE_DEPENDENCY_KEYS = {
  session: [
    "app",
    "apiContractVersion",
    "buildApiContractV1Payload",
    "buildMySecuritySummary",
    "buildRuntimeMetadata",
    "buildUserPayload",
    "proxyDiscordAvatarRequest",
  ],
  operational: [
    "app",
    "buildRuntimeMetadata",
    "evaluateOperationalMonitoring",
    "isMetricsEnabled",
    "loadSecurityEvents",
    "loadUserSessionIndexRecords",
    "metricsRegistry",
    "metricsTokenNormalized",
    "operationalHealthTokenNormalized",
    "securityEventStatusOpen",
  ],
  selfService: [
    "app",
    "appendAuditLog",
    "buildMySecuritySummary",
    "canManageMfa",
    "clearEnrollmentFromSession",
    "clearPendingMfaEnrollmentFromSession",
    "clearPendingMfaEnrollmentRedirectTarget",
    "completeRequiredMfaEnrollmentForSession",
    "dataEncryptionKeyring",
    "deleteUserMfaTotpRecord",
    "encryptStringWithKeyring",
    "generateRecoveryCodes",
    "getPendingMfaEnrollmentRedirectTarget",
    "getPendingMfaEnrollmentState",
    "getRequestIp",
    "handleMfaFailureSecuritySignals",
    "hashRecoveryCode",
    "isPlainObject",
    "isPendingMfaEnrollmentRequiredForUser",
    "isTotpEnabledForUser",
    "listActiveSessionsForUser",
    "loadUserPreferences",
    "metricsRegistry",
    "buildAuthRedirectUrl",
    "mfaRecoveryCodePepper",
    "normalizeUserPreferences",
    "requireAuth",
    "resolveEnrollmentFromSession",
    "resolveMfaMetadata",
    "revokeSessionBySid",
    "saveSessionState",
    "startTotpEnrollment",
    "userPreferencesMaxBytes",
    "verifyTotpCode",
    "verifyTotpOrRecoveryCode",
    "writeUserMfaTotpRecord",
    "writeUserPreferences",
  ],
};

const buildRouteDependencySet = (scopeName, source, keys) => {
  const dependencies = pickDependencyKeys(source, keys);
  return assertRequiredDependencies(scopeName, dependencies, keys);
};

const DIRECT_ROUTE_SCOPE_NAMES = Object.keys(DIRECT_ROUTE_DEPENDENCY_KEYS);

const normalizeBuildRequest = (sources = []) => {
  if (sources.length === 0) {
    return {
      routes: DIRECT_ROUTE_SCOPE_NAMES,
      sourceInputs: [],
    };
  }
  const [firstSource, ...restSources] = sources;
  const routeNames = Array.isArray(firstSource?.routes) ? firstSource.routes : null;
  if (!routeNames) {
    return {
      routes: DIRECT_ROUTE_SCOPE_NAMES,
      sourceInputs: sources,
    };
  }
  return {
    routes: routeNames,
    sourceInputs: restSources,
  };
};

export const buildDirectRouteDependencies = (...sources) => {
  const { routes, sourceInputs } = normalizeBuildRequest(sources);
  const merged = mergeDependencySources(...sourceInputs);
  return routes.reduce((accumulator, routeName) => {
    const dependencyKeys = DIRECT_ROUTE_DEPENDENCY_KEYS[routeName];
    if (!dependencyKeys) {
      throw new Error(`[bootstrap] unknown direct route dependency scope: ${routeName}`);
    }
    const scopeName = `register${routeName.charAt(0).toUpperCase()}${routeName.slice(1)}Routes`;
    accumulator[routeName] = buildRouteDependencySet(scopeName, merged, dependencyKeys);
    return accumulator;
  }, {});
};

export default buildDirectRouteDependencies;
