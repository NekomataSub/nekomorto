import { describe, expect, it } from "vitest";
import { resolveBetterAuthOriginConfig } from "../../server/lib/better-auth-origin.js";

describe("Better Auth origin config", () => {
  it("uses the first APP_ORIGIN entry as baseURL and trusts the complete origin lists", () => {
    expect(
      resolveBetterAuthOriginConfig({
        appOriginEnv: "https://dev.nekomata.moe,http://localhost:8080",
        adminOriginsEnv: "https://admin.nekomata.moe",
        isProduction: true,
      }),
    ).toEqual({
      baseURL: "https://dev.nekomata.moe",
      trustedOrigins: [
        "https://dev.nekomata.moe",
        "http://localhost:8080",
        "https://admin.nekomata.moe",
      ],
    });
  });

  it("uses the integrated backend origin as the development fallback", () => {
    expect(resolveBetterAuthOriginConfig()).toEqual({
      baseURL: "http://localhost:8080",
      trustedOrigins: ["http://localhost:8080"],
    });
  });
});
