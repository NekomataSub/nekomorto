import { describe, expect, it } from "vitest";

import { resolvePublicRouteModulePreloads } from "../../server/lib/client-build-manifest.js";

describe("client build manifest public route preloads", () => {
  it("keeps home modulepreload limited to the route entry", () => {
    const preloads = resolvePublicRouteModulePreloads({
      pathname: "/",
      manifest: {
        "src/pages/Index.tsx": {
          file: "assets/index.js",
          imports: ["src/pages/Login.tsx", "src/pages/ProjectReading.tsx"],
        },
        "src/pages/Login.tsx": {
          file: "assets/login.js",
        },
        "src/pages/ProjectReading.tsx": {
          file: "assets/project-reading.js",
        },
      },
    });

    expect(preloads).toEqual([
      {
        rel: "modulepreload",
        href: "/assets/index.js",
        crossorigin: "anonymous",
      },
    ]);
  });

  it("keeps recursive dependency preloads for non-home public routes", () => {
    const preloads = resolvePublicRouteModulePreloads({
      pathname: "/projetos",
      manifest: {
        "src/pages/Projects.tsx": {
          file: "assets/projects.js",
          imports: ["src/components/project/PublicProjectCard.tsx"],
        },
        "src/components/project/PublicProjectCard.tsx": {
          file: "assets/public-project-card.js",
        },
      },
    });

    expect(preloads).toEqual([
      expect.objectContaining({ href: "/assets/projects.js" }),
      expect.objectContaining({ href: "/assets/public-project-card.js" }),
    ]);
  });
});
