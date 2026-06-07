import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import {
  buildPwaManifestPayload,
  registerRuntimeMiddleware,
  resolveClientStaticAssetPath,
  resolvePwaCriticalAssetPath,
} from "../../server/lib/register-runtime-middleware.js";

describe("register-runtime-middleware asset resolution", () => {
  const clientDistDir = path.join("D:", "dist");

  it("resolves critical pwa assets from the dist root", () => {
    expect(
      resolvePwaCriticalAssetPath({
        clientDistDir,
        requestPath: "/manifest.webmanifest",
      }),
    ).toBe(path.join(clientDistDir, "manifest.webmanifest"));
    expect(
      resolvePwaCriticalAssetPath({
        clientDistDir,
        requestPath: "/sw.js",
      }),
    ).toBeNull();
  });

  it("resolves client static asset requests that should never fall through to html", () => {
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/assets/index-abc123.js",
      }),
    ).toBe(path.join(clientDistDir, "assets", "index-abc123.js"));
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/fonts/inter/InterLatin.woff2",
      }),
    ).toBe(path.join(clientDistDir, "fonts", "inter", "InterLatin.woff2"));
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/pwa/icon-192.png",
      }),
    ).toBe(path.join(clientDistDir, "pwa", "icon-192.png"));
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/favicon.ico",
      }),
    ).toBe(path.join(clientDistDir, "favicon.ico"));
  });

  it("keeps spa and api routes out of static asset handling", () => {
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/dashboard/posts",
      }),
    ).toBeNull();
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/api/public/bootstrap",
      }),
    ).toBeNull();
    expect(
      resolveClientStaticAssetPath({
        clientDistDir,
        requestPath: "/manifest.webmanifest",
      }),
    ).toBeNull();
  });
});

describe("buildPwaManifestPayload", () => {
  const pwaManifestBase = Object.freeze({
    id: "/",
    name: "Base Name",
    short_name: "Base Short",
    description: "Base description",
    start_url: "/",
  });

  it("prefers site settings for manifest name and description", () => {
    expect(
      buildPwaManifestPayload({
        loadSiteSettings: () => ({
          site: {
            name: "Neko Custom",
            description: "Descricao vinda das configuracoes",
          },
          theme: {
            mode: "light",
          },
        }),
        pwaManifestBase,
        pwaThemeColorDark: "#111111",
        pwaThemeColorLight: "#fafafa",
      }),
    ).toMatchObject({
      name: "Neko Custom",
      short_name: "Neko Custom",
      description: "Descricao vinda das configuracoes",
      theme_color: "#fafafa",
      background_color: "#fafafa",
    });
  });

  it("falls back to the base manifest fields when site settings are unavailable", () => {
    expect(
      buildPwaManifestPayload({
        loadSiteSettings: () => {
          throw new Error("settings unavailable");
        },
        pwaManifestBase,
        pwaThemeColorDark: "#111111",
        pwaThemeColorLight: "#fafafa",
      }),
    ).toMatchObject({
      name: "Base Name",
      short_name: "Base Short",
      description: "Base description",
      theme_color: "#111111",
      background_color: "#111111",
    });
  });
});

const createAppCapture = () => {
  const entries: Array<{ method: "get" | "use"; args: unknown[] }> = [];
  return {
    app: {
      get: (...args: unknown[]) => {
        entries.push({ method: "get", args });
      },
      set: vi.fn(),
      use: (...args: unknown[]) => {
        entries.push({ method: "use", args });
      },
    },
    entries,
  };
};

const createResponse = () => ({
  body: null as unknown,
  ended: false,
  headers: new Map<string, string>(),
  locals: {} as Record<string, unknown>,
  redirectedTo: "",
  statusCode: 200,
  end() {
    this.ended = true;
    return this;
  },
  json(payload: unknown) {
    this.body = payload;
    return this;
  },
  setHeader(name: string, value: unknown) {
    this.headers.set(String(name).toLowerCase(), String(value));
    return this;
  },
  status(code: number) {
    this.statusCode = Number(code);
    return this;
  },
  redirect(code: number, location: string) {
    this.statusCode = Number(code);
    this.redirectedTo = String(location || "");
    this.setHeader("location", this.redirectedTo);
    this.ended = true;
    return this;
  },
});

const invokeMiddlewareStack = async (middlewares: any[], req: Record<string, unknown>) => {
  const res = createResponse();
  const finalNext = vi.fn();
  let index = 0;
  const next = async () => {
    const middleware = middlewares[index];
    index += 1;
    if (!middleware) {
      finalNext();
      return;
    }
    await middleware(req, res, next);
  };
  await next();
  return { next: finalNext, res };
};

const createRuntimeDependencies = (overrides: Record<string, unknown> = {}) => {
  const { app, entries } = createAppCapture();
  const base = {
    apiContractVersion: "2026-04-16",
    app,
    canReadPublicAsset: vi.fn(async () => true),
    clientDistDir: path.join("D:", "dist"),
    clientRootDir: path.join("D:", "app"),
    getRequestIp: vi.fn(() => "203.0.113.20"),
    idempotencyStore: {
      complete: vi.fn(),
      release: vi.fn(),
      reserve: vi.fn(() => ({ status: "reserved" })),
    },
    idempotencyTtlMs: 60_000,
    isAllowedOrigin: vi.fn(() => true),
    isMaintenanceMode: false,
    isMetricsEnabled: false,
    isProduction: true,
    isPwaDevEnabled: false,
    loadSiteSettings: vi.fn(() => ({})),
    loadUploads: vi.fn(() => []),
    maybeEmitAdminActionFromNewNetwork: vi.fn(),
    metricsRegistry: {
      createTimer: vi.fn(() => () => 0),
      inc: vi.fn(),
    },
    pwaManifestBase: {
      id: "/",
      name: "Nekomorto",
      short_name: "Neko",
      start_url: "/",
    },
    pwaManifestCacheControl: "public, max-age=60",
    pwaThemeColorDark: "#111111",
    pwaThemeColorLight: "#fafafa",
    primaryAppHost: "nekomata.moe",
    primaryAppOrigin: "https://nekomata.moe",
    sessionCookieConfig: {
      cookie: {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
      name: "__Host-rainbow.sid",
      secret: "secret",
    },
    sessionStore: {
      on: vi.fn(),
    },
    setStaticCacheHeaders: vi.fn(),
    staticDefaultCacheControl: "public, max-age=300",
    updateSessionIndexFromRequest: vi.fn(),
    uploadStorageService: {},
    viteDevServer: null,
  };
  const dependencies = {
    ...base,
    ...overrides,
  };
  registerRuntimeMiddleware(dependencies);
  return {
    ...dependencies,
    entries,
  };
};

const getUseEntriesByPath = (
  entries: Array<{ method: string; args: unknown[] }>,
  routePath: string,
) => entries.filter((entry) => entry.method === "use" && entry.args[0] === routePath);

const expectCodeQlVisibleAssetLimiterBeforeCustomLimiter = (args: unknown[]) => {
  expect(String(args[0])).toContain("Promise.resolve(fn");
  expect(String(args[1])).toContain("PUBLIC_ASSET_RATE_LIMIT_STATE");
};

describe("registerRuntimeMiddleware security headers", () => {
  it("mantem CSP com nonce nas rotas publicas Astro com ClientRouter", async () => {
    const { entries } = createRuntimeDependencies();
    const securityMiddleware = entries.find(
      (entry) => entry.method === "use" && typeof entry.args[0] === "function",
    )?.args[0];

    const result = await invokeMiddlewareStack([securityMiddleware], {
      headers: {},
      method: "GET",
      originalUrl: "/projetos",
      path: "/projetos",
    });

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.res.headers.get("content-security-policy")).toContain(
      "script-src 'self' 'nonce-",
    );
    expect(result.res.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(result.res.headers.get("content-security-policy")).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });

  it("mantem CSP com nonce fora das rotas publicas com ClientRouter", async () => {
    const { entries } = createRuntimeDependencies();
    const securityMiddleware = entries.find(
      (entry) => entry.method === "use" && typeof entry.args[0] === "function",
    )?.args[0];

    const result = await invokeMiddlewareStack([securityMiddleware], {
      headers: {},
      method: "GET",
      originalUrl: "/dashboard",
      path: "/dashboard",
    });

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.res.headers.get("content-security-policy")).toContain("script-src 'self' 'nonce-");
    expect(result.res.headers.get("content-security-policy")).not.toContain(
      "script-src 'self' 'unsafe-inline'",
    );
  });
});

describe("registerRuntimeMiddleware public asset throttling", () => {
  it("reuses the same uploads rate limiter across delivery and static handlers", async () => {
    const canReadPublicAsset = vi.fn(async () => true);
    const { entries } = createRuntimeDependencies({
      canReadPublicAsset,
    });
    const uploadEntries = getUseEntriesByPath(entries, "/uploads");

    expect(uploadEntries).toHaveLength(2);
    expect(uploadEntries[0]?.args).toHaveLength(4);
    expect(uploadEntries[1]?.args).toHaveLength(4);

    const req = {
      method: "GET",
      originalUrl: "/uploads/posts/cover.png",
      path: "/posts/cover.png",
    };

    const first = await invokeMiddlewareStack(
      [uploadEntries[0]?.args[1], uploadEntries[0]?.args[2]],
      req,
    );
    const second = await invokeMiddlewareStack(
      [uploadEntries[1]?.args[1], uploadEntries[1]?.args[2]],
      req,
    );

    expect(first.next).toHaveBeenCalledTimes(1);
    expect(second.next).toHaveBeenCalledTimes(1);
    expect(canReadPublicAsset).toHaveBeenCalledTimes(1);
    expect(canReadPublicAsset).toHaveBeenCalledWith("203.0.113.20");
  });

  it("blocks uploads before the delivery middleware runs", async () => {
    const canReadPublicAsset = vi.fn(async () => false);
    const { entries } = createRuntimeDependencies({
      canReadPublicAsset,
    });
    const uploadEntries = getUseEntriesByPath(entries, "/uploads");

    const result = await invokeMiddlewareStack(
      [uploadEntries[0]?.args[1], uploadEntries[0]?.args[2]],
      {
        method: "GET",
        originalUrl: "/uploads/posts/limited.png",
        path: "/posts/limited.png",
      },
    );

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.statusCode).toBe(429);
    expect(result.res.body).toEqual({ error: "rate_limited" });
    expect(result.res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 429 for missing manifest requests before checking the filesystem", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync");
    const entries = createRuntimeDependencies({
      canReadPublicAsset: vi.fn(async () => false),
    }).entries;
    const fallbackEntryIndex = entries.findIndex(
      (entry) =>
        entry.method === "use" &&
        entry.args.some(
          (arg) => typeof arg === "function" && String(arg).includes("pwa_asset_not_found"),
        ),
    );
    const fallbackEntry = fallbackEntryIndex >= 0 ? entries[fallbackEntryIndex] : null;

    expect(fallbackEntry).not.toBeNull();
    if (!fallbackEntry) {
      throw new Error("missing pwa fallback entry");
    }
    expectCodeQlVisibleAssetLimiterBeforeCustomLimiter(fallbackEntry.args);

    const result = await invokeMiddlewareStack(fallbackEntry.args, {
      method: "GET",
      originalUrl: "/manifest.webmanifest",
      path: "/manifest.webmanifest",
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.statusCode).toBe(429);
    expect(result.res.body).toEqual({ error: "rate_limited" });
    expect(existsSyncSpy).not.toHaveBeenCalled();
    existsSyncSpy.mockRestore();
  });

  it("returns 404 for missing manifest requests after the limiter allows the request", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const entries = createRuntimeDependencies().entries;
    const fallbackEntryIndex = entries.findIndex(
      (entry) =>
        entry.method === "use" &&
        entry.args.some(
          (arg) => typeof arg === "function" && String(arg).includes("pwa_asset_not_found"),
        ),
    );
    const fallbackEntry = fallbackEntryIndex >= 0 ? entries[fallbackEntryIndex] : null;
    expect(fallbackEntry).not.toBeNull();
    if (!fallbackEntry) {
      throw new Error("missing pwa fallback entry");
    }
    expectCodeQlVisibleAssetLimiterBeforeCustomLimiter(fallbackEntry.args);
    const req = {
      method: "GET",
      originalUrl: "/manifest.webmanifest",
      path: "/manifest.webmanifest",
    };

    const gate = await invokeMiddlewareStack(fallbackEntry.args, req);

    expect(gate.next).not.toHaveBeenCalled();
    expect(gate.res.statusCode).toBe(404);
    expect(gate.res.body).toEqual({ error: "pwa_asset_not_found" });
    expect(existsSyncSpy).toHaveBeenCalledTimes(1);
    existsSyncSpy.mockRestore();
  });

  it("returns 429 for missing client assets before checking the filesystem", async () => {
    const existsSyncSpy = vi.spyOn(fs, "existsSync");
    const entries = createRuntimeDependencies({
      canReadPublicAsset: vi.fn(async () => false),
    }).entries;
    const fallbackEntryIndex = entries.findIndex(
      (entry) =>
        entry.method === "use" &&
        entry.args.some(
          (arg) =>
            typeof arg === "function" && String(arg).includes("resolveClientStaticAssetPath"),
        ),
    );
    const fallbackEntry = fallbackEntryIndex >= 0 ? entries[fallbackEntryIndex] : null;

    expect(fallbackEntry).not.toBeNull();
    if (!fallbackEntry) {
      throw new Error("missing client asset fallback entry");
    }
    expectCodeQlVisibleAssetLimiterBeforeCustomLimiter(fallbackEntry.args);

    const result = await invokeMiddlewareStack(fallbackEntry.args, {
      method: "GET",
      originalUrl: "/assets/index-missing.js",
      path: "/assets/index-missing.js",
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.statusCode).toBe(429);
    expect(result.res.body).toEqual({ error: "rate_limited" });
    expect(existsSyncSpy).not.toHaveBeenCalled();
    existsSyncSpy.mockRestore();
  });

  it("skips public asset throttling for non-read methods", async () => {
    const canReadPublicAsset = vi.fn(async () => false);
    const { entries } = createRuntimeDependencies({
      canReadPublicAsset,
    });
    const uploadEntries = getUseEntriesByPath(entries, "/uploads");

    const result = await invokeMiddlewareStack(
      [uploadEntries[0]?.args[1], uploadEntries[0]?.args[2]],
      {
        method: "POST",
        originalUrl: "/uploads/posts/cover.png",
        path: "/posts/cover.png",
      },
    );

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(canReadPublicAsset).not.toHaveBeenCalled();
  });
});

describe("registerRuntimeMiddleware canonical host redirects", () => {
  it("redirects www requests to the canonical origin in one hop", async () => {
    const { entries } = createRuntimeDependencies();
    const redirectEntry = entries.find(
      (entry) =>
        entry.method === "use" &&
        entry.args.some(
          (arg) => typeof arg === "function" && String(arg).includes("canonicalHost"),
        ),
    );

    expect(redirectEntry).toBeTruthy();
    if (!redirectEntry) {
      throw new Error("missing canonical redirect middleware");
    }

    const result = await invokeMiddlewareStack([redirectEntry.args[0]], {
      method: "GET",
      hostname: "www.nekomata.moe",
      originalUrl: "/faq?tab=seo",
      url: "/faq?tab=seo",
    });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.res.statusCode).toBe(301);
    expect(result.res.redirectedTo).toBe("https://nekomata.moe/faq?tab=seo");
  });

  it("keeps canonical host requests on the normal middleware chain", async () => {
    const { entries } = createRuntimeDependencies();
    const redirectEntry = entries.find(
      (entry) =>
        entry.method === "use" &&
        entry.args.some(
          (arg) => typeof arg === "function" && String(arg).includes("canonicalHost"),
        ),
    );

    expect(redirectEntry).toBeTruthy();
    if (!redirectEntry) {
      throw new Error("missing canonical redirect middleware");
    }

    const result = await invokeMiddlewareStack([redirectEntry.args[0]], {
      method: "GET",
      hostname: "nekomata.moe",
      originalUrl: "/faq?tab=seo",
      url: "/faq?tab=seo",
    });

    expect(result.next).toHaveBeenCalledTimes(1);
    expect(result.res.redirectedTo).toBe("");
  });
});
