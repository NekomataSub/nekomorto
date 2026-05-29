import express from "express";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import { registerAstroRoutes } from "../../server/routes/register-astro-routes.js";

const createTestServer = async ({
  registerBeforeAstro,
  handleAstroPublicRequest,
}: {
  registerBeforeAstro?: (app: express.Express) => void;
  handleAstroPublicRequest?: Parameters<typeof registerAstroRoutes>[0]["handleAstroPublicRequest"];
} = {}) => {
  const app = express();
  registerBeforeAstro?.(app);
  registerAstroRoutes({
    app,
    handleAstroPublicRequest,
  });
  app.get("/{*path}", (_req, res) => {
    res.type("html").send("<!doctype html><html><body>legacy</body></html>");
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

describe("registerAstroRoutes", () => {
  let activeServer: Server | null = null;

  afterEach(async () => {
    await closeServer(activeServer);
    activeServer = null;
  });

  it.each([
    "/",
    "/projetos",
    "/projeto/projeto-teste",
    "/projeto/projeto-teste/leitura/1",
    "/postagem/postagem-teste",
    "/sobre",
    "/faq",
    "/equipe",
    "/doacoes",
    "/recrutamento",
    "/termos-de-uso",
    "/politica-de-privacidade",
    "/login",
    "/dashboard",
    "/dashboard/posts",
  ])("serves Astro-owned route %s before the legacy fallback", async (pathname) => {
    const started = await createTestServer({
      handleAstroPublicRequest: async (_req, res) => {
        res.type("html").send("<!doctype html><html><body>astro</body></html>");
      },
    });
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}${pathname}`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("astro");
    expect(body).not.toContain("legacy");
  });

  it("falls through to the legacy runtime for non-Astro public routes", async () => {
    const started = await createTestServer({
      handleAstroPublicRequest: async (_req, res) => {
        res.type("html").send("<!doctype html><html><body>astro</body></html>");
      },
    });
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}/api/public/bootstrap`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("legacy");
  });

  it("falls through when the Astro handler is unavailable", async () => {
    const started = await createTestServer();
    activeServer = started.server;

    const response = await fetch(`${started.baseUrl}/termos-de-uso`);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("legacy");
  });

  it("lets an earlier OAuth callback route consume /login callback params before Astro", async () => {
    const started = await createTestServer({
      registerBeforeAstro: (app) => {
        app.get("/login", (req, res, next) => {
          const hasCallbackParams = Boolean(
            (typeof req.query.code === "string" && req.query.code.trim()) ||
              (typeof req.query.state === "string" && req.query.state.trim()),
          );
          if (!hasCallbackParams) {
            return next("route");
          }
          return res.type("text").send("oauth-callback");
        });
      },
      handleAstroPublicRequest: async (_req, res) => {
        res.type("html").send("<!doctype html><html><body>astro</body></html>");
      },
    });
    activeServer = started.server;

    const callbackResponse = await fetch(`${started.baseUrl}/login?code=abc&state=def`);
    const callbackBody = await callbackResponse.text();
    const pageResponse = await fetch(`${started.baseUrl}/login`);
    const pageBody = await pageResponse.text();

    expect(callbackResponse.status).toBe(200);
    expect(callbackBody).toBe("oauth-callback");
    expect(pageResponse.status).toBe(200);
    expect(pageBody).toContain("astro");
  });
});
