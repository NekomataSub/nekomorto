import { describe, expect, it } from "vitest";

import {
  buildAuthRedirectUrl,
  saveSessionState,
} from "../../server/lib/session-auth.js";

describe("session-auth", () => {
  it("saves the current session state when save() succeeds", async () => {
    const req = {
      session: {
        save: (callback: (error?: Error | null) => void) => {
          callback(null);
        },
      },
    };

    await expect(saveSessionState(req)).resolves.toBeUndefined();
  });

  it("throws when session save fails", async () => {
    const req = {
      session: {
        save: (callback: (error?: Error | null) => void) => {
          callback(new Error("persist_failed"));
        },
      },
    };

    await expect(saveSessionState(req)).rejects.toThrow("persist_failed");
  });

  it("throws when there is no session to save", async () => {
    await expect(saveSessionState({})).rejects.toThrow("session_unavailable");
  });
});

describe("buildAuthRedirectUrl", () => {
  it("builds login error redirects on the same app origin", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "/login",
        searchParams: { error: "state_mismatch" },
      }),
    ).toBe("http://localhost:5173/login?error=state_mismatch");
  });

  it("builds success redirects preserving the requested dashboard path", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "/dashboard/posts",
      }),
    ).toBe("http://localhost:5173/dashboard/posts");
  });

  it("builds MFA redirects on the same app origin", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "/login",
        searchParams: {
          mfa: "required",
          next: "/dashboard/posts",
        },
      }),
    ).toBe("http://localhost:5173/login?mfa=required&next=%2Fdashboard%2Fposts");
  });

  it("keeps existing query parameters when building redirects", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "/dashboard/posts?tab=scheduled",
      }),
    ).toBe("http://localhost:5173/dashboard/posts?tab=scheduled");
  });

  it("rejects protocol-relative redirect paths", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "//evil.example/path",
      }),
    ).toBe("http://localhost:5173/");
  });

  it("rejects backslash redirect paths", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: String.raw`/\evil.example`,
      }),
    ).toBe("http://localhost:5173/");
  });

  it("rejects absolute redirect paths", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "https://evil.example/x",
      }),
    ).toBe("http://localhost:5173/");
  });

  it("preserves safe internal path search and hash", () => {
    expect(
      buildAuthRedirectUrl({
        appOrigin: "http://localhost:5173",
        path: "/dashboard?tab=x#profile",
      }),
    ).toBe("http://localhost:5173/dashboard?tab=x#profile");
  });
});
