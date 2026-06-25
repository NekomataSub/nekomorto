import { act, fireEvent, screen } from "@testing-library/react";
import { useState } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { emptyPublicBootstrapPayload } from "@/types/public-bootstrap";
import PublicProjectsIsland from "../../src-astro/components/react/PublicProjectsIsland";

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      settings: {},
      pages: {},
      projects: [],
      inProgressItems: [],
      posts: [],
      updates: [],
      teamMembers: [],
      teamLinkTypes: [],
      mediaVariants: {},
      tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
      payloadMode: "full",
    }),
  })),
}));

vi.mock("@/components/PublicScrollToTop", () => ({
  default: () => null,
}));

vi.mock("@/pages/Projects", () => ({
  default: () => {
    const [count, setCount] = useState(0);
    return (
      <button type="button" onClick={() => setCount((current) => current + 1)}>
        Projetos hidratados: {count}
      </button>
    );
  },
}));

describe("PublicProjectsIsland hydration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates interactions without an initial bootstrap or route payload", async () => {
    const element = (
      <PublicProjectsIsland
        initialCurrentUser={null}
        initialPath="/projetos"
        initialPublicBootstrap={null}
        initialPublicRoutePayload={null}
        initialSettings={emptyPublicBootstrapPayload.settings}
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, element);
    });
    fireEvent.click(screen.getByRole("button", { name: "Projetos hidratados: 0" }));

    expect(screen.getByRole("button", { name: "Projetos hidratados: 1" })).toBeInTheDocument();
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
