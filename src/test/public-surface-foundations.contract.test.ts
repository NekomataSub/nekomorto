import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoFile = (relativePath: string) => path.resolve(process.cwd(), relativePath);
const readRepoFile = (relativePath: string) => readFileSync(repoFile(relativePath), "utf8");

describe("public surface foundations", () => {
  it("keeps skip navigation available in Astro and SPA layouts", () => {
    const astroLayout = readRepoFile("src-astro/layouts/PublicLayout.astro");
    const spaLayout = readRepoFile("src/components/PublicLayout.tsx");
    const css = readRepoFile("src/index.css");

    for (const layout of [astroLayout, spaLayout]) {
      expect(layout).toContain("public-skip-link");
      expect(layout).toContain("#public-main-content");
      expect(layout).toContain("Pular para o conteúdo");
    }
    expect(css).toContain(".public-skip-link:focus-visible");
  });

  it("defers below-the-fold rendering without removing content from the document", () => {
    const releasesSection = readRepoFile("src/components/ReleasesSection.tsx");
    const css = readRepoFile("src/index.css");

    expect(releasesSection).toContain("public-below-fold");
    expect(css).toContain("content-visibility: auto;");
    expect(css).toContain("contain-intrinsic-block-size: auto 80rem;");
  });

  it("preloads the primary local font from the Astro document", () => {
    const astroLayout = readRepoFile("src-astro/layouts/PublicLayout.astro");

    expect(astroLayout).toContain('rel="preload"');
    expect(astroLayout).toContain('href="/fonts/inter/InterLatin.woff2"');
    expect(astroLayout).toContain('type="font/woff2"');
  });

  it("keeps heavy editor and chart dependencies outside critical entries", () => {
    const astroConfig = readRepoFile("astro.config.mjs");
    const viteConfig = readRepoFile("vite.config.ts");
    const homeBuildGuard = readRepoFile("scripts/check-home-build.mjs");

    expect(astroConfig).not.toContain("manualChunks");
    expect(viteConfig).toContain("includeDependenciesRecursively: false");
    expect(viteConfig).toContain('name: "react-core"');
    expect(homeBuildGuard).toContain("index.html contém modulepreload de editor ou gráficos");
    expect(homeBuildGuard).toContain("island Astro crítico importa editor ou gráficos");
  });
});
