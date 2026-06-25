import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Better Auth runtime contract", () => {
  it("mounts the Express 5 handler before the JSON parser", () => {
    const source = repoFile("server/lib/register-runtime-middleware.js");
    expect(source.indexOf("registerBeforeBodyParsers(app)")).toBeLessThan(
      source.indexOf('express.json({ limit: "30mb" })'),
    );
  });

  it("gates OAuth with TOTP while leaving passkey callbacks outside the gate", () => {
    const source = repoFile("server/lib/better-auth-oauth-2fa.js");
    expect(source).toContain('context.path === "/callback/:id"');
    expect(source).toContain("deleteSessionCookie(ctx, true)");
    expect(source).toContain("createVerificationValue");
    expect(source).not.toContain("verify-authentication");
  });

  it("does not accept a legacy express session without a Better Auth cookie", () => {
    const source = repoFile("server/lib/better-auth-runtime.js");
    expect(source).toContain('cookieHeader.includes("nekomorto-auth.session_token=")');
    expect(source).toContain("req.session.user = null");
  });

  it("keeps legacy OAuth entrypoints out of the active direct route boot", () => {
    const directRoutes = repoFile("server/bootstrap/register-direct-server-routes.js");
    const betterAuthRuntime = repoFile("server/lib/better-auth-runtime.js");
    expect(directRoutes).not.toContain("registerAuthRoutes");
    expect(directRoutes).not.toContain('"auth"');
    expect(betterAuthRuntime).toContain('app.get("/auth/discord"');
    expect(betterAuthRuntime).toContain('app.get("/auth/google/callback"');
    expect(betterAuthRuntime).toContain("legacy_auth_removed");
  });
});
