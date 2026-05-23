import { defaultSettings, mergeSettings } from "@/hooks/site-settings-context";
import type { SiteSettings } from "@/types/site-settings";
import { fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import PublicChromeIsland from "../../src-astro/components/react/PublicChromeIsland";

vi.mock("@/components/Header", async () => {
  const { useGlobalShortcuts } = await import("@/hooks/use-global-shortcuts");

  return {
    default: ({ variant }: { variant?: "fixed" | "static" }) => {
      useGlobalShortcuts({
        getDashboardHref: () => "/dashboard",
      });
      return <header className={variant === "fixed" ? "fixed top-0" : ""}>NEKOMATA</header>;
    },
  };
});

vi.mock("@/components/Footer", () => ({
  default: () => (
    <footer>
      <a href="/recrutamento">Recrutamento</a>
      <a href="/termos-de-uso">Termos de Uso</a>
      <span>Política de Privacidade</span>
    </footer>
  ),
}));

const createSettings = (override: Partial<SiteSettings> = {}) =>
  mergeSettings(defaultSettings, override);

describe("PublicChromeIsland", () => {
  it("server-renders the public header", () => {
    const html = renderToString(
      <PublicChromeIsland
        kind="header"
        location="/sobre"
        initialCurrentUser={null}
        initialPublicBootstrap={null}
        initialPublicRoutePayload={null}
        initialSettings={createSettings()}
      />,
    );

    expect(html).toContain("fixed top-0");
    expect(html).toContain("NEKOMATA");
  });

  it("server-renders the public footer with configured legal links", () => {
    const html = renderToString(
      <PublicChromeIsland
        kind="footer"
        location="/faq"
        initialCurrentUser={null}
        initialPublicBootstrap={null}
        initialPublicRoutePayload={null}
        initialSettings={createSettings()}
      />,
    );

    expect(html).toContain("Recrutamento");
    expect(html).toContain("Termos de Uso");
    expect(html).toContain("Pol");
  });

  it("navega por documento para a dashboard com g seguido de d no header publico", () => {
    const navigateToHref = vi.fn();

    render(
      <PublicChromeIsland
        kind="header"
        location="/sobre"
        initialCurrentUser={null}
        initialPublicBootstrap={null}
        initialPublicRoutePayload={null}
        initialSettings={createSettings()}
        navigateToHref={navigateToHref}
      />,
    );

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });

    expect(navigateToHref).toHaveBeenCalledWith("/dashboard");
  });
});
