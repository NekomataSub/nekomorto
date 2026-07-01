import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  authSession: {
    updateMany: vi.fn(async () => ({ count: 1 })),
  },
}));

vi.mock("../../server/lib/prisma-client.js", () => ({
  prisma: prismaMock,
}));

vi.mock("better-auth", () => ({
  betterAuth: vi.fn(() => ({
    api: {
      getSession: vi.fn(),
    },
  })),
}));

vi.mock("better-auth/node", () => ({
  fromNodeHeaders: vi.fn((headers) => headers),
  toNodeHandler: vi.fn(() => () => undefined),
}));

vi.mock("better-auth/plugins", () => ({
  admin: vi.fn(() => ({})),
  twoFactor: vi.fn(() => ({})),
}));

vi.mock("@better-auth/passkey", () => ({
  passkey: vi.fn(() => ({})),
}));

vi.mock("@better-auth/prisma-adapter", () => ({
  prismaAdapter: vi.fn(() => ({})),
}));

vi.mock("../../server/lib/better-auth-oauth-2fa.js", () => ({
  oauthTwoFactorGate: vi.fn(() => ({})),
}));

vi.mock("../../server/lib/better-auth-origin.js", () => ({
  resolveBetterAuthOriginConfig: vi.fn(() => ({
    baseURL: "https://example.test",
    trustedOrigins: ["https://example.test"],
  })),
}));

import { touchBetterAuthSessionIndexFromRequest } from "../../server/lib/better-auth-runtime.js";

describe("Better Auth session touch", () => {
  beforeEach(() => {
    prismaMock.authSession.updateMany.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing without an approved Better Auth session", async () => {
    await expect(
      touchBetterAuthSessionIndexFromRequest({
        sessionID: "legacy-session",
        session: { user: { id: "owner-1" } },
        headers: { "user-agent": "Vitest" },
      }),
    ).resolves.toBe(false);

    expect(prismaMock.authSession.updateMany).not.toHaveBeenCalled();
  });

  it("updates the current Better Auth session metadata", async () => {
    await expect(
      touchBetterAuthSessionIndexFromRequest({
        betterAuthSession: {
          session: { token: "token-1" },
          user: { id: "owner-1" },
        },
        headers: {
          "user-agent": "Vitest Browser",
          "x-forwarded-for": "203.0.113.5, 10.0.0.1",
        },
      }),
    ).resolves.toBe(true);

    expect(prismaMock.authSession.updateMany).toHaveBeenCalledWith({
      where: { token: "token-1", userId: "owner-1" },
      data: {
        updatedAt: new Date("2026-07-01T12:00:00.000Z"),
        ipAddress: "203.0.113.5",
        userAgent: "Vitest Browser",
      },
    });
  });

  it("throttles repeated touches by session token", async () => {
    const req = {
      betterAuthSession: {
        session: { token: "token-2" },
        user: { id: "owner-1" },
      },
      headers: { "user-agent": "Vitest Browser" },
    };

    await expect(touchBetterAuthSessionIndexFromRequest(req)).resolves.toBe(true);
    await expect(touchBetterAuthSessionIndexFromRequest(req)).resolves.toBe(false);

    expect(prismaMock.authSession.updateMany).toHaveBeenCalledTimes(1);
  });
});
