import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";

import { createUserAccessRuntime } from "../../server/lib/user-access-runtime.js";

const createDeps = (overrides = {}) => {
  let ownerIds = ["owner-1"];
  let users = [
    {
      id: "owner-1",
      name: "Owner",
      phrase: "Chefe",
      bio: "Bio",
      avatarUrl: "/uploads/owner.png",
      avatarDisplay: "circle",
      socials: [{ label: "site" }],
      favoriteWorks: { manga: ["A"] },
      status: "active",
      permissions: ["*"],
      roles: ["admin"],
      accessRole: "admin",
      order: 0,
    },
    {
      id: "editor-1",
      name: "Editor",
      phrase: "Editor",
      bio: "",
      avatarUrl: "/uploads/editor.png",
      avatarDisplay: "square",
      socials: [],
      favoriteWorks: {},
      status: "active",
      permissions: ["posts", "usuarios"],
      roles: ["staff"],
      accessRole: null,
      order: 1,
    },
  ];
  const projects = [
    {
      id: "project-1",
      title: "Projeto 1",
      status: "Em andamento",
      views: 12,
      order: 0,
      episodeDownloads: [{ id: "download-1" }],
    },
    {
      id: "project-2",
      title: "Projeto 2",
      status: "Completo",
      views: 3,
      order: 1,
      episodeDownloads: [],
    },
  ];
  const posts = [
    {
      id: "post-1",
      slug: "primeiro-post",
      title: "Primeiro",
      status: "published",
      views: 25,
      publishedAt: "2026-03-27T10:00:00.000Z",
      updatedAt: "2026-03-28T10:00:00.000Z",
    },
  ];
  const comments = [
    {
      id: "comment-1",
      name: "Leitor",
      content: "Comentário",
      status: "approved",
      createdAt: "2026-03-28T11:00:00.000Z",
      targetType: "post",
    },
    {
      id: "comment-2",
      name: "Outro",
      content: "Pendente",
      status: "pending",
      createdAt: "2026-03-28T12:00:00.000Z",
      targetType: "project",
    },
  ];
  const analyticsEvents = [
    { eventType: "view", type: "all", ts: "2026-03-27T12:00:00.000Z" },
    { eventType: "view", type: "project", ts: "2026-03-28T12:00:00.000Z" },
    { eventType: "view", type: "post", ts: "2026-03-28T13:00:00.000Z" },
  ];
  const writeAllowedUsers = vi.fn();

  return {
    AccessRole: {
      NORMAL: "normal",
      ADMIN: "admin",
      OWNER_PRIMARY: "owner_primary",
      OWNER_SECONDARY: "owner_secondary",
    },
    PermissionId: {
      POSTS: "posts_v2",
      PROJETOS: "projects_v2",
      COMENTARIOS: "comments_v2",
      PAGINAS: "pages_v2",
      CONFIGURACOES: "settings_v2",
      UPLOADS: "uploads_v2",
      ANALYTICS: "analytics_v2",
      AUDIT_LOG: "audit_v2",
      INTEGRACOES: "integrations_v2",
      USUARIOS: "users_v2",
    },
    addOwnerRoleLabel: (roles, isOwnerUser) => (isOwnerUser ? [...roles, "owner"] : roles),
    buildAnalyticsRange: () => ({
      fromTs: 0,
      toTs: Date.now(),
      dayKeys: ["2026-03-27", "2026-03-28"],
    }),
    buildCommentTargetInfo: (comment) => ({
      label: `target:${comment.targetType}`,
      url: `/target/${comment.id}`,
    }),
    can: ({ grants, permissionId }) =>
      Array.isArray(grants?.permissions) && grants.permissions.includes(permissionId),
    computeEffectiveAccessRole: ({
      userId,
      accessRole,
      ownerIds: inputOwnerIds,
      primaryOwnerId,
    }) => {
      if (inputOwnerIds.includes(String(userId)) && String(userId) === String(primaryOwnerId)) {
        return "owner_primary";
      }
      if (inputOwnerIds.includes(String(userId))) {
        return "owner_secondary";
      }
      return accessRole || "normal";
    },
    computeGrants: ({ permissions = [] } = {}) => ({
      permissions: Array.isArray(permissions) ? permissions : [],
    }),
    createHash: (algorithm) => crypto.createHash(algorithm),
    defaultPermissionsForRole: (role) =>
      role === "owner_primary" ? ["*"] : ["owner-secondary-default"],
    expandLegacyPermissions: (permissions) => ({
      knownPermissions: Array.isArray(permissions) ? permissions : [],
      unknownPermissions: [],
    }),
    filterAnalyticsEvents: (events, _fromTs, _toTs, type) =>
      type === "all" ? events : events.filter((event) => event.type === type),
    isOwner: (userId) => ownerIds.includes(String(userId)),
    isPrimaryOwner: (userId) => String(userId) === String(ownerIds[0] || ""),
    isRbacV2AcceptLegacyStar: true,
    isRbacV2Enabled: false,
    loadAnalyticsEvents: () => analyticsEvents,
    loadComments: () => comments,
    loadOwnerIds: () => ownerIds,
    loadPosts: () => posts,
    loadProjects: () => projects,
    loadUsers: () => users,
    normalizeAccessRole: (value, fallback) => value || fallback,
    normalizeAnalyticsTypeFilter: (value) => value,
    normalizeAvatarDisplay: (value) => String(value || "circle"),
    normalizePosts: (value) => value,
    normalizeProjects: (value) => value,
    normalizeUploadsDeep: (value) => value,
    parseAnalyticsRangeDays: () => 7,
    primaryAppOrigin: "https://example.com",
    removeOwnerRoleLabel: (roles) => roles.filter((role) => role !== "owner"),
    resolveUploadScopeAccess: vi.fn((payload) => ({ ok: true, payload })),
    sanitizeFavoriteWorksByCategory: (value) => value || {},
    sanitizePermissionsForStorage: (permissions) =>
      Array.from(new Set(Array.isArray(permissions) ? permissions : [])),
    sanitizeSocials: (value) => (Array.isArray(value) ? value : []),
    selectRecentApprovedComments: (value, limit) =>
      value.filter((comment) => comment.status === "approved").slice(0, limit),
    writeAllowedUsers,
    writeUsers: vi.fn((nextUsers) => {
      users = nextUsers;
    }),
    __setOwnerIds: (nextOwnerIds) => {
      ownerIds = nextOwnerIds;
    },
    __setUsers: (nextUsers) => {
      users = nextUsers;
    },
    ...overrides,
  };
};

describe("user-access-runtime", () => {
  it("fails early when required dependencies are missing", () => {
    expect(() => createUserAccessRuntime()).toThrow(/missing required dependencies/i);
  });

  it("normalizes users and builds public team members with owner metadata", () => {
    const runtime = createUserAccessRuntime(createDeps());

    expect(
      runtime.normalizeUsers([
        {
          id: "owner-1",
          name: "Owner",
          roles: ["admin", "owner"],
          permissions: ["*", "usuarios", "*"],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "owner-1",
        status: "active",
        permissions: ["*", "usuarios"],
        roles: ["admin"],
        accessRole: "owner_primary",
      }),
    ]);

    expect(runtime.buildPublicTeamMembers()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "owner-1",
          roles: ["admin", "owner"],
          accessRole: "owner_primary",
          isAdmin: false,
        }),
        expect.objectContaining({
          id: "editor-1",
          accessRole: "admin",
          isAdmin: true,
        }),
      ]),
    );
  });

  it("uses Better Auth access records before legacy profile permissions", () => {
    const runtime = createUserAccessRuntime(
      createDeps({
        getAuthAccessRecord: (userId) =>
          String(userId) === "editor-1"
            ? {
                id: "editor-1",
                accessRole: "normal",
                permissions: ["projects_v2"],
              }
            : null,
        loadAuthOwnerIds: () => [],
        isRbacV2Enabled: true,
      }),
    );

    const context = runtime.getUserAccessContextById("editor-1");

    expect(context.accessRole).toBe("normal");
    expect(context.grants).toEqual({ permissions: ["projects_v2"] });
    expect(runtime.canManageProjects("editor-1")).toBe(true);
    expect(runtime.canManagePosts("editor-1")).toBe(false);
  });

  it("keeps runtime owners ahead of Better Auth owners", () => {
    const runtime = createUserAccessRuntime(
      createDeps({
        loadAuthOwnerIds: () => ["auth-owner", "owner-1"],
        getAuthAccessRecord: (userId) =>
          String(userId) === "auth-owner"
            ? {
                id: "auth-owner",
                accessRole: "owner_primary",
                permissions: ["*"],
              }
            : null,
        isRbacV2Enabled: true,
      }),
    );

    expect(runtime.getUserAccessContextById("owner-1")).toEqual(
      expect.objectContaining({
        accessRole: "owner_primary",
        isOwner: true,
        isPrimaryOwner: true,
      }),
    );
    expect(runtime.getUserAccessContextById("auth-owner")).toEqual(
      expect.objectContaining({
        accessRole: "owner_secondary",
        isOwner: true,
        isPrimaryOwner: false,
      }),
    );
  });

  it("builds dashboard overview metrics and analytics series", () => {
    const runtime = createUserAccessRuntime(createDeps());

    expect(runtime.buildDashboardOverviewResponsePayload("owner-1")).toEqual(
      expect.objectContaining({
        metrics: expect.objectContaining({
          totalProjects: 2,
          totalMedia: 1,
          activeProjects: 1,
          finishedProjects: 1,
          totalViewsLast7: 3,
          totalProjectViewsLast7: 1,
          totalPostViewsLast7: 1,
        }),
        pendingCommentsCount: 1,
        recentComments: [
          expect.objectContaining({
            id: "comment-1",
            page: "target:post",
            url: "/target/comment-1",
          }),
        ],
      }),
    );
  });

  it("delegates upload scope resolution with derived access flags", () => {
    const deps = createDeps();
    const runtime = createUserAccessRuntime(deps);

    const result = runtime.resolveRequestUploadAccessScope({
      sessionUser: { id: "editor-1" },
      folder: "avatars",
      listAll: true,
      scopeUserId: " editor-1 ",
    });

    expect(result.ok).toBe(true);
    expect(deps.resolveUploadScopeAccess).toHaveBeenCalledWith(
      expect.objectContaining({
        hasUploadManagement: true,
        canManagePosts: true,
        canManageProjects: false,
        canManageUsersBasic: true,
        canManagePages: false,
        canManageSettings: false,
        sessionUserId: "editor-1",
        scopeUserId: "editor-1",
        folder: "avatars",
        listAll: true,
      }),
    );
  });

  it("persists missing owners with enforced access invariants", () => {
    const deps = createDeps({
      isRbacV2Enabled: true,
    });
    deps.__setUsers([
      {
        id: "editor-1",
        name: "Editor",
        phrase: "",
        bio: "",
        avatarUrl: null,
        avatarDisplay: "square",
        socials: [],
        favoriteWorks: {},
        status: "active",
        permissions: ["users_access_v2"],
        roles: ["staff"],
        accessRole: "admin",
        order: 0,
      },
    ]);
    const runtime = createUserAccessRuntime(deps);

    runtime.ensureOwnerUser({
      id: "owner-1",
      name: "Owner Session",
      avatarUrl: "/uploads/session-owner.png",
    });

    expect(deps.writeUsers).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "editor-1",
        accessRole: "admin",
      }),
      expect.objectContaining({
        id: "owner-1",
        accessRole: "owner_primary",
        permissions: ["*"],
        status: "active",
      }),
    ]);
    expect(deps.writeAllowedUsers).toHaveBeenCalledWith(["owner-1", "editor-1"]);
    expect(runtime.permissionsForRead(["users_access_v2"])).toEqual(["users_access_v2"]);
  });

  it("does not let stale Better Auth access override user access mutations", () => {
    const runtime = createUserAccessRuntime(
      createDeps({
        getAuthAccessRecord: (userId) =>
          String(userId) === "editor-1"
            ? {
                id: "editor-1",
                accessRole: "admin",
                permissions: ["users_v2"],
              }
            : null,
        isRbacV2Enabled: true,
        loadAuthOwnerIds: () => [],
      }),
    );

    expect(
      runtime.enforceUserAccessInvariants([
        {
          id: "editor-1",
          name: "Editor",
          phrase: "",
          bio: "",
          avatarUrl: null,
          avatarDisplay: "square",
          socials: [],
          favoriteWorks: {},
          status: "active",
          permissions: ["posts_v2"],
          roles: ["staff"],
          accessRole: "normal",
          order: 0,
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        id: "editor-1",
        accessRole: "normal",
        permissions: ["posts_v2"],
      }),
    ]);
  });
});
