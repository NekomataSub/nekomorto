import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter as ReactRouterMemoryRouter } from "react-router-dom";
import { type ReactNode, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useDynamicSynopsisClampMock = vi.hoisted(() => vi.fn());
const synopsisRootRefMock = vi.hoisted(() => ({ current: null as HTMLDivElement | null }));

vi.mock("@/hooks/use-dynamic-synopsis-clamp", () => ({
  useDynamicSynopsisClamp: (...args: unknown[]) => useDynamicSynopsisClampMock(...args),
}));

import Projects from "@/pages/Projects";
import { usePublicDocumentLocation } from "@/lib/public-document-navigation";

const apiFetchMock = vi.hoisted(() => vi.fn());
const resizeObserverObserveMock = vi.hoisted(() => vi.fn());
const resizeObserverDisconnectMock = vi.hoisted(() => vi.fn());
const PROJECTS_LIST_STATE_STORAGE_KEY = "public.projects.list-state.v1";
const SEARCH_QUERY_DEBOUNCE_MS = 60;
const PROJECTS_LIST_IMAGE_SIZES = "(max-width: 767px) 129px, 154px";

type BootstrapWindow = Window &
  typeof globalThis & {
    __BOOTSTRAP_PUBLIC__?: unknown;
  };

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const createProject = (
  index: number,
  overrides: Partial<{
    title: string;
    type: string;
    tags: string[];
    genres: string[];
  }> = {},
) => ({
  id: `project-${index}`,
  title: overrides.title ?? `Projeto ${index}`,
  titleOriginal: "",
  titleEnglish: "",
  synopsis: `Sinopse ${index}`,
  description: `Descricao ${index}`,
  type: overrides.type ?? "Anime",
  status: "Em andamento",
  year: "2026",
  studio: "Studio Teste",
  episodes: "12 episódios",
  tags: overrides.tags ?? ["acao"],
  genres: overrides.genres ?? ["drama"],
  cover: "/placeholder.svg",
  banner: "/placeholder.svg",
  season: "Temporada 1",
  schedule: "Sabado",
  rating: "14",
  episodeDownloads: [],
  staff: [],
});

const createProjects = (count: number, overrides?: Parameters<typeof createProject>[1]) =>
  Array.from({ length: count }, (_, index) => createProject(index + 1, overrides));

const setupApiMock = ({
  projects = createProjects(24),
  mediaVariants = {},
}: {
  projects?: ReturnType<typeof createProject>[];
  mediaVariants?: unknown;
} = {}) => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(
    async (_apiBase: string, endpoint: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      if (endpoint === "/api/public/projects" && method === "GET") {
        return mockJsonResponse(true, { projects, mediaVariants });
      }
      if (endpoint === "/api/public/tag-translations" && method === "GET") {
        return mockJsonResponse(true, {
          tags: { acao: "Acao" },
          genres: { drama: "Drama" },
          staffRoles: {},
        });
      }
      if (endpoint === "/api/public/pages" && method === "GET") {
        return mockJsonResponse(true, {
          pages: { projects: { shareImage: "" } },
        });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    },
  );
};

const LocationProbe = () => {
  const location = usePublicDocumentLocation("/projetos");
  return <div data-testid="location-search">{location.search}</div>;
};

const MemoryRouter = ({
  children,
  initialEntries,
}: {
  children: ReactNode;
  initialEntries: string[];
}) => {
  const hasSyncedInitialEntryRef = useRef(false);
  if (!hasSyncedInitialEntryRef.current) {
    window.history.replaceState(null, "", String(initialEntries[0] || "/"));
    hasSyncedInitialEntryRef.current = true;
  }
  return (
    <ReactRouterMemoryRouter initialEntries={initialEntries}>{children}</ReactRouterMemoryRouter>
  );
};

const getSearchParams = () =>
  new URLSearchParams(String(window.location.search || "").replace(/^\?/, ""));

const getRenderedProjectCards = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("a.projects-public-card"));

const classTokens = (element: HTMLElement) =>
  String(element.className).split(/\s+/).filter(Boolean);

const findCenteredProjectCardWrapper = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>("div")).find((element) => {
    const classTokens = String(element.className).split(/\s+/).filter(Boolean);
    return classTokens.includes("md:col-span-2") && element.querySelector("a.projects-public-card");
  }) ?? null;

const setBootstrapPayload = (payload: unknown) => {
  (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__ = payload;
};

const clearBootstrapPayload = () => {
  delete (window as BootstrapWindow).__BOOTSTRAP_PUBLIC__;
};

const originalMatchMedia = window.matchMedia;

const setViewportIsMobile = (isMobile: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 767px)" ? isMobile : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
};

describe("Projects query sync", () => {
  beforeEach(() => {
    setupApiMock();
    useDynamicSynopsisClampMock.mockReset();
    synopsisRootRefMock.current = null;
    useDynamicSynopsisClampMock.mockReturnValue({
      rootRef: synopsisRootRefMock,
      lineByKey: {},
    });
    window.scrollTo = vi.fn();
    window.localStorage.clear();
    clearBootstrapPayload();
    resizeObserverObserveMock.mockReset();
    resizeObserverDisconnectMock.mockReset();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(...args: unknown[]) {
          resizeObserverObserveMock(...args);
        }
        unobserve() {}
        disconnect(...args: unknown[]) {
          resizeObserverDisconnectMock(...args);
        }
      },
    );
    setViewportIsMobile(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearBootstrapPayload();
    window.matchMedia = originalMatchMedia;
  });

  it("normaliza query legada de genre para genero", async () => {
    render(
      <MemoryRouter initialEntries={["/projetos?genre=drama"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const params = getSearchParams();
      expect(params.get("genero")).toBe("drama");
      expect(params.get("genre")).toBeNull();
    });
  });

  it("sincroniza letter/type/page da URL", async () => {
    setupApiMock({
      projects: createProjects(24, {
        type: "Anime",
        tags: ["acao"],
        genres: ["drama"],
      }),
    });

    render(
      <MemoryRouter initialEntries={["/projetos?letter=P&type=Anime&page=2"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const params = getSearchParams();
      expect(params.get("letter")).toBe("P");
      expect(params.get("type")).toBe("Anime");
      expect(params.get("page")).toBe("2");
    });
  });

  it("abre A-Z e Formato como popovers sem busca interna e sincroniza letter/type na URL", async () => {
    setupApiMock({
      projects: createProjects(24, {
        type: "Anime",
        tags: ["acao"],
        genres: ["drama"],
      }),
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const user = userEvent.setup();

    await screen.findByText("Projeto 1");
    const letterTrigger = await screen.findByRole("combobox", { name: "Filtrar por letra" });
    expect(container.querySelector("select")).toBeNull();

    await user.click(letterTrigger);

    const letterListbox = await screen.findByRole("listbox", { name: "A-Z" });
    expect(screen.queryByLabelText(/Buscar em a-z/i)).not.toBeInTheDocument();
    expect(within(letterListbox).getByRole("option", { name: "P" })).toBeInTheDocument();

    await user.click(within(letterListbox).getByRole("option", { name: "P" }));

    await waitFor(() => {
      expect(getSearchParams().get("letter")).toBe("P");
      expect(letterTrigger).toHaveAttribute("aria-expanded", "false");
      expect(screen.queryByRole("listbox", { name: "A-Z" })).not.toBeInTheDocument();
    });

    const formatTrigger = screen.getByRole("combobox", { name: "Filtrar por formato" });
    await user.click(formatTrigger);

    const formatListbox = await screen.findByRole("listbox", { name: "Formato" });
    expect(formatListbox).toHaveAttribute("aria-label", "Formato");
    expect(screen.queryByLabelText(/Buscar em formato/i)).not.toBeInTheDocument();
    const animeOption = within(formatListbox).getByRole("option", { name: /Anime/i });

    await user.click(animeOption);

    await waitFor(() => {
      expect(getSearchParams().get("type")).toBe("Anime");
    });
    expect(formatTrigger).toHaveTextContent(/Todos os formatos|Anime/i);
  });

  it("sincroniza q da URL com o campo de busca", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/projetos?q=studio"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const searchInput = await screen.findByLabelText("Buscar projetos");
    const letterFilter = screen.getByRole("combobox", { name: "Filtrar por letra" });
    const pageShell = container.firstElementChild;

    expect(searchInput).toHaveValue("studio");
    expect(searchInput).toHaveClass(
      "focus-visible:border-primary",
      "focus-visible:ring-1",
      "focus-visible:ring-primary/45",
      "focus-visible:ring-inset",
    );
    expect(letterFilter).toHaveClass(
      "focus-visible:border-primary",
      "focus-visible:ring-1",
      "focus-visible:ring-primary/45",
      "focus-visible:ring-inset",
    );
    expect(getSearchParams().get("q")).toBe("studio");
    expect(pageShell).toHaveClass("min-h-screen", "text-foreground");
    expect(pageShell).not.toHaveClass("bg-background", "bg-gradient-surface");

    await waitFor(() => {
      expect(getRenderedProjectCards(container).length).toBeGreaterThan(0);
    });
    const firstProjectCard = getRenderedProjectCards(container)[0];
    expect(firstProjectCard).toHaveClass(
      "projects-public-card",
      "group",
      "border",
      "border-border/60",
      "hover:border-primary/60",
    );
  });

  it("mantem o combobox de Projects alinhado ao contrato visual global", async () => {
    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
      </MemoryRouter>,
    );

    const formatTrigger = await screen.findByRole("combobox", { name: "Filtrar por formato" });
    expect(formatTrigger).toHaveTextContent(/Todos os formatos|Anime/i);
    expect(classTokens(formatTrigger)).toEqual(
      expect.arrayContaining([
        "rounded-xl",
        "border-border/60",
        "bg-background/60",
        "focus-visible:ring-inset",
      ]),
    );

    fireEvent.click(formatTrigger);

    const animeOption = await screen.findByRole("option", { name: "Anime" });
    const popover = animeOption.closest("div[role='listbox']")?.parentElement as HTMLElement | null;

    expect(popover).not.toBeNull();
    expect(classTokens(popover as HTMLElement)).toEqual(
      expect.arrayContaining([
        "rounded-2xl",
        "border-border/70",
        "bg-popover/95",
        "shadow-floating-soft",
      ]),
    );
    expect(animeOption).toHaveClass("rounded-xl", "py-2", "pl-9", "pr-3");
  });

  it("aplica debounce na query e mantém input responsivo durante a digitacao", async () => {
    setupApiMock({
      projects: [
        createProject(1, { title: "Alpha 1" }),
        createProject(2, { title: "Alpha 2" }),
        createProject(3, { title: "Alpha 3" }),
        createProject(4, { title: "Beta 1" }),
      ],
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const searchInput = await screen.findByLabelText("Buscar projetos");

    vi.useFakeTimers();
    try {
      fireEvent.change(searchInput, { target: { value: "alpha" } });

      expect(searchInput).toHaveValue("alpha");
      expect(getSearchParams().get("q")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(SEARCH_QUERY_DEBOUNCE_MS - 1);
      });
      expect(getSearchParams().get("q")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(1);
      });
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => {
      expect(getSearchParams().get("q")).toBe("alpha");
      expect(getRenderedProjectCards(container)).toHaveLength(3);
    });
  });

  it("nao restaura filtros/page do localStorage quando URL chega limpa", async () => {
    window.localStorage.setItem(
      PROJECTS_LIST_STATE_STORAGE_KEY,
      JSON.stringify({
        q: "drama",
        letter: "P",
        type: "Anime",
        tag: "acao",
        genero: "drama",
        page: 2,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const params = getSearchParams();
      expect(params.get("q")).toBeNull();
      expect(params.get("letter")).toBeNull();
      expect(params.get("type")).toBeNull();
      expect(params.get("tag")).toBeNull();
      expect(params.get("genero")).toBeNull();
      expect(params.get("page")).toBeNull();
    });
  });

  it("limpa automaticamente a chave legada ao carregar /projetos", async () => {
    window.localStorage.setItem(
      PROJECTS_LIST_STATE_STORAGE_KEY,
      JSON.stringify({
        q: "valor-antigo",
        page: 4,
      }),
    );

    render(
      <MemoryRouter initialEntries={["/projetos?tag=acao"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(window.localStorage.getItem(PROJECTS_LIST_STATE_STORAGE_KEY)).toBeNull();
      expect(getSearchParams().get("tag")).toBe("acao");
    });
  });

  it("limpar filtros remove params de filtro/paginacao e preserva params nao relacionados", async () => {
    setupApiMock({
      projects: createProjects(24, {
        type: "Anime",
        tags: ["acao"],
        genres: ["drama"],
      }),
    });

    render(
      <MemoryRouter
        initialEntries={[
          "/projetos?letter=P&type=Anime&tag=acao&genero=drama&page=2&q=teste&foo=1",
        ]}
      >
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));

    await waitFor(() => {
      const params = getSearchParams();
      expect(params.get("letter")).toBeNull();
      expect(params.get("type")).toBeNull();
      expect(params.get("tag")).toBeNull();
      expect(params.get("genero")).toBeNull();
      expect(params.get("genre")).toBeNull();
      expect(params.get("page")).toBeNull();
      expect(params.get("q")).toBeNull();
      expect(params.get("foo")).toBe("1");
    });
  });

  it("nao grava estado da listagem no localStorage ao interagir", async () => {
    render(
      <MemoryRouter initialEntries={["/projetos?tag=acao"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const pagination = await screen.findByRole("navigation");
    fireEvent.click(within(pagination).getByRole("link", { name: "2" }));

    await waitFor(() => {
      expect(window.localStorage.getItem(PROJECTS_LIST_STATE_STORAGE_KEY)).toBeNull();
      expect(getSearchParams().get("page")).toBe("2");
    });
  });

  it("escreve page na URL ao paginar", async () => {
    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const pagination = await screen.findByRole("navigation");
    fireEvent.click(within(pagination).getByRole("link", { name: "2" }));

    await waitFor(() => {
      expect(getSearchParams().get("page")).toBe("2");
    });
  });

  it("usa janela compacta com reticencias quando ha muitas paginas", async () => {
    setupApiMock({
      projects: createProjects(160),
    });

    render(
      <MemoryRouter initialEntries={["/projetos?page=5"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const pagination = await screen.findByRole("navigation");

    await waitFor(() => {
      expect(within(pagination).getByRole("link", { name: "1" })).toBeInTheDocument();
      expect(within(pagination).getByRole("link", { name: "4" })).toBeInTheDocument();
      expect(within(pagination).getByRole("link", { name: "5" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(within(pagination).getByRole("link", { name: "6" })).toBeInTheDocument();
      expect(within(pagination).getByRole("link", { name: "10" })).toBeInTheDocument();
      expect(within(pagination).getAllByText("Mais páginas")).toHaveLength(2);
      expect(within(pagination).queryByRole("link", { name: "2" })).not.toBeInTheDocument();
      expect(within(pagination).queryByRole("link", { name: "8" })).not.toBeInTheDocument();
    });

    fireEvent.click(within(pagination).getByRole("link", { name: "10" }));

    await waitFor(() => {
      expect(getSearchParams().get("page")).toBe("10");
    });
  });

  it("type invalido cai para Todos e URL canonica remove type", async () => {
    setupApiMock({
      projects: createProjects(12, {
        type: "Anime",
      }),
    });

    render(
      <MemoryRouter initialEntries={["/projetos?type=Inexistente"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(getSearchParams().get("type")).toBeNull();
    });
  });

  it("exibe textos da UI com acentuacao correta", async () => {
    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByPlaceholderText("Buscar por t\u00EDtulo, sinopse, tag ou g\u00EAnero"),
    ).toBeInTheDocument();
    expect(screen.getByText("G\u00EAneros")).toBeInTheDocument();
  });

  it("mantem a busca visivel e recolhe os filtros por padrao no mobile", async () => {
    setViewportIsMobile(true);
    setupApiMock({
      projects: Array.from({ length: 21 }, (_, index) =>
        createProject(index + 1, {
          title: `Alpha ${index + 1}`,
          type: "Anime",
          tags: ["acao"],
          genres: ["drama"],
        }),
      ),
    });

    render(
      <MemoryRouter initialEntries={["/projetos?q=alpha&tag=acao&type=Anime"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const searchInput = await screen.findByLabelText("Buscar projetos");
    const trigger = screen.getByRole("button", { name: /^Filtros\b/i });

    expect(searchInput).toHaveValue("alpha");
    await waitFor(() => {
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveTextContent("21");
      expect(trigger).toHaveTextContent("2 filtros ativos");
    });
    expect(screen.queryByRole("combobox", { name: "Filtrar por letra" })).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByRole("combobox", { name: "Filtrar por letra" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por tag" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por gênero" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por formato" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpar filtros" })).toBeInTheDocument();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => {
      expect(screen.queryByRole("combobox", { name: "Filtrar por letra" })).not.toBeInTheDocument();
    });
  });

  it("hidrata a listagem com bootstrap completo sem fetch inicial", async () => {
    setBootstrapPayload({
      settings: {},
      pages: {
        projects: {
          shareImage: "/uploads/projects-og.jpg",
          shareImageAlt: "Capa da pagina de projetos",
        },
      },
      projects: [
        {
          ...createProject(1, { title: "Projeto Bootstrap" }),
          cover: "/uploads/projects/projeto-bootstrap.png",
        },
      ],
      posts: [],
      updates: [],
      mediaVariants: {
        "/uploads/projects/projeto-bootstrap.png": {
          variantsVersion: 1,
          variants: {
            posterThumb: {
              width: 320,
              formats: {
                fallback: { url: "/uploads/_variants/bootstrap/poster-thumb.jpeg" },
              },
            },
          },
        },
      },
      tagTranslations: {
        tags: { acao: "Acao" },
        genres: { drama: "Drama" },
        staffRoles: {},
      },
      generatedAt: "2026-03-06T18:40:00.000Z",
      payloadMode: "full",
    });
    apiFetchMock.mockReset();

    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Projeto Bootstrap")).toBeInTheDocument();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("filtra por busca e restaura cards ao limpar consulta", async () => {
    setupApiMock({
      projects: [
        createProject(1, { title: "Alpha 1" }),
        createProject(2, { title: "Alpha 2" }),
        createProject(3, { title: "Alpha 3" }),
        createProject(4, { title: "Beta 1" }),
      ],
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const searchInput = await screen.findByLabelText("Buscar projetos");

    await waitFor(() => {
      expect(getRenderedProjectCards(container)).toHaveLength(4);
    });

    vi.useFakeTimers();
    try {
      fireEvent.change(searchInput, { target: { value: "alpha" } });
      act(() => {
        vi.advanceTimersByTime(SEARCH_QUERY_DEBOUNCE_MS);
      });
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => {
      expect(getRenderedProjectCards(container)).toHaveLength(3);
      expect(getSearchParams().get("q")).toBe("alpha");
      expect(screen.queryByRole("link", { name: "Beta 1" })).not.toBeInTheDocument();
    });

    vi.useFakeTimers();
    try {
      fireEvent.change(searchInput, { target: { value: "" } });
      act(() => {
        vi.advanceTimersByTime(SEARCH_QUERY_DEBOUNCE_MS);
      });
    } finally {
      vi.useRealTimers();
    }

    await waitFor(() => {
      expect(getRenderedProjectCards(container)).toHaveLength(4);
      expect(getSearchParams().get("q")).toBeNull();
    });
  });

  it("permite retry quando o carregamento inicial falha sem bootstrap completo", async () => {
    let projectsRequests = 0;
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === "/api/public/projects" && method === "GET") {
          projectsRequests += 1;
          if (projectsRequests === 1) {
            return mockJsonResponse(false, { error: "server_error" }, 500);
          }
          return mockJsonResponse(true, { projects: createProjects(1), mediaVariants: {} });
        }
        if (endpoint === "/api/public/tag-translations" && method === "GET") {
          return mockJsonResponse(true, {
            tags: { acao: "Acao" },
            genres: { drama: "Drama" },
            staffRoles: {},
          });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("N\u00E3o foi poss\u00EDvel carregar os projetos"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByText("Projeto 1")).toBeInTheDocument();
    expect(projectsRequests).toBe(2);
  });

  it("mantem centralizacao do ultimo card quando resultado fica impar", async () => {
    setupApiMock({
      projects: [
        createProject(1, { title: "Alpha 1" }),
        createProject(2, { title: "Alpha 2" }),
        createProject(3, { title: "Alpha 3" }),
        createProject(4, { title: "Beta 1" }),
      ],
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const searchInput = await screen.findByLabelText("Buscar projetos");
    fireEvent.change(searchInput, { target: { value: "alpha" } });

    await waitFor(() => {
      expect(getRenderedProjectCards(container)).toHaveLength(3);
    });

    await waitFor(() => {
      const centeredWrapper = findCenteredProjectCardWrapper(container);
      expect(centeredWrapper).not.toBeNull();
      expect(centeredWrapper).toHaveClass("md:col-span-2", "flex", "justify-center");
      const widthWrapper = Array.from(centeredWrapper?.children || []).find((child) =>
        String((child as HTMLElement).className).includes("md:w-[calc(50%-0.75rem)]"),
      );
      expect(widthWrapper).toBeTruthy();
    });

    fireEvent.change(searchInput, { target: { value: "" } });

    await waitFor(() => {
      expect(getRenderedProjectCards(container)).toHaveLength(4);
      expect(findCenteredProjectCardWrapper(container)).toBeNull();
    });
  });

  it("continua funcional com prefers-reduced-motion ativo", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      const { container } = render(
        <MemoryRouter initialEntries={["/projetos"]}>
          <Projects />
          <LocationProbe />
        </MemoryRouter>,
      );

      const searchInput = await screen.findByLabelText("Buscar projetos");
      fireEvent.change(searchInput, { target: { value: "Projeto 24" } });

      await waitFor(() => {
        expect(getRenderedProjectCards(container)).toHaveLength(1);
        expect(screen.getByText("Projeto 24")).toBeInTheDocument();
      });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("renderiza variants posterThumb para as capas publicas quando disponiveis", async () => {
    setupApiMock({
      projects: [
        {
          ...createProject(1),
          cover: "/uploads/projects/projeto-1.png",
        },
      ],
      mediaVariants: {
        "/uploads/projects/projeto-1.png": {
          variantsVersion: 3,
          variants: {
            posterThumb: {
              formats: {
                avif: { url: "/uploads/_variants/p1/poster-thumb-v3.avif" },
                webp: { url: "/uploads/_variants/p1/poster-thumb-v3.webp" },
                fallback: { url: "/uploads/_variants/p1/poster-thumb-v3.jpeg" },
              },
            },
          },
        },
      },
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const coverImage = await screen.findByRole("img", { name: "Projeto 1" });
    const coverPicture = coverImage.parentElement;
    const coverWrapper = coverPicture?.parentElement;
    const sources = Array.from(container.querySelectorAll("source"));

    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute("srcset", expect.stringContaining("/poster-thumb-v3.avif"));
    expect(sources[1]).toHaveAttribute("srcset", expect.stringContaining("/poster-thumb-v3.webp"));
    expect(coverImage).toHaveAttribute("src", expect.stringContaining("/poster-thumb-v3.jpeg"));
    expect(coverImage).toHaveAttribute("sizes", PROJECTS_LIST_IMAGE_SIZES);
    expect(coverWrapper).not.toBeNull();
    expect(coverWrapper).toHaveClass("h-full", "shrink-0", "overflow-hidden");
    expect(coverWrapper).not.toHaveClass("h-39", "md:h-50", "rounded-xl");
    expect(coverWrapper?.style.aspectRatio).toBe("9 / 14");
    const cardRoot = coverWrapper?.closest("a.projects-public-card");
    expect(cardRoot).not.toBeNull();
    expect(cardRoot).toHaveClass(
      "projects-public-card",
      "group",
      "relative",
      "h-50",
      "w-full",
      "items-stretch",
      "overflow-hidden",
      "rounded-2xl",
      "border",
      "border-border/60",
      "hover:border-primary/60",
      "md:h-60",
    );
    expect(cardRoot).not.toHaveClass(
      "projects-public-card-shell",
      "z-10",
      "gap-5",
      "p-5",
      "hover:-translate-y-1",
      "hover:shadow-lg",
    );
    expect(cardRoot?.parentElement).not.toHaveClass("projects-public-card-shell");
    expect(cardRoot?.querySelectorAll(".projects-public-card-shadow")).toHaveLength(0);
  });

  it("prioriza apenas a primeira capa no desktop sem medicao auxiliar de badges", async () => {
    const projects = Array.from({ length: 7 }, (_, index) => ({
      ...createProject(index + 1, { title: `Projeto ${index + 1}` }),
      cover: `/uploads/projects/projeto-${index + 1}.png`,
    }));
    const mediaVariants = Object.fromEntries(
      projects.map((project, index) => [
        project.cover,
        {
          variantsVersion: 3,
          variants: {
            posterThumb: {
              width: 320,
              formats: {
                avif: { url: `/uploads/_variants/p${index + 1}/poster-thumb-v3.avif` },
                webp: { url: `/uploads/_variants/p${index + 1}/poster-thumb-v3.webp` },
                fallback: { url: `/uploads/_variants/p${index + 1}/poster-thumb-v3.jpeg` },
              },
            },
            poster: {
              width: 920,
              formats: {
                fallback: { url: `/uploads/_variants/p${index + 1}/poster-v3.jpeg` },
              },
            },
          },
        },
      ]),
    );

    setupApiMock({
      projects,
      mediaVariants,
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const coverImages = await Promise.all(
      projects.map((project) => screen.findByRole("img", { name: project.title })),
    );

    expect(coverImages[0]).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/p1/poster-thumb-v3.jpeg"),
    );
    expect(coverImages[0]).toHaveAttribute("sizes", PROJECTS_LIST_IMAGE_SIZES);
    expect(coverImages[0]).toHaveAttribute("loading", "eager");
    expect(coverImages[0]).toHaveAttribute("fetchpriority", "high");
    coverImages.slice(1).forEach((coverImage, index) => {
      expect(coverImage).toHaveAttribute(
        "src",
        expect.stringContaining(`/uploads/_variants/p${index + 2}/poster-thumb-v3.jpeg`),
      );
      expect(coverImage).toHaveAttribute("sizes", PROJECTS_LIST_IMAGE_SIZES);
      expect(coverImage).toHaveAttribute("loading", "lazy");
      expect(coverImage).not.toHaveAttribute("fetchpriority");
    });
    expect(useDynamicSynopsisClampMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        keys: projects.map((project) => project.id),
        maxLines: 4,
        resolveMaxLines: expect.any(Function),
      }),
    );
    const clampCall = useDynamicSynopsisClampMock.mock.lastCall?.[0] as {
      resolveMaxLines: (context: {
        key: string;
        column: HTMLElement;
        columnWidth: number;
        defaultMaxLines: number;
      }) => number;
    };
    expect(
      clampCall.resolveMaxLines({
        key: "project-1",
        column: document.createElement("div"),
        columnWidth: 280,
        defaultMaxLines: 4,
      }),
    ).toBe(2);
    expect(
      clampCall.resolveMaxLines({
        key: "project-2",
        column: document.createElement("div"),
        columnWidth: 360,
        defaultMaxLines: 4,
      }),
    ).toBe(3);
    expect(
      clampCall.resolveMaxLines({
        key: "project-3",
        column: document.createElement("div"),
        columnWidth: 520,
        defaultMaxLines: 4,
      }),
    ).toBe(4);
    expect(container.querySelector("[data-badge-key]")).toBeNull();
  });

  it("usa clamp adaptativo mobile sem reintroduzir medicao auxiliar de badges", async () => {
    setViewportIsMobile(true);
    const projects = Array.from({ length: 7 }, (_, index) => ({
      ...createProject(index + 1, { title: `Projeto ${index + 1}` }),
      cover: `/uploads/projects/projeto-${index + 1}.png`,
    }));
    const mediaVariants = Object.fromEntries(
      projects.map((project, index) => [
        project.cover,
        {
          variantsVersion: 3,
          variants: {
            posterThumb: {
              width: 320,
              formats: {
                avif: { url: `/uploads/_variants/p${index + 1}/poster-thumb-v3.avif` },
                webp: { url: `/uploads/_variants/p${index + 1}/poster-thumb-v3.webp` },
                fallback: { url: `/uploads/_variants/p${index + 1}/poster-thumb-v3.jpeg` },
              },
            },
            poster: {
              width: 920,
              formats: {
                fallback: { url: `/uploads/_variants/p${index + 1}/poster-v3.jpeg` },
              },
            },
          },
        },
      ]),
    );

    setupApiMock({
      projects,
      mediaVariants,
    });
    useDynamicSynopsisClampMock.mockReturnValue({
      rootRef: synopsisRootRefMock,
      lineByKey: Object.fromEntries(projects.map((project) => [project.id, 2])),
    });

    const { container } = render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const coverImages = await Promise.all(
      projects.map((project) => screen.findByRole("img", { name: project.title })),
    );

    expect(coverImages[0]).toHaveAttribute("loading", "eager");
    expect(coverImages[0]).toHaveAttribute("fetchpriority", "high");
    coverImages.slice(1).forEach((coverImage) => {
      expect(coverImage).toHaveAttribute("loading", "lazy");
      expect(coverImage).not.toHaveAttribute("fetchpriority");
    });
    expect(useDynamicSynopsisClampMock).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        keys: projects.map((project) => project.id),
        maxLines: 4,
        resolveMaxLines: expect.any(Function),
      }),
    );
    const clampCall = useDynamicSynopsisClampMock.mock.lastCall?.[0] as {
      resolveMaxLines: (context: {
        key: string;
        column: HTMLElement;
        columnWidth: number;
        defaultMaxLines: number;
      }) => number;
    };
    expect(
      clampCall.resolveMaxLines({
        key: "project-1",
        column: document.createElement("div"),
        columnWidth: 280,
        defaultMaxLines: 4,
      }),
    ).toBe(2);
    expect(
      clampCall.resolveMaxLines({
        key: "project-2",
        column: document.createElement("div"),
        columnWidth: 360,
        defaultMaxLines: 4,
      }),
    ).toBe(3);
    expect(container.querySelector("[data-badge-key]")).toBeNull();
    Array.from(container.querySelectorAll('[data-synopsis-role="synopsis"]')).forEach((node) => {
      expect(node).toHaveClass("projects-public-synopsis", "projects-public-synopsis-clamp-2");
      expect(node).toHaveAttribute("data-synopsis-lines", "2");
    });
  });

  it("conecta a grade ao rootRef do clamp e aplica classes dinamicas por projeto", async () => {
    setupApiMock({
      projects: createProjects(5),
    });
    useDynamicSynopsisClampMock.mockReturnValue({
      rootRef: synopsisRootRefMock,
      lineByKey: {
        "project-1": 0,
        "project-2": 1,
        "project-3": 2,
        "project-4": 3,
        "project-5": 4,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await screen.findByText("Projeto 1");

    expect(synopsisRootRefMock.current).not.toBeNull();
    const synopsisNodes = Array.from(
      synopsisRootRefMock.current?.querySelectorAll<HTMLElement>(
        '[data-synopsis-role="synopsis"]',
      ) || [],
    );

    expect(synopsisNodes).toHaveLength(5);
    expect(synopsisNodes[0]).toHaveClass("projects-public-synopsis-clamp-0");
    expect(synopsisNodes[1]).toHaveClass("projects-public-synopsis-clamp-1");
    expect(synopsisNodes[2]).toHaveClass("projects-public-synopsis-clamp-2");
    expect(synopsisNodes[3]).toHaveClass("projects-public-synopsis-clamp-3");
    expect(synopsisNodes[4]).toHaveClass("projects-public-synopsis-clamp-4");
  });

  it("usa layout deterministico para exibir dois badges e overflow fixo", async () => {
    setupApiMock({
      projects: [
        createProject(1, {
          tags: ["acao", "comedia"],
          genres: ["drama"],
        }),
      ],
    });

    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    await screen.findByText("Projeto 1");

    await waitFor(() => {
      expect(screen.getByText("+1")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Filtrar por tag A.*o/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filtrar por tag comedia/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Filtrar por g.*nero Drama/i }),
    ).not.toBeInTheDocument();
  });

  it("adiciona aria-label e alvo minimo aos badges clicaveis", async () => {
    setupApiMock({
      projects: [createProject(1, { tags: ["acao"], genres: ["drama"] })],
    });

    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Projects />
        <LocationProbe />
      </MemoryRouter>,
    );

    const tagButton = await screen.findByRole("button", { name: /Filtrar por tag A.*o/i });
    const genreButton = await screen.findByRole("button", { name: /Filtrar por g.*nero Drama/i });

    expect(tagButton).toHaveClass(
      "min-h-6",
      "min-w-6",
      "rounded-full",
      "h-6",
      "px-2",
      "py-0",
      "border-border/70",
      "bg-background",
      "text-foreground/70",
      "hover:border-accent/60",
      "hover:bg-accent/15",
      "hover:text-foreground",
    );
    expect(genreButton).toHaveClass(
      "min-h-6",
      "min-w-6",
      "rounded-full",
      "h-6",
      "px-2",
      "py-0",
      "border-border/70",
      "bg-background",
      "text-foreground/70",
      "hover:border-accent/60",
      "hover:bg-accent/15",
      "hover:text-foreground",
    );
  });
});
