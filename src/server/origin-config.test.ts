import { describe, expect, it } from "vitest";

import {
  buildOriginConfig,
  isAllowedOrigin,
  resolveAuthAppOrigin,
} from "../../server/lib/origin-config.js";

describe("origin-config", () => {
  it("requires APP_ORIGIN in production", () => {
    expect(() =>
      buildOriginConfig({
        appOriginEnv: "",
        adminOriginsEnv: "",
        isProduction: true,
      }),
    ).toThrow(/APP_ORIGIN/);
  });

  it("normalizes application and admin origins without legacy OAuth redirect config", () => {
    const config = buildOriginConfig({
      appOriginEnv: "https://site.example.com,https://www.example.com",
      adminOriginsEnv: "https://admin.example.com",
      isProduction: true,
    });

    expect(config).toEqual({
      appOrigins: ["https://site.example.com", "https://www.example.com"],
      adminOrigins: ["https://admin.example.com"],
      allowedOrigins: [
        "https://site.example.com",
        "https://www.example.com",
        "https://admin.example.com",
      ],
      primaryAppOrigin: "https://site.example.com",
      primaryAppHost: "site.example.com",
    });
  });

  it("allows only configured origins in production", () => {
    const config = buildOriginConfig({
      appOriginEnv: "https://site.example.com",
      adminOriginsEnv: "https://admin.example.com",
      isProduction: true,
    });

    expect(
      isAllowedOrigin({
        origin: "https://site.example.com",
        allowedOrigins: config.allowedOrigins,
        isProduction: true,
      }),
    ).toBe(true);
    expect(
      isAllowedOrigin({
        origin: "https://admin.example.com",
        allowedOrigins: config.allowedOrigins,
        isProduction: true,
      }),
    ).toBe(true);
    expect(
      isAllowedOrigin({
        origin: "http://localhost:5173",
        allowedOrigins: config.allowedOrigins,
        isProduction: true,
      }),
    ).toBe(false);
  });

  it("allows localhost and LAN in development", () => {
    const config = buildOriginConfig({
      appOriginEnv: "",
      adminOriginsEnv: "",
      isProduction: false,
    });

    expect(
      isAllowedOrigin({
        origin: "http://localhost:5173",
        allowedOrigins: config.allowedOrigins,
        isProduction: false,
      }),
    ).toBe(true);
    expect(
      isAllowedOrigin({
        origin: "http://192.168.1.25:3000",
        allowedOrigins: config.allowedOrigins,
        isProduction: false,
      }),
    ).toBe(true);
    expect(
      isAllowedOrigin({
        origin: "https://evil.example.com",
        allowedOrigins: config.allowedOrigins,
        isProduction: false,
      }),
    ).toBe(false);
  });

  it("uses the preserved session origin for auth redirects when it is allowed", () => {
    const config = buildOriginConfig({
      appOriginEnv: "https://site.example.com",
      adminOriginsEnv: "https://admin.example.com",
      isProduction: true,
    });
    const origin = resolveAuthAppOrigin({
      req: {
        headers: { referer: "https://site.example.com/login" },
        protocol: "https",
      },
      sessionOrigin: "https://admin.example.com",
      primaryAppOrigin: config.primaryAppOrigin,
      isAllowedOriginFn: (candidate) =>
        isAllowedOrigin({
          origin: candidate,
          allowedOrigins: config.allowedOrigins,
          isProduction: true,
        }),
    });

    expect(origin).toBe("https://admin.example.com");
  });

  it("falls back to the primary app origin when session and request origins are invalid", () => {
    const config = buildOriginConfig({
      appOriginEnv: "https://site.example.com",
      isProduction: true,
    });
    const origin = resolveAuthAppOrigin({
      req: {
        headers: { referer: "https://evil.example.com/login" },
        protocol: "https",
      },
      sessionOrigin: "https://admin.example.com",
      primaryAppOrigin: config.primaryAppOrigin,
      isAllowedOriginFn: (candidate) =>
        isAllowedOrigin({
          origin: candidate,
          allowedOrigins: config.allowedOrigins,
          isProduction: true,
        }),
    });

    expect(origin).toBe("https://site.example.com");
  });
});
