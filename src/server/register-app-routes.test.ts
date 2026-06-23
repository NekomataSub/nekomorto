import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { registerAppRoutes } from "../../server/routes/register-app-routes.js";

const renderStubHtml = "<!doctype html><html><head><title>x</title></head><body></body></html>";
const fallbackStubHtml =
  "<!doctype html><html><head><title>fallback</title></head><body></body></html>";

const createTestServer = async () => {
  const app = express();
  registerAppRoutes({
    app,
    PRIMARY_APP_ORIGIN: "http://127.0.0.1:0",
    loadSiteSettings: () => ({
      site: { name: "Test", titleSeparator: " | " },
      theme: { accent: "default" },
    }),
    loadPages: () => [],
    resolveInstitutionalOgPageKeyFromPath: () => null,
    buildInstitutionalPageMeta: () => ({
      title: "Institutional",
      description: "",
      siteName: "Test",
    }),
    buildSiteMetaWithSettings: () => ({ title: "Site", description: "", siteName: "Test" }),
    resolveThemeColor: () => "#000000",
    getPageTitleFromPath: () => "",
    buildSchemaOrgPayload: () => [],
    renderMetaHtml: () => renderStubHtml,
    injectPublicBootstrapHtml: ({ html }) => html,
    injectDashboardBootstrapHtml: ({ html }) => html,
    sendHtml: async (_req, res, html) => res.type("html").send(html),
    getIndexHtml: () => fallbackStubHtml,
    PUBLIC_BOOTSTRAP_MODE_FULL: "full",
    PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME: "critical-home",
    isHomeHeroShellEnabled: false,
  });

  const server = await new Promise<Server>((resolve) => {
    const listeningServer = app.listen(0, () => resolve(listeningServer));
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to resolve test server address");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
  };
};

const closeServer = async (server: Server | null) => {
  if (!server) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

describe("registerAppRoutes", () => {
  let activeServer: Server | null = null;

  afterEach(async () => {
    await closeServer(activeServer);
    activeServer = null;
  });

  it("keeps SPA routes on the HTML catch-all", async () => {
    const started = await createTestServer();
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}/projetos`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(String(response.headers.get("content-type") || "").toLowerCase()).toContain("text/html");
    expect(body).toContain("<!doctype html>");
  });

  it.each([
    "/assets/missing.js",
    "/_astro/layout.css",
    "/foo.css",
    "/@vite/client",
    "/@vite-plugin-pwa/pwa-entry-point-loaded",
    "/src/main.tsx",
    "/@react-refresh",
    "/@id/__x00__react",
    "/@fs/C:/repo/src/main.tsx",
    "/node_modules/.vite/deps/react.js",
  ])("returns 404 without HTML for reserved asset route %s", async (path) => {
    const started = await createTestServer();
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}${path}`);
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(String(response.headers.get("content-type") || "").toLowerCase()).not.toContain(
      "text/html",
    );
    expect(body).not.toMatch(/<!doctype html>/i);
  });

  it("keeps /api paths as JSON 404s", async () => {
    const started = await createTestServer();
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}/api/x`);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(String(response.headers.get("content-type") || "").toLowerCase()).toContain(
      "application/json",
    );
    expect(body).toEqual({ error: "not_found" });
  });

  it("returns index-safe HTML with a real 404 for unknown application routes", async () => {
    const started = await createTestServer();
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}/rota-inexistente`);
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(String(response.headers.get("content-type") || "").toLowerCase()).toContain("text/html");
    expect(body).toContain("<title>Página não encontrada</title>");
    expect(body).toContain('<meta name="robots" content="noindex, nofollow" />');
  });
});
