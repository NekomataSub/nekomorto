import { act } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyPublicBootstrapPayload } from "@/types/public-bootstrap";
import PublicProjectDetailIsland from "../../src-astro/components/react/PublicProjectDetailIsland";

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      generatedAt: "2026-05-29T00:00:00.000Z",
      payloadMode: "full",
    }),
  })),
}));

vi.mock("@/components/PublicScrollToTop", () => ({
  default: () => null,
}));

vi.mock("@/pages/Project", async () => {
  const { usePublicDocumentLocation } = await vi.importActual<
    typeof import("@/lib/public-document-navigation")
  >("@/lib/public-document-navigation");

  return {
    default: ({
      initialPath,
      renderHero,
      slug,
    }: {
      initialPath?: string;
      renderHero?: boolean;
      slug?: string;
    }) => {
      const location = usePublicDocumentLocation(initialPath);

      return (
        <main data-testid="mock-project-detail">
          {location.pathname}:{slug}:{String(renderHero)}
        </main>
      );
    },
  };
});

describe("PublicProjectDetailIsland hydration", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
    vi.restoreAllMocks();
  });

  it("hydrates with the Astro initialPath snapshot even when window.location differs before hydration", async () => {
    const element = (
      <PublicProjectDetailIsland
        initialCurrentUser={null}
        initialPath="/projeto/gabriel-dropout"
        initialPublicBootstrap={{
          ...emptyPublicBootstrapPayload,
          generatedAt: "2026-05-29T00:00:00.000Z",
          payloadMode: "full",
        }}
        initialPublicRoutePayload={null}
        initialSettings={null}
        slug="gabriel-dropout"
      />
    );
    const container = document.createElement("div");
    window.history.replaceState(null, "", "/projetos?tag=acao");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    window.history.replaceState(null, "", "/projeto/gabriel-dropout");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(container).toHaveTextContent("/projeto/gabriel-dropout:gabriel-dropout:false");
    expect(
      consoleError.mock.calls.some((call) =>
        call.some((entry) => String(entry).toLowerCase().includes("hydration")),
      ),
    ).toBe(false);

    await act(async () => {
      root?.unmount();
    });
    container.remove();
  });
});
