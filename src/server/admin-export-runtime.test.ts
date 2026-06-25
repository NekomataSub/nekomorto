import { describe, expect, it, vi } from "vitest";

import { createAdminExportRuntime } from "../../server/lib/admin-export-runtime.js";

const createDeps = (overrides = {}) => {
  let jobs = [
    {
      id: "job-1",
      dataset: "users",
      format: "csv",
      status: "queued",
      requestedBy: "admin-1",
      filters: {},
      createdAt: "2026-03-28T12:00:00.000Z",
    },
  ];

  const upsertAdminExportJob = vi.fn((job) => {
    jobs = [...jobs.filter((entry) => entry.id !== job.id), job];
    return job;
  });

  const backgroundJobQueue = {
    enqueue: vi.fn(async (job) => job.run()),
  };

  return {
    AccessRole: {
      NORMAL: "normal",
    },
    adminExportMaxRows: 2,
    adminExportTtlHours: 24,
    adminExportsDir: "tmp-admin-exports",
    appendAuditLog: vi.fn(),
    backgroundJobQueue,
    createSystemAuditReq: () => ({
      headers: {},
      ip: "127.0.0.1",
      session: { user: { id: "system", name: "System" } },
      requestId: "system-req",
    }),
    filterByDateRange: (rows) => rows,
    filterExportEntries: (rows, filters: Record<string, unknown> = {}) => {
      const normalizedStatus = String(filters.status || "")
        .trim()
        .toLowerCase();
      return rows.filter((entry) => {
        if (normalizedStatus && String(entry.status || "").toLowerCase() !== normalizedStatus) {
          return false;
        }
        return true;
      });
    },
    loadAdminExportJobs: () => jobs,
    loadAuditLog: () => [],
    loadOwnerIds: () => ["owner-1"],
    loadSecurityEvents: () => [],
    loadUserSessionIndexRecords: () => [],
    loadUsers: () => [
      {
        id: "owner-1",
        name: "Owner",
        status: "active",
        accessRole: "normal",
        permissions: ["users.read"],
        roles: ["owner"],
        updatedAt: "2026-03-27T12:00:00.000Z",
      },
      {
        id: "user-2",
        name: "User Two",
        status: "inactive",
        accessRole: "normal",
        permissions: [],
        roles: [],
        updatedAt: "2026-03-26T12:00:00.000Z",
      },
      {
        id: "user-3",
        name: "User Three",
        status: "active",
        accessRole: "normal",
        permissions: [],
        roles: [],
        updatedAt: "2026-03-25T12:00:00.000Z",
      },
    ],
    metricsRegistry: {
      inc: vi.fn(),
    },
    normalizeExportDataset: (value) =>
      String(value || "")
        .trim()
        .toLowerCase() || "audit_log",
    normalizeExportFilters: (value) => {
      const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      return {
        status: String(source.status || "")
          .trim()
          .toLowerCase(),
      };
    },
    normalizeExportStatus: (value) =>
      String(value || "")
        .trim()
        .toLowerCase() || "queued",
    normalizeUsers: (rows) => rows,
    upsertAdminExportJob,
    writeExportFile: vi.fn(() => "/tmp-admin-exports/users-job-1.csv"),
    ...overrides,
  };
};

describe("admin-export-runtime", () => {
  it("fails early when required dependencies are missing", () => {
    expect(() => createAdminExportRuntime()).toThrow(/missing required dependencies/i);
  });

  it("builds normalized user export rows and respects the max row limit", async () => {
    const runtime = createAdminExportRuntime(createDeps());

    const payload = await runtime.buildExportRowsByDataset({
      dataset: "users",
      filters: {},
    });

    expect(payload.headers).toEqual([
      "id",
      "name",
      "status",
      "accessRole",
      "permissions",
      "roles",
      "isOwner",
      "updatedAt",
    ]);
    expect(payload.rows).toEqual([
      expect.objectContaining({
        id: "owner-1",
        isOwner: true,
      }),
      expect.objectContaining({
        id: "user-2",
        isOwner: false,
      }),
    ]);
    expect(payload.truncated).toBe(true);
  });

  it("runs queued jobs through the background queue and returns API-safe responses", async () => {
    const deps = createDeps();
    const runtime = createAdminExportRuntime(deps);

    const result = await runtime.enqueueAdminExportJob("job-1");

    expect(deps.backgroundJobQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "admin.export",
        payload: { jobId: "job-1" },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: "job-1",
        status: "completed",
        filePath: "/tmp-admin-exports/users-job-1.csv",
        rowCount: 2,
      }),
    );
    expect(deps.writeExportFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "users-job-1",
      }),
    );
    expect(deps.metricsRegistry.inc).toHaveBeenCalledWith("export_jobs_total", {
      status: "completed",
      dataset: "users",
    });
    expect(runtime.toAdminExportJobApiResponse(result)).toEqual(
      expect.objectContaining({
        id: "job-1",
        status: "completed",
        hasFile: true,
      }),
    );
  });
});
