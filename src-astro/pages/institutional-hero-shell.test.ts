import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readPageSource = (filename: string) =>
  readFileSync(new URL(`./${filename}`, import.meta.url), "utf8");

describe("institutional Astro hero shell", () => {
  it("keeps the team hero in the Astro page shell", () => {
    const source = readPageSource("equipe.astro");

    expect(source).toContain('import PublicPageHero from "../components/PublicPageHero.astro"');
    expect(source).toContain("<PublicPageHero");
    expect(source).toContain("badge={teamPage.heroBadge}");
    expect(source).toContain("title={teamPage.heroTitle}");
    expect(source).toContain("subtitle={teamPage.heroSubtitle}");
  });

  it("keeps the donations hero in the Astro page shell", () => {
    const source = readPageSource("doacoes.astro");

    expect(source).toContain('import PublicPageHero from "../components/PublicPageHero.astro"');
    expect(source).toContain("<PublicPageHero");
    expect(source).toContain("title={donations.heroTitle}");
    expect(source).toContain("subtitle={donations.heroSubtitle}");
  });

  it("keeps the about hero in the Astro page shell", () => {
    const source = readPageSource("sobre.astro");

    expect(source).toContain('import PublicPageHero from "../components/PublicPageHero.astro"');
    expect(source).toContain("<PublicPageHero");
    expect(source).toContain("badge={about.heroBadge}");
    expect(source).toContain("title={about.heroTitle}");
    expect(source).toContain("subtitle={about.heroSubtitle}");
  });

  it("keeps the FAQ hero in the Astro page shell", () => {
    const source = readPageSource("faq.astro");

    expect(source).toContain('import PublicPageHero from "../components/PublicPageHero.astro"');
    expect(source).toContain("<PublicPageHero");
    expect(source).toContain("title={faq.heroTitle}");
    expect(source).toContain("subtitle={faq.heroSubtitle}");
  });

  it("keeps the recruitment hero and content in the Astro page shell", () => {
    const source = readPageSource("recrutamento.astro");

    expect(source).toContain('import PublicPageHero from "../components/PublicPageHero.astro"');
    expect(source).toContain("<PublicPageHero");
    expect(source).toContain("badge={recruitment.heroBadge}");
    expect(source).toContain("title={recruitment.heroTitle}");
    expect(source).toContain("subtitle={recruitment.heroSubtitle}");
    expect(source).toContain("recruitment.roles.length > 0");
  });

  it("keeps the project hero in the Astro page shell and disables the duplicate island hero", () => {
    const source = readPageSource("projeto/[slug].astro");

    expect(source).toContain(
      'import ProjectHero from "../../../src/components/project/ProjectHero"',
    );
    expect(source).toContain("<ProjectHero");
    expect(source).toContain("renderHero={!renderAstroHero}");
  });
});
