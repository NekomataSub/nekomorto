import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Header from "@/components/Header";
import { GlobalShortcutsProvider } from "@/hooks/global-shortcuts-provider";
import { defaultSettings, mergeSettings } from "@/hooks/site-settings-context";
import { uiCopy } from "@/lib/ui-copy";
import type { SiteSettings } from "@/types/site-settings";

const apiFetchMock = vi.hoisted(() => vi.fn());
const useSiteSettingsMock = vi.hoisted(() => vi.fn());
const usePublicBootstrapMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const setThemePreferenceMock = vi.hoisted(() => vi.fn());
const scheduleOnBrowserLoadIdleMock = vi.hoisted(() => vi.fn());
const useIsMobileMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => useSiteSettingsMock(),
}));

vi.mock("@/hooks/use-public-bootstrap", () => ({
  usePublicBootstrap: () => usePublicBootstrapMock(),
}));

vi.mock("@/hooks/use-theme-mode", () => ({
  useThemeMode: () => ({
    globalMode: "dark",
    effectiveMode: "dark",
    preference: "global",
    isOverridden: false,
    setPreference: setThemePreferenceMock,
  }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => useIsMobileMock(),
}));

vi.mock("@/lib/browser-idle", () => ({
  scheduleOnBrowserLoadIdle: (
    callback: (deadline: IdleDeadline) => void,
    options?: { delayMs?: number },
  ) => scheduleOnBrowserLoadIdleMock(callback, options),
}));

vi.mock("@/lib/public-document-navigation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/public-document-navigation")>(
    "@/lib/public-document-navigation",
  );
  const router = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    usePublicDocumentLocation: () => {
      const location = router.useLocation();
      return {
        hash: location.hash,
        href: `${location.pathname}${location.search}${location.hash}`,
        pathname: location.pathname,
        search: location.search,
      };
    },
  };
});

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const createSettings = (override: Partial<SiteSettings> = {}) =>
  mergeSettings(defaultSettings, override);

const classTokens = (element: HTMLElement) =>
  String(element.className).split(/\s+/).filter(Boolean);
const setWindowScrollY = (value: number) => {
  Object.defineProperty(window, "scrollY", {
    value,
    configurable: true,
    writable: true,
  });
};

const setupApiMock = (options?: {
  logoutOk?: boolean;
  searchSuggestOk?: boolean;
  searchSuggestions?: unknown[];
  searchMediaVariants?: unknown;
}) => {
  const {
    logoutOk = true,
    searchSuggestOk = false,
    searchSuggestions = [],
    searchMediaVariants = {},
  } = options || {};
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(
    async (_apiBase: string, endpoint: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      if (endpoint === "/api/public/me" && method === "GET") {
        return mockJsonResponse(true, {
          user: {
            id: "user-1",
            name: "Admin",
            username: "admin",
            avatarUrl: null,
          },
        });
      }
      if (endpoint === "/api/logout" && method === "POST") {
        return mockJsonResponse(
          logoutOk,
          logoutOk ? { ok: true } : { error: "logout_failed" },
          logoutOk ? 200 : 500,
        );
      }
      if (endpoint.startsWith("/api/public/search/suggest?") && method === "GET") {
        if (searchSuggestOk) {
          return mockJsonResponse(true, {
            suggestions: searchSuggestions,
            mediaVariants: searchMediaVariants,
          });
        }
        return mockJsonResponse(false, { error: "search_suggest_failed" }, 500);
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    },
  );
};

const getSearchSuggestCalls = () =>
  apiFetchMock.mock.calls.filter((call) =>
    String(call[1] || "").startsWith("/api/public/search/suggest?"),
  );
const getPublicMeCalls = () =>
  apiFetchMock.mock.calls.filter((call) => String(call[1] || "") === "/api/public/me");
const getScheduleOnBrowserLoadIdleCallsByDelay = (delayMs: number) =>
  scheduleOnBrowserLoadIdleMock.mock.calls.filter((call) => {
    const options = (call[1] || {}) as { delayMs?: number };
    return Number(options.delayMs || 0) === delayMs;
  });

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-pathname">{location.pathname}</div>;
};

describe("Header mobile search layout", () => {
  beforeEach(() => {
    setWindowScrollY(0);
    window.history.replaceState(null, "", "/");
    setupApiMock();
    toastMock.mockReset();
    setThemePreferenceMock.mockReset();
    scheduleOnBrowserLoadIdleMock.mockReset();
    scheduleOnBrowserLoadIdleMock.mockImplementation(
      (callback: (deadline: IdleDeadline) => void) => {
        callback({
          didTimeout: false,
          timeRemaining: () => 16,
        } as IdleDeadline);
        return () => undefined;
      },
    );
    useIsMobileMock.mockReset();
    useIsMobileMock.mockReturnValue(false);
    (window as Window & { __BOOTSTRAP_PUBLIC__?: unknown }).__BOOTSTRAP_PUBLIC__ = undefined;
    (window as Window & { __BOOTSTRAP_PUBLIC_ME__?: unknown }).__BOOTSTRAP_PUBLIC_ME__ = undefined;
    useSiteSettingsMock.mockReset();
    usePublicBootstrapMock.mockReset();
    useSiteSettingsMock.mockReturnValue({
      settings: createSettings(),
      isLoading: false,
      refresh: vi.fn(async () => undefined),
    });
    usePublicBootstrapMock.mockReturnValue({
      data: {
        projects: [
          {
            id: "project-1",
            title: "Projeto Teste",
            synopsis: "Sinopse do projeto",
            tags: ["acao"],
            cover: "/placeholder.svg",
          },
        ],
        posts: [
          {
            title: "Post Teste",
            slug: "post-teste",
            excerpt: "Resumo do post",
          },
        ],
        mediaVariants: {},
        tagTranslations: {
          tags: { acao: "Acao" },
        },
      },
    });
  });

  it("não agenda preload de menus em idle no mobile", async () => {
    useIsMobileMock.mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    expect(getScheduleOnBrowserLoadIdleCallsByDelay(1200)).toHaveLength(0);
    expect(getScheduleOnBrowserLoadIdleCallsByDelay(2500)).toHaveLength(0);
  });

  it("schedules menu preload on idle on desktop", async () => {
    useIsMobileMock.mockReturnValue(false);
    window.history.replaceState(null, "", "/postagem/post-teste");

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(scheduleOnBrowserLoadIdleMock).toHaveBeenCalled();
    });
    expect(getScheduleOnBrowserLoadIdleCallsByDelay(1200).length).toBeGreaterThan(0);
  });

  it("disables idle menu preload on reading and posting routes", async () => {
    useIsMobileMock.mockReturnValue(false);

    render(
      <MemoryRouter initialEntries={["/postagem/post-teste"]}>
        <Header locationPath="/postagem/post-teste" />
      </MemoryRouter>,
    );

    expect(getScheduleOnBrowserLoadIdleCallsByDelay(1200)).toHaveLength(0);
    expect(getScheduleOnBrowserLoadIdleCallsByDelay(2500)).toHaveLength(0);
  });

  it("aplica gradiente abaixo do header fixo apenas após scroll", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const banner = screen.getByRole("banner");
    expect(classTokens(banner)).toContain("after:top-full");
    expect(classTokens(banner)).toContain("after:inset-x-0");
    expect(classTokens(banner)).toContain("after:h-8");
    expect(classTokens(banner)).toContain("after:opacity-0");
    expect(classTokens(banner)).not.toContain("after:inset-0");
    expect(classTokens(banner)).toContain("backdrop-blur-none");
    expect(classTokens(banner)).not.toContain("backdrop-blur-xl");

    const nav = within(banner).getByRole("navigation");
    expect(classTokens(nav)).toContain("z-10");

    act(() => {
      setWindowScrollY(20);
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(classTokens(banner)).toContain("after:opacity-100");
      expect(classTokens(banner)).toContain("backdrop-blur-xl");
      expect(classTokens(banner)).not.toContain("backdrop-blur-none");
    });

    act(() => {
      setWindowScrollY(0);
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(classTokens(banner)).toContain("after:opacity-0");
      expect(classTokens(banner)).toContain("backdrop-blur-none");
      expect(classTokens(banner)).not.toContain("backdrop-blur-xl");
    });
  });

  it("não aplica gradiente no variant static, mesmo com scroll", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header variant="static" />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const banner = screen.getByRole("banner");
    expect(classTokens(banner)).not.toContain("after:top-full");
    expect(classTokens(banner)).not.toContain("after:inset-x-0");
    expect(classTokens(banner)).not.toContain("after:h-8");
    expect(classTokens(banner)).toContain("backdrop-blur-none");

    act(() => {
      setWindowScrollY(40);
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(classTokens(banner)).not.toContain("after:top-full");
      expect(classTokens(banner)).not.toContain("after:inset-x-0");
      expect(classTokens(banner)).not.toContain("after:h-8");
      expect(classTokens(banner)).toContain("backdrop-blur-none");
      expect(classTokens(banner)).not.toContain("backdrop-blur-xl");
    });
  });

  it("não aplica gradiente quando o header fixo desabilita a sombra inferior", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header showBottomGradient={false} />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const banner = screen.getByRole("banner");
    expect(classTokens(banner)).toContain("fixed");
    expect(classTokens(banner)).toContain("top-0");
    expect(classTokens(banner)).not.toContain("after:top-full");
    expect(classTokens(banner)).not.toContain("after:inset-x-0");
    expect(classTokens(banner)).not.toContain("after:h-8");
    expect(classTokens(banner)).toContain("backdrop-blur-none");

    act(() => {
      setWindowScrollY(20);
      window.dispatchEvent(new Event("scroll"));
    });

    await waitFor(() => {
      expect(classTokens(banner)).toContain("fixed");
      expect(classTokens(banner)).toContain("top-0");
      expect(classTokens(banner)).not.toContain("after:top-full");
      expect(classTokens(banner)).not.toContain("after:inset-x-0");
      expect(classTokens(banner)).not.toContain("after:h-8");
      expect(classTokens(banner)).toContain("backdrop-blur-xl");
      expect(classTokens(banner)).not.toContain("backdrop-blur-none");
    });
  });

  it("não dispara fetch de perfil quando a revalidação idle não executa", async () => {
    scheduleOnBrowserLoadIdleMock.mockImplementation(() => () => undefined);
    useIsMobileMock.mockReturnValue(true);
    (window as Window & { __BOOTSTRAP_PUBLIC_ME__?: unknown }).__BOOTSTRAP_PUBLIC_ME__ = {
      id: "bootstrap-user-1",
      name: "Bootstrap Admin",
      username: "bootstrap-admin",
      avatarUrl: null,
    };

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("busca /api/public/me imediatamente quando nao ha bootstrap de usuario", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "http://api.local",
        "/api/public/me",
        expect.objectContaining({ auth: true }),
      );
    });
    expect(getScheduleOnBrowserLoadIdleCallsByDelay(2500)).toHaveLength(0);
  });

  it("revalida imediatamente /api/public/me quando bootstrap SSR e anonimo", async () => {
    (window as Window & { __BOOTSTRAP_PUBLIC__?: unknown }).__BOOTSTRAP_PUBLIC__ = {
      projects: [],
      posts: [],
      updates: [],
      settings: {},
      pages: {},
    };
    (window as Window & { __BOOTSTRAP_PUBLIC_ME__?: unknown }).__BOOTSTRAP_PUBLIC_ME__ = null;

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getScheduleOnBrowserLoadIdleCallsByDelay(1200).length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(getPublicMeCalls()).toHaveLength(1);
    });
    expect(getScheduleOnBrowserLoadIdleCallsByDelay(2500)).toHaveLength(0);
  });

  it("agenda revalidacao de /api/public/me quando bootstrap SSR possui usuario", async () => {
    (window as Window & { __BOOTSTRAP_PUBLIC__?: unknown }).__BOOTSTRAP_PUBLIC__ = {
      projects: [],
      posts: [],
      updates: [],
      settings: {},
      pages: {},
    };
    (window as Window & { __BOOTSTRAP_PUBLIC_ME__?: unknown }).__BOOTSTRAP_PUBLIC_ME__ = {
      id: "bootstrap-user-1",
      name: "Bootstrap Admin",
      username: "bootstrap-admin",
      avatarUrl: null,
    };

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getScheduleOnBrowserLoadIdleCallsByDelay(2500)).toHaveLength(1);
    });
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "http://api.local",
        "/api/public/me",
        expect.objectContaining({ auth: true }),
      );
    });
  });

  it("oculta clusters, centraliza busca e restaura estado ao fechar no mobile", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    const leftCluster = screen.getByTestId("public-header-left-cluster");
    const searchCluster = screen.getByTestId("public-header-search-cluster");
    const actionsCluster = screen.getByTestId("public-header-actions-cluster");

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));

    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveFocus();
    expect(classTokens(leftCluster)).toContain("invisible");
    expect(classTokens(leftCluster)).toContain("pointer-events-none");
    expect(classTokens(actionsCluster)).toContain("invisible");
    expect(classTokens(actionsCluster)).toContain("pointer-events-none");
    expect(classTokens(searchCluster)).toContain("absolute");
    expect(classTokens(searchCluster)).toContain("inset-x-0");
    expect(classTokens(searchCluster)).toContain("w-[min(22rem,calc(100vw-1rem))]");

    await user.type(searchInput, "teste");

    await waitFor(() => {
      expect(getSearchSuggestCalls().length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.queryByText(uiCopy.search.loadingSuggestions)).not.toBeInTheDocument();
    });
    expect(await screen.findByText("Projeto Teste", {}, { timeout: 3000 })).toBeInTheDocument();
    expect(await screen.findByText("Post Teste", {}, { timeout: 3000 })).toBeInTheDocument();

    const results = screen.getByTestId("public-header-results");
    expect(classTokens(results)).toContain("w-[min(24rem,calc(100vw-1rem))]");
    expect(classTokens(results)).toContain("md:w-80");
    expect(classTokens(results)).toContain("left-0");
    expect(classTokens(results)).toContain("right-0");
    expect(classTokens(results)).toContain("shadow-floating-soft");
    expect(classTokens(results)).not.toContain("shadow-lg");

    await user.click(document.body);

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Buscar projetos e posts")).not.toBeInTheDocument();
    });
    expect(classTokens(leftCluster)).toContain("opacity-100");
    expect(classTokens(leftCluster)).toContain("visible");
    expect(classTokens(leftCluster)).toContain("pointer-events-auto");
    expect(classTokens(leftCluster)).not.toContain("invisible");
    expect(classTokens(actionsCluster)).toContain("opacity-100");
    expect(classTokens(actionsCluster)).toContain("visible");
    expect(classTokens(actionsCluster)).toContain("pointer-events-auto");
    expect(classTokens(actionsCluster)).not.toContain("invisible");
    expect(classTokens(searchCluster)).not.toContain("absolute");
  });

  it("dispara busca com debounce e renderiza sugestoes remotas", async () => {
    const user = userEvent.setup();
    setupApiMock({
      searchSuggestOk: true,
      searchSuggestions: [
        {
          kind: "project",
          id: "project-99",
          label: "Projeto Remoto",
          href: "/projeto/project-99",
          description: "Resultado remoto",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    await user.type(searchInput, "re");

    expect(getSearchSuggestCalls()).toHaveLength(0);

    await waitFor(() => {
      expect(getSearchSuggestCalls()).toHaveLength(1);
    });
    expect(await screen.findByText("Projeto Remoto")).toBeInTheDocument();
  });

  it("mantem itens renderizados e oculta loading durante nova busca em andamento", async () => {
    const user = userEvent.setup();
    let searchCallCount = 0;
    let resolvePendingSearch: ((response: Response) => void) | null = null;

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, {
            user: {
              id: "user-1",
              name: "Admin",
              username: "admin",
              avatarUrl: null,
            },
          });
        }
        if (endpoint.startsWith("/api/public/search/suggest?") && method === "GET") {
          searchCallCount += 1;
          if (searchCallCount === 1) {
            return mockJsonResponse(true, {
              suggestions: [
                {
                  kind: "project",
                  id: "project-primeiro",
                  label: "Projeto Primeiro",
                  href: "/projeto/project-primeiro",
                  description: "Resultado inicial",
                },
              ],
              mediaVariants: {},
            });
          }
          return await new Promise<Response>((resolve) => {
            resolvePendingSearch = resolve;
          });
        }
        if (endpoint === "/api/logout" && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");

    fireEvent.change(searchInput, { target: { value: "re" } });
    expect(await screen.findByText("Projeto Primeiro")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "rex" } });

    await waitFor(() => {
      expect(searchCallCount).toBe(2);
    });
    expect(await screen.findByText("Projeto Primeiro")).toBeInTheDocument();
    expect(screen.queryByText(uiCopy.search.loadingSuggestions)).not.toBeInTheDocument();

    await act(async () => {
      resolvePendingSearch?.(
        mockJsonResponse(true, {
          suggestions: [],
          mediaVariants: {},
        }),
      );
    });
  });

  it("exibe loading quando busca esta carregando e ainda nao ha itens", async () => {
    const user = userEvent.setup();
    let resolvePendingSearch: ((response: Response) => void) | null = null;

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, {
            user: {
              id: "user-1",
              name: "Admin",
              username: "admin",
              avatarUrl: null,
            },
          });
        }
        if (endpoint.startsWith("/api/public/search/suggest?") && method === "GET") {
          return await new Promise<Response>((resolve) => {
            resolvePendingSearch = resolve;
          });
        }
        if (endpoint === "/api/logout" && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    fireEvent.change(searchInput, { target: { value: "ca" } });

    expect(await screen.findByText(uiCopy.search.loadingSuggestions)).toBeInTheDocument();
    expect(screen.queryByText("Projeto Teste")).not.toBeInTheDocument();
    expect(screen.queryByText("Post Teste")).not.toBeInTheDocument();

    await act(async () => {
      resolvePendingSearch?.(
        mockJsonResponse(true, {
          suggestions: [],
          mediaVariants: {},
        }),
      );
    });
  });

  it("mantem badges de projetos remotos em uma linha com overflow oculto", async () => {
    const user = userEvent.setup();
    setupApiMock({
      searchSuggestOk: true,
      searchSuggestions: [
        {
          kind: "project",
          id: "project-88",
          label: "Projeto Remoto Badges",
          href: "/projeto/project-88",
          description: "Resultado remoto com muitas tags",
          tags: ["acao", "TagAlpha", "TagGamma", "TagBeta"],
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    await user.type(searchInput, "ba");

    const projectLink = await screen.findByRole("link", { name: /Projeto Remoto Badges/i });
    const projectCard = projectLink.closest("a");
    expect(projectCard).not.toBeNull();
    expect(classTokens(projectCard as HTMLElement)).toContain("h-36");
    expect(classTokens(projectCard as HTMLElement)).toContain("items-stretch");
    expect(classTokens(projectCard as HTMLElement)).toContain("bg-card/60");
    expect(classTokens(projectCard as HTMLElement)).not.toContain("bg-gradient-card");
    expect(classTokens(projectCard as HTMLElement)).not.toContain("gap-4");
    expect(classTokens(projectCard as HTMLElement)).not.toContain("p-4");

    const coverColumn = projectCard?.querySelector(
      ".flex.min-h-0.min-w-0.flex-1",
    ) as HTMLElement | null;
    expect(coverColumn).not.toBeNull();
    expect(classTokens(coverColumn as HTMLElement)).toContain("flex-1");
    expect(classTokens(coverColumn as HTMLElement)).toContain("min-h-0");
    expect(classTokens(coverColumn as HTMLElement)).toContain("p-4");
    expect(classTokens(coverColumn as HTMLElement)).toContain("overflow-hidden");
    expect(classTokens(coverColumn as HTMLElement)).not.toContain("h-28");

    const synopsis = screen.getByText("Resultado remoto com muitas tags");
    expect(synopsis).not.toBeNull();
    expect(classTokens(synopsis as HTMLElement)).toContain("shrink-0");
    expect(classTokens(synopsis as HTMLElement)).toContain("line-clamp-3");
    expect(classTokens(synopsis as HTMLElement)).not.toContain("flex-1");
    expect(classTokens(synopsis as HTMLElement)).not.toContain("clamp-safe-2");
    expect(classTokens(synopsis as HTMLElement)).not.toContain("line-clamp-4");

    const searchCardShell = projectCard?.parentElement as HTMLElement | null;
    expect(searchCardShell).not.toBeNull();

    const coverImage = screen.getByRole("img", { name: "Projeto Remoto Badges" });
    const coverPicture = coverImage.parentElement;
    const coverWrapper = coverPicture?.parentElement as HTMLElement | null;
    expect(coverWrapper).not.toBeNull();
    expect(classTokens(coverWrapper as HTMLElement)).toContain("h-full");
    expect(classTokens(coverWrapper as HTMLElement)).not.toContain("h-28");
    expect(classTokens(coverWrapper as HTMLElement)).not.toContain("rounded-lg");
    expect(classTokens(coverWrapper as HTMLElement)).not.toContain("self-start");
    expect(classTokens(coverWrapper as HTMLElement)).not.toContain("w-20");
    expect(coverWrapper?.style.aspectRatio).toBe("9 / 14");

    const badgesRow = screen.getByText("Acao").parentElement as HTMLElement | null;
    expect(badgesRow).not.toBeNull();
    expect(classTokens(badgesRow as HTMLElement)).toContain("flex-nowrap");
    expect(classTokens(badgesRow as HTMLElement)).toContain("overflow-hidden");
    expect(classTokens(badgesRow as HTMLElement)).toContain("shrink-0");
    expect(classTokens(badgesRow as HTMLElement)).toContain("mt-auto");
    expect(classTokens(badgesRow as HTMLElement)).toContain("pb-1");
    expect(classTokens(badgesRow as HTMLElement)).not.toContain("flex-wrap");

    expect(screen.getByText("Acao")).toBeInTheDocument();
    expect(screen.getByText("TagAlpha")).toBeInTheDocument();
    expect(screen.queryByText("acao")).not.toBeInTheDocument();
    expect(screen.queryByText("TagBeta")).not.toBeInTheDocument();
    expect(screen.queryByText("TagGamma")).not.toBeInTheDocument();
  });

  it("aplica o clamp seguro calculado quando o hook retorna menos linhas para a sinopse", async () => {
    const user = userEvent.setup();
    setupApiMock({
      searchSuggestOk: true,
      searchSuggestions: [
        {
          kind: "project",
          id: "project-55",
          label: "Projeto Clamp Curto",
          href: "/projeto/project-55",
          description: "Uma sinopse longa o bastante para precisar de corte visual",
          tags: ["acao", "drama"],
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    await user.type(searchInput, "cl");

    const synopsis = await screen.findByText(
      "Uma sinopse longa o bastante para precisar de corte visual",
    );
    expect(synopsis).toHaveClass("line-clamp-3");
    expect(synopsis).not.toHaveClass("clamp-safe-1", "clamp-safe-2", "line-clamp-4");
  });

  it("usa fallback local quando a busca remota falha", async () => {
    const user = userEvent.setup();
    setupApiMock({ searchSuggestOk: false });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    await user.type(searchInput, "teste");

    await waitFor(() => {
      expect(getSearchSuggestCalls().length).toBeGreaterThan(0);
    });
    expect(await screen.findByText("Projeto Teste")).toBeInTheDocument();
    expect(await screen.findByText("Post Teste")).toBeInTheDocument();
    expect(await screen.findByText("Acao")).toBeInTheDocument();
    expect(screen.queryByText("acao")).not.toBeInTheDocument();
  });

  it("mantem a ordem no desktop com links antes da busca e busca antes das acoes", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const aboutLink = screen.getByRole("link", { name: "Sobre" });
    const searchCluster = screen.getByTestId("public-header-search-cluster");
    const actionsCluster = screen.getByTestId("public-header-actions-cluster");

    expect(
      aboutLink.compareDocumentPosition(searchCluster) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      searchCluster.compareDocumentPosition(actionsCluster) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("usa breakpoint lg para navbar completa, hamburguer e nome do usuario", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const aboutLink = screen.getByRole("link", { name: "Sobre" });
    const navLinksContainer = aboutLink.parentElement as HTMLElement | null;
    expect(navLinksContainer).not.toBeNull();
    expect(classTokens(navLinksContainer as HTMLElement)).toContain("hidden");
    expect(classTokens(navLinksContainer as HTMLElement)).toContain("lg:flex");
    expect(classTokens(navLinksContainer as HTMLElement)).not.toContain("md:flex");

    const menuButton = screen.getByRole("button", { name: "Abrir menu" });
    expect(classTokens(menuButton)).toContain("lg:hidden");
    expect(classTokens(menuButton)).not.toContain("md:hidden");

    const userName = screen.getByText("Admin");
    expect(classTokens(userName)).toContain("hidden");
    expect(classTokens(userName)).toContain("lg:inline");
    expect(classTokens(userName)).not.toContain("md:inline");
  });

  it("renderiza toggle de tema no header", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });
    const searchButton = screen.getByRole("button", { name: "Abrir busca" });
    const themeToggle = screen.getByRole("button", { name: /Alternar para tema/i });

    expect(classTokens(searchButton)).toContain("text-foreground/80");
    expect(themeToggle).toBeInTheDocument();
    expect(classTokens(themeToggle)).toContain("text-foreground/80");
    expect(setThemePreferenceMock).not.toHaveBeenCalled();
  });

  it("abre a busca com / quando o foco nao esta em elementos interativos", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <GlobalShortcutsProvider>
          <Header />
        </GlobalShortcutsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.keyDown(window, { key: "/" });

    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    expect(searchInput).toHaveFocus();
  });

  it("ignora / quando o foco esta em um botao", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <GlobalShortcutsProvider>
          <Header />
        </GlobalShortcutsProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    const searchButton = screen.getByRole("button", { name: "Abrir busca" });
    fireEvent.keyDown(searchButton, { key: "/" });

    expect(screen.queryByPlaceholderText("Buscar projetos e posts")).not.toBeInTheDocument();
  });

  it("não redireciona e exibe toast quando logout falha", async () => {
    const user = userEvent.setup();
    setupApiMock({ logoutOk: false });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      render(
        <MemoryRouter initialEntries={["/sobre"]}>
          <Header />
          <LocationProbe />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(apiFetchMock).toHaveBeenCalledTimes(1);
      });

      const profileButton = screen.getByText("Admin").closest("button");
      expect(profileButton).toBeTruthy();
      await user.click(profileButton as HTMLButtonElement);
      const profileMenu = await screen.findByRole("menu");
      expect(classTokens(profileMenu)).toContain("shadow-floating-soft");
      expect(classTokens(profileMenu)).not.toContain("shadow-xl");
      await user.click(await screen.findByRole("menuitem", { name: /Sair/i }));

      await waitFor(() => {
        expect(toastMock).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/sair/i),
            variant: "destructive",
          }),
        );
      });

      expect(screen.getByTestId("location-pathname")).toHaveTextContent("/sobre");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("renderiza poster otimizado para thumbnails remotos da busca", async () => {
    const user = userEvent.setup();
    setupApiMock({
      searchSuggestOk: true,
      searchSuggestions: [
        {
          kind: "project",
          id: "project-remote",
          label: "Projeto Remoto",
          href: "/projeto/project-remote",
          description: "Resultado remoto",
          image: "/uploads/projects/remoto.png",
          tags: ["acao"],
        },
      ],
      searchMediaVariants: {
        "/uploads/projects/remoto.png": {
          variantsVersion: 4,
          variants: {
            posterThumb: {
              formats: {
                avif: { url: "/uploads/_variants/remote/posterThumb-v4.avif" },
                webp: { url: "/uploads/_variants/remote/posterThumb-v4.webp" },
                fallback: { url: "/uploads/_variants/remote/posterThumb-v4.jpeg" },
              },
            },
          },
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Header />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Abrir busca" }));
    const searchInput = await screen.findByPlaceholderText("Buscar projetos e posts");
    await user.type(searchInput, "remoto");

    await waitFor(() => {
      expect(getSearchSuggestCalls().length).toBeGreaterThan(0);
    });

    const coverImage = await screen.findByRole("img", { name: "Projeto Remoto" });
    const picture = coverImage.parentElement;
    const sources = Array.from(picture?.querySelectorAll("source") || []);

    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute("srcset", expect.stringContaining("/posterThumb-v4.avif"));
    expect(sources[1]).toHaveAttribute("srcset", expect.stringContaining("/posterThumb-v4.webp"));
    expect(coverImage).toHaveAttribute("src", expect.stringContaining("/posterThumb-v4.jpeg"));
  });
});
