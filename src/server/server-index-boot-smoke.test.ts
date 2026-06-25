import * as http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

const bootSmoke = vi.hoisted(() => {
  const timerState = {
    immediates: [] as Array<{ callback: (...args: unknown[]) => unknown; args: unknown[] }>,
    intervals: [] as Array<{ callback: (...args: unknown[]) => unknown; delay: number }>,
    cleared: [] as unknown[],
  };
  const rateLimiterInstance = {
    close: vi.fn(async () => undefined),
  };
  const createRateLimiterMock = vi.fn(async () => rateLimiterInstance);
  const createRepositoryStub = () =>
    new Proxy(
      {
        loadSiteSettings: () => null,
        writeSiteSettings: vi.fn(),
      },
      {
        get(target, property, receiver) {
          if (Reflect.has(target, property)) {
            return Reflect.get(target, property, receiver);
          }
          if (typeof property === "string" && property.startsWith("load")) {
            return () => [];
          }
          if (
            typeof property === "string" &&
            /^(append|delete|find|invalidate|upsert|write)/.test(property)
          ) {
            return () => null;
          }
          if (typeof property === "string" && property.startsWith("is")) {
            return () => false;
          }
          return undefined;
        },
      },
    );
  const createDataRepositoryMock = vi.fn(async () => createRepositoryStub());

  return {
    createDataRepositoryMock,
    createRateLimiterMock,
    rateLimiterInstance,
    timerState,
  };
});

vi.mock("pg", () => ({
  Pool: class FakePool {
    constructor() {}
    end() {}
    on() {}
  },
}));

vi.mock("../../server/lib/data-repository.js", () => ({
  createDataRepository: bootSmoke.createDataRepositoryMock,
}));

vi.mock("../../server/lib/prisma-client.js", () => ({
  prisma: {},
}));

vi.mock("../../server/lib/rate-limiter.js", () => ({
  createRateLimiter: bootSmoke.createRateLimiterMock,
}));

vi.mock("../../server/lib/client-build-manifest.js", () => ({
  readClientBuildManifest: () => null,
  resolvePublicRouteModulePreloads: () => [],
}));

vi.mock("../../server/lib/public-donations-qr.js", () => ({
  buildPublicDonationsRoutePayload: vi.fn(async () => ({
    pixQrCodeUrl: "/placeholder.svg",
    cryptoQrCodeUrls: {},
  })),
}));

vi.mock("../../server/lib/frontend-runtime.js", async () => {
  const actual = await vi.importActual<typeof import("../../server/lib/frontend-runtime.js")>(
    "../../server/lib/frontend-runtime.js",
  );
  return {
    ...actual,
    createViteDevServer: vi.fn(async () => null),
  };
});

const originalEnv = { ...process.env };

describe.sequential("server/index boot smoke", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    bootSmoke.timerState.immediates.length = 0;
    bootSmoke.timerState.intervals.length = 0;
    bootSmoke.timerState.cleared.length = 0;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("imports the real composition root without binding a live port", async () => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgres://testuser:testpass@localhost:5432/testdb",
      DISCORD_CLIENT_ID: "discord-client",
      DISCORD_CLIENT_SECRET: "discord-secret",
      NODE_ENV: "test",
      PORT: "0",
      SESSION_SECRET: "session-secret",
    };

    vi.stubGlobal(
      "setImmediate",
      vi.fn((callback: (...args: unknown[]) => unknown, ...args: unknown[]) => {
        bootSmoke.timerState.immediates.push({ callback, args });
        return { hasRef: () => false, ref: () => undefined, unref: () => undefined };
      }),
    );
    vi.stubGlobal(
      "setInterval",
      vi.fn((callback: (...args: unknown[]) => unknown, delay?: number) => {
        bootSmoke.timerState.intervals.push({ callback, delay: Number(delay || 0) });
        return { hasRef: () => false, ref: () => undefined, unref: () => undefined };
      }),
    );
    vi.stubGlobal(
      "clearInterval",
      vi.fn((handle: unknown) => {
        bootSmoke.timerState.cleared.push(handle);
      }),
    );

    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const listenSpy = vi.spyOn(http.Server.prototype, "listen").mockImplementation(function (
      this: http.Server,
      _port,
      callback?: () => void,
    ) {
      callback?.();
      return this;
    });
    const onSpy = vi.spyOn(http.Server.prototype, "on");

    await expect(import("../../server/index.js")).resolves.toBeTruthy();

    expect(bootSmoke.createDataRepositoryMock).toHaveBeenCalledTimes(1);
    expect(bootSmoke.createRateLimiterMock).toHaveBeenCalledTimes(1);
    expect(listenSpy).toHaveBeenCalledWith(0, expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("close", expect.any(Function));
    // Boot should register asynchronous background work; assert timer intent by validating scheduled callback shape.
    expect(bootSmoke.timerState.immediates).toHaveLength(3);
    for (const immediate of bootSmoke.timerState.immediates) {
      expect(immediate.callback).toEqual(expect.any(Function));
    }
    expect(bootSmoke.timerState.intervals.length).toBeGreaterThanOrEqual(3);
    for (const interval of bootSmoke.timerState.intervals) {
      expect(interval.callback).toEqual(expect.any(Function));
      expect(Number.isFinite(interval.delay)).toBe(true);
      expect(interval.delay).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});
