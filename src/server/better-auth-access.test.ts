import { describe, expect, it } from "vitest";
import { betterAuthRoles } from "../../server/lib/better-auth-access.js";

describe("Better Auth RBAC", () => {
  it("preserves the application permission matrix", () => {
    expect(betterAuthRoles.normal.authorize({ content: ["posts"] }).success).toBe(false);
    expect(betterAuthRoles.admin.authorize({ content: ["posts", "usuarios"] }).success).toBe(true);
    expect(betterAuthRoles.admin.authorize({ content: ["configuracoes"] }).success).toBe(false);
    expect(
      betterAuthRoles.owner_primary.authorize({
        content: ["configuracoes", "audit_log", "integracoes"],
      }).success,
    ).toBe(true);
  });
});
