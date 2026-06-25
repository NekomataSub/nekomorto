import { Router } from "express";

const setNoStore = (res) => {
  res.setHeader("Cache-Control", "no-store");
};

const getBearerToken = (req) => {
  const authHeader = String(req.headers.authorization || "").trim();
  return authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";
};

const normalizeRemoteAddress = (value) =>
  String(value || "")
    .trim()
    .replace(/^::ffff:/i, "");

const isLoopbackAddress = (value) => {
  const address = normalizeRemoteAddress(value);
  return address === "::1" || address === "localhost" || address.startsWith("127.");
};

const getForwardedForAddress = (req) =>
  String(req.headers["x-forwarded-for"] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)[0] || "";

const isLoopbackRequest = (req) => {
  const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || "";
  if (!isLoopbackAddress(remoteAddress)) {
    return false;
  }
  const forwardedForAddress = getForwardedForAddress(req);
  return !forwardedForAddress || isLoopbackAddress(forwardedForAddress);
};

const sanitizeBuildMetadata = (build = {}) => ({
  apiVersion: build.apiVersion,
});

const sanitizeHealthCheck = (check = {}) => {
  const safeCheck = {
    name: check.name,
    status: check.status,
  };
  if (Number.isFinite(Number(check.latencyMs))) {
    safeCheck.latencyMs = Math.round(Number(check.latencyMs));
  }
  return safeCheck;
};

const buildPublicOperationalHealthPayload = (health, build) => ({
  ok: health.ok,
  status: health.status,
  ts: health.ts,
  dataSource: health.dataSource,
  maintenanceMode: health.maintenanceMode,
  checks: Array.isArray(health.checks) ? health.checks.map(sanitizeHealthCheck) : [],
  summary: health.summary,
  build: sanitizeBuildMetadata(build),
});

const buildDetailedOperationalHealthPayload = (health, build) => ({
  ...health,
  build,
});

export const registerOperationalRoutes = ({
  app,
  buildRuntimeMetadata,
  evaluateOperationalMonitoring,
  isMetricsEnabled,
  loadSecurityEvents,
  loadUserSessionIndexRecords,
  metricsRegistry,
  metricsTokenNormalized,
  operationalHealthTokenNormalized,
  securityEventStatusOpen,
}) => {
  const router = Router();

  router.get("/api/health/live", (_req, res) => {
    setNoStore(res);
    return res.json({
      ok: true,
      status: "ok",
      ts: new Date().toISOString(),
      build: buildRuntimeMetadata(),
    });
  });

  const isDetailedOperationalHealthAllowed = (req) => {
    const token =
      getBearerToken(req) || String(req.headers["x-operational-health-token"] || "").trim();
    return (
      isLoopbackRequest(req) ||
      Boolean(operationalHealthTokenNormalized && token === operationalHealthTokenNormalized)
    );
  };

  const sendOperationalHealth = async (req, res) => {
    setNoStore(res);
    const snapshot = await evaluateOperationalMonitoring();
    const build = buildRuntimeMetadata();
    const statusCode = snapshot.health.status === "fail" ? 503 : 200;
    const payload = isDetailedOperationalHealthAllowed(req)
      ? buildDetailedOperationalHealthPayload(snapshot.health, build)
      : buildPublicOperationalHealthPayload(snapshot.health, build);
    return res.status(statusCode).json(payload);
  };

  router.get("/api/health/ready", async (req, res) => {
    return sendOperationalHealth(req, res);
  });

  router.get("/api/health", async (req, res) => {
    return sendOperationalHealth(req, res);
  });

  router.get("/api/metrics", async (req, res, next) => {
    if (!isMetricsEnabled || !metricsTokenNormalized) {
      return res.status(404).json({ error: "not_found" });
    }
    const authHeader = String(req.headers.authorization || "").trim();
    const tokenFromHeader = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice("bearer ".length).trim()
      : "";
    const token = tokenFromHeader || String(req.headers["x-metrics-token"] || "").trim();
    if (!token || token !== metricsTokenNormalized) {
      return res.status(401).json({ error: "unauthorized" });
    }

    let activeSessionsCount = 0;
    try {
      activeSessionsCount = (await loadUserSessionIndexRecords({ includeRevoked: false })).filter(
        (entry) => !entry.revokedAt,
      ).length;
    } catch (error) {
      return next(error);
    }
    metricsRegistry.setGauge("active_sessions_total", {}, activeSessionsCount);
    const openSecurityEvents = loadSecurityEvents().filter(
      (entry) => String(entry.status || "").toLowerCase() === securityEventStatusOpen,
    ).length;
    metricsRegistry.setGauge("security_events_open_current", {}, openSecurityEvents);

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    return res.status(200).send(metricsRegistry.renderPrometheus());
  });

  app.use(router);
};
