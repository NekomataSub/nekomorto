import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import session from "express-session";
import fs from "fs";
import path from "path";
import { buildCorsOptionsForRequest } from "./cors-policy.js";
import { createIdempotencyFingerprint } from "./idempotency-store.js";
import { canAccessApiDuringPendingAuth, resolvePendingAuthStage } from "./pending-mfa-guard.js";
import { applySecurityHeaders } from "./security-headers.js";
import { createUploadsDeliveryMiddleware } from "./uploads-delivery.js";

const MUTATING_HTTP_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_-]{8,200}$/;
const CLIENT_STATIC_ASSET_PREFIXES = ["/assets/", "/fonts/", "/pwa/"];
const CLIENT_STATIC_ASSET_EXACT_PATHS = new Set([
  "/favicon.ico",
  "/placeholder.svg",
  "/robots.txt",
]);
const PUBLIC_ASSET_RATE_LIMIT_STATE = Symbol("publicAssetRateLimitState");

export const resolvePwaCriticalAssetPath = ({ clientDistDir, requestPath }) => {
  const normalizedPath = String(requestPath || "").trim();
  if (!normalizedPath) {
    return null;
  }
  if (normalizedPath === "/manifest.webmanifest") {
    return path.join(clientDistDir, "manifest.webmanifest");
  }
  return null;
};

export const resolveClientStaticAssetPath = ({ clientDistDir, requestPath }) => {
  const normalizedPath = String(requestPath || "").trim();
  if (!normalizedPath || !normalizedPath.startsWith("/")) {
    return null;
  }
  if (CLIENT_STATIC_ASSET_EXACT_PATHS.has(normalizedPath)) {
    return path.join(clientDistDir, normalizedPath.slice(1));
  }
  if (
    CLIENT_STATIC_ASSET_PREFIXES.some(
      (prefix) => normalizedPath === prefix.slice(0, -1) || normalizedPath.startsWith(prefix),
    )
  ) {
    return path.join(clientDistDir, normalizedPath.slice(1));
  }
  return null;
};

const resolvePwaThemeColors = ({ mode, pwaThemeColorDark, pwaThemeColorLight }) => {
  if (String(mode || "").toLowerCase() === "light") {
    return {
      theme_color: pwaThemeColorLight,
      background_color: pwaThemeColorLight,
    };
  }
  return {
    theme_color: pwaThemeColorDark,
    background_color: pwaThemeColorDark,
  };
};

export const buildPwaManifestPayload = ({
  loadSiteSettings,
  pwaManifestBase,
  pwaThemeColorDark,
  pwaThemeColorLight,
}) => {
  let settings = null;
  try {
    settings = loadSiteSettings();
  } catch {
    settings = null;
  }
  const themeMode = settings?.theme?.mode || "dark";
  const siteName = String(settings?.site?.name || "").trim();
  const siteDescription = String(settings?.site?.description || "").trim();
  return {
    ...pwaManifestBase,
    name: siteName || String(pwaManifestBase?.name || "").trim(),
    short_name: siteName || String(pwaManifestBase?.short_name || "").trim(),
    description: siteDescription || String(pwaManifestBase?.description || "").trim(),
    ...resolvePwaThemeColors({
      mode: themeMode,
      pwaThemeColorDark,
      pwaThemeColorLight,
    }),
  };
};

export const registerRuntimeMiddleware = ({
  app,
  apiContractVersion,
  canReadPublicAsset,
  clientDistDir,
  clientRootDir,
  getRequestIp,
  idempotencyStore,
  idempotencyTtlMs,
  isAllowedOrigin,
  isMaintenanceMode,
  isMetricsEnabled,
  isProduction,
  isPwaDevEnabled,
  loadSiteSettings,
  loadUploads,
  maybeEmitAdminActionFromNewNetwork,
  metricsRegistry,
  pwaManifestBase,
  pwaManifestCacheControl,
  pwaThemeColorDark,
  pwaThemeColorLight,
  primaryAppHost,
  primaryAppOrigin,
  sessionCookieConfig,
  sessionStore,
  setStaticCacheHeaders,
  staticDefaultCacheControl,
  trustProxy = 1,
  updateSessionIndexFromRequest,
  uploadStorageService,
  viteDevServer,
}) => {
  const PUBLIC_ASSET_METHODS = new Set(["GET", "HEAD"]);

  const rejectRateLimitedAssetRead = (res) => {
    res.setHeader("Cache-Control", "no-store");
    return res.status(429).json({ error: "rate_limited" });
  };

  const resolveRequestPath = (req) => {
    const fallbackPath = String(req?.path || req?.url || "").trim();
    const rawUrl = String(req?.originalUrl || req?.url || fallbackPath).trim();
    if (!rawUrl) {
      return fallbackPath;
    }
    try {
      return new URL(rawUrl, "https://nekomata.local").pathname || fallbackPath;
    } catch {
      return fallbackPath;
    }
  };

  const isPublicAssetReadRequest = (req) => {
    const requestPath = resolveRequestPath(req);
    if (!requestPath) {
      return false;
    }
    if (requestPath === "/manifest.webmanifest" || requestPath.startsWith("/uploads/")) {
      return true;
    }
    return Boolean(
      resolvePwaCriticalAssetPath({
        clientDistDir,
        requestPath,
      }) ||
        resolveClientStaticAssetPath({
          clientDistDir,
          requestPath,
        }),
    );
  };

  const enforcePublicAssetReadRateLimit = async (req, res, next) => {
    const method = String(req.method || "").toUpperCase();
    if (!PUBLIC_ASSET_METHODS.has(method) || !isPublicAssetReadRequest(req)) {
      return next();
    }
    if (req[PUBLIC_ASSET_RATE_LIMIT_STATE]) {
      return next();
    }
    req[PUBLIC_ASSET_RATE_LIMIT_STATE] = true;
    if (typeof canReadPublicAsset !== "function") {
      return next();
    }
    if (!(await canReadPublicAsset(getRequestIp(req)))) {
      return rejectRateLimitedAssetRead(res);
    }
    return next();
  };

  const codeQlVisiblePublicAssetReadRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: isProduction ? 5000 : 10000,
    standardHeaders: false,
    legacyHeaders: false,
    skip: (req) => {
      const method = String(req.method || "").toUpperCase();
      return !PUBLIC_ASSET_METHODS.has(method) || !isPublicAssetReadRequest(req);
    },
    keyGenerator: (req) => {
      const ip = getRequestIp(req);
      return ip ? ipKeyGenerator(ip) : "anonymous";
    },
    handler: (_req, res) => rejectRateLimitedAssetRead(res),
  });

  const codeQlVisiblePendingAuthGuardRateLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: isProduction ? 300 : 1000,
    standardHeaders: false,
    legacyHeaders: false,
    skip: (req) => !resolvePendingAuthStage(req.session),
    keyGenerator: (req) => {
      const pendingUserId =
        req.session?.pendingMfaUser?.id || req.session?.pendingMfaEnrollmentUser?.id || "";
      if (pendingUserId) {
        return `pending-auth:${pendingUserId}`;
      }
      const ip = getRequestIp(req);
      return ip ? ipKeyGenerator(ip) : "anonymous";
    },
    handler: (_req, res) => {
      res.setHeader("Cache-Control", "no-store");
      return res.status(429).json({ error: "rate_limited" });
    },
  });

  const handleMissingPwaAsset = (req, res, next) => {
    const method = String(req.method || "").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }
    const assetPath = resolvePwaCriticalAssetPath({
      clientDistDir,
      requestPath: req.path,
    });
    if (!assetPath) {
      return next();
    }
    if (fs.existsSync(assetPath)) {
      return next();
    }
    return res.status(404).json({ error: "pwa_asset_not_found" });
  };

  const handleMissingClientAsset = (req, res, next) => {
    const method = String(req.method || "").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }
    const assetPath = resolveClientStaticAssetPath({
      clientDistDir,
      requestPath: req.path,
    });
    if (!assetPath) {
      return next();
    }
    if (fs.existsSync(assetPath)) {
      return next();
    }
    return res.status(404).end();
  };

  app.use((req, res, next) => {
    if (!isProduction) {
      return next();
    }
    const cspNonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = cspNonce;
    applySecurityHeaders(res, cspNonce);
    return next();
  });

  app.use(compression());
  app.use(express.json({ limit: "30mb" }));
  app.use(cookieParser());
  const apiCorsMiddleware = cors((req, callback) => {
    const corsOptions = buildCorsOptionsForRequest({
      origin: req.headers.origin,
      method: req.method,
      isProduction,
      isAllowedOriginFn: isAllowedOrigin,
    });
    if (corsOptions) {
      callback(null, corsOptions);
      return;
    }
    callback(new Error("Not allowed by CORS"));
  });
  app.use("/api", apiCorsMiddleware);
  app.use("/auth", apiCorsMiddleware);

  app.set("trust proxy", trustProxy);

  app.use((req, res, next) => {
    if (!isProduction) {
      return next();
    }
    const method = String(req.method || "").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      return next();
    }
    const canonicalHost = String(primaryAppHost || "")
      .trim()
      .toLowerCase();
    const canonicalOrigin = String(primaryAppOrigin || "").trim();
    const hostname = String(req.hostname || "")
      .trim()
      .toLowerCase();
    if (!canonicalHost || !canonicalOrigin || hostname !== `www.${canonicalHost}`) {
      return next();
    }
    const location = `${canonicalOrigin}${String(req.originalUrl || req.url || "/")}`;
    return res.redirect(301, location);
  });

  const requireSameOrigin = (req, res, next) => {
    if (!isProduction) {
      return next();
    }
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return next();
    }
    const originHeader = String(req.headers.origin || "");
    const refererHeader = String(req.headers.referer || "");
    let origin = originHeader;
    if (!origin && refererHeader) {
      try {
        origin = new URL(refererHeader).origin;
      } catch {
        origin = "";
      }
    }
    if (!origin || !isAllowedOrigin(origin)) {
      return res.status(403).json({ error: "csrf" });
    }
    return next();
  };
  app.use("/api", requireSameOrigin);

  const sessionCookieOptions = {
    ...sessionCookieConfig.cookie,
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
  };
  app.use(
    session({
      name: sessionCookieConfig.name,
      secret: sessionCookieConfig.secret,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: sessionCookieOptions,
    }),
  );

  app.use((req, res, next) => {
    const requestIdHeader = String(req.headers["x-request-id"] || "").trim();
    const requestId = /^[a-zA-Z0-9._:-]{6,128}$/.test(requestIdHeader)
      ? requestIdHeader
      : crypto.randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-API-Version", apiContractVersion);
    return next();
  });
  app.use((req, res, next) => {
    const stopTimer = metricsRegistry.createTimer("http_request_duration_ms", {
      method: String(req.method || "").toUpperCase(),
      route: String(req.path || ""),
    });
    const startedAt = Date.now();
    res.on("finish", () => {
      const durationMs = stopTimer();
      metricsRegistry.inc("http_requests_total", {
        method: String(req.method || "").toUpperCase(),
        route: String(req.path || ""),
        status: String(res.statusCode || 0),
      });
      if (isMetricsEnabled) {
        const log = {
          level: res.statusCode >= 500 ? "error" : "info",
          msg: "http_request",
          ts: new Date().toISOString(),
          requestId: req.requestId || null,
          userId:
            req.session?.user?.id ||
            req.session?.pendingMfaUser?.id ||
            req.session?.pendingMfaEnrollmentUser?.id ||
            null,
          method: String(req.method || "").toUpperCase(),
          route: String(req.path || ""),
          statusCode: Number(res.statusCode || 0),
          durationMs: Math.round(durationMs),
          ip: getRequestIp(req) || "",
          ua: String(req.headers["user-agent"] || "").slice(0, 200),
          bytesIn: Number(req.headers["content-length"] || 0) || 0,
          bytesOut: Number(res.getHeader("content-length") || 0) || 0,
          elapsedMs: Date.now() - startedAt,
        };
        console.log(JSON.stringify(log));
      }
    });
    return next();
  });
  app.use((req, _res, next) => {
    updateSessionIndexFromRequest(req);
    return next();
  });
  app.use("/api", codeQlVisiblePendingAuthGuardRateLimit, (req, res, next) => {
    const pendingAuthStage = resolvePendingAuthStage(req.session);
    if (!pendingAuthStage) {
      return next();
    }
    if (canAccessApiDuringPendingAuth(pendingAuthStage, req.path)) {
      return next();
    }
    return res.status(401).json({
      error: pendingAuthStage === "mfa_enrollment" ? "mfa_enrollment_required" : "mfa_required",
    });
  });
  app.use("/api", (req, _res, next) => {
    maybeEmitAdminActionFromNewNetwork(req);
    return next();
  });

  app.use((req, res, next) => {
    if (!isMaintenanceMode) {
      return next();
    }
    if (!req.path.startsWith("/api")) {
      return next();
    }
    if (!MUTATING_HTTP_METHODS.has(String(req.method || "").toUpperCase())) {
      return next();
    }
    return res.status(503).json({ error: "maintenance_mode" });
  });

  app.use("/api", (req, res, next) => {
    if (!MUTATING_HTTP_METHODS.has(String(req.method || "").toUpperCase())) {
      return next();
    }
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim();
    if (!idempotencyKey) {
      return next();
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return res.status(400).json({ error: "invalid_idempotency_key" });
    }
    const actorId = req.session?.user?.id
      ? `user:${req.session.user.id}`
      : `ip:${getRequestIp(req) || "anonymous"}`;
    const requestPath = String(req.path || "").split("?")[0] || "/";
    const fingerprint = createIdempotencyFingerprint({
      method: req.method,
      path: requestPath,
      actorId,
      body: req.body && typeof req.body === "object" ? req.body : null,
    });
    const reserveResult = idempotencyStore.reserve({
      key: idempotencyKey,
      fingerprint,
      ttlOverrideMs: idempotencyTtlMs,
    });

    if (reserveResult.status === "conflict") {
      return res.status(409).json({ error: "idempotency_conflict" });
    }
    if (reserveResult.status === "in_progress") {
      return res.status(409).json({ error: "idempotency_in_progress" });
    }
    if (reserveResult.status === "replay") {
      const replay = reserveResult.response || {};
      res.setHeader("Idempotency-Replayed", "true");
      res.setHeader("Idempotency-Key", idempotencyKey);
      return res.status(Number(replay.statusCode || 200)).json(replay.body ?? null);
    }
    if (reserveResult.status !== "reserved") {
      return res.status(400).json({ error: "invalid_idempotency_key" });
    }

    res.setHeader("Idempotency-Key", idempotencyKey);
    const originalJson = res.json.bind(res);
    let capturedJson = null;
    let hasJsonPayload = false;
    res.json = (payload) => {
      capturedJson = payload;
      hasJsonPayload = true;
      return originalJson(payload);
    };

    let done = false;
    const finalize = () => {
      if (done) {
        return;
      }
      done = true;
      if (res.statusCode >= 500 || !hasJsonPayload) {
        idempotencyStore.release({ key: idempotencyKey, fingerprint });
        return;
      }
      idempotencyStore.complete({
        key: idempotencyKey,
        fingerprint,
        ttlOverrideMs: idempotencyTtlMs,
        response: {
          statusCode: res.statusCode,
          body: capturedJson,
        },
      });
    };

    res.on("finish", finalize);
    res.on("close", () => {
      if (!res.writableEnded) {
        idempotencyStore.release({ key: idempotencyKey, fingerprint });
      }
    });
    return next();
  });

  app.get("/manifest.webmanifest", enforcePublicAssetReadRateLimit, (_req, res) => {
    if (!isProduction && !isPwaDevEnabled) {
      return res.status(404).json({ error: "pwa_asset_unavailable_in_dev" });
    }
    const payload = buildPwaManifestPayload({
      loadSiteSettings,
      pwaManifestBase,
      pwaThemeColorDark,
      pwaThemeColorLight,
    });
    res.setHeader("Cache-Control", pwaManifestCacheControl);
    res.type("application/manifest+json; charset=utf-8");
    return res.status(200).send(JSON.stringify(payload));
  });

  const uploadsPublicDir = path.join(clientRootDir, "public", "uploads");
  app.use("/uploads/_quarantine", (_req, res) => res.status(404).end());
  app.use(
    "/uploads",
    codeQlVisiblePublicAssetReadRateLimit,
    enforcePublicAssetReadRateLimit,
    createUploadsDeliveryMiddleware({
      uploadsDir: uploadsPublicDir,
      loadUploads,
      storageService: uploadStorageService,
      defaultCacheControl: staticDefaultCacheControl,
    }),
  );
  app.use(
    "/uploads",
    codeQlVisiblePublicAssetReadRateLimit,
    enforcePublicAssetReadRateLimit,
    express.static(uploadsPublicDir, {
      setHeaders: (res) => {
        res.setHeader("Cache-Control", staticDefaultCacheControl);
      },
    }),
  );
  if (isProduction) {
    app.use(
      codeQlVisiblePublicAssetReadRateLimit,
      enforcePublicAssetReadRateLimit,
      express.static(clientDistDir, {
        index: false,
        setHeaders: setStaticCacheHeaders,
      }),
    );
    app.use(
      codeQlVisiblePublicAssetReadRateLimit,
      enforcePublicAssetReadRateLimit,
      handleMissingPwaAsset,
    );
    app.use(
      codeQlVisiblePublicAssetReadRateLimit,
      enforcePublicAssetReadRateLimit,
      handleMissingClientAsset,
    );
  }
  if (!isProduction) {
    app.use((req, res, next) => {
      const method = String(req.method || "").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        return next();
      }
      const assetPath = resolvePwaCriticalAssetPath({
        clientDistDir,
        requestPath: req.path,
      });
      if (!assetPath) {
        return next();
      }
      if (isPwaDevEnabled) {
        return next();
      }
      return res.status(404).json({ error: "pwa_asset_unavailable_in_dev" });
    });
  }
  if (viteDevServer) {
    app.use(viteDevServer.middlewares);
  }
};
