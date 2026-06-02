import crypto from "crypto";
import {
  isNormalizedDomainReady,
  loadCommentsFromNormalized,
  loadNormalizedRuntimeStateMap,
  loadPostsFromNormalized,
  loadPostVersionsFromNormalized,
  loadProjectsFromNormalized,
  loadUpdatesFromNormalized,
  loadUploadsFromNormalized,
  loadUsersFromNormalized,
  syncCommentsToNormalized,
  syncPostsToNormalized,
  syncPostVersionsToNormalized,
  syncProjectsToNormalized,
  syncUpdatesToNormalized,
  syncUploadsToNormalized,
  syncUsersToNormalized,
  toDateOnlyOrNull,
} from "./normalized-domain-store.js";
import { prisma } from "./prisma-client.js";
import { WEBHOOK_DELIVERY_STATUS } from "./webhooks/delivery.js";

const cloneValue = (value) => {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
};

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const toDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
};

const normalizeMissingTableName = (value) =>
  String(value || "")
    .trim()
    .replace(/"/g, "")
    .toLowerCase();

const isPrismaMissingTableError = (error, { modelName = "", tableName = "" } = {}) => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const errorCode = String(error?.code || "").trim();
  const driverKind = String(error?.meta?.driverAdapterError?.cause?.kind || "").trim();
  if (errorCode !== "P2021" && driverKind !== "TableDoesNotExist") {
    return false;
  }
  if (modelName && String(error?.meta?.modelName || "").trim() === modelName) {
    return true;
  }
  const normalizedExpectedTable = normalizeMissingTableName(tableName);
  const normalizedActualTable = normalizeMissingTableName(
    error?.meta?.driverAdapterError?.cause?.table,
  );
  if (!normalizedExpectedTable || !normalizedActualTable) {
    return false;
  }
  return (
    normalizedActualTable === normalizedExpectedTable ||
    normalizedActualTable.endsWith(`.${normalizedExpectedTable}`)
  );
};

const DEFAULT_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_AUDIT_MAX_ENTRIES = 20_000;

const toAuditTimestamp = (value) => {
  const parsed = toDateOrNull(value);
  return parsed ? parsed.getTime() : null;
};

const compactAuditLogEntries = (
  entries,
  {
    nowTs = Date.now(),
    retentionMs = DEFAULT_AUDIT_RETENTION_MS,
    maxEntries = DEFAULT_AUDIT_MAX_ENTRIES,
  } = {},
) => {
  const safeRetentionMs = Math.max(0, Number(retentionMs) || 0);
  const safeMaxEntries = Math.max(0, Math.floor(Number(maxEntries) || 0));
  const cutoff = nowTs - safeRetentionMs;
  const filtered = ensureArray(entries)
    .filter((entry) => toAuditTimestamp(entry?.ts) !== null)
    .filter((entry) => Number(toAuditTimestamp(entry?.ts)) >= cutoff)
    .sort(
      (left, right) => Number(toAuditTimestamp(left?.ts)) - Number(toAuditTimestamp(right?.ts)),
    );
  if (safeMaxEntries === 0) {
    return [];
  }
  if (filtered.length <= safeMaxEntries) {
    return filtered;
  }
  return filtered.slice(filtered.length - safeMaxEntries);
};

const toAuditLogRow = (entry, position) => ({
  id: String(entry?.id || crypto.randomUUID()),
  position,
  ts: toDateOrNull(entry?.ts) || new Date(),
  actorId: String(entry?.actorId || "anonymous"),
  actorName: String(entry?.actorName || "anonymous"),
  ip: String(entry?.ip || ""),
  action: String(entry?.action || ""),
  resource: String(entry?.resource || ""),
  resourceId: entry?.resourceId ? String(entry.resourceId) : null,
  status: String(entry?.status || "success"),
  requestId: entry?.requestId ? String(entry.requestId) : null,
  data: cloneValue(entry || {}),
});

const sortByCreatedAtDesc = (items) =>
  ensureArray(items).sort((left, right) => {
    const leftTs = new Date(left?.createdAt || 0).getTime();
    const rightTs = new Date(right?.createdAt || 0).getTime();
    return rightTs - leftTs;
  });

const normalizeWebhookDeliveryRecord = (record) => {
  const id = String(record?.id || "").trim();
  if (!id) {
    return null;
  }
  return {
    id,
    scope: String(record?.scope || "").trim(),
    provider: String(record?.provider || "").trim(),
    channel: record?.channel ? String(record.channel).trim() : null,
    eventKey: record?.eventKey ? String(record.eventKey).trim() : null,
    status: String(record?.status || WEBHOOK_DELIVERY_STATUS.QUEUED)
      .trim()
      .toLowerCase(),
    targetUrl: String(record?.targetUrl || "").trim(),
    targetLabel: String(record?.targetLabel || "").trim(),
    payload:
      record?.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
        ? cloneValue(record.payload)
        : {},
    context:
      record?.context && typeof record.context === "object" && !Array.isArray(record.context)
        ? cloneValue(record.context)
        : {},
    attemptCount: Number.isFinite(Number(record?.attemptCount)) ? Number(record.attemptCount) : 0,
    maxAttempts: Number.isFinite(Number(record?.maxAttempts)) ? Number(record.maxAttempts) : 1,
    nextAttemptAt: record?.nextAttemptAt ? String(record.nextAttemptAt) : null,
    lastAttemptAt: record?.lastAttemptAt ? String(record.lastAttemptAt) : null,
    lastStatusCode: Number.isFinite(Number(record?.lastStatusCode))
      ? Number(record.lastStatusCode)
      : null,
    lastErrorCode: record?.lastErrorCode ? String(record.lastErrorCode) : null,
    lastError: record?.lastError ? String(record.lastError) : null,
    processingOwner: record?.processingOwner ? String(record.processingOwner) : null,
    processingStartedAt: record?.processingStartedAt ? String(record.processingStartedAt) : null,
    sentAt: record?.sentAt ? String(record.sentAt) : null,
    retryOfId: record?.retryOfId ? String(record.retryOfId) : null,
    createdAt: String(record?.createdAt || new Date().toISOString()),
    updatedAt: String(record?.updatedAt || new Date().toISOString()),
  };
};

const normalizeWebhookStateRecord = (value) => {
  const key = String(value?.key || "").trim();
  if (!key) {
    return null;
  }
  return {
    key,
    data:
      value?.data && typeof value.data === "object" && !Array.isArray(value.data)
        ? cloneValue(value.data)
        : {},
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
  };
};

const normalizeUserIdentityRecord = (record) => {
  const normalized = {
    id: String(record?.id || "").trim(),
    userId: String(record?.userId || "").trim(),
    provider: String(record?.provider || "").trim(),
    providerSubject: String(record?.providerSubject || "").trim(),
    emailNormalized: record?.emailNormalized
      ? String(record.emailNormalized).trim().toLowerCase()
      : null,
    emailVerified: typeof record?.emailVerified === "boolean" ? record.emailVerified : null,
    displayName: record?.displayName ? String(record.displayName).trim() : null,
    avatarUrl: record?.avatarUrl ? String(record.avatarUrl).trim() : null,
    linkedAt: record?.linkedAt ? String(record.linkedAt) : new Date().toISOString(),
    lastUsedAt: record?.lastUsedAt ? String(record.lastUsedAt) : null,
    disabledAt: record?.disabledAt ? String(record.disabledAt) : null,
    data: cloneValue(record?.data || {}),
    createdAt: record?.createdAt ? String(record.createdAt) : new Date().toISOString(),
    updatedAt: record?.updatedAt ? String(record.updatedAt) : new Date().toISOString(),
  };
  if (!normalized.id || !normalized.userId || !normalized.provider || !normalized.providerSubject) {
    return null;
  }
  return normalized;
};

const toUserIdentityPersistenceRow = (record) => ({
  id: record.id,
  userId: record.userId,
  provider: record.provider,
  providerSubject: record.providerSubject,
  emailNormalized: record.emailNormalized,
  emailVerified: record.emailVerified,
  displayName: record.displayName,
  avatarUrl: record.avatarUrl,
  linkedAt: toDateOrNull(record.linkedAt) || new Date(),
  lastUsedAt: toDateOrNull(record.lastUsedAt),
  disabledAt: toDateOrNull(record.disabledAt),
  data: cloneValue(record.data),
});

const toUserIdentitySnapshotRecord = (record) => {
  const normalized = normalizeUserIdentityRecord({
    ...record,
    linkedAt: record?.linkedAt ? new Date(record.linkedAt).toISOString() : null,
    lastUsedAt: record?.lastUsedAt ? new Date(record.lastUsedAt).toISOString() : null,
    disabledAt: record?.disabledAt ? new Date(record.disabledAt).toISOString() : null,
    createdAt: record?.createdAt ? new Date(record.createdAt).toISOString() : null,
    updatedAt: record?.updatedAt ? new Date(record.updatedAt).toISOString() : null,
  });
  return normalized;
};

const cloneUserIdentityRecord = (record) => {
  const normalized = normalizeUserIdentityRecord(record);
  return normalized ? cloneValue(normalized) : null;
};

const cloneUserIdentityRecords = (records, predicate = null) =>
  ensureArray(records).reduce((acc, record) => {
    const normalized = cloneUserIdentityRecord(record);
    if (!normalized) {
      return acc;
    }
    if (typeof predicate === "function" && !predicate(normalized)) {
      return acc;
    }
    acc.push(normalized);
    return acc;
  }, []);

const findUserIdentityInCollection = (records, predicate) => {
  const match = ensureArray(records).find(predicate);
  return cloneUserIdentityRecord(match);
};

const toAnalyticsEventRow = (event, position) => ({
  id: String(event?.id || crypto.randomUUID()),
  position: Number.isFinite(Number(position)) ? Math.max(0, Math.floor(Number(position))) : 0,
  ts: toDateOrNull(event?.ts) || new Date(),
  day: toDateOnlyOrNull(event?.day) || toDateOnlyOrNull(event?.ts) || new Date(),
  eventType: String(event?.eventType || "view"),
  resourceType: String(event?.resourceType || "post"),
  resourceId: String(event?.resourceId || ""),
  visitorHash: String(event?.visitorHash || "anonymous"),
  referrerHost: String(event?.referrerHost || "(direct)"),
  isAuthenticated: Boolean(event?.isAuthenticated),
  data: cloneValue(event || {}),
});

const buildDefaultAnalyticsDaily = ({ schemaVersion }) => ({
  schemaVersion,
  generatedAt: new Date().toISOString(),
  days: {},
});

const buildDefaultAnalyticsMeta = (
  { schemaVersion, retentionDays, aggregateRetentionDays },
  override = {},
) => ({
  schemaVersion,
  retentionDays,
  aggregateRetentionDays,
  updatedAt: new Date().toISOString(),
  ...override,
});

export class DbDataRepository {
  constructor(options) {
    this.source = "db";
    this.ownerIdsFallback = ensureArray(options.ownerIdsFallback).map((item) => String(item));
    this.analyticsConfig = {
      schemaVersion: options.analyticsSchemaVersion,
      retentionDays: options.analyticsRetentionDays,
      aggregateRetentionDays: options.analyticsAggRetentionDays,
    };
    this.auditRetentionMs = Math.max(
      0,
      Number(options.auditRetentionMs ?? DEFAULT_AUDIT_RETENTION_MS) || 0,
    );
    this.auditMaxEntries = Math.max(
      0,
      Math.floor(Number(options.auditMaxEntries ?? DEFAULT_AUDIT_MAX_ENTRIES) || 0),
    );
    this.auditLogNextPosition = 0;
    this.analyticsEventNextPosition = 0;
    this.normalizedSchemaAvailable = false;
    this.normalizedReadState = new Map();
    this.epubImportJobStorageAvailable = true;
    this.projectImageImportJobStorageAvailable = true;
    this.projectImageExportJobStorageAvailable = true;
    this.webhookDeliveryStorageAvailable = true;
    this.webhookStateStorageAvailable = true;
    this.onBackgroundError = options.onBackgroundError;
    this.persistQueue = Promise.resolve();
    this.health = {
      queueDepth: 0,
      oldestPendingEnqueuedAt: null,
      lastPersistStartedAt: null,
      lastPersistCompletedAt: null,
      lastPersistErrorAt: null,
      lastPersistErrorLabel: null,
      lastPersistErrorMessage: null,
    };
    this.snapshot = {
      ownerIds: [],
      auditLog: [],
      analyticsEvents: [],
      analyticsDaily: buildDefaultAnalyticsDaily(this.analyticsConfig),
      analyticsMeta: buildDefaultAnalyticsMeta(this.analyticsConfig),
      allowedUsers: [],
      users: [],
      linkTypes: [],
      posts: [],
      postVersions: [],
      projects: [],
      updates: [],
      tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
      comments: [],
      uploads: [],
      pages: {},
      siteSettings: {},
      integrationSettings: {},
      userPreferences: {},
      userIdentityRecords: [],
      userMfaTotpRecords: {},
      userSessionIndexRecords: [],
      securityEvents: [],
      adminExportJobs: [],
      epubImportJobs: [],
      projectImageImportJobs: [],
      projectImageExportJobs: [],
      webhookDeliveries: [],
      webhookStates: {},
      secretRotations: [],
    };
  }

  static async create(options) {
    const repo = new DbDataRepository(options);
    await repo.hydrate();
    return repo;
  }

  getDataSource() {
    return this.source;
  }

  reportError(label, error) {
    this.health.lastPersistErrorAt = new Date().toISOString();
    this.health.lastPersistErrorLabel = String(label || "");
    this.health.lastPersistErrorMessage = String(error?.message || error || "").slice(0, 500);
    const message = `[data-repository:${label}] ${error?.message || error}`;
    console.error(message);
    if (typeof this.onBackgroundError === "function") {
      this.onBackgroundError({ label, error });
    }
  }

  enqueuePersist(label, fn, options = {}) {
    const propagateError = options?.propagateError === true;
    const enqueuedAt = Date.now();
    this.health.queueDepth += 1;
    if (
      !Number.isFinite(Number(this.health.oldestPendingEnqueuedAt)) ||
      Number(this.health.oldestPendingEnqueuedAt) > enqueuedAt
    ) {
      this.health.oldestPendingEnqueuedAt = enqueuedAt;
    }
    let finished = false;
    const markDone = () => {
      if (finished) {
        return;
      }
      finished = true;
      this.health.queueDepth = Math.max(0, Number(this.health.queueDepth || 0) - 1);
      if (this.health.queueDepth === 0) {
        this.health.oldestPendingEnqueuedAt = null;
      }
    };
    const jobPromise = this.persistQueue.then(async () => {
      this.health.lastPersistStartedAt = new Date().toISOString();
      try {
        await fn();
        this.health.lastPersistCompletedAt = new Date().toISOString();
      } catch (error) {
        this.reportError(label, error);
        if (propagateError) {
          throw error;
        }
      } finally {
        markDone();
      }
    });
    this.persistQueue = jobPromise.catch(() => undefined);
    return jobPromise;
  }

  async persistCollectionById({ model, rows, idKey = "id", updateFields = null }) {
    if (!model || typeof model.deleteMany !== "function" || typeof model.upsert !== "function") {
      throw new Error("persist_collection_model_invalid");
    }
    const safeRows = ensureArray(rows);
    const ids = safeRows.map((row) => String(row?.[idKey] || "").trim()).filter(Boolean);
    const tx = [];
    if (ids.length > 0) {
      tx.push(model.deleteMany({ where: { [idKey]: { notIn: ids } } }));
    } else {
      tx.push(model.deleteMany({}));
    }
    safeRows.forEach((row) => {
      const where = { [idKey]: row[idKey] };
      const update =
        Array.isArray(updateFields) && updateFields.length > 0
          ? updateFields.reduce((acc, field) => {
              acc[field] = row[field];
              return acc;
            }, {})
          : { ...row };
      tx.push(
        model.upsert({
          where,
          create: row,
          update,
        }),
      );
    });
    await prisma.$transaction(tx);
  }

  async hydrate() {
    this.normalizedReadState = await loadNormalizedRuntimeStateMap(prisma);
    this.normalizedSchemaAvailable = this.normalizedReadState?.available === true;
    const useNormalizedUsers = isNormalizedDomainReady(this.normalizedReadState, "users");
    const useNormalizedPosts = isNormalizedDomainReady(this.normalizedReadState, "posts");
    const useNormalizedPostVersions = isNormalizedDomainReady(
      this.normalizedReadState,
      "post_versions",
    );
    const useNormalizedProjects = isNormalizedDomainReady(this.normalizedReadState, "projects");
    const useNormalizedUpdates = isNormalizedDomainReady(this.normalizedReadState, "updates");
    const useNormalizedComments = isNormalizedDomainReady(this.normalizedReadState, "comments");
    const useNormalizedUploads = isNormalizedDomainReady(this.normalizedReadState, "uploads");
    const [
      ownerIds,
      auditLogs,
      analyticsEvents,
      analyticsDaily,
      analyticsMeta,
      allowedUsers,
      legacyUsers,
      linkTypes,
      legacyPosts,
      legacyPostVersions,
      legacyProjects,
      legacyUpdates,
      tagTranslations,
      legacyComments,
      legacyUploads,
      pages,
      siteSettings,
      integrationSettings,
      userPreferences,
      userIdentityRecords,
      userMfaTotpRecords,
      userSessionIndexRecords,
      securityEvents,
      adminExportJobs,
      epubImportJobs,
      projectImageImportJobs,
      projectImageExportJobs,
      webhookDeliveries,
      webhookStates,
      secretRotations,
      normalizedUsers,
      normalizedPosts,
      normalizedPostVersions,
      normalizedProjects,
      normalizedUpdates,
      normalizedUploads,
    ] = await Promise.all([
      prisma.ownerIdRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.auditLogRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.analyticsEventRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.analyticsDailyRecord.findUnique({ where: { id: 1 } }),
      prisma.analyticsMetaRecord.findUnique({ where: { id: 1 } }),
      prisma.allowedUserRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.userRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.linkTypeRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.postRecord.findMany({ orderBy: { position: "asc" } }),
      typeof prisma.postVersionRecord?.findMany === "function"
        ? prisma.postVersionRecord.findMany({ orderBy: { position: "asc" } }).catch(() => [])
        : Promise.resolve([]),
      prisma.projectRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.updateRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.tagTranslationsRecord.findUnique({ where: { id: 1 } }),
      prisma.commentRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.uploadRecord.findMany({ orderBy: { position: "asc" } }),
      prisma.pagesRecord.findUnique({ where: { id: 1 } }),
      prisma.siteSettingsRecord.findUnique({ where: { id: 1 } }),
      typeof prisma.integrationSettingsRecord?.findUnique === "function"
        ? prisma.integrationSettingsRecord.findUnique({ where: { id: 1 } }).catch(() => null)
        : Promise.resolve(null),
      prisma.userPreferenceRecord.findMany({}),
      typeof prisma.userIdentityRecord?.findMany === "function"
        ? prisma.userIdentityRecord.findMany({})
        : Promise.resolve([]),
      typeof prisma.userMfaTotpRecord?.findMany === "function"
        ? prisma.userMfaTotpRecord.findMany({})
        : Promise.resolve([]),
      typeof prisma.userSessionIndexRecord?.findMany === "function"
        ? prisma.userSessionIndexRecord.findMany({ orderBy: { lastSeenAt: "desc" } })
        : Promise.resolve([]),
      typeof prisma.securityEventRecord?.findMany === "function"
        ? prisma.securityEventRecord.findMany({ orderBy: { ts: "desc" } })
        : Promise.resolve([]),
      typeof prisma.adminExportJobRecord?.findMany === "function"
        ? prisma.adminExportJobRecord.findMany({ orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
      typeof prisma.epubImportJobRecord?.findMany === "function"
        ? prisma.epubImportJobRecord.findMany({ orderBy: { createdAt: "desc" } }).catch((error) => {
            if (
              isPrismaMissingTableError(error, {
                modelName: "EpubImportJobRecord",
                tableName: "epub_import_jobs",
              })
            ) {
              this.epubImportJobStorageAvailable = false;
              console.warn(
                "[data-repository:epub_import_jobs] table missing; async EPUB import disabled until migrations run.",
              );
              return [];
            }
            throw error;
          })
        : (() => {
            this.epubImportJobStorageAvailable = false;
            return Promise.resolve([]);
          })(),
      typeof prisma.projectImageImportJobRecord?.findMany === "function"
        ? prisma.projectImageImportJobRecord
            .findMany({ orderBy: { createdAt: "desc" } })
            .catch((error) => {
              if (
                isPrismaMissingTableError(error, {
                  modelName: "ProjectImageImportJobRecord",
                  tableName: "project_image_import_jobs",
                })
              ) {
                this.projectImageImportJobStorageAvailable = false;
                console.warn(
                  "[data-repository:project_image_import_jobs] table missing; async image import disabled until migrations run.",
                );
                return [];
              }
              throw error;
            })
        : (() => {
            this.projectImageImportJobStorageAvailable = false;
            return Promise.resolve([]);
          })(),
      typeof prisma.projectImageExportJobRecord?.findMany === "function"
        ? prisma.projectImageExportJobRecord
            .findMany({ orderBy: { createdAt: "desc" } })
            .catch((error) => {
              if (
                isPrismaMissingTableError(error, {
                  modelName: "ProjectImageExportJobRecord",
                  tableName: "project_image_export_jobs",
                })
              ) {
                this.projectImageExportJobStorageAvailable = false;
                console.warn(
                  "[data-repository:project_image_export_jobs] table missing; async image export disabled until migrations run.",
                );
                return [];
              }
              throw error;
            })
        : (() => {
            this.projectImageExportJobStorageAvailable = false;
            return Promise.resolve([]);
          })(),
      typeof prisma.webhookDeliveryRecord?.findMany === "function"
        ? prisma.webhookDeliveryRecord
            .findMany({ orderBy: { createdAt: "desc" } })
            .catch((error) => {
              if (
                isPrismaMissingTableError(error, {
                  modelName: "WebhookDeliveryRecord",
                  tableName: "webhook_deliveries",
                })
              ) {
                this.webhookDeliveryStorageAvailable = false;
                console.warn(
                  "[data-repository:webhook_deliveries] table missing; persistent webhook delivery disabled until migrations run.",
                );
                return [];
              }
              throw error;
            })
        : (() => {
            this.webhookDeliveryStorageAvailable = false;
            return Promise.resolve([]);
          })(),
      typeof prisma.webhookStateRecord?.findMany === "function"
        ? prisma.webhookStateRecord.findMany({}).catch((error) => {
            if (
              isPrismaMissingTableError(error, {
                modelName: "WebhookStateRecord",
                tableName: "webhook_state",
              })
            ) {
              this.webhookStateStorageAvailable = false;
              console.warn(
                "[data-repository:webhook_state] table missing; persistent webhook runtime state disabled until migrations run.",
              );
              return [];
            }
            throw error;
          })
        : (() => {
            this.webhookStateStorageAvailable = false;
            return Promise.resolve([]);
          })(),
      typeof prisma.secretRotationRecord?.findMany === "function"
        ? prisma.secretRotationRecord.findMany({ orderBy: { rotatedAt: "desc" } })
        : Promise.resolve([]),
      useNormalizedUsers
        ? loadUsersFromNormalized(prisma).catch(() => null)
        : Promise.resolve(null),
      useNormalizedPosts
        ? loadPostsFromNormalized(prisma).catch(() => null)
        : Promise.resolve(null),
      useNormalizedPostVersions
        ? loadPostVersionsFromNormalized(prisma).catch(() => null)
        : Promise.resolve(null),
      useNormalizedProjects
        ? loadProjectsFromNormalized(prisma).catch(() => null)
        : Promise.resolve(null),
      useNormalizedUpdates
        ? loadUpdatesFromNormalized(prisma).catch(() => null)
        : Promise.resolve(null),
      useNormalizedUploads
        ? loadUploadsFromNormalized(prisma).catch(() => null)
        : Promise.resolve(null),
    ]);

    const resolvedUsers = Array.isArray(normalizedUsers)
      ? normalizedUsers
      : legacyUsers.map((row) => cloneValue(row.data));
    const resolvedPosts = Array.isArray(normalizedPosts)
      ? normalizedPosts
      : legacyPosts.map((row) => cloneValue(row.data));
    const resolvedPostVersions = Array.isArray(normalizedPostVersions)
      ? normalizedPostVersions
      : legacyPostVersions.map((row) => cloneValue(row.data));
    const resolvedProjects = Array.isArray(normalizedProjects)
      ? normalizedProjects
      : legacyProjects.map((row) => cloneValue(row.data));
    const resolvedUpdates = Array.isArray(normalizedUpdates)
      ? normalizedUpdates
      : legacyUpdates.map((row) => cloneValue(row.data));
    const resolvedUploads = Array.isArray(normalizedUploads)
      ? normalizedUploads
      : legacyUploads.map((row) => cloneValue(row.data));

    const resolvedComments =
      useNormalizedComments && typeof loadCommentsFromNormalized === "function"
        ? await loadCommentsFromNormalized(prisma, {
            posts: resolvedPosts,
            projects: resolvedProjects,
          }).catch(() => legacyComments.map((row) => cloneValue(row.data)))
        : legacyComments.map((row) => cloneValue(row.data));

    this.snapshot.ownerIds = Array.from(
      new Set([...this.ownerIdsFallback, ...ownerIds.map((item) => String(item.userId))]),
    );
    this.snapshot.auditLog = auditLogs.map((row) => cloneValue(row.data));
    this.snapshot.analyticsEvents = analyticsEvents.map((row) => cloneValue(row.data));
    this.snapshot.analyticsDaily = analyticsDaily?.data
      ? cloneValue(analyticsDaily.data)
      : buildDefaultAnalyticsDaily(this.analyticsConfig);
    this.snapshot.analyticsMeta = analyticsMeta?.data
      ? cloneValue(analyticsMeta.data)
      : buildDefaultAnalyticsMeta(this.analyticsConfig);
    this.snapshot.allowedUsers = allowedUsers.map((item) => String(item.userId));
    this.snapshot.users = resolvedUsers;
    this.snapshot.linkTypes = linkTypes.map((row) => cloneValue(row.data));
    this.snapshot.posts = resolvedPosts;
    this.snapshot.postVersions = resolvedPostVersions;
    this.snapshot.projects = resolvedProjects;
    this.snapshot.updates = resolvedUpdates;
    this.snapshot.tagTranslations = tagTranslations?.data
      ? cloneValue(tagTranslations.data)
      : { tags: {}, genres: {}, staffRoles: {} };
    this.snapshot.comments = resolvedComments;
    this.snapshot.uploads = resolvedUploads;
    this.snapshot.pages = pages?.data ? cloneValue(pages.data) : {};
    this.snapshot.siteSettings = siteSettings?.data ? cloneValue(siteSettings.data) : {};
    this.snapshot.integrationSettings = integrationSettings?.data
      ? cloneValue(integrationSettings.data)
      : {};
    this.snapshot.userPreferences = userPreferences.reduce((acc, row) => {
      const userId = String(row?.userId || "").trim();
      if (!userId) {
        return acc;
      }
      acc[userId] = cloneValue(row.data);
      return acc;
    }, {});
    this.snapshot.userIdentityRecords = cloneUserIdentityRecords(
      userIdentityRecords.map((row) => toUserIdentitySnapshotRecord(row)),
    );
    this.snapshot.userMfaTotpRecords = userMfaTotpRecords.reduce((acc, row) => {
      const userId = String(row?.userId || "").trim();
      if (!userId) {
        return acc;
      }
      acc[userId] = {
        userId,
        secretEncrypted: String(row?.secretEncrypted || ""),
        secretKeyId: String(row?.secretKeyId || ""),
        enabledAt: row?.enabledAt ? new Date(row.enabledAt).toISOString() : null,
        disabledAt: row?.disabledAt ? new Date(row.disabledAt).toISOString() : null,
        recoveryCodesHashed: cloneValue(row?.recoveryCodesHashed || []),
        createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      };
      return acc;
    }, {});
    this.snapshot.userSessionIndexRecords = userSessionIndexRecords.map((row) => ({
      sid: String(row?.sid || ""),
      userId: String(row?.userId || ""),
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      lastSeenAt: row?.lastSeenAt ? new Date(row.lastSeenAt).toISOString() : null,
      lastIp: row?.lastIp ? String(row.lastIp) : "",
      userAgent: row?.userAgent ? String(row.userAgent) : "",
      revokedAt: row?.revokedAt ? new Date(row.revokedAt).toISOString() : null,
      revokedBy: row?.revokedBy ? String(row.revokedBy) : null,
      revokeReason: row?.revokeReason ? String(row.revokeReason) : null,
      isPendingMfa: Boolean(row?.isPendingMfa),
    }));
    this.snapshot.securityEvents = securityEvents.map((row) => ({
      id: String(row?.id || ""),
      ts: row?.ts ? new Date(row.ts).toISOString() : new Date().toISOString(),
      type: String(row?.type || ""),
      severity: String(row?.severity || "info"),
      riskScore: Number(row?.riskScore || 0),
      status: String(row?.status || "open"),
      actorUserId: row?.actorUserId ? String(row.actorUserId) : null,
      targetUserId: row?.targetUserId ? String(row.targetUserId) : null,
      ip: row?.ip ? String(row.ip) : "",
      userAgent: row?.userAgent ? String(row.userAgent) : "",
      sessionId: row?.sessionId ? String(row.sessionId) : null,
      requestId: row?.requestId ? String(row.requestId) : null,
      data: cloneValue(row?.data || {}),
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
    this.snapshot.adminExportJobs = adminExportJobs.map((row) => ({
      id: String(row?.id || ""),
      dataset: String(row?.dataset || ""),
      format: String(row?.format || "csv"),
      status: String(row?.status || "queued"),
      requestedBy: String(row?.requestedBy || ""),
      filters: cloneValue(row?.filters || {}),
      filePath: row?.filePath ? String(row.filePath) : null,
      rowCount: Number.isFinite(Number(row?.rowCount)) ? Number(row.rowCount) : null,
      error: row?.error ? String(row.error) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      startedAt: row?.startedAt ? new Date(row.startedAt).toISOString() : null,
      finishedAt: row?.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      expiresAt: row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
    this.snapshot.epubImportJobs = epubImportJobs.map((row) => ({
      id: String(row?.id || ""),
      projectId: String(row?.projectId || ""),
      requestedBy: String(row?.requestedBy || ""),
      status: String(row?.status || "queued"),
      summary: cloneValue(row?.summary || {}),
      resultPath: row?.resultPath ? String(row.resultPath) : null,
      error: row?.error ? String(row.error) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      startedAt: row?.startedAt ? new Date(row.startedAt).toISOString() : null,
      finishedAt: row?.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      expiresAt: row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
    this.snapshot.projectImageImportJobs = projectImageImportJobs.map((row) => ({
      id: String(row?.id || ""),
      projectId: String(row?.projectId || ""),
      requestedBy: String(row?.requestedBy || ""),
      status: String(row?.status || "queued"),
      summary: cloneValue(row?.summary || {}),
      resultPath: row?.resultPath ? String(row.resultPath) : null,
      error: row?.error ? String(row.error) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      startedAt: row?.startedAt ? new Date(row.startedAt).toISOString() : null,
      finishedAt: row?.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      expiresAt: row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
    this.snapshot.projectImageExportJobs = projectImageExportJobs.map((row) => ({
      id: String(row?.id || ""),
      projectId: String(row?.projectId || ""),
      requestedBy: String(row?.requestedBy || ""),
      status: String(row?.status || "queued"),
      summary: cloneValue(row?.summary || {}),
      resultPath: row?.resultPath ? String(row.resultPath) : null,
      error: row?.error ? String(row.error) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      startedAt: row?.startedAt ? new Date(row.startedAt).toISOString() : null,
      finishedAt: row?.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      expiresAt: row?.expiresAt ? new Date(row.expiresAt).toISOString() : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
    this.snapshot.webhookDeliveries = webhookDeliveries.map((row) => ({
      id: String(row?.id || ""),
      scope: String(row?.scope || ""),
      provider: String(row?.provider || ""),
      channel: row?.channel ? String(row.channel) : null,
      eventKey: row?.eventKey ? String(row.eventKey) : null,
      status: String(row?.status || "queued"),
      targetUrl: String(row?.targetUrl || ""),
      targetLabel: String(row?.targetLabel || ""),
      payload: cloneValue(row?.payload || {}),
      context: cloneValue(row?.context || {}),
      attemptCount: Number.isFinite(Number(row?.attemptCount)) ? Number(row.attemptCount) : 0,
      maxAttempts: Number.isFinite(Number(row?.maxAttempts)) ? Number(row.maxAttempts) : 1,
      nextAttemptAt: row?.nextAttemptAt ? new Date(row.nextAttemptAt).toISOString() : null,
      lastAttemptAt: row?.lastAttemptAt ? new Date(row.lastAttemptAt).toISOString() : null,
      lastStatusCode: Number.isFinite(Number(row?.lastStatusCode))
        ? Number(row.lastStatusCode)
        : null,
      lastErrorCode: row?.lastErrorCode ? String(row.lastErrorCode) : null,
      lastError: row?.lastError ? String(row.lastError) : null,
      processingOwner: row?.processingOwner ? String(row.processingOwner) : null,
      processingStartedAt: row?.processingStartedAt
        ? new Date(row.processingStartedAt).toISOString()
        : null,
      sentAt: row?.sentAt ? new Date(row.sentAt).toISOString() : null,
      retryOfId: row?.retryOfId ? String(row.retryOfId) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));
    this.snapshot.webhookStates = webhookStates.reduce((acc, row) => {
      const key = String(row?.key || "").trim();
      if (!key) {
        return acc;
      }
      acc[key] = {
        key,
        data: cloneValue(row?.data || {}),
        updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
      };
      return acc;
    }, {});
    this.snapshot.secretRotations = secretRotations.map((row) => ({
      id: String(row?.id || ""),
      secretFamily: String(row?.secretFamily || ""),
      keyId: String(row?.keyId || ""),
      rotatedAt: row?.rotatedAt ? new Date(row.rotatedAt).toISOString() : new Date().toISOString(),
      rotatedBy: String(row?.rotatedBy || "system"),
      notes: row?.notes ? String(row.notes) : "",
      status: String(row?.status || "completed"),
      createdAt: row?.createdAt ? new Date(row.createdAt).toISOString() : null,
    }));
    this.auditLogNextPosition = auditLogs.reduce((max, row) => {
      const nextPosition = Number(row?.position);
      if (!Number.isFinite(nextPosition)) {
        return max;
      }
      return Math.max(max, Math.floor(nextPosition) + 1);
    }, 0);
    this.analyticsEventNextPosition = analyticsEvents.reduce((max, row) => {
      const nextPosition = Number(row?.position);
      if (!Number.isFinite(nextPosition)) {
        return max;
      }
      return Math.max(max, Math.floor(nextPosition) + 1);
    }, 0);
  }

  loadOwnerIds() {
    return cloneValue(this.snapshot.ownerIds);
  }

  writeOwnerIds(ids) {
    const unique = Array.from(
      new Set(
        ensureArray(ids)
          .map((id) => String(id).trim())
          .filter(Boolean),
      ),
    );
    this.snapshot.ownerIds = unique;
    this.enqueuePersist("owner_ids", async () => {
      const candidateIds = this.snapshot.ownerIds;
      // Filter to IDs that exist in the users table to satisfy the FK constraint.
      // Owner IDs from env that haven't logged in yet won't have user records.
      const existingUsers = await prisma.userRecord.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true },
      });
      const existingIdSet = new Set(existingUsers.map((u) => u.id));
      const rows = candidateIds
        .filter((userId) => existingIdSet.has(userId))
        .map((userId, index) => ({ userId, position: index }));
      await prisma.$transaction([
        prisma.ownerIdRecord.deleteMany({}),
        ...(rows.length ? [prisma.ownerIdRecord.createMany({ data: rows })] : []),
      ]);
    });
  }

  loadAuditLog() {
    return cloneValue(this.snapshot.auditLog);
  }

  writeAuditLog(entries) {
    this.snapshot.auditLog = cloneValue(ensureArray(entries));
    this.auditLogNextPosition = this.snapshot.auditLog.length;
    this.enqueuePersist("audit_logs", async () => {
      const rows = this.snapshot.auditLog.map((entry, index) => toAuditLogRow(entry, index));
      await prisma.$transaction([
        prisma.auditLogRecord.deleteMany({}),
        ...(rows.length ? [prisma.auditLogRecord.createMany({ data: rows })] : []),
      ]);
    });
  }

  appendAuditLogEntry(entry) {
    const baseEntry =
      entry && typeof entry === "object" && !Array.isArray(entry) ? cloneValue(entry) : {};
    const normalizedEntry = {
      ...baseEntry,
      id: String(baseEntry?.id || crypto.randomUUID()),
      ts: (toDateOrNull(baseEntry?.ts) || new Date()).toISOString(),
      actorId: String(baseEntry?.actorId || "anonymous"),
      actorName: String(baseEntry?.actorName || "anonymous"),
      ip: String(baseEntry?.ip || ""),
      action: String(baseEntry?.action || ""),
      resource: String(baseEntry?.resource || ""),
      resourceId: baseEntry?.resourceId ? String(baseEntry.resourceId) : null,
      status: String(baseEntry?.status || "success"),
      requestId: baseEntry?.requestId ? String(baseEntry.requestId) : null,
    };
    const previousEntries = ensureArray(this.snapshot.auditLog);
    const nextEntries = compactAuditLogEntries([...previousEntries, normalizedEntry], {
      retentionMs: this.auditRetentionMs,
      maxEntries: this.auditMaxEntries,
    });
    const nextIds = new Set(
      nextEntries.map((item) => String(item?.id || "").trim()).filter(Boolean),
    );
    const removedIds = previousEntries
      .map((item) => String(item?.id || "").trim())
      .filter((id) => id && !nextIds.has(id));
    const shouldPersistEntry = nextIds.has(normalizedEntry.id);
    const position = this.auditLogNextPosition;
    this.snapshot.auditLog = nextEntries;
    if (shouldPersistEntry) {
      this.auditLogNextPosition += 1;
    }
    if (!shouldPersistEntry && removedIds.length === 0) {
      return;
    }
    this.enqueuePersist("audit_log_append", async () => {
      const operations = [];
      if (shouldPersistEntry) {
        operations.push(
          prisma.auditLogRecord.create({
            data: toAuditLogRow(normalizedEntry, position),
          }),
        );
      }
      if (removedIds.length > 0) {
        operations.push(
          prisma.auditLogRecord.deleteMany({
            where: {
              id: {
                in: removedIds,
              },
            },
          }),
        );
      }
      if (operations.length === 0) {
        return;
      }
      await prisma.$transaction(operations);
    });
  }

  loadAnalyticsEvents() {
    return cloneValue(this.snapshot.analyticsEvents);
  }

  writeAnalyticsEvents(events) {
    this.snapshot.analyticsEvents = cloneValue(ensureArray(events));
    this.analyticsEventNextPosition = this.snapshot.analyticsEvents.length;
    this.enqueuePersist("analytics_events", async () => {
      const rows = this.snapshot.analyticsEvents.map((event, index) =>
        toAnalyticsEventRow(event, index),
      );
      await prisma.$transaction([
        prisma.analyticsEventRecord.deleteMany({}),
        ...(rows.length ? [prisma.analyticsEventRecord.createMany({ data: rows })] : []),
      ]);
    });
  }

  appendAnalyticsEventEntry(event) {
    const baseEvent =
      event && typeof event === "object" && !Array.isArray(event) ? cloneValue(event) : {};
    const normalizedEvent = {
      ...baseEvent,
      id: String(baseEvent?.id || crypto.randomUUID()),
      ts: (toDateOrNull(baseEvent?.ts) || new Date()).toISOString(),
      day: String(baseEvent?.day || ""),
      eventType: String(baseEvent?.eventType || "view"),
      resourceType: String(baseEvent?.resourceType || "post"),
      resourceId: String(baseEvent?.resourceId || ""),
      visitorHash: String(baseEvent?.visitorHash || "anonymous"),
      referrerHost: String(baseEvent?.referrerHost || "(direct)"),
      isAuthenticated: Boolean(baseEvent?.isAuthenticated),
    };
    const position = this.analyticsEventNextPosition;
    this.snapshot.analyticsEvents = [
      ...ensureArray(this.snapshot.analyticsEvents),
      normalizedEvent,
    ];
    this.analyticsEventNextPosition += 1;
    this.enqueuePersist("analytics_event_append", async () => {
      await prisma.analyticsEventRecord.create({
        data: toAnalyticsEventRow(normalizedEvent, position),
      });
    });
  }

  loadAnalyticsDaily() {
    return cloneValue(this.snapshot.analyticsDaily);
  }

  writeAnalyticsDaily(data) {
    const payload = {
      schemaVersion: this.analyticsConfig.schemaVersion,
      generatedAt: String(data?.generatedAt || new Date().toISOString()),
      days: data?.days && typeof data.days === "object" ? data.days : {},
    };
    this.snapshot.analyticsDaily = payload;
    this.enqueuePersist("analytics_daily", async () => {
      await prisma.analyticsDailyRecord.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          schemaVersion: Number(payload.schemaVersion) || this.analyticsConfig.schemaVersion,
          generatedAt: toDateOrNull(payload.generatedAt) || new Date(),
          data: cloneValue(payload),
        },
        update: {
          schemaVersion: Number(payload.schemaVersion) || this.analyticsConfig.schemaVersion,
          generatedAt: toDateOrNull(payload.generatedAt) || new Date(),
          data: cloneValue(payload),
        },
      });
    });
  }

  loadAnalyticsMeta() {
    return cloneValue(this.snapshot.analyticsMeta);
  }

  writeAnalyticsMeta(value) {
    const payload = buildDefaultAnalyticsMeta(this.analyticsConfig, value);
    this.snapshot.analyticsMeta = payload;
    this.enqueuePersist("analytics_meta", async () => {
      await prisma.analyticsMetaRecord.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          schemaVersion: Number(payload.schemaVersion) || this.analyticsConfig.schemaVersion,
          retentionDays: Number(payload.retentionDays) || this.analyticsConfig.retentionDays,
          aggregateRetentionDays:
            Number(payload.aggregateRetentionDays) || this.analyticsConfig.aggregateRetentionDays,
          updatedAt: toDateOrNull(payload.updatedAt) || new Date(),
          data: cloneValue(payload),
        },
        update: {
          schemaVersion: Number(payload.schemaVersion) || this.analyticsConfig.schemaVersion,
          retentionDays: Number(payload.retentionDays) || this.analyticsConfig.retentionDays,
          aggregateRetentionDays:
            Number(payload.aggregateRetentionDays) || this.analyticsConfig.aggregateRetentionDays,
          updatedAt: toDateOrNull(payload.updatedAt) || new Date(),
          data: cloneValue(payload),
        },
      });
    });
  }

  loadAllowedUsers() {
    return cloneValue(this.snapshot.allowedUsers);
  }

  writeAllowedUsers(ids) {
    this.snapshot.allowedUsers = ensureArray(ids).map((id) => String(id));
    this.enqueuePersist("allowed_users", async () => {
      const candidateIds = this.snapshot.allowedUsers;
      // Filter to IDs that exist in the users table to satisfy the FK constraint.
      // Owner IDs from env that haven't logged in yet won't have user records.
      const existingUsers = await prisma.userRecord.findMany({
        where: { id: { in: candidateIds } },
        select: { id: true },
      });
      const existingIdSet = new Set(existingUsers.map((u) => u.id));
      const rows = candidateIds
        .filter((userId) => existingIdSet.has(userId))
        .map((userId, index) => ({ userId, position: index }));
      await prisma.$transaction([
        prisma.allowedUserRecord.deleteMany({}),
        ...(rows.length ? [prisma.allowedUserRecord.createMany({ data: rows })] : []),
      ]);
    });
  }

  loadUsers() {
    return cloneValue(this.snapshot.users);
  }

  writeUsers(users) {
    const previousUsers = cloneValue(this.snapshot.users);
    const nextUsers = cloneValue(ensureArray(users));
    this.snapshot.users = nextUsers;
    this.enqueuePersist("users", async () => {
      if (this.normalizedSchemaAvailable) {
        await syncUsersToNormalized(prisma, previousUsers, nextUsers);
      }
      const rows = nextUsers.map((user, index) => ({
        id: String(user?.id || crypto.randomUUID()),
        position: index,
        accessRole: user?.accessRole ? String(user.accessRole) : null,
        status: user?.status ? String(user.status) : null,
        data: cloneValue(user || {}),
      }));
      await this.persistCollectionById({
        model: prisma.userRecord,
        rows,
        idKey: "id",
        updateFields: ["position", "accessRole", "status", "data"],
      });
    });
  }

  loadLinkTypes() {
    return cloneValue(this.snapshot.linkTypes);
  }

  writeLinkTypes(items) {
    this.snapshot.linkTypes = cloneValue(ensureArray(items));
    this.enqueuePersist("link_types", async () => {
      const rows = this.snapshot.linkTypes.map((item, index) => ({
        id: String(item?.id || `link-${index}`),
        position: index,
        label: String(item?.label || ""),
        icon: String(item?.icon || ""),
        data: cloneValue(item || {}),
      }));
      await this.persistCollectionById({
        model: prisma.linkTypeRecord,
        rows,
        idKey: "id",
        updateFields: ["position", "label", "icon", "data"],
      });
    });
  }

  loadPosts() {
    return cloneValue(this.snapshot.posts);
  }

  writePosts(posts) {
    const previousPosts = cloneValue(this.snapshot.posts);
    const nextPosts = cloneValue(ensureArray(posts));
    this.snapshot.posts = nextPosts;
    this.enqueuePersist("posts", async () => {
      if (this.normalizedSchemaAvailable) {
        await syncPostsToNormalized(prisma, previousPosts, nextPosts);
      }
      const rows = nextPosts.map((post, index) => ({
        id: String(post?.id || crypto.randomUUID()),
        position: index,
        slug: String(post?.slug || post?.id || crypto.randomUUID()),
        projectId: String(post?.projectId || ""),
        status: String(post?.status || "draft"),
        publishedAt: toDateOrNull(post?.publishedAt),
        deletedAt: toDateOrNull(post?.deletedAt),
        data: cloneValue(post || {}),
      }));
      await this.persistCollectionById({
        model: prisma.postRecord,
        rows,
        idKey: "id",
        updateFields: [
          "position",
          "slug",
          "projectId",
          "status",
          "publishedAt",
          "deletedAt",
          "data",
        ],
      });
    });
  }

  loadPostVersions() {
    return cloneValue(this.snapshot.postVersions);
  }

  writePostVersions(entries) {
    const previousEntries = cloneValue(this.snapshot.postVersions);
    const nextEntries = cloneValue(ensureArray(entries));
    this.snapshot.postVersions = nextEntries;
    this.enqueuePersist("post_versions", async () => {
      if (this.normalizedSchemaAvailable) {
        await syncPostVersionsToNormalized(prisma, previousEntries, nextEntries);
      }
      const rows = nextEntries.map((entry, index) => ({
        id: String(entry?.id || crypto.randomUUID()),
        postId: String(entry?.postId || ""),
        position: index,
        versionNumber: Number.isFinite(Number(entry?.versionNumber))
          ? Number(entry.versionNumber)
          : index + 1,
        reason: String(entry?.reason || "update"),
        label: typeof entry?.label === "string" && entry.label.trim() ? String(entry.label) : null,
        actorId:
          typeof entry?.actorId === "string" && entry.actorId.trim() ? String(entry.actorId) : null,
        actorName:
          typeof entry?.actorName === "string" && entry.actorName.trim()
            ? String(entry.actorName)
            : null,
        slug: String(entry?.slug || entry?.data?.slug || ""),
        createdAt: toDateOrNull(entry?.createdAt) || new Date(),
        data: cloneValue(entry || {}),
      }));
      await prisma.$transaction([
        prisma.postVersionRecord.deleteMany({}),
        ...(rows.length ? [prisma.postVersionRecord.createMany({ data: rows })] : []),
      ]);
    });
  }

  loadProjects() {
    return cloneValue(this.snapshot.projects);
  }

  writeProjects(projects) {
    const previousProjects = cloneValue(this.snapshot.projects);
    const nextProjects = cloneValue(ensureArray(projects));
    this.snapshot.projects = nextProjects;
    this.enqueuePersist("projects", async () => {
      if (this.normalizedSchemaAvailable) {
        await syncProjectsToNormalized(prisma, previousProjects, nextProjects);
      }
      const rows = nextProjects.map((project, index) => ({
        id: String(project?.id || crypto.randomUUID()),
        position: index,
        deletedAt: toDateOrNull(project?.deletedAt),
        data: cloneValue(project || {}),
      }));
      await this.persistCollectionById({
        model: prisma.projectRecord,
        rows,
        idKey: "id",
        updateFields: ["position", "deletedAt", "data"],
      });
    });
  }

  loadUpdates() {
    return cloneValue(this.snapshot.updates);
  }

  writeUpdates(updates) {
    const previousUpdates = cloneValue(this.snapshot.updates);
    const nextUpdates = cloneValue(ensureArray(updates));
    const references = {
      projects: cloneValue(this.snapshot.projects),
    };
    this.snapshot.updates = nextUpdates;
    this.enqueuePersist("updates", async () => {
      if (this.normalizedSchemaAvailable) {
        const normalizedResult = await syncUpdatesToNormalized(
          prisma,
          previousUpdates,
          nextUpdates,
          references,
        );
        if (
          Array.isArray(normalizedResult?.quarantined) &&
          normalizedResult.quarantined.length > 0
        ) {
          this.reportError(
            "updates_v2_quarantine",
            new Error(`quarantined=${normalizedResult.quarantined.length}`),
          );
        }
      }
      const rows = nextUpdates.map((update, index) => ({
        id: String(update?.id || crypto.randomUUID()),
        position: index,
        projectId: String(update?.projectId || ""),
        updatedAt: toDateOrNull(update?.updatedAt),
        data: cloneValue(update || {}),
      }));
      await this.persistCollectionById({
        model: prisma.updateRecord,
        rows,
        idKey: "id",
        updateFields: ["position", "projectId", "updatedAt", "data"],
      });
    });
  }

  loadTagTranslations() {
    return cloneValue(this.snapshot.tagTranslations);
  }

  writeTagTranslations(payload) {
    this.snapshot.tagTranslations =
      payload && typeof payload === "object"
        ? cloneValue(payload)
        : { tags: {}, genres: {}, staffRoles: {} };
    this.enqueuePersist("tag_translations", async () => {
      await prisma.tagTranslationsRecord.upsert({
        where: { id: 1 },
        create: { id: 1, data: cloneValue(this.snapshot.tagTranslations) },
        update: { data: cloneValue(this.snapshot.tagTranslations) },
      });
    });
  }

  loadComments() {
    return cloneValue(this.snapshot.comments);
  }

  writeComments(comments) {
    const previousComments = cloneValue(this.snapshot.comments);
    const nextComments = cloneValue(ensureArray(comments));
    const references = {
      posts: cloneValue(this.snapshot.posts),
      projects: cloneValue(this.snapshot.projects),
    };
    this.snapshot.comments = nextComments;
    this.enqueuePersist("comments", async () => {
      if (this.normalizedSchemaAvailable) {
        const normalizedResult = await syncCommentsToNormalized(
          prisma,
          previousComments,
          nextComments,
          references,
        );
        if (
          Array.isArray(normalizedResult?.quarantined) &&
          normalizedResult.quarantined.length > 0
        ) {
          this.reportError(
            "comments_v2_quarantine",
            new Error(`quarantined=${normalizedResult.quarantined.length}`),
          );
        }
      }
      const rows = nextComments.map((comment, index) => ({
        id: String(comment?.id || crypto.randomUUID()),
        position: index,
        targetType: String(comment?.targetType || ""),
        targetId: String(comment?.targetId || ""),
        status: String(comment?.status || "pending"),
        createdAt: toDateOrNull(comment?.createdAt),
        data: cloneValue(comment || {}),
      }));
      await this.persistCollectionById({
        model: prisma.commentRecord,
        rows,
        idKey: "id",
        updateFields: ["position", "targetType", "targetId", "status", "createdAt", "data"],
      });
    });
  }

  loadUploads() {
    return cloneValue(this.snapshot.uploads);
  }

  writeUploads(uploads, options = {}) {
    const previousUploads = cloneValue(this.snapshot.uploads);
    const nextUploads = cloneValue(ensureArray(uploads));
    this.snapshot.uploads = nextUploads;
    const persistPromise = this.enqueuePersist(
      "uploads",
      async () => {
        if (this.normalizedSchemaAvailable) {
          await syncUploadsToNormalized(prisma, previousUploads, nextUploads);
        }
        const rows = nextUploads.map((upload, index) => ({
          id: String(upload?.id || crypto.randomUUID()),
          position: index,
          url: String(upload?.url || ""),
          folder: String(upload?.folder || ""),
          createdAt: toDateOrNull(upload?.createdAt),
          data: cloneValue(upload || {}),
        }));
        await this.persistCollectionById({
          model: prisma.uploadRecord,
          rows,
          idKey: "id",
          updateFields: ["position", "url", "folder", "createdAt", "data"],
        });
      },
      { propagateError: options?.awaitPersist === true },
    );
    if (options?.awaitPersist === true) {
      return persistPromise;
    }
    return undefined;
  }

  loadPages() {
    return cloneValue(this.snapshot.pages);
  }

  writePages(pages) {
    this.snapshot.pages = pages && typeof pages === "object" ? cloneValue(pages) : {};
    this.enqueuePersist("pages", async () => {
      await prisma.pagesRecord.upsert({
        where: { id: 1 },
        create: { id: 1, data: cloneValue(this.snapshot.pages) },
        update: { data: cloneValue(this.snapshot.pages) },
      });
    });
  }

  loadSiteSettings() {
    return cloneValue(this.snapshot.siteSettings);
  }

  writeSiteSettings(settings) {
    this.snapshot.siteSettings =
      settings && typeof settings === "object" ? cloneValue(settings) : {};
    this.enqueuePersist("site_settings", async () => {
      await prisma.siteSettingsRecord.upsert({
        where: { id: 1 },
        create: { id: 1, data: cloneValue(this.snapshot.siteSettings) },
        update: { data: cloneValue(this.snapshot.siteSettings) },
      });
    });
  }

  loadIntegrationSettings() {
    return cloneValue(this.snapshot.integrationSettings);
  }

  writeIntegrationSettings(settings) {
    this.snapshot.integrationSettings =
      settings && typeof settings === "object" ? cloneValue(settings) : {};
    this.enqueuePersist("integration_settings", async () => {
      if (typeof prisma.integrationSettingsRecord?.upsert !== "function") {
        return;
      }
      await prisma.integrationSettingsRecord.upsert({
        where: { id: 1 },
        create: { id: 1, data: cloneValue(this.snapshot.integrationSettings) },
        update: { data: cloneValue(this.snapshot.integrationSettings) },
      });
    });
  }

  loadUserPreferences(userId) {
    const key = String(userId || "").trim();
    if (!key) {
      return {};
    }
    const stored = this.snapshot.userPreferences?.[key];
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }
    return cloneValue(stored);
  }

  writeUserPreferences(userId, preferences) {
    const key = String(userId || "").trim();
    if (!key) {
      return;
    }
    const nextPreferences =
      preferences && typeof preferences === "object" && !Array.isArray(preferences)
        ? cloneValue(preferences)
        : {};
    this.snapshot.userPreferences = this.snapshot.userPreferences || {};
    this.snapshot.userPreferences[key] = nextPreferences;
    this.enqueuePersist("user_preferences", async () => {
      await prisma.userPreferenceRecord.upsert({
        where: { userId: key },
        create: { userId: key, data: cloneValue(nextPreferences) },
        update: { data: cloneValue(nextPreferences) },
      });
    });
  }

  loadUserIdentityRecords({ userId = null, provider = null, includeDisabled = false } = {}) {
    const normalizedUserId = String(userId || "").trim();
    const normalizedProvider = String(provider || "").trim();
    return cloneUserIdentityRecords(this.snapshot.userIdentityRecords || [], (record) => {
      if (normalizedUserId && String(record.userId || "") !== normalizedUserId) {
        return false;
      }
      if (normalizedProvider && String(record.provider || "") !== normalizedProvider) {
        return false;
      }
      if (!includeDisabled && record.disabledAt) {
        return false;
      }
      return true;
    });
  }

  findUserIdentityRecord(provider, providerSubject) {
    const normalizedProvider = String(provider || "").trim();
    const normalizedSubject = String(providerSubject || "").trim();
    if (!normalizedProvider || !normalizedSubject) {
      return null;
    }
    return findUserIdentityInCollection(
      this.snapshot.userIdentityRecords || [],
      (record) =>
        String(record.provider || "") === normalizedProvider &&
        String(record.providerSubject || "") === normalizedSubject,
    );
  }

  findUserIdentityRecordByEmail(provider, emailNormalized) {
    const normalizedProvider = String(provider || "").trim();
    const normalizedEmail = String(emailNormalized || "")
      .trim()
      .toLowerCase();
    if (!normalizedProvider || !normalizedEmail) {
      return null;
    }
    return findUserIdentityInCollection(
      this.snapshot.userIdentityRecords || [],
      (record) =>
        !record.disabledAt &&
        String(record.provider || "") === normalizedProvider &&
        String(record.emailNormalized || "") === normalizedEmail,
    );
  }

  findUserIdentityRecordsByEmail(emailNormalized, { includeDisabled = false } = {}) {
    const normalizedEmail = String(emailNormalized || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail) {
      return [];
    }
    return cloneUserIdentityRecords(this.snapshot.userIdentityRecords || [], (record) => {
      if (!includeDisabled && record.disabledAt) {
        return false;
      }
      return String(record.emailNormalized || "") === normalizedEmail;
    });
  }

  upsertUserIdentityRecord(record) {
    const normalized = normalizeUserIdentityRecord(record);
    if (!normalized) {
      return null;
    }
    const list = Array.isArray(this.snapshot.userIdentityRecords)
      ? [...this.snapshot.userIdentityRecords]
      : [];
    const index = list.findIndex((entry) => String(entry.id || "") === normalized.id);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.userIdentityRecords = list;
    const persistPromise = this.enqueuePersist("user_identities", async () => {
      const persistenceRow = toUserIdentityPersistenceRow(normalized);
      await prisma.userIdentityRecord.upsert({
        where: { id: normalized.id },
        create: {
          ...persistenceRow,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
        },
        update: persistenceRow,
      });
    });
    return persistPromise;
  }

  async flushPersistQueue() {
    await this.persistQueue;
  }

  writeUserIdentityRecords(records) {
    const nextRecords = cloneUserIdentityRecords(records || [], () => true);
    this.snapshot.userIdentityRecords = nextRecords;
    this.enqueuePersist("user_identities_replace", async () => {
      if (typeof prisma.userIdentityRecord?.deleteMany === "function") {
        await prisma.userIdentityRecord.deleteMany({});
      }
      if (!nextRecords.length) {
        return;
      }
      if (typeof prisma.userIdentityRecord?.createMany === "function") {
        await prisma.userIdentityRecord.createMany({
          data: nextRecords.map((record) => ({
            ...toUserIdentityPersistenceRow(record),
            createdAt: toDateOrNull(record.createdAt) || new Date(),
            updatedAt: toDateOrNull(record.updatedAt) || new Date(),
          })),
        });
        return;
      }
      await Promise.all(
        nextRecords.map((record) =>
          prisma.userIdentityRecord.upsert({
            where: { id: record.id },
            create: {
              ...toUserIdentityPersistenceRow(record),
              createdAt: toDateOrNull(record.createdAt) || new Date(),
            },
            update: toUserIdentityPersistenceRow(record),
          }),
        ),
      );
    });
    return cloneUserIdentityRecords(nextRecords, () => true);
  }

  loadUserMfaTotpRecord(userId) {
    const key = String(userId || "").trim();
    if (!key) {
      return null;
    }
    const row = this.snapshot.userMfaTotpRecords?.[key];
    return row ? cloneValue(row) : null;
  }

  writeUserMfaTotpRecord(userId, record) {
    const key = String(userId || "").trim();
    if (!key) {
      return;
    }
    const row = {
      userId: key,
      secretEncrypted: String(record?.secretEncrypted || ""),
      secretKeyId: String(record?.secretKeyId || ""),
      enabledAt: record?.enabledAt ? String(record.enabledAt) : new Date().toISOString(),
      disabledAt: record?.disabledAt ? String(record.disabledAt) : null,
      recoveryCodesHashed: cloneValue(
        Array.isArray(record?.recoveryCodesHashed) ? record.recoveryCodesHashed : [],
      ),
    };
    this.snapshot.userMfaTotpRecords = this.snapshot.userMfaTotpRecords || {};
    this.snapshot.userMfaTotpRecords[key] = row;
    this.enqueuePersist("user_mfa_totp", async () => {
      await prisma.userMfaTotpRecord.upsert({
        where: { userId: key },
        create: {
          userId: key,
          secretEncrypted: row.secretEncrypted,
          secretKeyId: row.secretKeyId,
          enabledAt: toDateOrNull(row.enabledAt) || new Date(),
          disabledAt: toDateOrNull(row.disabledAt),
          recoveryCodesHashed: cloneValue(row.recoveryCodesHashed),
        },
        update: {
          secretEncrypted: row.secretEncrypted,
          secretKeyId: row.secretKeyId,
          enabledAt: toDateOrNull(row.enabledAt),
          disabledAt: toDateOrNull(row.disabledAt),
          recoveryCodesHashed: cloneValue(row.recoveryCodesHashed),
        },
      });
    });
  }

  deleteUserMfaTotpRecord(userId) {
    const key = String(userId || "").trim();
    if (!key) {
      return;
    }
    if (this.snapshot.userMfaTotpRecords) {
      delete this.snapshot.userMfaTotpRecords[key];
    }
    this.enqueuePersist("user_mfa_totp_delete", async () => {
      await prisma.userMfaTotpRecord.deleteMany({ where: { userId: key } });
    });
  }

  loadUserSessionIndexRecords({ userId = null, includeRevoked = true } = {}) {
    const normalizedUserId = String(userId || "").trim();
    return cloneValue(this.snapshot.userSessionIndexRecords || []).filter((record) => {
      if (normalizedUserId && String(record.userId) !== normalizedUserId) {
        return false;
      }
      if (!includeRevoked && record.revokedAt) {
        return false;
      }
      return true;
    });
  }

  upsertUserSessionIndexRecord(record) {
    const sid = String(record?.sid || "").trim();
    const userId = String(record?.userId || "").trim();
    if (!sid || !userId) {
      return;
    }
    const normalized = {
      sid,
      userId,
      createdAt: String(record?.createdAt || new Date().toISOString()),
      lastSeenAt: String(record?.lastSeenAt || new Date().toISOString()),
      lastIp: String(record?.lastIp || ""),
      userAgent: String(record?.userAgent || ""),
      revokedAt: record?.revokedAt ? String(record.revokedAt) : null,
      revokedBy: record?.revokedBy ? String(record.revokedBy) : null,
      revokeReason: record?.revokeReason ? String(record.revokeReason) : null,
      isPendingMfa: Boolean(record?.isPendingMfa),
    };
    const list = ensureArray(this.snapshot.userSessionIndexRecords);
    const index = list.findIndex((item) => String(item?.sid || "") === sid);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.userSessionIndexRecords = list;
    this.enqueuePersist("user_session_index", async () => {
      await prisma.userSessionIndexRecord.upsert({
        where: { sid },
        create: {
          sid,
          userId: normalized.userId,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
          lastSeenAt: toDateOrNull(normalized.lastSeenAt) || new Date(),
          lastIp: normalized.lastIp || null,
          userAgent: normalized.userAgent || null,
          revokedAt: toDateOrNull(normalized.revokedAt),
          revokedBy: normalized.revokedBy,
          revokeReason: normalized.revokeReason,
          isPendingMfa: normalized.isPendingMfa,
        },
        update: {
          userId: normalized.userId,
          lastSeenAt: toDateOrNull(normalized.lastSeenAt) || new Date(),
          lastIp: normalized.lastIp || null,
          userAgent: normalized.userAgent || null,
          revokedAt: toDateOrNull(normalized.revokedAt),
          revokedBy: normalized.revokedBy,
          revokeReason: normalized.revokeReason,
          isPendingMfa: normalized.isPendingMfa,
        },
      });
    });
  }

  revokeUserSessionIndexRecord(sid, { revokedBy = null, revokeReason = null } = {}) {
    const key = String(sid || "").trim();
    if (!key) {
      return;
    }
    const list = ensureArray(this.snapshot.userSessionIndexRecords);
    const index = list.findIndex((item) => String(item?.sid || "") === key);
    if (index < 0) {
      return;
    }
    const current = list[index];
    list[index] = {
      ...current,
      revokedAt: new Date().toISOString(),
      revokedBy: revokedBy ? String(revokedBy) : null,
      revokeReason: revokeReason ? String(revokeReason) : null,
    };
    this.snapshot.userSessionIndexRecords = list;
    const persisted = list[index];
    this.enqueuePersist("user_session_index_revoke", async () => {
      await prisma.userSessionIndexRecord.updateMany({
        where: { sid: key },
        data: {
          revokedAt: toDateOrNull(persisted.revokedAt) || new Date(),
          revokedBy: persisted.revokedBy,
          revokeReason: persisted.revokeReason,
        },
      });
    });
  }

  removeUserSessionIndexRecord(sid) {
    const key = String(sid || "").trim();
    if (!key) {
      return;
    }
    this.snapshot.userSessionIndexRecords = ensureArray(
      this.snapshot.userSessionIndexRecords,
    ).filter((item) => String(item?.sid || "") !== key);
    this.enqueuePersist("user_session_index_delete", async () => {
      await prisma.userSessionIndexRecord.deleteMany({ where: { sid: key } });
    });
  }

  loadSecurityEvents() {
    return cloneValue(this.snapshot.securityEvents || []);
  }

  writeSecurityEvents(events) {
    this.snapshot.securityEvents = cloneValue(ensureArray(events));
    this.enqueuePersist("security_events", async () => {
      const rows = this.snapshot.securityEvents.map((event) => ({
        id: String(event?.id || crypto.randomUUID()),
        ts: toDateOrNull(event?.ts) || new Date(),
        type: String(event?.type || ""),
        severity: String(event?.severity || "info"),
        riskScore: Number.isFinite(Number(event?.riskScore))
          ? Math.floor(Number(event.riskScore))
          : 0,
        status: String(event?.status || "open"),
        actorUserId: event?.actorUserId ? String(event.actorUserId) : null,
        targetUserId: event?.targetUserId ? String(event.targetUserId) : null,
        ip: event?.ip ? String(event.ip) : null,
        userAgent: event?.userAgent ? String(event.userAgent) : null,
        sessionId: event?.sessionId ? String(event.sessionId) : null,
        requestId: event?.requestId ? String(event.requestId) : null,
        data: cloneValue(event?.data || {}),
      }));
      await this.persistCollectionById({
        model: prisma.securityEventRecord,
        rows,
        idKey: "id",
        updateFields: [
          "ts",
          "type",
          "severity",
          "riskScore",
          "status",
          "actorUserId",
          "targetUserId",
          "ip",
          "userAgent",
          "sessionId",
          "requestId",
          "data",
        ],
      });
    });
  }

  upsertSecurityEvent(event) {
    const id = String(event?.id || "").trim() || crypto.randomUUID();
    const list = ensureArray(this.snapshot.securityEvents);
    const index = list.findIndex((item) => String(item?.id || "") === id);
    const normalized = {
      id,
      ts: String(event?.ts || new Date().toISOString()),
      type: String(event?.type || ""),
      severity: String(event?.severity || "info"),
      riskScore: Number.isFinite(Number(event?.riskScore))
        ? Math.floor(Number(event.riskScore))
        : 0,
      status: String(event?.status || "open"),
      actorUserId: event?.actorUserId ? String(event.actorUserId) : null,
      targetUserId: event?.targetUserId ? String(event.targetUserId) : null,
      ip: event?.ip ? String(event.ip) : "",
      userAgent: event?.userAgent ? String(event.userAgent) : "",
      sessionId: event?.sessionId ? String(event.sessionId) : null,
      requestId: event?.requestId ? String(event.requestId) : null,
      data: cloneValue(event?.data || {}),
    };
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.securityEvents = list.sort((a, b) => {
      const aTs = new Date(a.ts || 0).getTime();
      const bTs = new Date(b.ts || 0).getTime();
      return bTs - aTs;
    });
    this.enqueuePersist("security_event_upsert", async () => {
      await prisma.securityEventRecord.upsert({
        where: { id },
        create: {
          id,
          ts: toDateOrNull(normalized.ts) || new Date(),
          type: normalized.type,
          severity: normalized.severity,
          riskScore: normalized.riskScore,
          status: normalized.status,
          actorUserId: normalized.actorUserId,
          targetUserId: normalized.targetUserId,
          ip: normalized.ip || null,
          userAgent: normalized.userAgent || null,
          sessionId: normalized.sessionId,
          requestId: normalized.requestId,
          data: cloneValue(normalized.data),
        },
        update: {
          ts: toDateOrNull(normalized.ts) || new Date(),
          type: normalized.type,
          severity: normalized.severity,
          riskScore: normalized.riskScore,
          status: normalized.status,
          actorUserId: normalized.actorUserId,
          targetUserId: normalized.targetUserId,
          ip: normalized.ip || null,
          userAgent: normalized.userAgent || null,
          sessionId: normalized.sessionId,
          requestId: normalized.requestId,
          data: cloneValue(normalized.data),
        },
      });
    });
    return cloneValue(normalized);
  }

  loadAdminExportJobs() {
    return cloneValue(this.snapshot.adminExportJobs || []);
  }

  upsertAdminExportJob(job) {
    const id = String(job?.id || "").trim();
    if (!id) {
      return null;
    }
    const normalized = {
      id,
      dataset: String(job?.dataset || "audit_log"),
      format: String(job?.format || "csv"),
      status: String(job?.status || "queued"),
      requestedBy: String(job?.requestedBy || ""),
      filters: cloneValue(job?.filters || {}),
      filePath: job?.filePath ? String(job.filePath) : null,
      rowCount: Number.isFinite(Number(job?.rowCount)) ? Number(job.rowCount) : null,
      error: job?.error ? String(job.error) : null,
      createdAt: String(job?.createdAt || new Date().toISOString()),
      startedAt: job?.startedAt ? String(job.startedAt) : null,
      finishedAt: job?.finishedAt ? String(job.finishedAt) : null,
      expiresAt: job?.expiresAt ? String(job.expiresAt) : null,
      updatedAt: String(job?.updatedAt || new Date().toISOString()),
    };
    const list = ensureArray(this.snapshot.adminExportJobs);
    const index = list.findIndex((item) => String(item?.id || "") === id);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.adminExportJobs = list.sort((a, b) => {
      const aTs = new Date(a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAt || 0).getTime();
      return bTs - aTs;
    });
    this.enqueuePersist("admin_export_job", async () => {
      await prisma.adminExportJobRecord.upsert({
        where: { id },
        create: {
          id,
          dataset: normalized.dataset,
          format: normalized.format,
          status: normalized.status,
          requestedBy: normalized.requestedBy,
          filters: cloneValue(normalized.filters),
          filePath: normalized.filePath,
          rowCount: normalized.rowCount,
          error: normalized.error,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
        update: {
          dataset: normalized.dataset,
          format: normalized.format,
          status: normalized.status,
          requestedBy: normalized.requestedBy,
          filters: cloneValue(normalized.filters),
          filePath: normalized.filePath,
          rowCount: normalized.rowCount,
          error: normalized.error,
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
      });
    });
    return cloneValue(normalized);
  }

  loadEpubImportJobs() {
    return cloneValue(this.snapshot.epubImportJobs || []);
  }

  isEpubImportJobStorageAvailable() {
    return this.epubImportJobStorageAvailable === true;
  }

  upsertEpubImportJob(job) {
    if (
      this.epubImportJobStorageAvailable !== true ||
      typeof prisma.epubImportJobRecord?.upsert !== "function"
    ) {
      return null;
    }
    const id = String(job?.id || "").trim();
    if (!id) {
      return null;
    }
    const normalized = {
      id,
      projectId: String(job?.projectId || "").trim(),
      requestedBy: String(job?.requestedBy || "").trim(),
      status: String(job?.status || "queued"),
      summary:
        job?.summary && typeof job.summary === "object" && !Array.isArray(job.summary)
          ? cloneValue(job.summary)
          : {},
      resultPath: job?.resultPath ? String(job.resultPath) : null,
      error: job?.error ? String(job.error) : null,
      createdAt: String(job?.createdAt || new Date().toISOString()),
      startedAt: job?.startedAt ? String(job.startedAt) : null,
      finishedAt: job?.finishedAt ? String(job.finishedAt) : null,
      expiresAt: job?.expiresAt ? String(job.expiresAt) : null,
      updatedAt: String(job?.updatedAt || new Date().toISOString()),
    };
    const list = ensureArray(this.snapshot.epubImportJobs);
    const index = list.findIndex((item) => String(item?.id || "") === id);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.epubImportJobs = list.sort((a, b) => {
      const aTs = new Date(a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAt || 0).getTime();
      return bTs - aTs;
    });
    this.enqueuePersist("epub_import_job", async () => {
      await prisma.epubImportJobRecord.upsert({
        where: { id },
        create: {
          id,
          projectId: normalized.projectId,
          requestedBy: normalized.requestedBy,
          status: normalized.status,
          summary: cloneValue(normalized.summary),
          resultPath: normalized.resultPath,
          error: normalized.error,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
        update: {
          projectId: normalized.projectId,
          requestedBy: normalized.requestedBy,
          status: normalized.status,
          summary: cloneValue(normalized.summary),
          resultPath: normalized.resultPath,
          error: normalized.error,
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
      });
    });
    return cloneValue(normalized);
  }

  loadProjectImageImportJobs() {
    return cloneValue(this.snapshot.projectImageImportJobs || []);
  }

  isProjectImageImportJobStorageAvailable() {
    return this.projectImageImportJobStorageAvailable === true;
  }

  upsertProjectImageImportJob(job) {
    if (
      this.projectImageImportJobStorageAvailable !== true ||
      typeof prisma.projectImageImportJobRecord?.upsert !== "function"
    ) {
      return null;
    }
    const id = String(job?.id || "").trim();
    if (!id) {
      return null;
    }
    const normalized = {
      id,
      projectId: String(job?.projectId || "").trim(),
      requestedBy: String(job?.requestedBy || "").trim(),
      status: String(job?.status || "queued"),
      summary:
        job?.summary && typeof job.summary === "object" && !Array.isArray(job.summary)
          ? cloneValue(job.summary)
          : {},
      resultPath: job?.resultPath ? String(job.resultPath) : null,
      error: job?.error ? String(job.error) : null,
      createdAt: String(job?.createdAt || new Date().toISOString()),
      startedAt: job?.startedAt ? String(job.startedAt) : null,
      finishedAt: job?.finishedAt ? String(job.finishedAt) : null,
      expiresAt: job?.expiresAt ? String(job.expiresAt) : null,
      updatedAt: String(job?.updatedAt || new Date().toISOString()),
    };
    const list = ensureArray(this.snapshot.projectImageImportJobs);
    const index = list.findIndex((item) => String(item?.id || "") === id);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.projectImageImportJobs = list.sort((a, b) => {
      const aTs = new Date(a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAt || 0).getTime();
      return bTs - aTs;
    });
    this.enqueuePersist("project_image_import_job", async () => {
      await prisma.projectImageImportJobRecord.upsert({
        where: { id },
        create: {
          id,
          projectId: normalized.projectId,
          requestedBy: normalized.requestedBy,
          status: normalized.status,
          summary: cloneValue(normalized.summary),
          resultPath: normalized.resultPath,
          error: normalized.error,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
        update: {
          projectId: normalized.projectId,
          requestedBy: normalized.requestedBy,
          status: normalized.status,
          summary: cloneValue(normalized.summary),
          resultPath: normalized.resultPath,
          error: normalized.error,
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
      });
    });
    return cloneValue(normalized);
  }

  loadProjectImageExportJobs() {
    return cloneValue(this.snapshot.projectImageExportJobs || []);
  }

  isProjectImageExportJobStorageAvailable() {
    return this.projectImageExportJobStorageAvailable === true;
  }

  upsertProjectImageExportJob(job) {
    if (
      this.projectImageExportJobStorageAvailable !== true ||
      typeof prisma.projectImageExportJobRecord?.upsert !== "function"
    ) {
      return null;
    }
    const id = String(job?.id || "").trim();
    if (!id) {
      return null;
    }
    const normalized = {
      id,
      projectId: String(job?.projectId || "").trim(),
      requestedBy: String(job?.requestedBy || "").trim(),
      status: String(job?.status || "queued"),
      summary:
        job?.summary && typeof job.summary === "object" && !Array.isArray(job.summary)
          ? cloneValue(job.summary)
          : {},
      resultPath: job?.resultPath ? String(job.resultPath) : null,
      error: job?.error ? String(job.error) : null,
      createdAt: String(job?.createdAt || new Date().toISOString()),
      startedAt: job?.startedAt ? String(job.startedAt) : null,
      finishedAt: job?.finishedAt ? String(job.finishedAt) : null,
      expiresAt: job?.expiresAt ? String(job.expiresAt) : null,
      updatedAt: String(job?.updatedAt || new Date().toISOString()),
    };
    const list = ensureArray(this.snapshot.projectImageExportJobs);
    const index = list.findIndex((item) => String(item?.id || "") === id);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.projectImageExportJobs = list.sort((a, b) => {
      const aTs = new Date(a.createdAt || 0).getTime();
      const bTs = new Date(b.createdAt || 0).getTime();
      return bTs - aTs;
    });
    this.enqueuePersist("project_image_export_job", async () => {
      await prisma.projectImageExportJobRecord.upsert({
        where: { id },
        create: {
          id,
          projectId: normalized.projectId,
          requestedBy: normalized.requestedBy,
          status: normalized.status,
          summary: cloneValue(normalized.summary),
          resultPath: normalized.resultPath,
          error: normalized.error,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
        update: {
          projectId: normalized.projectId,
          requestedBy: normalized.requestedBy,
          status: normalized.status,
          summary: cloneValue(normalized.summary),
          resultPath: normalized.resultPath,
          error: normalized.error,
          startedAt: toDateOrNull(normalized.startedAt),
          finishedAt: toDateOrNull(normalized.finishedAt),
          expiresAt: toDateOrNull(normalized.expiresAt),
        },
      });
    });
    return cloneValue(normalized);
  }

  isWebhookDeliveryStorageAvailable() {
    return this.webhookDeliveryStorageAvailable === true;
  }

  storeWebhookDeliverySnapshot(record) {
    const normalized = normalizeWebhookDeliveryRecord(record);
    if (!normalized) {
      return null;
    }
    const list = ensureArray(this.snapshot.webhookDeliveries);
    const index = list.findIndex((item) => String(item?.id || "") === normalized.id);
    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.push(normalized);
    }
    this.snapshot.webhookDeliveries = sortByCreatedAtDesc(list);
    return normalized;
  }

  loadWebhookDeliveries() {
    return cloneValue(this.snapshot.webhookDeliveries || []);
  }

  findWebhookDelivery(id) {
    const normalizedId = String(id || "").trim();
    if (!normalizedId) {
      return null;
    }
    const match = ensureArray(this.snapshot.webhookDeliveries).find(
      (item) => String(item?.id || "") === normalizedId,
    );
    return match ? cloneValue(match) : null;
  }

  upsertWebhookDelivery(record) {
    const normalized = this.storeWebhookDeliverySnapshot(record);
    if (!normalized) {
      return null;
    }
    if (
      this.webhookDeliveryStorageAvailable === true &&
      typeof prisma.webhookDeliveryRecord?.upsert === "function"
    ) {
      this.enqueuePersist("webhook_delivery", async () => {
        await prisma.webhookDeliveryRecord.upsert({
          where: { id: normalized.id },
          create: {
            id: normalized.id,
            scope: normalized.scope,
            provider: normalized.provider,
            channel: normalized.channel,
            eventKey: normalized.eventKey,
            status: normalized.status,
            targetUrl: normalized.targetUrl,
            targetLabel: normalized.targetLabel,
            payload: cloneValue(normalized.payload),
            context: cloneValue(normalized.context),
            attemptCount: normalized.attemptCount,
            maxAttempts: normalized.maxAttempts,
            nextAttemptAt: toDateOrNull(normalized.nextAttemptAt),
            lastAttemptAt: toDateOrNull(normalized.lastAttemptAt),
            lastStatusCode: normalized.lastStatusCode,
            lastErrorCode: normalized.lastErrorCode,
            lastError: normalized.lastError,
            processingOwner: normalized.processingOwner,
            processingStartedAt: toDateOrNull(normalized.processingStartedAt),
            sentAt: toDateOrNull(normalized.sentAt),
            retryOfId: normalized.retryOfId,
            createdAt: toDateOrNull(normalized.createdAt) || new Date(),
          },
          update: {
            scope: normalized.scope,
            provider: normalized.provider,
            channel: normalized.channel,
            eventKey: normalized.eventKey,
            status: normalized.status,
            targetUrl: normalized.targetUrl,
            targetLabel: normalized.targetLabel,
            payload: cloneValue(normalized.payload),
            context: cloneValue(normalized.context),
            attemptCount: normalized.attemptCount,
            maxAttempts: normalized.maxAttempts,
            nextAttemptAt: toDateOrNull(normalized.nextAttemptAt),
            lastAttemptAt: toDateOrNull(normalized.lastAttemptAt),
            lastStatusCode: normalized.lastStatusCode,
            lastErrorCode: normalized.lastErrorCode,
            lastError: normalized.lastError,
            processingOwner: normalized.processingOwner,
            processingStartedAt: toDateOrNull(normalized.processingStartedAt),
            sentAt: toDateOrNull(normalized.sentAt),
            retryOfId: normalized.retryOfId,
          },
        });
      });
    }
    return cloneValue(normalized);
  }

  async claimWebhookDelivery({ workerId = "", now = new Date().toISOString() } = {}) {
    const normalizedWorkerId = String(workerId || "").trim();
    const nowDate = toDateOrNull(now) || new Date();
    if (
      this.webhookDeliveryStorageAvailable === true &&
      typeof prisma.webhookDeliveryRecord?.findMany === "function" &&
      typeof prisma.webhookDeliveryRecord?.updateMany === "function" &&
      typeof prisma.webhookDeliveryRecord?.findUnique === "function"
    ) {
      const candidates = await prisma.webhookDeliveryRecord.findMany({
        where: {
          status: { in: [WEBHOOK_DELIVERY_STATUS.QUEUED, WEBHOOK_DELIVERY_STATUS.RETRYING] },
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: nowDate } }],
        },
        orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
        take: 20,
      });
      for (const candidate of candidates) {
        const claimed = await prisma.webhookDeliveryRecord.updateMany({
          where: {
            id: String(candidate?.id || ""),
            status: { in: [WEBHOOK_DELIVERY_STATUS.QUEUED, WEBHOOK_DELIVERY_STATUS.RETRYING] },
            OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: nowDate } }],
          },
          data: {
            status: WEBHOOK_DELIVERY_STATUS.PROCESSING,
            processingOwner: normalizedWorkerId || null,
            processingStartedAt: nowDate,
          },
        });
        if (Number(claimed?.count || 0) < 1) {
          continue;
        }
        const refreshed = await prisma.webhookDeliveryRecord.findUnique({
          where: { id: String(candidate?.id || "") },
        });
        const normalized = this.storeWebhookDeliverySnapshot(refreshed);
        return normalized ? cloneValue(normalized) : null;
      }
    }

    const fallbackCandidates = ensureArray(this.snapshot.webhookDeliveries)
      .filter((entry) =>
        [WEBHOOK_DELIVERY_STATUS.QUEUED, WEBHOOK_DELIVERY_STATUS.RETRYING].includes(
          String(entry?.status || "")
            .trim()
            .toLowerCase(),
        ),
      )
      .filter((entry) => {
        const dueAtTs = entry?.nextAttemptAt ? new Date(entry.nextAttemptAt).getTime() : null;
        return dueAtTs === null || (Number.isFinite(dueAtTs) && dueAtTs <= nowDate.getTime());
      })
      .sort((left, right) => {
        const leftDue = left?.nextAttemptAt ? new Date(left.nextAttemptAt).getTime() : 0;
        const rightDue = right?.nextAttemptAt ? new Date(right.nextAttemptAt).getTime() : 0;
        return leftDue - rightDue;
      });
    const fallback = fallbackCandidates[0];
    if (!fallback) {
      return null;
    }
    const claimedFallback = this.storeWebhookDeliverySnapshot({
      ...fallback,
      status: WEBHOOK_DELIVERY_STATUS.PROCESSING,
      processingOwner: normalizedWorkerId || null,
      processingStartedAt: nowDate.toISOString(),
      updatedAt: nowDate.toISOString(),
    });
    return claimedFallback ? cloneValue(claimedFallback) : null;
  }

  loadWebhookState(key) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return null;
    }
    const state = this.snapshot.webhookStates?.[normalizedKey];
    return state ? cloneValue(state) : null;
  }

  writeWebhookState(key, data) {
    const normalized = normalizeWebhookStateRecord({ key, data });
    if (!normalized) {
      return null;
    }
    this.snapshot.webhookStates = {
      ...this.snapshot.webhookStates,
      [normalized.key]: normalized,
    };
    if (
      this.webhookStateStorageAvailable === true &&
      typeof prisma.webhookStateRecord?.upsert === "function"
    ) {
      this.enqueuePersist("webhook_state", async () => {
        await prisma.webhookStateRecord.upsert({
          where: { key: normalized.key },
          create: {
            key: normalized.key,
            data: cloneValue(normalized.data),
          },
          update: {
            data: cloneValue(normalized.data),
          },
        });
      });
    }
    return cloneValue(normalized);
  }

  loadSecretRotations() {
    return cloneValue(this.snapshot.secretRotations || []);
  }

  appendSecretRotation(entry) {
    const normalized = {
      id: String(entry?.id || crypto.randomUUID()),
      secretFamily: String(entry?.secretFamily || ""),
      keyId: String(entry?.keyId || ""),
      rotatedAt: String(entry?.rotatedAt || new Date().toISOString()),
      rotatedBy: String(entry?.rotatedBy || "system"),
      notes: entry?.notes ? String(entry.notes) : "",
      status: String(entry?.status || "completed"),
      createdAt: String(entry?.createdAt || new Date().toISOString()),
    };
    this.snapshot.secretRotations = [normalized, ...ensureArray(this.snapshot.secretRotations)]
      .sort((a, b) => new Date(b.rotatedAt || 0).getTime() - new Date(a.rotatedAt || 0).getTime())
      .slice(0, 1000);
    this.enqueuePersist("secret_rotation", async () => {
      await prisma.secretRotationRecord.upsert({
        where: { id: normalized.id },
        create: {
          id: normalized.id,
          secretFamily: normalized.secretFamily,
          keyId: normalized.keyId,
          rotatedAt: toDateOrNull(normalized.rotatedAt) || new Date(),
          rotatedBy: normalized.rotatedBy,
          notes: normalized.notes || null,
          status: normalized.status,
          createdAt: toDateOrNull(normalized.createdAt) || new Date(),
        },
        update: {
          secretFamily: normalized.secretFamily,
          keyId: normalized.keyId,
          rotatedAt: toDateOrNull(normalized.rotatedAt) || new Date(),
          rotatedBy: normalized.rotatedBy,
          notes: normalized.notes || null,
          status: normalized.status,
        },
      });
    });
    return cloneValue(normalized);
  }

  getHealthSnapshot() {
    const nowMs = Date.now();
    const oldestPendingMs =
      Number.isFinite(Number(this.health.oldestPendingEnqueuedAt)) &&
      Number(this.health.oldestPendingEnqueuedAt) > 0
        ? Math.max(0, nowMs - Number(this.health.oldestPendingEnqueuedAt))
        : 0;
    return cloneValue({
      queueDepth: Math.max(0, Number(this.health.queueDepth || 0)),
      oldestPendingMs,
      lastPersistStartedAt: this.health.lastPersistStartedAt || null,
      lastPersistCompletedAt: this.health.lastPersistCompletedAt || null,
      lastPersistErrorAt: this.health.lastPersistErrorAt || null,
      lastPersistErrorLabel: this.health.lastPersistErrorLabel || null,
      lastPersistErrorMessage: this.health.lastPersistErrorMessage || null,
    });
  }
}

export const createDataRepository = async (options) => {
  if (!String(options.databaseUrl || "").trim()) {
    throw new Error("DATABASE_URL is required for DB repository");
  }
  return DbDataRepository.create(options);
};
