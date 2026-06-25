import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
type BootstrapWindow = Window &
  typeof globalThis & {
    __BOOTSTRAP_PUBLIC__?: unknown;
  };

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const createJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const loadHookModule = async () => {
  vi.resetModules();
  return await import("@/hooks/use-public-bootstrap");
};

describe("usePublicBootstrap store", () => {
  beforeEach(() => {
    vi.useRealTimers();
    apiFetchMock.mockReset();
    delete (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__;
  });

  it("deduplica fetch concorrente entre consumidores", async () => {
    const requestState = {
      resolve: null as ((response: Response) => void) | null,
    };
    apiFetchMock.mockImplementation(
      async () =>
        await new Promise<Response>((resolve) => {
          requestState.resolve = resolve;
        }),
    );

    const { usePublicBootstrap } = await loadHookModule();

    const Harness = ({ testId }: { testId: string }) => {
      const { data } = usePublicBootstrap();
      return <div data-testid={testId}>{data?.projects?.[0]?.title || "none"}</div>;
    };

    render(
      <>
        <Harness testId="hook-a" />
        <Harness testId="hook-b" />
      </>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const completeRequest = requestState.resolve;
    if (!completeRequest) {
      throw new Error("Expected pending bootstrap request");
    }
    completeRequest(
      createJsonResponse(true, {
        settings: {},
        pages: {},
        projects: [{ id: "project-a", title: "Projeto A" }],
        posts: [],
        updates: [],
        mediaVariants: {},
        tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
        generatedAt: "2026-03-05T00:00:00.000Z",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("hook-a")).toHaveTextContent("Projeto A");
      expect(screen.getByTestId("hook-b")).toHaveTextContent("Projeto A");
    });
  });

  it("revalida quando o cache fica stale e atualiza com novo payload", async () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValue(1_000);
    apiFetchMock
      .mockResolvedValueOnce(
        createJsonResponse(true, {
          settings: {},
          pages: {},
          projects: [{ id: "project-1", title: "Projeto 1" }],
          posts: [],
          updates: [],
          mediaVariants: {},
          tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
          generatedAt: "2026-03-05T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(true, {
          settings: {},
          pages: {},
          projects: [{ id: "project-2", title: "Projeto 2" }],
          posts: [],
          updates: [],
          mediaVariants: {},
          tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
          generatedAt: "2026-03-05T00:01:00.000Z",
        }),
      );

    const { usePublicBootstrap } = await loadHookModule();

    const Harness = () => {
      const { data, isLoading } = usePublicBootstrap();
      return (
        <div data-testid="hook">
          {data?.projects?.[0]?.title || "none"}|{isLoading ? "loading" : "idle"}
        </div>
      );
    };

    const firstRender = render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("hook")).toHaveTextContent("Projeto 1|idle");
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    firstRender.unmount();

    dateNowSpy.mockReturnValue(61_100);

    render(<Harness />);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("hook")).toHaveTextContent("Projeto 2|idle");
    });
  });

  it("preserva dados anteriores quando refetch falha por erro de rede", async () => {
    apiFetchMock
      .mockResolvedValueOnce(
        createJsonResponse(true, {
          settings: {},
          pages: {},
          projects: [{ id: "project-1", title: "Projeto Inicial" }],
          posts: [],
          updates: [],
          mediaVariants: {},
          tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
          generatedAt: "2026-03-05T00:00:00.000Z",
        }),
      )
      .mockRejectedValueOnce(new Error("network_fail"));

    const { usePublicBootstrap } = await loadHookModule();

    const Harness = () => {
      const { data, error, refetch } = usePublicBootstrap();
      return (
        <div>
          <div data-testid="title">{data?.projects?.[0]?.title || "none"}</div>
          <div data-testid="error">{error?.message || ""}</div>
          <button type="button" onClick={() => void refetch().catch(() => undefined)}>
            refetch
          </button>
        </div>
      );
    };

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("title")).toHaveTextContent("Projeto Inicial");
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "refetch" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("error")).toHaveTextContent("network_fail");
    });
    expect(screen.getByTestId("title")).toHaveTextContent("Projeto Inicial");
  });

  it("revalida imediatamente quando o bootstrap inicial vem em modo critical-home", async () => {
    apiFetchMock.mockResolvedValueOnce(
      createJsonResponse(true, {
        settings: {},
        pages: { home: {} },
        projects: [{ id: "project-full", title: "Projeto Completo" }],
        posts: [],
        updates: [],
        mediaVariants: {},
        tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
        generatedAt: "2026-03-05T00:01:00.000Z",
        payloadMode: "full",
      }),
    );

    const { primePublicBootstrapCache, usePublicBootstrap } = await loadHookModule();
    primePublicBootstrapCache({
      settings: {},
      pages: { home: {} },
      projects: [
        {
          id: "project-critical",
          title: "Projeto Critico",
        },
      ],
      posts: [],
      updates: [],
      mediaVariants: {},
      tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
      generatedAt: "2026-03-05T00:00:00.000Z",
      payloadMode: "critical-home",
    });

    const Harness = () => {
      const { data, isHydratingFullPayload } = usePublicBootstrap();
      return (
        <div data-testid="hook">
          {data?.projects?.[0]?.title || "none"}|{isHydratingFullPayload ? "hydrating" : "full"}
        </div>
      );
    };

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("hook")).toHaveTextContent("Projeto Completo|full");
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("revalida imediatamente quando o bootstrap inicial vem em modo shell", async () => {
    apiFetchMock.mockResolvedValueOnce(
      createJsonResponse(true, {
        settings: {},
        pages: { donations: { heroTitle: "Doacoes completas" } },
        projects: [{ id: "project-full", title: "Projeto Completo" }],
        posts: [],
        updates: [],
        mediaVariants: {},
        tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
        generatedAt: "2026-03-05T00:01:00.000Z",
        payloadMode: "full",
      }),
    );

    const { primePublicBootstrapCache, usePublicBootstrap } = await loadHookModule();
    primePublicBootstrapCache({
      settings: {},
      pages: { donations: {} },
      projects: [],
      posts: [],
      updates: [],
      mediaVariants: {},
      tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
      generatedAt: "2026-03-05T00:00:00.000Z",
      payloadMode: "shell",
    });

    const Harness = () => {
      const { data, isHydratingFullPayload } = usePublicBootstrap();
      return (
        <div data-testid="hook">
          {data?.pages?.donations?.heroTitle || "none"}|
          {isHydratingFullPayload ? "hydrating" : "full"}
        </div>
      );
    };

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("hook")).toHaveTextContent("Doacoes completas|full");
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserva inProgressItems ao normalizar o payload buscado", async () => {
    apiFetchMock.mockResolvedValueOnce(
      createJsonResponse(true, {
        settings: {},
        pages: {},
        projects: [],
        inProgressItems: [
          {
            projectId: "project-ln",
            projectTitle: "NouKin",
            projectType: "Light Novel",
            number: 3,
            volume: 0,
            progressStage: "traducao",
            completedStages: ["aguardando-raw"],
          },
        ],
        posts: [],
        updates: [],
        mediaVariants: {},
        tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
        generatedAt: "2026-03-05T00:00:00.000Z",
      }),
    );

    const { usePublicBootstrap } = await loadHookModule();

    const Harness = () => {
      const { data } = usePublicBootstrap();
      const item = data?.inProgressItems?.[0];
      return (
        <div data-testid="item">
          {item ? `${item.projectTitle}|${item.number}|${item.volume ?? "sem-volume"}` : "none"}
        </div>
      );
    };

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("item")).toHaveTextContent("NouKin|3|0");
    });
  });

  it("expõe lastFetchedAt e só revalida quando a idade mínima expira", async () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValue(10_000);
    apiFetchMock
      .mockResolvedValueOnce(
        createJsonResponse(true, {
          settings: {},
          pages: {},
          projects: [{ id: "project-1", title: "Projeto Inicial" }],
          posts: [],
          updates: [],
          mediaVariants: {},
          tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
          generatedAt: "2026-03-05T00:00:00.000Z",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(true, {
          settings: {},
          pages: {},
          projects: [{ id: "project-2", title: "Projeto Atualizado" }],
          posts: [],
          updates: [],
          mediaVariants: {},
          tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
          generatedAt: "2026-03-05T00:01:00.000Z",
        }),
      );

    const {
      getPublicBootstrapLastFetchedAt,
      refreshPublicBootstrapCacheIfStale,
      usePublicBootstrap,
    } = await loadHookModule();

    const Harness = () => {
      const { data, lastFetchedAt } = usePublicBootstrap();
      return (
        <div data-testid="hook">
          {data?.projects?.[0]?.title || "none"}|{String(lastFetchedAt)}
        </div>
      );
    };

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId("hook")).toHaveTextContent("Projeto Inicial|10000");
    });

    expect(getPublicBootstrapLastFetchedAt()).toBe(10_000);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    dateNowSpy.mockReturnValue(20_000);
    await refreshPublicBootstrapCacheIfStale({
      apiBase: "http://api.local",
      minAgeMs: 15_000,
    });
    expect(apiFetchMock).toHaveBeenCalledTimes(1);

    dateNowSpy.mockReturnValue(26_000);
    await refreshPublicBootstrapCacheIfStale({
      apiBase: "http://api.local",
      minAgeMs: 15_000,
    });

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByTestId("hook")).toHaveTextContent("Projeto Atualizado|26000");
    });
  });

  it("promove payload partial mesmo quando o cache ainda nao esta stale", async () => {
    const dateNowSpy = vi.spyOn(Date, "now");
    dateNowSpy.mockReturnValue(10_000);
    apiFetchMock.mockResolvedValueOnce(
      createJsonResponse(true, {
        settings: { theme: { accent: "#08D6FF", mode: "dark" } },
        pages: {},
        projects: [{ id: "project-full", title: "Projeto Completo" }],
        posts: [{ id: "post-1", title: "Post Completo" }],
        updates: [],
        mediaVariants: {},
        tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
        generatedAt: "2026-03-05T00:01:00.000Z",
        payloadMode: "full",
      }),
    );

    const { primePublicBootstrapCache, refreshPublicBootstrapCacheIfStale } =
      await loadHookModule();
    primePublicBootstrapCache({
      settings: { theme: { accent: "#08D6FF", mode: "dark" } },
      pages: {},
      projects: [{ id: "project-critical", title: "Projeto Critico" }],
      posts: [],
      updates: [],
      mediaVariants: {},
      tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
      generatedAt: "2026-03-05T00:00:00.000Z",
      payloadMode: "critical-home",
    });

    const payload = await refreshPublicBootstrapCacheIfStale({
      apiBase: "http://api.local",
      minAgeMs: 60_000,
    });

    expect(apiFetchMock).toHaveBeenCalledWith("http://api.local", "/api/public/bootstrap");
    expect(payload.payloadMode).toBe("full");
    expect(payload.posts).toEqual([expect.objectContaining({ id: "post-1" })]);
    expect(payload.settings.theme?.accent).toBe("#08D6FF");
  });
});
