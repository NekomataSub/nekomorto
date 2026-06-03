import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cssPath = path.resolve(process.cwd(), "src/index.css");
const cssSource = readFileSync(cssPath, "utf8");

describe("scrollbar gutter contract", () => {
  it("reserves a stable gutter only for dashboard-scoped shells", () => {
    expect(cssSource).toMatch(
      /html\.dashboard-scrollbar-gutter-stable,\s*body\.dashboard-scrollbar-gutter-stable\s*\{[\s\S]*scrollbar-gutter:\s*stable;/,
    );
  });

  it("reserves a stable gutter for public surfaces only when the public-scoped class is present", () => {
    expect(cssSource).toMatch(
      /html\.public-scrollbar-gutter-stable,\s*html\.public-scrollbar-gutter-stable body,\s*body\.public-scrollbar-gutter-stable\s*\{[\s\S]*scrollbar-gutter:\s*stable;/,
    );
  });

  it("does not reserve symmetric global gutter space on the root document", () => {
    expect(cssSource).not.toContain("scrollbar-gutter: stable both-edges");
  });

  it("does not force permanent root vertical scroll as a fallback", () => {
    expect(cssSource).not.toMatch(
      /@supports not \(scrollbar-gutter: stable\)[\s\S]*overflow-y: scroll;/,
    );
  });

  it("keeps react-remove-scroll body margin compensation intact", () => {
    expect(cssSource).not.toMatch(
      /body\[data-scroll-locked\]\s*\{[^}]*margin-right\s*:\s*0\s*!important/i,
    );
  });

  it("compensates dashboard fixed-right elements while body scroll is locked", () => {
    expect(cssSource).toContain("body[data-scroll-locked] .dashboard-scroll-lock-fixed-right");
    expect(cssSource).toContain("right: var(--removed-body-scroll-bar-size, 0px) !important;");
  });
});
