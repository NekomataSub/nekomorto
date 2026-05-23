import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SiteSettingsProvider } from "@/hooks/site-settings-provider";
import { useSiteSettings } from "@/hooks/use-site-settings";

const apiFetchMock = vi.hoisted(() => vi.fn());
const useResolvedPublicBootstrapMock = vi.hoisted(() =>
  vi.fn<() => Record<string, unknown> | null>(() => null),
);

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/hooks/public-bootstrap-provider", async () => {
  const actual = await vi.importActual("@/hooks/public-bootstrap-provider");
  return {
    ...actual,
    useResolvedPublicBootstrap: () => useResolvedPublicBootstrapMock(),
  };
});

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const Consumer = () => {
  const { isLoading, settings } = useSiteSettings();
  return (
    <div>
      <span data-testid="loading-state">{isLoading ? "loading" : "idle"}</span>
      <span data-testid="site-name">{settings.site?.name || ""}</span>
    </div>
  );
};

describe("SiteSettingsProvider initiallyLoaded", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    useResolvedPublicBootstrapMock.mockReset();
    useResolvedPublicBootstrapMock.mockReturnValue(null);
  });

  it("revalida via /api/public/bootstrap quando initiallyLoaded=true", async () => {
    apiFetchMock.mockResolvedValue(
      mockJsonResponse(true, {
        settings: {
          site: { name: "Nekomata API" },
        },
      }),
    );

    render(
      <SiteSettingsProvider initialSettings={{ site: { name: "Nekomata" } } as any} initiallyLoaded>
        <Consumer />
      </SiteSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("idle");
    });
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("", "/api/public/bootstrap");
    });
    expect(screen.getByTestId("site-name")).toHaveTextContent("Nekomata");
  });

  it("carrega configuracoes quando inicialmente nao carregado", async () => {
    apiFetchMock.mockResolvedValue(
      mockJsonResponse(true, {
        settings: {
          site: { name: "Nekomata API" },
        },
      }),
    );

    render(
      <SiteSettingsProvider>
        <Consumer />
      </SiteSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("site-name")).toHaveTextContent("Nekomata API");
    });
  });

  it("nao reaplica tokens do tema quando as mesmas configuracoes entram novamente", async () => {
    const setPropertySpy = vi.spyOn(document.documentElement.style, "setProperty");
    const initialSettings = {
      site: { name: "Nekomata" },
      theme: { accent: "#34A853", mode: "dark" },
    } as any;
    useResolvedPublicBootstrapMock.mockReturnValue({
      payloadMode: "full",
      settings: initialSettings,
    });

    const view = render(
      <SiteSettingsProvider initialSettings={initialSettings} initiallyLoaded>
        <Consumer />
      </SiteSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("idle");
    });

    setPropertySpy.mockClear();

    view.rerender(
      <SiteSettingsProvider initialSettings={initialSettings} initiallyLoaded>
        <Consumer />
      </SiteSettingsProvider>,
    );

    await Promise.resolve();
    expect(setPropertySpy).not.toHaveBeenCalled();
  });

  it("nao revalida quando o bootstrap inicial ja vem completo", async () => {
    useResolvedPublicBootstrapMock.mockReturnValue({
      payloadMode: "full",
      settings: {
        site: { name: "Nekomata Bootstrap" },
      },
    });

    render(
      <SiteSettingsProvider initialSettings={{ site: { name: "Nekomata" } } as any} initiallyLoaded>
        <Consumer />
      </SiteSettingsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("idle");
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
