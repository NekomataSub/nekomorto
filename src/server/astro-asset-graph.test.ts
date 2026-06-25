import { describe, expect, it } from "vitest";

import {
  extractAstroAssetUrls,
  extractAstroModuleImportUrls,
} from "../../scripts/lib/astro-asset-graph.mjs";

describe("Astro asset graph smoke helpers", () => {
  it("extracts Astro assets from HTML without including unrelated assets", () => {
    const html = `
      <link rel="stylesheet" href="/_astro/page.hash123.css">
      <astro-island component-url="/_astro/PublicHomeIsland.hash456.js"></astro-island>
      <script src="/assets/legacy.js"></script>
    `;

    expect(extractAstroAssetUrls(html, "https://nekomata.moe/")).toEqual([
      "https://nekomata.moe/_astro/page.hash123.css",
      "https://nekomata.moe/_astro/PublicHomeIsland.hash456.js",
    ]);
  });

  it("resolves static and dynamic relative module imports", () => {
    const source = `
      import { hydrate } from "./client.hash123.js";
      import("./lazy.hash456.js");
      import "./side-effect.hash789.js";
      import external from "react";
    `;

    expect(
      extractAstroModuleImportUrls(
        source,
        "https://nekomata.moe/_astro/PublicHomeIsland.entry123.js",
      ),
    ).toEqual([
      "https://nekomata.moe/_astro/client.hash123.js",
      "https://nekomata.moe/_astro/lazy.hash456.js",
      "https://nekomata.moe/_astro/side-effect.hash789.js",
    ]);
  });
});

