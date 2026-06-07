import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cssSource = readFileSync(resolve(process.cwd(), "src/components/HeroSection.css"), "utf8");

describe("hero carousel target size contract", () => {
  it("keeps carousel indicators at least 24px wide and tall", () => {
    const indicatorRule = cssSource.match(/\.hero-home__indicator\s*\{[^}]+\}/)?.[0] || "";

    expect(indicatorRule).toContain("width: 1.5rem;");
    expect(indicatorRule).toContain("height: 1.5rem;");
  });

  it("keeps the current indicator visual styling on the pseudo element", () => {
    expect(cssSource).toContain(".hero-home__indicator::before");
    expect(cssSource).toContain(".hero-home__indicator--current::before");
  });
});
