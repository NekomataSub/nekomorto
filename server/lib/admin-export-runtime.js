const REQUIRED_DEPENDENCY_KEYS = [
  "AccessRole",
  "adminExportMaxRows",
  "adminExportTtlHours",
  "adminExportsDir",
  "appendAuditLog",
  "backgroundJobQueue",
  "createSystemAuditReq",
  "filterByDateRange",
  "filterExportEntries",
  "loadAdminExportJobs",
  "loadAuditLog",
  "loadOwnerIds",
  "loadSecurityEvents",
  "loadUserSessionIndexRecords",
  "loadUsers",
  "metricsRegistry",
  "normalizeExportDataset",
  "normalizeExportFilters",
  "normalizeExportStatus",
  "normalizeUsers",
  "upsertAdminExportJob",
  "writeExportFile",
];

const assertRequiredDependencies = (dependencies = {}) => {
  const missing = REQUIRED_DEPENDENCY_KEYS.filter((key) => dependencies[key] === undefined);
  if (missing.length === 0) {
    return;
  }
  throw new Error(
    `[admin-export-runtime] missing required dependencies: ${missing.sort().join(", ")}`,
  );
};

const EXPORT_HEADERS_BY_DATASET = Object.freeze({
  audit_log: [
    "id",
    "ts",
    "actorId",
    "actorName",
    "action",
    "resource",
    "resourceId",
    "status",
    "ip",
    "requestId",
    "meta",
  ],
  security_events: [
    "id",
    "ts",
    "type",
    "severity",
    "riskScore",
    "status",
    "actorUserId",
    "targetUserId",
    "ip",
    "userAgent",
    "requestId",
    "data",
  ],
  users: ["id", "name", "status", "accessRole", "permissions", "roles", "isOwner", "updatedAt"],
  sessions: [
    "sid",
    "userId",
    "createdAt",
    "lastSeenAt",
    "lastIp",
    "userAgent",
    "revokedAt",
    "revokedBy",
    "revokeReason",
    "isPendingMfa",
  ],
});

export const createAdminExportRuntime = (dependencies = {}) => {
  assertRequiredDependencies(dependencies);

  const {
    AccessRole,
    adminExportMaxRows,
    adminExportTtlHours,
    adminExportsDir,
    appendAuditLog,
    backgroundJobQueue,
    createSystemAuditReq,
    filterByDateRange,
    filterExportEntries,
    loadAdminExportJobs,
    loadAuditLog,
    loadOwnerIds,
    loadSecurityEvents,
    loadUserSessionIndexRecords,
    loadUsers,
    metricsRegistry,
    normalizeExportDataset,
    normalizeExportFilters,
    normalizeExportStatus,
    normalizeUsers,
    upsertAdminExportJob,
    writeExportFile,
  } = dependencies;

  const buildExportRowsByDataset = async ({ dataset, filters }) => {
    const normalizedDataset = normalizeExportDataset(dataset);
    const normalizedFilters = normalizeExportFilters(filters);

    if (normalizedDataset === "audit_log") {
      let rows = loadAuditLog();
      rows = filterByDateRange(rows, {
        dateFrom: normalizedFilters.dateFrom,
        dateTo: normalizedFilters.dateTo,
        tsAccessor: (entry) => entry.ts,
      });
      rows = filterExportEntries(rows, normalizedFilters, {
        fieldAccessors: {
          actorUserId: (entry) => entry.actorId,
          targetUserId: (entry) => entry.resourceId,
          action: (entry) => entry.action,
          resource: (entry) => entry.resource,
          status: (entry) => entry.status,
        },
      });
      const mapped = rows.slice(0, adminExportMaxRows).map((entry) => ({
        id: entry.id,
        ts: entry.ts,
        actorId: entry.actorId,
        actorName: entry.actorName,
        action: entry.action,
        resource: entry.resource,
        resourceId: entry.resourceId || "",
        status: entry.status,
        ip: entry.ip || "",
        requestId: entry.requestId || "",
        meta: entry.meta || {},
      }));
      return {
        headers: EXPORT_HEADERS_BY_DATASET.audit_log,
        rows: mapped,
        truncated: rows.length > mapped.length,
      };
    }

    if (normalizedDataset === "security_events") {
      let rows = loadSecurityEvents();
      rows = filterByDateRange(rows, {
        dateFrom: normalizedFilters.dateFrom,
        dateTo: normalizedFilters.dateTo,
        tsAccessor: (entry) => entry.ts,
      });
      rows = filterExportEntries(rows, normalizedFilters, {
        fieldAccessors: {
          actorUserId: (entry) => entry.actorUserId,
          targetUserId: (entry) => entry.targetUserId,
          action: (entry) => entry.type,
          severity: (entry) => entry.severity,
          status: (entry) => entry.status,
        },
      });
      const mapped = rows.slice(0, adminExportMaxRows).map((entry) => ({
        id: entry.id,
        ts: entry.ts,
        type: entry.type,
        severity: entry.severity,
        riskScore: Number(entry.riskScore || 0),
        status: entry.status,
        actorUserId: entry.actorUserId || "",
        targetUserId: entry.targetUserId || "",
        ip: entry.ip || "",
        userAgent: entry.userAgent || "",
        requestId: entry.requestId || "",
        data: entry.data || {},
      }));
      return {
        headers: EXPORT_HEADERS_BY_DATASET.security_events,
        rows: mapped,
        truncated: rows.length > mapped.length,
      };
    }

    if (normalizedDataset === "users") {
      const ownerIds = new Set(loadOwnerIds().map((entry) => String(entry)));
      let rows = normalizeUsers(loadUsers()).map((entry) => ({
        id: entry.id,
        name: entry.name || "",
        status: entry.status || "active",
        accessRole: entry.accessRole || AccessRole.NORMAL,
        permissions: Array.isArray(entry.permissions) ? entry.permissions : [],
        roles: Array.isArray(entry.roles) ? entry.roles : [],
        isOwner: ownerIds.has(String(entry.id)),
        updatedAt: entry.updatedAt || "",
      }));
      rows = filterExportEntries(rows, normalizedFilters, {
        fieldAccessors: {
          actorUserId: (entry) => entry.id,
          targetUserId: (entry) => entry.id,
          status: (entry) => entry.status,
        },
      });
      const mapped = rows.slice(0, adminExportMaxRows);
      return {
        headers: EXPORT_HEADERS_BY_DATASET.users,
        rows: mapped,
        truncated: rows.length > mapped.length,
      };
    }

    let sessionRows = await loadUserSessionIndexRecords({ includeRevoked: true });
    sessionRows = filterByDateRange(sessionRows, {
      dateFrom: normalizedFilters.dateFrom,
      dateTo: normalizedFilters.dateTo,
      tsAccessor: (entry) => entry.lastSeenAt || entry.createdAt,
    });
    sessionRows = filterExportEntries(sessionRows, normalizedFilters, {
      fieldAccessors: {
        actorUserId: (entry) => entry.userId,
        targetUserId: (entry) => entry.userId,
        status: (entry) => (entry.revokedAt ? "revoked" : "active"),
      },
    });
    const mapped = sessionRows.slice(0, adminExportMaxRows).map((entry) => ({
      sid: entry.sid,
      userId: entry.userId,
      createdAt: entry.createdAt || null,
      lastSeenAt: entry.lastSeenAt || null,
      lastIp: entry.lastIp || "",
      userAgent: entry.userAgent || "",
      revokedAt: entry.revokedAt || null,
      revokedBy: entry.revokedBy || null,
      revokeReason: entry.revokeReason || null,
      isPendingMfa: Boolean(entry.isPendingMfa),
    }));
    return {
      headers: EXPORT_HEADERS_BY_DATASET.sessions,
      rows: mapped,
      truncated: sessionRows.length > mapped.length,
    };
  };

  const toAdminExportJobApiResponse = (job) => ({
    id: job.id,
    dataset: job.dataset,
    format: job.format,
    status: normalizeExportStatus(job.status),
    requestedBy: job.requestedBy,
    filters: job.filters || {},
    rowCount: Number.isFinite(Number(job.rowCount)) ? Number(job.rowCount) : null,
    error: job.error || null,
    createdAt: job.createdAt || null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    expiresAt: job.expiresAt || null,
    hasFile: Boolean(job.filePath),
  });

  const runAdminExportJob = async (jobId) => {
    const current = loadAdminExportJobs().find(
      (entry) => String(entry?.id || "") === String(jobId || ""),
    );
    if (!current) {
      return null;
    }
    const nowIso = new Date().toISOString();
    let processing = upsertAdminExportJob({
      ...current,
      status: "processing",
      startedAt: nowIso,
      finishedAt: null,
      error: null,
    });
    try {
      const payload = await buildExportRowsByDataset({
        dataset: processing.dataset,
        filters: processing.filters,
      });
      const filePath = writeExportFile({
        exportsDir: adminExportsDir,
        fileName: `${processing.dataset}-${processing.id}`,
        format: processing.format,
        headers: payload.headers,
        rows: payload.rows,
      });
      const finishedAt = new Date();
      processing = upsertAdminExportJob({
        ...processing,
        status: "completed",
        filePath,
        rowCount: payload.rows.length,
        finishedAt: finishedAt.toISOString(),
        expiresAt: new Date(
          finishedAt.getTime() + adminExportTtlHours * 60 * 60 * 1000,
        ).toISOString(),
        error: payload.truncated ? "truncated_max_rows" : null,
      });
      appendAuditLog(createSystemAuditReq(), "admin.exports.completed", "exports", {
        id: processing.id,
        dataset: processing.dataset,
        rowCount: payload.rows.length,
      });
      metricsRegistry.inc("export_jobs_total", {
        status: "completed",
        dataset: String(processing.dataset || "unknown"),
      });
      return processing;
    } catch (error) {
      const failed = upsertAdminExportJob({
        ...processing,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: String(error?.message || error || "export_failed"),
      });
      appendAuditLog(createSystemAuditReq(), "admin.exports.failed", "exports", {
        id: current.id,
        dataset: current.dataset,
        error: String(error?.message || error || "export_failed"),
      });
      metricsRegistry.inc("export_jobs_total", {
        status: "failed",
        dataset: String(current.dataset || "unknown"),
      });
      return failed;
    }
  };

  const enqueueAdminExportJob = (jobId) =>
    backgroundJobQueue.enqueue({
      type: "admin.export",
      payload: { jobId },
      run: async () => runAdminExportJob(jobId),
    });

  return {
    buildExportRowsByDataset,
    enqueueAdminExportJob,
    runAdminExportJob,
    toAdminExportJobApiResponse,
  };
};

export default createAdminExportRuntime;
