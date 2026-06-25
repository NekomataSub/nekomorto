import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const readPage = (relativePath: string) =>
  readFileSync(path.resolve(process.cwd(), relativePath), "utf8");

describe("public Astro hydration directives", () => {
  it.each(["src-astro/pages/index.astro", "src-astro/pages/projetos/index.astro"])(
    "hydrates the interactive page on load: %s",
    (relativePath) => {
      const source = readPage(relativePath);

      expect(source).toContain("client:load");
      expect(source).not.toContain("client:idle");
    },
  );

  it("keeps the projects Astro route seeded with a catalog payload", () => {
    const source = readPage("server/index.js");

    expect(source).toContain('if (routeKind === "projects-list")');
    expect(source).toContain("serializePublicProjectCatalog(getPublicVisibleProjects())");
    expect(source).toContain('kind: "projects-list"');
    expect(source).not.toContain('if (routeKind === "projects-list") {\n          return null;');
  });
});
