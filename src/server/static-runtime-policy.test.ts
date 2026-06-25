import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  hasHashedAssetName,
  setStaticCacheHeaders,
  STATIC_IMMUTABLE_CACHE_CONTROL,
} from "../../server/lib/static-runtime-policy.js";

describe("static runtime policy", () => {
  it("recognizes Vite and Astro hashed asset names", () => {
    expect(hasHashedAssetName("index-abc12345.js")).toBe(true);
    expect(hasHashedAssetName("client.DpdUz5kO.js")).toBe(true);
    expect(hasHashedAssetName("client.js")).toBe(false);
  });

  it("marks hashed Astro assets as immutable", () => {
    const setHeader = vi.fn();

    setStaticCacheHeaders(
      { setHeader },
      path.join("app", "dist-astro", "client", "_astro", "client.DpdUz5kO.js"),
    );

    expect(setHeader).toHaveBeenCalledWith("Cache-Control", STATIC_IMMUTABLE_CACHE_CONTROL);
  });
});

