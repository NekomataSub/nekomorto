import { describe, expect, it } from "vitest";

import { buildServerBootConfig } from "../../server/bootstrap/build-server-boot-config.js";

const createBaseEnv = (overrides: Record<string, string> = {}) => ({
  APP_ORIGIN: "https://nekomata.moe",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/nekomorto",
  NODE_ENV: "production",
  SESSION_SECRET: "secret",
  ...overrides,
});

describe("buildServerBootConfig logging", () => {
  it("enables useful server request logging by default in production", () => {
    const config = buildServerBootConfig({
      env: createBaseEnv(),
      repoRootDir: "/repo",
    });

    expect(config.serverLogLevel).toBe("info");
    expect(config.serverLogRequestScope).toBe("api");
    expect(config.isServerLogPretty).toBe(false);
  });

  it("normalizes explicit server logging env values", () => {
    const config = buildServerBootConfig({
      env: createBaseEnv({
        NODE_ENV: "development",
        SERVER_LOG_LEVEL: "warn",
        SERVER_LOG_PRETTY: "false",
        SERVER_LOG_REQUEST_SCOPE: "public",
      }),
      repoRootDir: "/repo",
    });

    expect(config.serverLogLevel).toBe("warn");
    expect(config.serverLogRequestScope).toBe("public");
    expect(config.isServerLogPretty).toBe(false);
  });

  it("falls back to safe logging defaults for invalid env values", () => {
    const config = buildServerBootConfig({
      env: createBaseEnv({
        SERVER_LOG_LEVEL: "chatty",
        SERVER_LOG_REQUEST_SCOPE: "everything",
      }),
      repoRootDir: "/repo",
    });

    expect(config.serverLogLevel).toBe("info");
    expect(config.serverLogRequestScope).toBe("api");
  });
});
