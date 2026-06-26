import path from "path";
import { describe, expect, it, vi } from "vitest";

import {
  createViteDevServer,
  isViteMiddlewareEnabled,
  resolveClientIndexPath,
  resolveViteAllowedHostsFromOrigins,
} from "../../server/lib/frontend-runtime.js";

describe("frontend-runtime", () => {
  describe("resolveClientIndexPath", () => {
    it("uses root index in development", () => {
      const rootDir = "/repo";
      const resolved = resolveClientIndexPath({
        clientRootDir: rootDir,
        isProduction: false,
      });
      expect(resolved).toBe(path.join(rootDir, "index.html"));
    });

    it("uses dist index in production when build exists", () => {
      const rootDir = "/repo";
      const distDir = path.join(rootDir, "dist");
      const resolved = resolveClientIndexPath({
        clientRootDir: rootDir,
        clientDistDir: distDir,
        isProduction: true,
        existsSync: () => true,
      });
      expect(resolved).toBe(path.join(distDir, "index.html"));
    });

    it("throws in production when dist/index.html is missing", () => {
      expect(() =>
        resolveClientIndexPath({
          clientRootDir: "/repo",
          clientDistDir: "/repo/dist",
          isProduction: true,
          existsSync: () => false,
        }),
      ).toThrow(/npm run build/i);
    });
  });

  describe("isViteMiddlewareEnabled", () => {
    it("enables vite middleware only in development", () => {
      expect(isViteMiddlewareEnabled(false)).toBe(true);
      expect(isViteMiddlewareEnabled(true)).toBe(false);
    });
  });

  describe("createViteDevServer", () => {
    it("does not create vite server in production", async () => {
      const createServer = vi.fn();
      const result = await createViteDevServer({
        isProduction: true,
        createServer,
      });
      expect(result).toBeNull();
      expect(createServer).not.toHaveBeenCalled();
    });

    it("creates vite server in development with middleware mode", async () => {
      const viteServer = { middlewares: {}, transformIndexHtml: vi.fn() };
      const createServer = vi.fn().mockResolvedValue(viteServer);
      const httpServer = { on: vi.fn() };

      const result = await createViteDevServer({
        isProduction: false,
        createServer,
        httpServer,
      });

      expect(result).toBe(viteServer);
      expect(createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          appType: "custom",
          server: expect.objectContaining({
            middlewareMode: true,
            hmr: expect.objectContaining({
              overlay: false,
            }),
            ws: expect.objectContaining({
              server: httpServer,
            }),
          }),
        }),
      );
    });

    it("forwards APP_ORIGIN hostnames to vite allowedHosts", async () => {
      const viteServer = { middlewares: {}, transformIndexHtml: vi.fn() };
      const createServer = vi.fn().mockResolvedValue(viteServer);

      await createViteDevServer({
        isProduction: false,
        createServer,
        appOriginEnv: "https://dev.nekomata.moe,http://localhost:8080",
      });

      expect(createServer).toHaveBeenCalledWith(
        expect.objectContaining({
          server: expect.objectContaining({
            allowedHosts: ["dev.nekomata.moe", "localhost"],
          }),
        }),
      );
    });
  });

  describe("resolveViteAllowedHostsFromOrigins", () => {
    it("normalizes and deduplicates valid hosts from APP_ORIGIN", () => {
      expect(
        resolveViteAllowedHostsFromOrigins(
          "https://dev.nekomata.moe,http://localhost:8080,https://DEV.nekomata.moe",
        ),
      ).toEqual(["dev.nekomata.moe", "localhost"]);
    });

    it("throws for malformed URLs in APP_ORIGIN", () => {
      expect(() => resolveViteAllowedHostsFromOrigins("https://dev.nekomata.moe,invalid")).toThrow(
        /APP_ORIGIN.*invalid URL/i,
      );
    });

    it("throws for unsupported protocols in APP_ORIGIN", () => {
      expect(() => resolveViteAllowedHostsFromOrigins("ftp://dev.nekomata.moe")).toThrow(
        /APP_ORIGIN.*unsupported protocol/i,
      );
    });
  });
});
