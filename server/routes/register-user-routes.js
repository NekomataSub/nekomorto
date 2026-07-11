import {
  assertRequiredDependencies,
  pickDependencyKeys,
} from "../bootstrap/assert-required-dependencies.js";
import { registerUserBootstrapOwnerRoutes } from "./user/register-user-bootstrap-owner-routes.js";
import { registerUserListRoutes } from "./user/register-user-list-routes.js";
import { registerUserManagementRoutes } from "./user/register-user-management-routes.js";
import { registerUserOwnerRoutes } from "./user/register-user-owner-routes.js";
import { registerUserPublicUserRoutes } from "./user/register-user-public-user-routes.js";
import { registerUserSelfRoutes } from "./user/register-user-self-routes.js";
import { persistUsers } from "./user/shared.js";

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const pickUserDependencies = (dependencies, scopeName, keys) =>
  assertRequiredDependencies(scopeName, pickDependencyKeys(dependencies, keys), keys);
const shouldRegisterUserGroup = (dependencies, activationKeys = []) =>
  activationKeys.some((key) => hasOwn(dependencies, key));

const LIST_DEPENDENCY_KEYS = [
  "app",
  "appendAuditLog",
  "applyOwnerRole",
  "canManageUsersAccess",
  "canManageUsersBasic",
  "enforceUserAccessInvariants",
  "ensureOwnerUser",
  "isRbacV2Enabled",
  "loadOwnerIds",
  "loadUploads",
  "loadUsers",
  "normalizeUsers",
  "requireAuth",
  "syncAllowedUsers",
  "userWithAccessForResponse",
  "withUserProfileRevision",
  "writeUsers",
];

const OWNER_DEPENDENCY_KEYS = [
  "AccessRole",
  "SecurityEventSeverity",
  "app",
  "appendAuditLog",
  "defaultPermissionsForRole",
  "emitSecurityEvent",
  "enforceUserAccessInvariants",
  "getPrimaryOwnerId",
  "loadOwnerIds",
  "loadUsers",
  "normalizeUsers",
  "requirePrimaryOwner",
  "syncAllowedUsers",
  "writeOwnerIds",
  "writeUsers",
];

const BOOTSTRAP_OWNER_DEPENDENCY_KEYS = [
  "BOOTSTRAP_TOKEN",
  "app",
  "appendAuditLog",
  "canBootstrap",
  "ensureOwnerUser",
  "enforceUserAccessInvariants",
  "getRequestIp",
  "loadOwnerIds",
  "loadUsers",
  "normalizeUsers",
  "requireAuth",
  "syncAllowedUsers",
  "writeOwnerIds",
  "writeUsers",
];

const PUBLIC_USER_DEPENDENCY_KEYS = ["app", "buildPublicMediaVariants", "buildPublicTeamMembers"];

const MANAGEMENT_DEPENDENCY_KEYS = [
  "AccessRole",
  "BASIC_PROFILE_FIELDS",
  "PermissionId",
  "SecurityEventSeverity",
  "app",
  "appendAuditLog",
  "applyOwnerRole",
  "buildUserProfileRevisionToken",
  "can",
  "defaultPermissionsForRole",
  "emitSecurityEvent",
  "ensureNoEditConflict",
  "getPrimaryOwnerId",
  "getUserAccessContextById",
  "isAdminUser",
  "isBasicProfileField",
  "isOwner",
  "isPrimaryOwner",
  "isRbacV2Enabled",
  "loadOwnerIds",
  "loadUploads",
  "loadUsers",
  "normalizeAccessRole",
  "normalizeAvatarDisplay",
  "normalizeUsers",
  "parseEditRevisionOptions",
  "pickBasicProfilePatch",
  "removeOwnerRoleLabel",
  "requireAuth",
  "resolveDiscordAvatarFallbackUrl",
  "sanitizeFavoriteWorksByCategory",
  "sanitizePermissionsForStorage",
  "sanitizeSocials",
  "shouldEmitSecurityRuleEvent",
  "syncSessionUserDisplayProfile",
  "userWithAccessForResponse",
  "withEffectiveAvatarUrl",
  "withUserProfileRevision",
  "writeOwnerIds",
];

const SELF_DEPENDENCY_KEYS = [
  "BASIC_PROFILE_FIELDS",
  "app",
  "appendAuditLog",
  "applyOwnerRole",
  "buildUserProfileRevisionToken",
  "ensureNoEditConflict",
  "loadOwnerIds",
  "loadUploads",
  "loadUsers",
  "normalizeAvatarDisplay",
  "normalizeUsers",
  "parseEditRevisionOptions",
  "pickBasicProfilePatch",
  "removeOwnerRoleLabel",
  "requireAuth",
  "resolveDiscordAvatarFallbackUrl",
  "sanitizeFavoriteWorksByCategory",
  "sanitizeSocials",
  "syncSessionUserDisplayProfile",
  "userWithAccessForResponse",
  "withEffectiveAvatarUrl",
  "withUserProfileRevision",
];

const PERSIST_USER_DEPENDENCY_KEYS = [
  "enforceUserAccessInvariants",
  "isOwner",
  "normalizeUsers",
  "syncAllowedUsers",
  "writeUsers",
];

export const registerUserRoutes = (dependencies = {}) => {
  const needsPersistUsers =
    shouldRegisterUserGroup(dependencies, [
      "normalizeAvatarDisplay",
      "defaultPermissionsForRole",
    ]) || shouldRegisterUserGroup(dependencies, ["resolveDiscordAvatarFallbackUrl"]);
  const persistDependencies = needsPersistUsers
    ? pickUserDependencies(
        dependencies,
        "register-user-routes.persist-users",
        PERSIST_USER_DEPENDENCY_KEYS,
      )
    : null;
  const persistCurrentUsers = persistDependencies
    ? ({ users, isLegacy = false }) =>
        persistUsers({
          users,
          isLegacy,
          enforceUserAccessInvariants: persistDependencies.enforceUserAccessInvariants,
          isOwner: persistDependencies.isOwner,
          normalizeUsers: persistDependencies.normalizeUsers,
          syncAllowedUsers: persistDependencies.syncAllowedUsers,
          writeUsers: persistDependencies.writeUsers,
        })
    : null;

  if (shouldRegisterUserGroup(dependencies, ["canManageUsersBasic", "canManageUsersAccess"])) {
    registerUserListRoutes(
      pickUserDependencies(dependencies, "register-user-routes.list", LIST_DEPENDENCY_KEYS),
    );
  }
  if (shouldRegisterUserGroup(dependencies, ["SecurityEventSeverity"])) {
    registerUserOwnerRoutes(
      pickUserDependencies(dependencies, "register-user-routes.owners", OWNER_DEPENDENCY_KEYS),
    );
  }
  if (shouldRegisterUserGroup(dependencies, ["canBootstrap", "BOOTSTRAP_TOKEN"])) {
    registerUserBootstrapOwnerRoutes(
      pickUserDependencies(
        dependencies,
        "register-user-routes.bootstrap-owner",
        BOOTSTRAP_OWNER_DEPENDENCY_KEYS,
      ),
    );
  }
  if (shouldRegisterUserGroup(dependencies, ["buildPublicTeamMembers"])) {
    registerUserPublicUserRoutes(
      pickUserDependencies(
        dependencies,
        "register-user-routes.public-users",
        PUBLIC_USER_DEPENDENCY_KEYS,
      ),
    );
  }
  if (shouldRegisterUserGroup(dependencies, ["pickBasicProfilePatch"])) {
    registerUserSelfRoutes({
      ...pickUserDependencies(dependencies, "register-user-routes.self", SELF_DEPENDENCY_KEYS),
      persistCurrentUsers,
    });
  }
  if (
    shouldRegisterUserGroup(dependencies, ["normalizeAvatarDisplay", "defaultPermissionsForRole"])
  ) {
    registerUserManagementRoutes({
      ...pickUserDependencies(
        dependencies,
        "register-user-routes.user-management",
        MANAGEMENT_DEPENDENCY_KEYS,
      ),
      persistCurrentUsers,
    });
  }
};

export default registerUserRoutes;
