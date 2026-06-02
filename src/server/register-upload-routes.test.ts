import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import { registerUploadRoutes } from "../../server/routes/register-upload-routes.js";

const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7J8AAAAASUVORK5CYII=";

const createAppRecorder = () => {
  const routes: Array<{
    method: string;
    path: string;
    handlers: Array<(...args: any[]) => unknown>;
  }> = [];
  const register =
    (method: string) =>
    (path: string, ...handlers: Array<(...args: any[]) => unknown>) => {
      routes.push({
        method,
        path,
        handlers,
      });
    };

  return {
    app: {
      get: register("GET"),
      post: register("POST"),
      patch: register("PATCH"),
      put: register("PUT"),
      delete: register("DELETE"),
    },
    routes,
  };
};

const getRoute = (routes, method, path) =>
  routes.find((route) => route.method === method && route.path === path);

const createMockRes = () => ({
  statusCode: 200,
  body: null as any,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const invokeFinalHandler = async (route, req) => {
  const res = createMockRes();
  await route.handlers[route.handlers.length - 1](req, res);
  return res;
};

const createDependencies = ({ app, overrides = {} }) => ({
  MAX_SVG_SIZE_BYTES: 1024,
  MAX_UPLOAD_SIZE_BYTES: 1024 * 1024,
  PRIMARY_APP_ORIGIN: "https://dev.nekomata.moe",
  PUBLIC_UPLOADS_DIR: "D:/dev/nekomorto/public/uploads",
  STATIC_DEFAULT_CACHE_CONTROL: "public, max-age=0",
  app,
  appendAuditLog: vi.fn(),
  attachUploadMediaMetadata: vi.fn(async (entry) => entry),
  buildManagedStorageAreaSummary: vi.fn(() => []),
  canManageUploads: vi.fn(() => false),
  canUploadImage: vi.fn(() => true),
  cleanupUploadStagingWorkspace: vi.fn(),
  computeBufferSha256: vi.fn(() => "hash"),
  createSlug: vi.fn((value) => value),
  createUploadStagingWorkspace: vi.fn(() => ({})),
  deleteManagedUploadEntryAssets: vi.fn(async () => undefined),
  ensureUploadEntryHasRequiredVariants: vi.fn(async () => ({
    uploadEntry: null,
    variantsGenerated: false,
    variantGenerationError: "",
  })),
  extractRequestedUploadFocalPayload: vi.fn(() => ({})),
  findUploadByHash: vi.fn(() => null),
  getUploadFolderFromUrlValue: vi.fn(() => ""),
  getUploadExtFromMime: vi.fn(() => "png"),
  getUploadMimeFromExtension: vi.fn(() => "image/png"),
  getUploadVariantUrlPrefix: vi.fn(() => "/uploads/_variants/u1/"),
  getRequestIp: vi.fn((req) => String(req?.ip || "").trim()),
  hasOwnField: vi.fn((value, key) => Object.prototype.hasOwnProperty.call(value || {}, key)),
  importRemoteImageFile: vi.fn(async () => null),
  invalidateUploadsCleanupPreviewCache: vi.fn(),
  isChapterBasedType: vi.fn(() => false),
  isPrivateUploadFolder: vi.fn(() => false),
  isUploadFolderAllowedInScope: vi.fn(() => true),
  loadCachedUploadsCleanupPreview: vi.fn(async () => null),
  loadComments: vi.fn(() => []),
  loadLinkTypes: vi.fn(() => []),
  loadPages: vi.fn(() => ({})),
  loadPosts: vi.fn(() => []),
  loadProjects: vi.fn(() => []),
  loadSiteSettings: vi.fn(() => ({})),
  loadUpdates: vi.fn(() => []),
  loadUploads: vi.fn(() => []),
  loadUsers: vi.fn(() => []),
  materializeUploadEntrySourceToStaging: vi.fn(async () => null),
  normalizeProjects: vi.fn((projects) => projects),
  normalizeUploadMime: vi.fn((mime) => mime),
  normalizeUploadScopeUserId: vi.fn((value) => String(value || "").trim()),
  normalizeVariants: vi.fn((value) => value || {}),
  persistUploadEntryFromStaging: vi.fn(async () => null),
  readUploadAltText: vi.fn(() => ""),
  readUploadFocalState: vi.fn(() => ({
    focalCrops: undefined,
    focalPoints: undefined,
    focalPoint: undefined,
  })),
  readUploadSlot: vi.fn(() => ""),
  readUploadSlotManaged: vi.fn(() => false),
  readUploadStorageProvider: vi.fn(() => "local"),
  requireAuth: vi.fn((_req, _res, next) => next?.()),
  resolveIncomingUploadFocalState: vi.fn(() => ({})),
  resolveRequestUploadAccessScope: vi.fn(() => ({
    allowed: true,
    hasFullAccess: false,
    allowedRoots: ["posts", "users", "projects"],
  })),
  resolveUploadAbsolutePath: vi.fn(() => ""),
  resolveUploadVariantPresetKeysForArea: vi.fn(() => []),
  runUploadsCleanup: vi.fn(async () => ({})),
  sanitizeSvg: vi.fn((input) => input),
  sanitizeUploadBaseName: vi.fn((value) => value),
  sanitizeUploadFolder: vi.fn((value) => value),
  sanitizeUploadSlot: vi.fn((value) => value),
  shouldIncludeUploadInHashDedupe: vi.fn(() => true),
  upsertUploadEntries: vi.fn(() => []),
  uploadStorageService: {},
  validateUploadImageBuffer: vi.fn(async () => undefined),
  writeComments: vi.fn(),
  writeLinkTypes: vi.fn(),
  writePages: vi.fn(),
  writePosts: vi.fn(),
  writeProjects: vi.fn(),
  writeSiteSettings: vi.fn(),
  writeUploadBufferToStaging: vi.fn(async () => undefined),
  writeUpdates: vi.fn(),
  writeUploads: vi.fn(),
  writeUsers: vi.fn(),
  ...overrides,
});

describe("registerUploadRoutes", () => {
  it("uses the trusted request ip helper for upload-from-url throttling", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        canUploadImage: vi.fn(async () => false),
        getRequestIp: vi.fn(() => "trusted-ip"),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "POST", "/api/uploads/image-from-url");
    const res = await invokeFinalHandler(route, {
      body: {
        folder: "posts",
        url: "https://cdn.example.com/image.png",
      },
      headers: { "x-forwarded-for": "198.51.100.99" },
      ip: "127.0.0.1",
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: "rate_limited" });
    expect(dependencies.getRequestIp).toHaveBeenCalled();
    expect(dependencies.canUploadImage).toHaveBeenCalledWith("trusted-ip");
  });

  it("renames direct uploads to UUID-based file names on the server", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        attachUploadMediaMetadata: vi.fn(async ({ entry }) => ({
          ...entry,
          hashSha256: "hash",
          variants: {},
          variantBytes: 0,
        })),
        computeBufferSha256: vi.fn(() => "hash"),
        createUploadStagingWorkspace: vi.fn(() => ({
          uploadsDir: "D:/tmp/upload-staging",
        })),
        persistUploadEntryFromStaging: vi.fn(async () => undefined),
        uploadStorageService: {
          activeProvider: "local",
        },
        validateUploadImageBuffer: vi.fn(() => ({
          valid: true,
          mime: "image/png",
          dimensions: {
            width: 1,
            height: 1,
          },
        })),
        writeUploadBufferToStaging: vi.fn(() => "D:/tmp/upload-staging/generated.png"),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "POST", "/api/uploads/image");
    expect(route).toBeTruthy();
    expect(route.handlers[0]).toBe(dependencies.requireAuth);

    const res = await invokeFinalHandler(route, {
      body: {
        dataUrl: `data:image/png;base64,${ONE_BY_ONE_PNG_BASE64}`,
        folder: "posts",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.fileName).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    expect(res.body.url).toMatch(
      /^\/uploads\/posts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    expect(dependencies.writeUploads).toHaveBeenCalledWith([
      expect.objectContaining({
        fileName: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
        ),
      }),
    ]);
  });

  it("lista metadados e arquivos locais soltos dentro da pasta solicitada", async () => {
    const { app, routes } = createAppRecorder();
    const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-routes-users-"));
    fs.mkdirSync(path.join(uploadsDir, "users"), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, "posts"), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, "users", "loose.png"), "users");
    fs.writeFileSync(path.join(uploadsDir, "posts", "hidden.png"), "posts");
    const dependencies = createDependencies({
      app,
      overrides: {
        PUBLIC_UPLOADS_DIR: uploadsDir,
        loadUploads: vi.fn(() => [
          {
            id: "upload-users-root",
            url: "/uploads/users/avatar.png",
            folder: "users",
            fileName: "avatar.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "upload-users-child",
            url: "/uploads/users/nested/child.png",
            folder: "users/nested",
            fileName: "child.png",
            mime: "image/png",
            size: 180,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
          {
            id: "upload-posts-root",
            url: "/uploads/posts/post.png",
            folder: "posts",
            fileName: "post.png",
            mime: "image/png",
            size: 200,
            createdAt: "2024-01-03T00:00:00.000Z",
          },
        ]),
      },
    });
    try {
      registerUploadRoutes(dependencies);

      const route = getRoute(routes, "GET", "/api/uploads/list");
      expect(route).toBeTruthy();
      expect(route.handlers).toHaveLength(2);
      expect(route.handlers[0]).toBe(dependencies.requireAuth);

      const res = await invokeFinalHandler(route, {
        query: {
          folder: "users",
          recursive: "1",
          scopeUserId: "user-1",
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.files.map((item) => item.url)).toEqual([
        "/uploads/users/avatar.png",
        "/uploads/users/loose.png",
        "/uploads/users/nested/child.png",
      ]);
      expect(res.body.files.some((item) => item.url === "/uploads/posts/post.png")).toBe(false);
      expect(res.body.files.some((item) => item.url === "/uploads/posts/hidden.png")).toBe(false);
    } finally {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it("mantem 403 quando o escopo e resolvido mas o acesso e negado", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        resolveRequestUploadAccessScope: vi.fn(() => ({
          allowed: false,
          hasFullAccess: false,
          allowedRoots: ["posts"],
        })),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "GET", "/api/uploads/list");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      query: {
        folder: "users",
        recursive: "1",
        scopeUserId: "380305493391966208",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "forbidden" });
  });

  it("limpa staging workspace quando focal point e invalido", async () => {
    const { app, routes } = createAppRecorder();
    const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-routes-focal-"));
    const sourcePath = path.join(uploadsDir, "posts", "cover.png");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64"));
    const stagingWorkspace = {
      uploadsDir: path.join(uploadsDir, "_staging"),
    };
    const dependencies = createDependencies({
      app,
      overrides: {
        PUBLIC_UPLOADS_DIR: uploadsDir,
        canManageUploads: vi.fn(() => true),
        cleanupUploadStagingWorkspace: vi.fn(),
        createUploadStagingWorkspace: vi.fn(() => stagingWorkspace),
        extractRequestedUploadFocalPayload: vi.fn(() => ({})),
        loadUploads: vi.fn(() => [
          {
            id: "upload-1",
            url: "/uploads/posts/cover.png",
            folder: "posts",
            fileName: "cover.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ]),
        resolveUploadAbsolutePath: vi.fn(() => sourcePath),
        writeUploadBufferToStaging: vi.fn(() =>
          path.join(stagingWorkspace.uploadsDir, "cover.png"),
        ),
      },
    });

    try {
      registerUploadRoutes(dependencies);

      const route = getRoute(routes, "PATCH", "/api/uploads/:id/focal-point");
      expect(route).toBeTruthy();

      const res = await invokeFinalHandler(route, {
        params: {
          id: "upload-1",
        },
        body: {},
        session: {
          user: {
            id: "user-1",
          },
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: "invalid_focal_point" });
      expect(dependencies.cleanupUploadStagingWorkspace).toHaveBeenCalledWith(stagingWorkspace);
    } finally {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it("lista uploads de branding sem misturar outros roots", async () => {
    const { app, routes } = createAppRecorder();
    const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-routes-branding-"));
    fs.mkdirSync(path.join(uploadsDir, "branding"), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, "users"), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, "branding", "wordmark.png"), "branding");
    fs.writeFileSync(path.join(uploadsDir, "users", "hidden.png"), "users");
    const dependencies = createDependencies({
      app,
      overrides: {
        PUBLIC_UPLOADS_DIR: uploadsDir,
        loadUploads: vi.fn(() => [
          {
            id: "upload-branding-root",
            url: "/uploads/branding/logo.png",
            folder: "branding",
            fileName: "logo.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "upload-users-root",
            url: "/uploads/users/avatar.png",
            folder: "users",
            fileName: "avatar.png",
            mime: "image/png",
            size: 180,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ]),
      },
    });

    try {
      registerUploadRoutes(dependencies);

      const route = getRoute(routes, "GET", "/api/uploads/list");
      expect(route).toBeTruthy();

      const res = await invokeFinalHandler(route, {
        query: {
          folder: "branding",
          recursive: "1",
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.files.map((item) => item.url)).toEqual([
        "/uploads/branding/logo.png",
        "/uploads/branding/wordmark.png",
      ]);
      expect(res.body.files.some((item) => item.url === "/uploads/users/avatar.png")).toBe(false);
      expect(res.body.files.some((item) => item.url === "/uploads/users/hidden.png")).toBe(false);
    } finally {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it("anexa metadados do projeto aos uploads dentro de roots de projeto", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        loadProjects: vi.fn(() => [
          {
            id: "proj-1",
            title: "Projeto Um",
          },
        ]),
        loadUploads: vi.fn(() => [
          {
            id: "upload-project-page",
            url: "/uploads/projects/proj-1/capitulos/volume-1/capitulo-2/pagina-1.png",
            folder: "projects/proj-1/capitulos/volume-1/capitulo-2",
            fileName: "pagina-1.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ]),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "GET", "/api/uploads/list");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      query: {
        folder: "projects",
        recursive: "1",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "/uploads/projects/proj-1/capitulos/volume-1/capitulo-2/pagina-1.png",
          projectId: "proj-1",
          projectTitle: "Projeto Um",
        }),
      ]),
    );
  });

  it("inclui upload pedido por includeUrl sem expor o restante do outro projeto", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        loadProjects: vi.fn(() => [
          {
            id: "proj-a",
            title: "Projeto A",
          },
          {
            id: "proj-b",
            title: "Projeto B",
          },
        ]),
        loadUploads: vi.fn(() => [
          {
            id: "upload-proj-a-cover",
            url: "/uploads/projects/proj-a/cover.png",
            folder: "projects/proj-a",
            fileName: "cover.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "upload-proj-b-banner",
            url: "/uploads/projects/proj-b/banner.png",
            folder: "projects/proj-b",
            fileName: "banner.png",
            mime: "image/png",
            size: 180,
            createdAt: "2024-01-02T00:00:00.000Z",
            hashSha256: "hash-banner",
          },
          {
            id: "upload-proj-b-hidden",
            url: "/uploads/projects/proj-b/hidden.png",
            folder: "projects/proj-b",
            fileName: "hidden.png",
            mime: "image/png",
            size: 200,
            createdAt: "2024-01-03T00:00:00.000Z",
          },
        ]),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "GET", "/api/uploads/list");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      query: {
        folder: "projects/proj-a",
        recursive: "1",
        includeUrl: "/uploads/projects/proj-b/banner.png",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.files.map((item) => item.url)).toEqual([
      "/uploads/projects/proj-a/cover.png",
      "/uploads/projects/proj-b/banner.png",
    ]);
    expect(res.body.files.some((item) => item.url === "/uploads/projects/proj-b/hidden.png")).toBe(
      false,
    );
    expect(res.body.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "/uploads/projects/proj-b/banner.png",
          projectId: "proj-b",
          projectTitle: "Projeto B",
          hashSha256: "hash-banner",
        }),
      ]),
    );
  });

  it("ignora includeUrl fora do escopo autorizado", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        isUploadFolderAllowedInScope: vi.fn((folder, accessScope) => {
          if (accessScope?.hasFullAccess) {
            return true;
          }
          const root = String(folder || "").split("/")[0] || "";
          return (
            Array.isArray(accessScope?.allowedRoots) && accessScope.allowedRoots.includes(root)
          );
        }),
        loadUploads: vi.fn(() => [
          {
            id: "upload-proj-a-cover",
            url: "/uploads/projects/proj-a/cover.png",
            folder: "projects/proj-a",
            fileName: "cover.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "upload-users-avatar",
            url: "/uploads/users/avatar.png",
            folder: "users",
            fileName: "avatar.png",
            mime: "image/png",
            size: 180,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
        ]),
        resolveRequestUploadAccessScope: vi.fn(() => ({
          allowed: true,
          hasFullAccess: false,
          allowedRoots: ["projects"],
        })),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "GET", "/api/uploads/list");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      query: {
        folder: "projects/proj-a",
        recursive: "1",
        includeUrl: "/uploads/users/avatar.png",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.files.map((item) => item.url)).toEqual(["/uploads/projects/proj-a/cover.png"]);
    expect(res.body.files.some((item) => item.url === "/uploads/users/avatar.png")).toBe(false);
  });

  it("nao duplica um item quando includeUrl aponta para upload ja listado pela pasta", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        loadUploads: vi.fn(() => [
          {
            id: "upload-proj-a-cover",
            url: "/uploads/projects/proj-a/cover.png",
            folder: "projects/proj-a",
            fileName: "cover.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
        ]),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "GET", "/api/uploads/list");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      query: {
        folder: "projects/proj-a",
        recursive: "1",
        includeUrl: "/uploads/projects/proj-a/cover.png",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0]).toEqual(
      expect.objectContaining({
        url: "/uploads/projects/proj-a/cover.png",
      }),
    );
  });

  it("lista __all__ respeitando apenas os roots autorizados", async () => {
    const { app, routes } = createAppRecorder();
    const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-routes-all-"));
    fs.mkdirSync(path.join(uploadsDir, "users"), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, "posts"), { recursive: true });
    fs.mkdirSync(path.join(uploadsDir, "projects"), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, "users", "loose.png"), "users");
    fs.writeFileSync(path.join(uploadsDir, "posts", "loose.png"), "posts");
    fs.writeFileSync(path.join(uploadsDir, "projects", "loose.png"), "projects");
    const dependencies = createDependencies({
      app,
      overrides: {
        PUBLIC_UPLOADS_DIR: uploadsDir,
        isUploadFolderAllowedInScope: vi.fn((folder, accessScope) => {
          if (accessScope?.hasFullAccess) {
            return true;
          }
          const root = String(folder || "").split("/")[0] || "";
          return (
            Array.isArray(accessScope?.allowedRoots) && accessScope.allowedRoots.includes(root)
          );
        }),
        loadUploads: vi.fn(() => [
          {
            id: "upload-users-root",
            url: "/uploads/users/avatar.png",
            folder: "users",
            fileName: "avatar.png",
            mime: "image/png",
            size: 120,
            createdAt: "2024-01-01T00:00:00.000Z",
          },
          {
            id: "upload-posts-root",
            url: "/uploads/posts/post.png",
            folder: "posts",
            fileName: "post.png",
            mime: "image/png",
            size: 200,
            createdAt: "2024-01-02T00:00:00.000Z",
          },
          {
            id: "upload-projects-root",
            url: "/uploads/projects/proj-1/cover.png",
            folder: "projects/proj-1",
            fileName: "cover.png",
            mime: "image/png",
            size: 300,
            createdAt: "2024-01-03T00:00:00.000Z",
          },
        ]),
        resolveRequestUploadAccessScope: vi.fn(() => ({
          allowed: true,
          hasFullAccess: false,
          allowedRoots: ["users", "posts"],
        })),
      },
    });

    try {
      registerUploadRoutes(dependencies);

      const route = getRoute(routes, "GET", "/api/uploads/list");
      expect(route).toBeTruthy();

      const res = await invokeFinalHandler(route, {
        query: {
          folder: "__all__",
          scopeUserId: "user-1",
        },
        session: {
          user: {
            id: "user-1",
          },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.body.files.map((item) => item.url)).toEqual([
        "/uploads/posts/loose.png",
        "/uploads/posts/post.png",
        "/uploads/users/avatar.png",
        "/uploads/users/loose.png",
      ]);
      expect(res.body.files.some((item) => item.url === "/uploads/projects/proj-1/cover.png")).toBe(
        false,
      );
      expect(res.body.files.some((item) => item.url === "/uploads/projects/loose.png")).toBe(false);
    } finally {
      fs.rmSync(uploadsDir, { recursive: true, force: true });
    }
  });

  it("degrada para lista vazia quando a leitura interna falha", async () => {
    const { app, routes } = createAppRecorder();
    const dependencies = createDependencies({
      app,
      overrides: {
        loadUploads: vi.fn(() => {
          throw new Error("read_failed");
        }),
      },
    });

    registerUploadRoutes(dependencies);

    const route = getRoute(routes, "GET", "/api/uploads/list");
    expect(route).toBeTruthy();

    const res = await invokeFinalHandler(route, {
      query: {
        folder: "branding",
        recursive: "1",
      },
      session: {
        user: {
          id: "user-1",
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ files: [] });
  });
});
