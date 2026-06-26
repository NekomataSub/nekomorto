import fs from "fs";
import path from "path";

export const isViteMiddlewareEnabled = (isProduction) => !Boolean(isProduction);

const parseOriginHostname = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(
      `APP_ORIGIN contains invalid URL "${normalized}". Use absolute http(s) origins separated by commas.`,
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `APP_ORIGIN contains unsupported protocol in "${normalized}". Use http:// or https:// origins.`,
    );
  }
  return parsed.hostname.toLowerCase();
};

export const resolveViteAllowedHostsFromOrigins = (appOriginEnv = "") => {
  const raw = String(appOriginEnv || "").trim();
  if (!raw) {
    return [];
  }
  const hosts = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => parseOriginHostname(item))
    .filter(Boolean);
  return Array.from(new Set(hosts));
};

export const resolveClientIndexPath = ({
  clientRootDir,
  clientDistDir = path.join(clientRootDir, "dist"),
  isProduction,
  existsSync = fs.existsSync,
} = {}) => {
  const distIndexPath = path.join(clientDistDir, "index.html");
  if (isProduction) {
    if (!existsSync(distIndexPath)) {
      throw new Error(
        `Missing production build at ${distIndexPath}. Run "npm run build" before "npm run start".`,
      );
    }
    return distIndexPath;
  }
  return path.join(clientRootDir, "index.html");
};

export const createViteDevServer = async ({
  isProduction,
  createServer,
  httpServer,
  appOriginEnv = process.env.APP_ORIGIN,
} = {}) => {
  if (!isViteMiddlewareEnabled(isProduction)) {
    return null;
  }
  const createViteServer = createServer || (await import("vite")).createServer;
  const allowedHosts = resolveViteAllowedHostsFromOrigins(appOriginEnv);
  const serverConfig = {
    middlewareMode: true,
    hmr: {
      overlay: false,
    },
    ws: {
      ...(httpServer ? { server: httpServer } : {}),
    },
  };
  if (allowedHosts.length) {
    serverConfig.allowedHosts = allowedHosts;
  }
  return createViteServer({
    server: serverConfig,
    appType: "custom",
  });
};
