import { act, waitFor } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resetPublicBootstrapCache,
  usePublicBootstrap,
} from "@/hooks/use-public-bootstrap";
import { emptyPublicBootstrapPayload, type PublicBootstrapPayload } from "@/types/public-bootstrap";
import PublicHomeIsland from "../../src-astro/components/react/PublicHomeIsland";

type BootstrapWindow = Window &
  typeof globalThis & {
    __BOOTSTRAP_PUBLIC__?: unknown;
  };

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/components/PublicScrollToTop", () => ({
  default: () => null,
}));

vi.mock("@/pages/Index", () => ({
  default: () => {
    const { data } = usePublicBootstrap();
    return <main data-testid="mock-home">{data?.projects?.[0]?.title || "none"}</main>;
  },
}));

const publicBootstrap = {
  ...emptyPublicBootstrapPayload,
  projects: [
    {
      id: "project-hydration",
      title: "Projeto Hidratado",
    } as PublicBootstrapPayload["projects"][number],
  ],
  generatedAt: "2026-05-29T00:00:00.000Z",
  payloadMode: "full",
} satisfies PublicBootstrapPayload;

const criticalPublicBootstrap = {
  ...emptyPublicBootstrapPayload,
  projects: [
    {
      id: "project-critical",
      title: "Projeto Crítico",
    } as PublicBootstrapPayload["projects"][number],
  ],
  generatedAt: "2026-05-29T00:00:00.000Z",
  payloadMode: "critical-home",
} satisfies PublicBootstrapPayload;

describe("PublicHomeIsland hydration", () => {
  beforeEach(() => {
    delete (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__;
    resetPublicBootstrapCache();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    delete (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__;
    vi.restoreAllMocks();
  });

  it("hydrates with the same bootstrap snapshot serialized by Astro props", async () => {
    const element = (
      <PublicHomeIsland
        initialCurrentUser={null}
        initialPath="/"
        initialPublicBootstrap={publicBootstrap}
        initialPublicRoutePayload={null}
        initialSettings={null}
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__ = publicBootstrap;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, element);
    });

    expect(container).toHaveTextContent("Projeto Hidratado");
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

  it("promotes the critical home snapshot after hydration fetches the full bootstrap", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...emptyPublicBootstrapPayload,
        projects: [{ id: "project-full", title: "Projeto Completo" }],
        generatedAt: "2026-05-29T00:01:00.000Z",
        payloadMode: "full",
      }),
    });
    const element = (
      <PublicHomeIsland
        initialCurrentUser={null}
        initialPath="/"
        initialPublicBootstrap={criticalPublicBootstrap}
        initialPublicRoutePayload={null}
        initialSettings={null}
      />
    );
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__ = criticalPublicBootstrap;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    let root: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => {
      root = hydrateRoot(container, element);
    });

    await waitFor(() => {
      expect(container).toHaveTextContent("Projeto Completo");
    });
    expect(apiFetchMock).toHaveBeenCalledWith("", "/api/public/bootstrap");
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
