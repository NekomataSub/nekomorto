import { createServer as createHttpServer } from "node:http";
import path from "path";

import { createViteDevServer, resolveClientIndexPath } from "../lib/frontend-runtime.js";
import { createAbsoluteUrlResolver, createIndexHtmlLoader } from "../lib/meta-html.js";
import { isAllowedOrigin as isAllowedOriginByConfig } from "../lib/origin-config.js";

export const normalizeRequestIp = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("::ffff:")) {
    return normalized.slice("::ffff:".length);
  }
  return normalized;
};

export const getRequestIp = (req) => normalizeRequestIp(req?.ip);

export const createServerPlatformRuntime = async ({
  app,
  fs,
  repoRootDir = process.cwd(),
  allowedOrigins = [],
  primaryAppOrigin = "",
  isProduction = false,
} = {}) => {
  const clientRootDir = repoRootDir;
  const clientDistDir = path.join(clientRootDir, "dist");
  const clientIndexPath = resolveClientIndexPath({
    clientRootDir,
    clientDistDir,
    isProduction,
  });
  const httpServer = createHttpServer(app);
  const viteDevServer = await createViteDevServer({ isProduction, httpServer });
  const getIndexHtml = createIndexHtmlLoader({
    fs,
    clientIndexPath,
    isProduction,
  });
  const toAbsoluteUrl = createAbsoluteUrlResolver({
    origin: primaryAppOrigin,
  });
  const isAllowedOrigin = (origin) =>
    isAllowedOriginByConfig({
      origin,
      allowedOrigins,
      isProduction,
    });

  return {
    clientDistDir,
    clientIndexPath,
    clientRootDir,
    getIndexHtml,
    getRequestIp,
    httpServer,
    isAllowedOrigin,
    toAbsoluteUrl,
    viteDevServer,
  };
};

export default createServerPlatformRuntime;
