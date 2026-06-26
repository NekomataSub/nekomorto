export const buildUserRuntimeDependencies = (dependencies = {}) => {
  const dataRepository = dependencies.dataRepository;
  const loadStoredUserPreferences =
    dependencies.loadStoredUserPreferences ??
    ((userId) =>
      dataRepository && typeof dataRepository.loadUserPreferences === "function"
        ? dataRepository.loadUserPreferences(userId)
        : {});
  const writeStoredUserPreferences =
    dependencies.writeStoredUserPreferences ??
    ((userId, preferences) => {
      if (dataRepository && typeof dataRepository.writeUserPreferences === "function") {
        dataRepository.writeUserPreferences(userId, preferences);
      }
    });

  return {
    AccessRole: dependencies.AccessRole,
    PermissionId: dependencies.PermissionId,
    addOwnerRoleLabel: dependencies.addOwnerRoleLabel,
    appendAuditLog: dependencies.appendAuditLog,
    authFailedBurstCritical:
      dependencies.authFailedBurstCritical ?? dependencies.AUTH_FAILED_BURST_CRITICAL,
    authFailedBurstWarning:
      dependencies.authFailedBurstWarning ?? dependencies.AUTH_FAILED_BURST_WARNING,
    authFailedByIpCounter: dependencies.authFailedByIpCounter,
    buildAnalyticsRange: dependencies.buildAnalyticsRange,
    buildCommentTargetInfo: dependencies.buildCommentTargetInfo,
    buildOtpAuthUrl: dependencies.buildOtpAuthUrl,
    can: dependencies.can,
    computeEffectiveAccessRole: dependencies.computeEffectiveAccessRole,
    computeGrants: dependencies.computeGrants,
    createEnrollmentToken:
      dependencies.createEnrollmentToken ??
      (dependencies.crypto ? () => dependencies.crypto.randomUUID() : undefined),
    createHash:
      dependencies.createHash ??
      (dependencies.crypto ? (algorithm) => dependencies.crypto.createHash(algorithm) : undefined),
    createRevisionToken: dependencies.createRevisionToken,
    createSecurityEventPayload: dependencies.createSecurityEventPayload,
    createSystemAuditReq: dependencies.createSystemAuditReq,
    dashboardHomeRoleIds: dependencies.dashboardHomeRoleIds ?? dependencies.DASHBOARD_HOME_ROLE_IDS,
    dashboardWidgetIds: dependencies.dashboardWidgetIds ?? dependencies.DASHBOARD_WIDGET_IDS,
    dataEncryptionKeyring: dependencies.dataEncryptionKeyring,
    dataRepository,
    decryptStringWithKeyring: dependencies.decryptStringWithKeyring,
    defaultPermissionsForRole: dependencies.defaultPermissionsForRole,
    excessiveSessionsWarning:
      dependencies.excessiveSessionsWarning ?? dependencies.EXCESSIVE_SESSIONS_WARNING,
    expandLegacyPermissions: dependencies.expandLegacyPermissions,
    filterAnalyticsEvents: dependencies.filterAnalyticsEvents,
    generateTotpSecret: dependencies.generateTotpSecret,
    getAuthAccessRecord: dependencies.getAuthAccessRecord,
    getDispatchCriticalSecurityEventWebhook: dependencies.getDispatchCriticalSecurityEventWebhook,
    getIpv4Network24: dependencies.getIpv4Network24,
    getRequestIp: dependencies.getRequestIp,
    hashRecoveryCode: dependencies.hashRecoveryCode,
    isDiscordAvatarUrl: dependencies.isDiscordAvatarUrl,
    isOwner: dependencies.isOwner,
    isPlainObject: dependencies.isPlainObject,
    isPrimaryOwner: dependencies.isPrimaryOwner,
    isRbacV2AcceptLegacyStar: dependencies.isRbacV2AcceptLegacyStar,
    isRbacV2Enabled: dependencies.isRbacV2Enabled,
    loadAnalyticsEvents: dependencies.loadAnalyticsEvents,
    loadAuthOwnerIds: dependencies.loadAuthOwnerIds,
    loadComments: dependencies.loadComments,
    loadOwnerIds: dependencies.loadOwnerIds,
    loadPosts: dependencies.loadPosts,
    loadProjects: dependencies.loadProjects,
    loadSecurityEvents: dependencies.loadSecurityEvents,
    loadSiteSettings: dependencies.loadSiteSettings,
    loadUserIdentityRecords: dependencies.loadUserIdentityRecords,
    loadStoredUserPreferences,
    loadUploads: dependencies.loadUploads,
    loadUsers: dependencies.loadUsers,
    metricsRegistry: dependencies.metricsRegistry,
    mfaEnrollmentTtlMs: dependencies.mfaEnrollmentTtlMs ?? dependencies.MFA_ENROLLMENT_TTL_MS,
    mfaFailedBurstWarning:
      dependencies.mfaFailedBurstWarning ?? dependencies.MFA_FAILED_BURST_WARNING,
    mfaFailedByUserCounter: dependencies.mfaFailedByUserCounter,
    mfaIconUrl: dependencies.mfaIconUrl ?? dependencies.MFA_ICON_URL,
    mfaIssuer: dependencies.mfaIssuer ?? dependencies.MFA_ISSUER,
    mfaRecoveryCodePepper:
      dependencies.mfaRecoveryCodePepper ?? dependencies.MFA_RECOVERY_CODE_PEPPER,
    newNetworkLookbackMs: dependencies.newNetworkLookbackMs ?? dependencies.NEW_NETWORK_LOOKBACK_MS,
    normalizeAccessRole: dependencies.normalizeAccessRole,
    normalizeAnalyticsTypeFilter: dependencies.normalizeAnalyticsTypeFilter,
    normalizeAvatarDisplay: dependencies.normalizeAvatarDisplay,
    normalizePosts: dependencies.normalizePosts,
    normalizeProjectReaderPreferences: dependencies.normalizeProjectReaderPreferences,
    normalizeProjects: dependencies.normalizeProjects,
    normalizeSecurityEventStatus: dependencies.normalizeSecurityEventStatus,
    normalizeUploadsDeep: dependencies.normalizeUploadsDeep,
    parseAnalyticsRangeDays: dependencies.parseAnalyticsRangeDays,
    primaryAppOrigin: dependencies.primaryAppOrigin ?? dependencies.PRIMARY_APP_ORIGIN,
    removeOwnerRoleLabel: dependencies.removeOwnerRoleLabel,
    resolveEffectiveUserAvatarUrl: dependencies.resolveEffectiveUserAvatarUrl,
    resolveUploadScopeAccess: dependencies.resolveUploadScopeAccess,
    resolveUserAvatarRenderVersion: dependencies.resolveUserAvatarRenderVersion,
    sanitizeAssetUrl: dependencies.sanitizeAssetUrl,
    sanitizeFavoriteWorksByCategory: dependencies.sanitizeFavoriteWorksByCategory,
    sanitizePermissionsForStorage: dependencies.sanitizePermissionsForStorage,
    sanitizeSocials: dependencies.sanitizeSocials,
    securityEventSeverity: dependencies.securityEventSeverity ?? dependencies.SecurityEventSeverity,
    securityEventStatus: dependencies.securityEventStatus ?? dependencies.SecurityEventStatus,
    selectRecentApprovedComments: dependencies.selectRecentApprovedComments,
    sessionIndexTouchMinIntervalMs:
      dependencies.sessionIndexTouchMinIntervalMs ??
      dependencies.SESSION_INDEX_TOUCH_MIN_INTERVAL_MS,
    sessionIndexTouchTsBySid: dependencies.sessionIndexTouchTsBySid,
    sessionStore: dependencies.sessionStore,
    shouldSyncDiscordAvatarToStoredUser: dependencies.shouldSyncDiscordAvatarToStoredUser,
    upsertSecurityEvent: dependencies.upsertSecurityEvent,
    userPreferencesDensitySet:
      dependencies.userPreferencesDensitySet ?? dependencies.USER_PREFERENCES_DENSITY_SET,
    userPreferencesThemeModeSet:
      dependencies.userPreferencesThemeModeSet ?? dependencies.USER_PREFERENCES_THEME_MODE_SET,
    verifyTotpCode: dependencies.verifyTotpCode,
    writeAllowedUsers: dependencies.writeAllowedUsers,
    writeStoredUserPreferences,
    writeUsers: dependencies.writeUsers,
  };
};

export default buildUserRuntimeDependencies;
