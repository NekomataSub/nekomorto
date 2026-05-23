import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigationType } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectEpisode } from "@/data/projects";
import { PUBLIC_ANALYTICS_INGEST_PATH } from "@/lib/public-analytics";
import ProjectReading from "@/pages/ProjectReading";

const apiFetchMock = vi.hoisted(() => vi.fn());
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchBestEffort: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => {
      const location = actual.useLocation();
      const match = String(location.pathname || "").match(
        /^\/projeto\/([^/]+)\/leitura\/([^/?#]+)/i,
      );
      return {
        slug: match?.[1] ? decodeURIComponent(match[1]) : "projeto-teste",
        chapter: match?.[2] ? decodeURIComponent(match[2]) : "1",
      };
    },
  };
});

vi.mock("@/components/lexical/LexicalViewer", () => ({
  default: () => <div data-testid="lexical-viewer" />,
}));

vi.mock("@/components/CommentsSection", () => ({
  default: () => null,
}));

vi.mock("@/components/Header", () => ({
  default: ({
    variant = "fixed",
    showBottomGradient = true,
  }: {
    variant?: "fixed" | "static";
    showBottomGradient?: boolean;
  }) => (
    <div
      ref={(node) => {
        if (!node) {
          return;
        }
        Object.defineProperty(node, "getBoundingClientRect", {
          configurable: true,
          value: () =>
            ({
              x: 0,
              y: 0,
              top: 0,
              bottom: 96,
              left: 0,
              right: 1280,
              width: 1280,
              height: 96,
              toJSON: () => ({}),
            }) as DOMRect,
        });
      }}
      data-testid="public-header"
      data-variant={variant}
      data-show-bottom-gradient={String(showBottomGradient)}
    />
  ),
}));

vi.mock("@/components/Footer", () => ({
  default: () => <div data-testid="public-footer" />,
}));

vi.mock("@/components/DiscordInviteCard", () => ({
  default: () => <div data-testid="discord-invite-card" />,
}));

vi.mock("@/components/LatestEpisodeCard", () => ({
  default: () => <div data-testid="latest-episode-card" />,
}));

vi.mock("@/components/WorkStatusCard", () => ({
  default: () => <div data-testid="work-status-card" />,
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const mockRectsByTestId = (
  rects: Record<
    string,
    {
      top: number;
      bottom: number;
      left?: number;
      right?: number;
      width?: number;
      height?: number;
    }
  >,
) =>
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const testId = this.getAttribute("data-testid");
    const rect = testId ? rects[testId] : undefined;
    if (!rect) {
      return {
        x: 0,
        y: 0,
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      } as DOMRect;
    }

    const left = rect.left ?? 0;
    const right = rect.right ?? left + (rect.width ?? 0);
    const width = rect.width ?? Math.max(right - left, 0);
    const height = rect.height ?? Math.max(rect.bottom - rect.top, 0);

    return {
      x: left,
      y: rect.top,
      top: rect.top,
      bottom: rect.bottom,
      left,
      right,
      width,
      height,
      toJSON: () => ({}),
    } as DOMRect;
  });

const ProjectReadingLocationProbe = () => {
  const location = useLocation();
  const navigationType = useNavigationType();

  return (
    <>
      <div data-testid="project-reading-location-pathname">{location.pathname}</div>
      <div data-testid="project-reading-location-search">{location.search}</div>
      <div data-testid="project-reading-location-hash">{location.hash}</div>
      <div data-testid="project-reading-location-action">{navigationType}</div>
    </>
  );
};

const createReadingEpisodeFixture = (overrides: Partial<ProjectEpisode> = {}): ProjectEpisode => ({
  number: 1,
  title: "Capitulo 1",
  synopsis: "",
  releaseDate: "",
  duration: "",
  sourceType: "TV",
  sources: [],
  ...overrides,
});

type ProjectEpisodeFixture = Partial<ProjectEpisode> & Pick<ProjectEpisode, "number" | "title">;

const createProjectFixture = (episodeDownloads?: ProjectEpisodeFixture[]): Project => ({
  id: "projeto-teste",
  title: "Projeto Teste",
  synopsis: "Sinopse",
  description: "",
  type: "Light Novel",
  status: "",
  year: "",
  studio: "",
  episodes: "",
  tags: [],
  cover: "/uploads/project-cover.jpg",
  banner: "",
  season: "",
  schedule: "",
  rating: "",
  staff: [],
  volumeEntries: [],
  volumeCovers: [],
  episodeDownloads: episodeDownloads?.map((episode) => createReadingEpisodeFixture(episode)) || [
    createReadingEpisodeFixture({
      number: 1,
      volume: 2,
      title: "Capitulo 1",
      synopsis: "Resumo do capitulo",
      content: "<p>Conteudo</p>",
    }),
  ],
});

const createLexicalChapterResponse = ({
  number,
  volume,
  title,
  synopsis = "Resumo do capitulo",
}: {
  number: number;
  volume?: number;
  title: string;
  synopsis?: string;
}) => ({
  number,
  volume,
  title,
  synopsis,
  content: "<p>Conteudo</p>",
  contentFormat: "lexical" as const,
});

const createImageChapterResponse = ({
  number,
  volume,
  title,
  synopsis = "Resumo do capitulo",
}: {
  number: number;
  volume?: number;
  title: string;
  synopsis?: string;
}) => ({
  number,
  volume,
  title,
  synopsis,
  contentFormat: "images" as const,
  pages: [
    {
      position: 0,
      imageUrl: `/uploads/projects/projeto-teste/ch-${number}-v-${volume ?? "none"}-1.jpg`,
    },
    {
      position: 1,
      imageUrl: `/uploads/projects/projeto-teste/ch-${number}-v-${volume ?? "none"}-2.jpg`,
    },
  ],
  pageCount: 2,
  hasPages: true,
});

const setupProjectReadingApiMock = (
  episodeDownloads?: ProjectEpisodeFixture[],
  permissions: string[] | null = null,
  options?: {
    project?: Project;
    chapterEndpoint?: string;
    chapterResponse?: Record<string, unknown> | null;
    readerConfig?: Record<string, unknown> | null;
  },
) => {
  const project = options?.project || createProjectFixture(episodeDownloads);
  const chapterEndpoint =
    options?.chapterEndpoint || "/api/public/projects/projeto-teste/chapters/1?volume=2";
  const chapterResponse =
    options?.chapterResponse === undefined
      ? {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
          contentFormat: "lexical",
        }
      : options.chapterResponse;

  apiFetchMock.mockReset();
  (
    window as Window & {
      __BOOTSTRAP_PUBLIC__?: unknown;
      __BOOTSTRAP_PUBLIC_ME__?: unknown;
    }
  ).__BOOTSTRAP_PUBLIC__ = {
    settings: {},
    pages: {},
    projects: [
      {
        id: project.id,
        title: project.title,
        titleOriginal: "",
        titleEnglish: "",
        synopsis: project.synopsis,
        description: "",
        type: project.type,
        status: "",
        tags: [],
        genres: [],
        cover: project.cover,
        coverAlt: "",
        banner: "",
        bannerAlt: "",
        heroImageUrl: "",
        heroImageAlt: "",
        forceHero: false,
        trailerUrl: "",
        studio: "",
        episodes: "",
        producers: [],
        volumeEntries: project.volumeEntries || [],
        volumeCovers: project.volumeCovers || [],
        episodeDownloads: Array.isArray(project.episodeDownloads)
          ? project.episodeDownloads.map((entry) => ({
              number: Number(entry.number || 0),
              volume: Number.isFinite(Number(entry.volume)) ? Number(entry.volume) : undefined,
              title: String(entry.title || ""),
              content: typeof entry.content === "string" ? entry.content : "",
              contentFormat:
                String(entry.contentFormat || "")
                  .trim()
                  .toLowerCase() === "images"
                  ? "images"
                  : "lexical",
              pages: Array.isArray(entry.pages) ? entry.pages : [],
              pageCount: Number.isFinite(Number(entry.pageCount))
                ? Number(entry.pageCount)
                : undefined,
              hasPages: Boolean((entry as { hasPages?: boolean }).hasPages),
              releaseDate: String(entry.releaseDate || ""),
              duration: String(entry.duration || ""),
              coverImageUrl: String(entry.coverImageUrl || ""),
              coverImageAlt: String(entry.coverImageAlt || ""),
              sourceType: String(entry.sourceType || ""),
              sources: Array.isArray(entry.sources) ? entry.sources : [],
              progressStage: String(entry.progressStage || ""),
              completedStages: Array.isArray(entry.completedStages) ? entry.completedStages : [],
              chapterUpdatedAt: String(entry.chapterUpdatedAt || ""),
              hasContent:
                Boolean((entry as { hasContent?: boolean }).hasContent) ||
                (typeof entry.content === "string" && entry.content.trim().length > 0),
              entryKind:
                String((entry as { entryKind?: string }).entryKind || "")
                  .trim()
                  .toLowerCase() === "extra"
                  ? "extra"
                  : "main",
              entrySubtype: String((entry as { entrySubtype?: string }).entrySubtype || ""),
              readingOrder: Number.isFinite(Number(entry.readingOrder))
                ? Number(entry.readingOrder)
                : undefined,
              displayLabel: String((entry as { displayLabel?: string }).displayLabel || ""),
            }))
          : [],
        views: 0,
        viewsDaily: {},
        readerConfig:
          (project as { readerConfig?: Record<string, unknown> }).readerConfig || undefined,
      },
    ],
    posts: [],
    updates: [],
    teamMembers: [],
    teamLinkTypes: [],
    mediaVariants: {},
    tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
    generatedAt: "2026-03-10T00:00:00.000Z",
    payloadMode: "full",
  };
  (
    window as Window & {
      __BOOTSTRAP_PUBLIC__?: unknown;
      __BOOTSTRAP_PUBLIC_ME__?: unknown;
    }
  ).__BOOTSTRAP_PUBLIC_ME__ = permissions
    ? {
        id: "1",
        name: "Admin",
        username: "admin",
        permissions,
        grants: { projetos: permissions.includes("projetos") || permissions.includes("*") },
      }
    : null;
  apiFetchMock.mockImplementation(
    async (_apiBase: string, endpoint: string, requestOptions?: RequestInit) => {
      if (
        endpoint === "/api/public/projects/projeto-teste" &&
        (!requestOptions?.method || requestOptions.method === "GET")
      ) {
        return mockJsonResponse(true, { project });
      }
      if (
        endpoint === chapterEndpoint &&
        (!requestOptions?.method || requestOptions.method === "GET")
      ) {
        return mockJsonResponse(true, {
          chapter: chapterResponse,
          readerConfig: options?.readerConfig || undefined,
        });
      }
      if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && requestOptions?.method === "POST") {
        return mockJsonResponse(true, { ok: true });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    },
  );
};

describe("ProjectReading analytics", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    apiFetchMock.mockReset();
    window.localStorage.clear();
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      writable: true,
      value: 0,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1280,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      writable: true,
      value: 640,
    });
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC__;
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__;
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("envia evento chapter_view ao carregar capitulo", async () => {
    setupProjectReadingApiMock();

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });

    await waitFor(() => {
      const analyticsCall = apiFetchMock.mock.calls.find(
        (call) => call[1] === PUBLIC_ANALYTICS_INGEST_PATH,
      );
      expect(analyticsCall).toBeDefined();
      const requestOptions = (analyticsCall?.[2] || {}) as RequestInit;
      expect(String(requestOptions.method || "").toUpperCase()).toBe("POST");
      const payload = JSON.parse(String(requestOptions.body || "{}"));
      expect(payload.eventType).toBe("chapter_view");
      expect(payload.resourceType).toBe("chapter");
      expect(payload.meta?.projectId).toBe("projeto-teste");
      expect(payload.meta?.chapterNumber).toBe(1);
      expect(payload.meta?.volume).toBe(2);
    });
  });

  it("mantem o leitor carregado quando o chapter_view falha na rede", async () => {
    setupProjectReadingApiMock();
    const baseImplementation = apiFetchMock.getMockImplementation();
    if (!baseImplementation) {
      throw new Error("expected apiFetch mock implementation");
    }
    apiFetchMock.mockImplementation(
      async (apiBase: string, endpoint: string, options?: RequestInit) => {
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && options?.method === "POST") {
          throw new TypeError("Failed to fetch");
        }
        return baseImplementation(apiBase, endpoint, options);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Cap.*tulo 1/i })).toBeInTheDocument();
    expect(await screen.findByTestId("lexical-viewer")).toBeInTheDocument();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "",
        PUBLIC_ANALYTICS_INGEST_PATH,
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("nao renderiza controles do leitor e nao depende de storage local", async () => {
    setupProjectReadingApiMock();
    window.localStorage.setItem("reading.any-value", "1");

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    await screen.findByTestId("lexical-viewer");

    expect(screen.queryByText("Fonte")).not.toBeInTheDocument();
    expect(screen.queryByText("Contraste")).not.toBeInTheDocument();
    expect(screen.queryByText("Largura")).not.toBeInTheDocument();
    expect(screen.queryByText("Tamanho")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restaurar padr.o/i })).not.toBeInTheDocument();
  });

  it("restaura o hero dedicado do light novel e a navegacao textual entre capitulos", async () => {
    setupProjectReadingApiMock([
      {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        content: "<p>Conteudo</p>",
      },
      {
        number: 2,
        volume: 2,
        title: "Capitulo 2",
        synopsis: "Resumo do capitulo 2",
        content: "<p>Conteudo 2</p>",
      },
    ]);

    const { container } = render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });

    expect(screen.queryByRole("navigation", { name: /breadcrumb/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Leitura de Light Novel/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Volume 1/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("public-header")).toHaveAttribute("data-variant", "fixed");
    expect(screen.getByTestId("public-footer")).toBeInTheDocument();

    const hero = screen.getByTestId("project-reading-hero");
    expect(hero).toBeInTheDocument();
    expect(within(hero).getByText("Projeto Teste")).toBeInTheDocument();
    expect(within(hero).getByText("Resumo do capitulo")).toBeInTheDocument();
    expect(within(hero).getByText("Light Novel")).toBeInTheDocument();
    expect(within(hero).getByText(/Vol\. 2/i)).toBeInTheDocument();
    expect(within(hero).getByRole("link", { name: /Voltar ao projeto/i })).toHaveAttribute(
      "href",
      "/projeto/projeto-teste",
    );
    expect(within(hero).queryByRole("link", { name: /Editar cap.tulo/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-reading-info-bar")).not.toBeInTheDocument();
    const chapterNav = screen.getByTestId("project-reading-chapter-nav");
    expect(
      within(chapterNav).queryByRole("link", { name: /Cap.*tulo anterior/i }),
    ).not.toBeInTheDocument();
    expect(within(chapterNav).getByRole("link", { name: /Pr.ximo cap.*tulo/i })).toHaveAttribute(
      "href",
      "/projeto/projeto-teste/leitura/2?volume=2",
    );
    expect(screen.queryByTestId("project-reading-comments-handoff")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-reading-comments-sentinel")).toBeInTheDocument();
    expect(document.querySelector(".project-reading-reader-shell")).not.toBeNull();
    expect(container.firstElementChild).not.toHaveClass("pt-20", "md:pt-24");
  });

  it("exibe CTA de editar capitulo para staff com permissao de projetos", async () => {
    setupProjectReadingApiMock(undefined, ["projetos"]);

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    const editLink = await screen.findByRole("link", {
      name: /Editar cap.tulo/i,
    });
    expect(editLink).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );
    expect(editLink.querySelector("svg")).not.toBeNull();
  });

  it("mantem o CTA de editar capitulo canonico em capitulo ambiguo quando a resposta publica omite o volume", async () => {
    setupProjectReadingApiMock(
      [
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1 - Volume 2",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
        },
        {
          number: 1,
          volume: 3,
          title: "Capitulo 1 - Volume 3",
          synopsis: "Resumo do capitulo 3",
          content: "<p>Conteudo 3</p>",
        },
      ],
      ["projetos"],
      {
        chapterResponse: {
          number: 1,
          title: "Capitulo 1 - Publico",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
          contentFormat: "lexical",
        },
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    const editLink = await screen.findByRole("link", {
      name: /Editar cap.tulo/i,
    });
    expect(editLink).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );
  });

  it("mantem o CTA de editar capitulo com ?volume=0 quando esse é o desambiguador canônico", async () => {
    setupProjectReadingApiMock(
      [
        {
          number: 1,
          volume: 0,
          title: "Capitulo 1 - Volume 0",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
        },
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1 - Volume 2",
          synopsis: "Resumo do capitulo 2",
          content: "<p>Conteudo 2</p>",
        },
      ],
      ["projetos"],
      {
        chapterEndpoint: "/api/public/projects/projeto-teste/chapters/1?volume=0",
        chapterResponse: {
          number: 1,
          title: "Capitulo 1 - Publico",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
          contentFormat: "lexical",
        },
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=0"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    const editLink = await screen.findByRole("link", {
      name: /Editar cap.tulo/i,
    });
    expect(editLink).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=0",
    );
  });

  it("nao renderiza o CTA de editar capitulo quando a resolucao canonica continua ambigua", async () => {
    setupProjectReadingApiMock(
      [
        {
          number: 1,
          title: "Capitulo 1 - Sem volume",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
        },
        {
          number: 1,
          volume: 3,
          title: "Capitulo 1 - Volume 3",
          synopsis: "Resumo do capitulo 3",
          content: "<p>Conteudo 3</p>",
        },
      ],
      ["projetos"],
      {
        chapterEndpoint: "/api/public/projects/projeto-teste/chapters/1",
        chapterResponse: {
          number: 1,
          title: "Capitulo 1 - Publico",
          synopsis: "Resumo do capitulo",
          content: "<p>Conteudo</p>",
          contentFormat: "lexical",
        },
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-hero");
    expect(screen.getByRole("link", { name: /Editar cap.tulo/i })).toBeInTheDocument();
  });

  it("nao exibe CTA de editar capitulo sem permissao", async () => {
    setupProjectReadingApiMock(undefined, ["posts"]);

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    expect(screen.queryByRole("link", { name: /Editar cap.tulo/i })).not.toBeInTheDocument();
  });

  it("mantem a acao de retorno no hero e deixa os controles do reader no menu em-stage", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
        {
          number: 2,
          volume: 2,
          title: "Capitulo 2",
          synopsis: "Resumo do capitulo 2",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      readerConfig: {
        layout: "scroll-vertical",
        imageFit: "both",
        chromeMode: "default",
        viewportMode: "viewport",
        siteHeaderVariant: "fixed",
        showSiteFooter: true,
      },
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");
    const firstFold = screen.getByTestId("project-reading-first-fold");
    const imageLayout = screen.getByTestId("project-reading-images-layout");
    const publicHeader = screen.getByTestId("public-header");
    const readerShell = screen.getByTestId("project-reading-full-bleed-shell");
    const readerBar = screen.getByTestId("project-reading-reader-bar");
    const infoBar = screen.getByTestId("project-reading-info-bar");
    const contextRow = within(infoBar).getByTestId("project-reading-context-row");
    const projectTitle = within(infoBar).getByTestId("project-reading-project-title");
    const chapterContext = within(infoBar).getByTestId("project-reading-chapter-context");
    const synopsis = within(infoBar).getByTestId("project-reading-synopsis");
    const actions = within(infoBar).getByTestId("project-reading-actions");
    const heading = within(readerBar).getByRole("heading", {
      name: /Cap.*tulo 1/i,
    });
    const commentsHandoff = screen.getByTestId("project-reading-comments-handoff");
    const commentsSentinel = screen.getByTestId("project-reading-comments-sentinel");

    expect(firstFold).toHaveClass("project-reading-first-fold", "min-h-screen");
    expect(imageLayout).toHaveClass("flex", "min-h-0", "flex-1", "flex-col");
    expect(imageLayout).not.toHaveClass("pb-16");
    expect(imageLayout).not.toHaveClass("mx-auto");
    expect(imageLayout.style.maxWidth).toBe("");
    expect(publicHeader).toHaveAttribute("data-variant", "fixed");
    expect(publicHeader).toHaveAttribute("data-show-bottom-gradient", "true");
    expect(firstFold).not.toHaveAttribute("data-site-header-attached");
    await waitFor(() => {
      expect(screen.getByTestId("project-reading-site-header-offset").style.height).toBe("96px");
    });
    expect(readerShell).toHaveClass("w-full");
    expect(readerShell).toHaveClass("gap-2", "md:gap-3");
    expect(readerBar).not.toHaveClass("mx-auto");
    expect(readerBar).toHaveClass("gap-4", "py-3", "md:py-4");
    expect(readerBar.style.maxWidth).toBe("");
    expect(infoBar).toHaveAttribute("data-variant", "reader-full-bleed");
    expect(projectTitle).toHaveAttribute("href", "/projeto/projeto-teste");
    expect(projectTitle).toHaveClass("project-reading-masthead__overline");
    expect(chapterContext).toHaveTextContent(/Cap.*tulo 1/i);
    expect(contextRow).toBeInTheDocument();
    expect(within(infoBar).queryByTestId("project-reading-project-type")).not.toBeInTheDocument();
    expect(within(actions).getByRole("link", { name: /Voltar ao projeto/i })).toHaveAttribute(
      "href",
      "/projeto/projeto-teste",
    );
    expect(within(actions).getByRole("link", { name: /Voltar ao projeto/i })).toHaveClass(
      "project-reading-action-btn",
      "project-reading-action-btn--secondary",
    );
    expect(
      within(actions).queryByRole("link", { name: /Editar cap.tulo/i }),
    ).not.toBeInTheDocument();
    expect(synopsis).toHaveTextContent("Resumo do capitulo");
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass("project-reading-masthead__title");
    expect(synopsis).toHaveClass("project-reading-masthead__synopsis");
    expect(within(infoBar).queryByTestId("project-reading-meta-row")).not.toBeInTheDocument();
    expect(
      projectTitle.compareDocumentPosition(chapterContext) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      chapterContext.compareDocumentPosition(synopsis) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(commentsHandoff.style.minHeight).toBe("5rem");
    expect(
      publicHeader.compareDocumentPosition(infoBar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      infoBar.compareDocumentPosition(screen.getByTestId("project-reading-stage")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(firstFold.contains(imageLayout)).toBe(true);
    expect(firstFold.contains(commentsHandoff)).toBe(false);
    expect(
      firstFold.compareDocumentPosition(commentsHandoff) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      commentsHandoff.compareDocumentPosition(commentsSentinel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await waitFor(() => {
      expect(readerShell.style.minHeight).toMatch(/px$/);
    });

    expect(screen.queryByTestId("project-reading-chapter-nav")).not.toBeInTheDocument();
    expect(screen.queryByTestId("project-reader-sidebar")).not.toBeInTheDocument();
    expect(
      screen
        .getByTestId("project-reading-stage")
        .contains(screen.getByTestId("project-reader-menu-button")),
    ).toBe(true);
    expect(infoBar.contains(screen.getByTestId("project-reader-menu-button"))).toBe(false);

    fireEvent.click(screen.getByTestId("project-reader-menu-button"));
    expect(await screen.findByText("Leitor")).toBeInTheDocument();
    expect(screen.getByTestId("project-reader-sidebar")).toBeInTheDocument();
    expect(
      screen
        .getByTestId("project-reading-stage")
        .contains(screen.getByTestId("project-reader-sidebar")),
    ).toBe(true);
    expect(screen.getByRole("combobox", { name: /Selecionar cap.tulo/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Selecionar p.gina/i })).toBeInTheDocument();
    expect(
      within(screen.getByTestId("project-reader-sidebar")).queryByRole("link", {
        name: /Voltar ao projeto/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("project-reader-sidebar")).queryByRole("link", {
        name: /Editar cap.tulo/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("muda o wrapper do leitor de imagens pelo readerConfig mesmo com o mesmo projectType", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };
    const chapterResponse = {
      number: 1,
      volume: 2,
      title: "Capitulo 1",
      synopsis: "Resumo do capitulo",
      contentFormat: "images",
      pages: [{ position: 0, imageUrl: "/uploads/projects/projeto-teste/page-1.jpg" }],
      pageCount: 1,
      hasPages: true,
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      readerConfig: {
        layout: "scroll-vertical",
        imageFit: "both",
        chromeMode: "default",
        viewportMode: "viewport",
        siteHeaderVariant: "fixed",
        showSiteFooter: true,
      },
      chapterResponse,
    });

    const viewportRender = render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");
    expect(screen.getByTestId("project-reading-first-fold")).toBeInTheDocument();
    expect(screen.getByTestId("public-header")).toBeInTheDocument();
    expect(screen.getByTestId("public-footer")).toBeInTheDocument();
    viewportRender.unmount();

    setupProjectReadingApiMock(undefined, null, {
      project,
      readerConfig: {
        layout: "scroll-vertical",
        imageFit: "width",
        chromeMode: "cinema",
        viewportMode: "natural",
        siteHeaderVariant: "static",
        showSiteFooter: false,
      },
      chapterResponse,
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    const imageLayout = await screen.findByTestId("project-reading-images-layout");
    expect(screen.queryByTestId("project-reading-first-fold")).not.toBeInTheDocument();
    expect(screen.getByTestId("public-header")).toHaveAttribute("data-variant", "static");
    expect(screen.queryByTestId("project-reading-site-header-offset")).not.toBeInTheDocument();
    expect(screen.queryByTestId("public-footer")).not.toBeInTheDocument();
    expect(imageLayout.parentElement).not.toHaveAttribute("data-site-header-attached");
    expect(imageLayout).toHaveClass("min-h-screen");
    expect(imageLayout).not.toHaveClass("flex-1", "min-h-0");
    expect(screen.getByTestId("project-reading-info-bar")).toHaveAttribute(
      "data-variant",
      "reader-cinema",
    );
    expect(screen.getByTestId("project-reading-stage")).toHaveAttribute(
      "data-viewport-mode",
      "natural",
    );
  });

  it.each([
    "Manga",
    "Webtoon",
  ] as const)("aplica o mesmo wrapper de imagem quando %s recebe o mesmo readerConfig", async (projectType) => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: projectType,
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      readerConfig: {
        layout: "scroll-vertical",
        imageFit: "width",
        chromeMode: "cinema",
        viewportMode: "natural",
        siteHeaderVariant: "static",
        showSiteFooter: false,
      },
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    const imageLayout = await screen.findByTestId("project-reading-images-layout");
    expect(screen.queryByTestId("project-reading-first-fold")).not.toBeInTheDocument();
    expect(screen.getByTestId("public-header")).toHaveAttribute("data-variant", "static");
    expect(screen.queryByTestId("public-footer")).not.toBeInTheDocument();
    expect(imageLayout).toHaveClass("flex", "flex-col", "min-h-screen");
    expect(screen.getByTestId("project-reading-info-bar")).toHaveAttribute(
      "data-variant",
      "reader-cinema",
    );
    expect(screen.getByTestId("project-reading-stage")).toHaveAttribute(
      "data-chrome-mode",
      "cinema",
    );
    expect(screen.getByTestId("project-reading-stage")).toHaveAttribute(
      "data-viewport-mode",
      "natural",
    );
  });

  it("mostra Editar extra no hero do leitor de imagens", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Extra 1",
          synopsis: "Resumo do extra",
          hasPages: true,
          entryKind: "extra",
          displayLabel: "Extra 1",
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, ["projetos"], {
      project,
      readerConfig: {
        layout: "single",
        imageFit: "both",
      },
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Extra 1",
        synopsis: "Resumo do extra",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/extra-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
        entryKind: "extra",
        displayLabel: "Extra 1",
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    const actions = within(await screen.findByTestId("project-reading-info-bar")).getByTestId(
      "project-reading-actions",
    );
    expect(within(actions).getByRole("link", { name: /Editar extra/i })).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );
  });

  it("usa hasContent e hasPages do payload publico enxuto na navegacao", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasContent: true,
        },
        {
          number: 2,
          volume: 2,
          title: "Capitulo 2",
          synopsis: "Capitulo por imagens",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");
    fireEvent.click(screen.getByTestId("project-reader-menu-button"));

    const chapterTrigger = screen.getByRole("combobox", {
      name: /Selecionar cap.tulo/i,
    });
    fireEvent.click(chapterTrigger);

    expect(await screen.findByRole("option", { name: /Cap.*tulo 2/i })).toBeInTheDocument();
  });

  it("mantem a mesma ordem de volume zero no menu do image reader", async () => {
    const imageEpisodes = [
      {
        number: 1,
        volume: 0,
        title: "Capitulo 1 - Volume 0",
        synopsis: "Resumo do capitulo 1 v0",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/ch-1-v-0-1.jpg",
          },
          {
            position: 1,
            imageUrl: "/uploads/projects/projeto-teste/ch-1-v-0-2.jpg",
          },
        ],
        hasPages: true,
      },
      {
        number: 2,
        volume: 0,
        title: "Capitulo 2 - Volume 0",
        synopsis: "Resumo do capitulo 2 v0",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/ch-2-v-0-1.jpg",
          },
          {
            position: 1,
            imageUrl: "/uploads/projects/projeto-teste/ch-2-v-0-2.jpg",
          },
        ],
        hasPages: true,
      },
      {
        number: 1,
        volume: 1,
        title: "Capitulo 1 - Volume 1",
        synopsis: "Resumo do capitulo 1 v1",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/ch-1-v-1-1.jpg",
          },
          {
            position: 1,
            imageUrl: "/uploads/projects/projeto-teste/ch-1-v-1-2.jpg",
          },
        ],
        hasPages: true,
      },
      {
        number: 2,
        volume: 1,
        title: "Capitulo 2 - Volume 1",
        synopsis: "Resumo do capitulo 2 v1",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/ch-2-v-1-1.jpg",
          },
          {
            position: 1,
            imageUrl: "/uploads/projects/projeto-teste/ch-2-v-1-2.jpg",
          },
        ],
        hasPages: true,
      },
    ] satisfies ProjectEpisodeFixture[];
    const project = {
      ...createProjectFixture(imageEpisodes),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterEndpoint: "/api/public/projects/projeto-teste/chapters/2?volume=0",
      chapterResponse: createImageChapterResponse({
        number: 2,
        volume: 0,
        title: "Capitulo 2 - Volume 0",
      }),
    });

    const baseImplementation = apiFetchMock.getMockImplementation();
    if (!baseImplementation) {
      throw new Error("expected apiFetch mock implementation");
    }

    apiFetchMock.mockImplementation(
      async (apiBase: string, endpoint: string, options?: RequestInit) => {
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=1" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, {
            chapter: createImageChapterResponse({
              number: 1,
              volume: 1,
              title: "Capitulo 1 - Volume 1",
            }),
          });
        }

        return baseImplementation(apiBase, endpoint, options);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/2?volume=0"]}>
        <ProjectReading />
        <ProjectReadingLocationProbe />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");
    fireEvent.click(screen.getByTestId("project-reader-menu-button"));

    const sidebar = await screen.findByTestId("project-reader-sidebar");
    const previousButton = within(sidebar).getByRole("button", {
      name: /Cap.tulo anterior/i,
    });
    const nextButton = within(sidebar).getByRole("button", {
      name: /Pr.ximo cap.tulo/i,
    });
    expect(previousButton).toHaveClass(
      "project-reading-nav-btn",
      "project-reading-nav-btn--secondary",
    );
    expect(nextButton).toHaveClass("project-reading-nav-btn", "project-reading-nav-btn--next");
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.queryByTestId("project-reader-sidebar")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("project-reading-location-pathname").textContent).toBe(
        "/projeto/projeto-teste/leitura/1",
      );
      expect(screen.getByTestId("project-reading-location-search").textContent).toMatch(
        /^\?volume=1(?:&page=1)?$/,
      );
    });

    fireEvent.click(screen.getByTestId("project-reader-menu-button"));

    const chapterTrigger = screen.getByRole("combobox", {
      name: /Selecionar cap.tulo/i,
    });
    fireEvent.click(chapterTrigger);

    const optionTexts = (await screen.findAllByRole("option")).map((option) =>
      String(option.textContent || "")
        .replace(/\s+/g, " ")
        .trim(),
    );
    expect(optionTexts[0]).toMatch(/Vol\. 0 .*Cap.*tulo 1/i);
    expect(optionTexts[1]).toMatch(/Vol\. 0 .*Cap.*tulo 2/i);
    expect(optionTexts[2]).toMatch(/Vol\. 1 .*Cap.*tulo 1/i);
    expect(optionTexts[3]).toMatch(/Vol\. 1 .*Cap.*tulo 2/i);
  });

  it("entra no palco ao abrir um capitulo por imagens sem hash na URL", async () => {
    const rectSpy = mockRectsByTestId({
      "project-reading-stage": {
        top: 280,
        bottom: 920,
        width: 1200,
        height: 640,
      },
      "reader-page-0": { top: 280, bottom: 920, width: 1200, height: 640 },
    });
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");

    await waitFor(() => {
      expect(window.scrollTo).toHaveBeenCalledWith({
        top: 216,
        behavior: "auto",
      });
    });

    rectSpy.mockRestore();
  });

  it("sincroniza ?page=1 na rota publica de leitura quando a URL nao traz pagina", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
        <ProjectReadingLocationProbe />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");

    await waitFor(() => {
      expect(screen.getByTestId("project-reading-location-search")).toHaveTextContent(
        "?volume=2&page=1",
      );
      expect(screen.getByTestId("project-reading-location-action")).toHaveTextContent("REPLACE");
    });
  });

  it("respeita ?page existente ao entrar na rota publica de leitura", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
        {
          number: 2,
          volume: 2,
          title: "Capitulo 2",
          synopsis: "Resumo do capitulo 2",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
          {
            position: 1,
            imageUrl: "/uploads/projects/projeto-teste/page-2.jpg",
          },
        ],
        pageCount: 2,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2&page=2"]}>
        <ProjectReading />
        <ProjectReadingLocationProbe />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");

    await waitFor(() => {
      expect(screen.getByTestId("project-reading-location-search")).toHaveTextContent(
        "?volume=2&page=2",
      );
    });
    expect(screen.getByTestId("project-reading-location-action")).toHaveTextContent("POP");
  });

  it("preserva o fluxo de hash de comentario e nao forca retorno ao palco", async () => {
    const rectSpy = mockRectsByTestId({
      "project-reading-stage": {
        top: 280,
        bottom: 920,
        width: 1200,
        height: 640,
      },
      "reader-page-0": { top: 280, bottom: 920, width: 1200, height: 640 },
    });
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2#comment-42"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");
    expect(window.scrollTo).not.toHaveBeenCalled();

    rectSpy.mockRestore();
  });

  it("preserva o hash de comentario enquanto sincroniza ?page na rota publica", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2#comment-42"]}>
        <ProjectReading />
        <ProjectReadingLocationProbe />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");

    await waitFor(() => {
      expect(screen.getByTestId("project-reading-location-search")).toHaveTextContent(
        "?volume=2&page=1",
      );
      expect(screen.getByTestId("project-reading-location-hash")).toHaveTextContent("#comment-42");
      expect(screen.getByTestId("project-reading-location-action")).toHaveTextContent("REPLACE");
    });
  });

  it("aplica offset quando a preferencia legada do leitor resolve o header fixo", async () => {
    window.localStorage.setItem(
      "public.reader.preferences",
      JSON.stringify({
        reader: {
          projectTypes: {
            manga: {
              showSiteHeader: true,
            },
          },
        },
      }),
    );

    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    const publicHeader = await screen.findByTestId("public-header");
    expect(publicHeader).toHaveAttribute("data-variant", "fixed");
    expect(publicHeader).toHaveAttribute("data-show-bottom-gradient", "true");
    await waitFor(() => {
      expect(screen.getByTestId("project-reading-site-header-offset").style.height).toBe("96px");
    });
  });

  it("renderiza o footer do site ao final do fluxo do leitor por imagens quando a config o habilita", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Webtoon",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      readerConfig: {
        layout: "scroll-vertical",
        imageFit: "width",
        chromeMode: "cinema",
        viewportMode: "natural",
        siteHeaderVariant: "static",
        showSiteFooter: true,
      },
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("project-reading-stage");

    const commentsSentinel = screen.getByTestId("project-reading-comments-sentinel");
    const footer = screen.getByTestId("public-footer");
    const publicHeader = screen.getByTestId("public-header");

    expect(publicHeader).toHaveAttribute("data-variant", "static");
    expect(footer).toBeInTheDocument();
    expect(
      commentsSentinel.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps vertical image reader chapters in natural document flow when viewportMode is natural", async () => {
    const project = {
      ...createProjectFixture([
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          hasPages: true,
        },
      ]),
      type: "Manga",
    };

    setupProjectReadingApiMock(undefined, null, {
      project,
      readerConfig: {
        layout: "scroll-vertical",
        imageFit: "width",
        chromeMode: "cinema",
        viewportMode: "natural",
        siteHeaderVariant: "static",
        showSiteFooter: false,
      },
      chapterResponse: {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        contentFormat: "images",
        pages: [
          {
            position: 0,
            imageUrl: "/uploads/projects/projeto-teste/page-1.jpg",
          },
        ],
        pageCount: 1,
        hasPages: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    const imageLayout = await screen.findByTestId("project-reading-images-layout");
    const readerShell = screen.getByTestId("project-reading-full-bleed-shell");
    const stage = screen.getByTestId("project-reading-stage");
    const commentsHandoff = screen.getByTestId("project-reading-comments-handoff");
    const commentsSentinel = screen.getByTestId("project-reading-comments-sentinel");

    expect(screen.getByTestId("public-header")).toHaveAttribute("data-variant", "static");
    expect(screen.queryByTestId("project-reading-site-header-offset")).not.toBeInTheDocument();
    expect(imageLayout).toHaveClass("flex", "flex-col", "min-h-screen");
    expect(imageLayout).not.toHaveClass("flex-1", "min-h-0");
    expect(commentsHandoff.style.minHeight).toBe("5rem");
    expect(
      imageLayout.compareDocumentPosition(commentsHandoff) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      commentsHandoff.compareDocumentPosition(commentsSentinel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await waitFor(() => {
      expect(readerShell.style.minHeight).toMatch(/px$/);
      expect(readerShell.style.height).toBe("");
      expect(stage.style.minHeight).toMatch(/px$/);
      expect(stage.style.height).toBe("");
    });
  });

  it("keeps lexical chapters without the image-reader comments handoff spacer", async () => {
    setupProjectReadingApiMock();

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByTestId("lexical-viewer");

    expect(screen.getByTestId("public-header")).toHaveAttribute("data-variant", "fixed");
    expect(screen.getByTestId("public-footer")).toBeInTheDocument();
    expect(screen.queryByTestId("project-reading-comments-handoff")).not.toBeInTheDocument();
    expect(screen.getByTestId("project-reading-comments-sentinel")).toBeInTheDocument();
  });

  it("ignora capitulos sem leitura na navegacao publica", async () => {
    setupProjectReadingApiMock([
      {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        synopsis: "Resumo do capitulo",
        content: "<p>Conteudo</p>",
        hasContent: true,
      },
      {
        number: 2,
        volume: 2,
        title: "Capitulo 2",
        synopsis: "So download",
        hasContent: false,
        sources: [{ label: "Drive", url: "https://example.com/file" }],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    expect(screen.queryByRole("link", { name: /Pr.ximo cap.tulo/i })).not.toBeInTheDocument();
  });

  it("coloca capitulos com volume zero no inicio global da navegacao textual", async () => {
    const episodeDownloads = [
      {
        number: 1,
        volume: 0,
        title: "Capitulo 1 - Volume 0",
        synopsis: "Resumo do capitulo 1 v0",
        content: "<p>Conteudo 1 v0</p>",
        hasContent: true,
      },
      {
        number: 2,
        volume: 0,
        title: "Capitulo 2 - Volume 0",
        synopsis: "Resumo do capitulo 2 v0",
        content: "<p>Conteudo 2 v0</p>",
        hasContent: true,
      },
      {
        number: 1,
        volume: 1,
        title: "Capitulo 1 - Volume 1",
        synopsis: "Resumo do capitulo 1 v1",
        content: "<p>Conteudo 1 v1</p>",
        hasContent: true,
      },
      {
        number: 2,
        volume: 1,
        title: "Capitulo 2 - Volume 1",
        synopsis: "Resumo do capitulo 2 v1",
        content: "<p>Conteudo 2 v1</p>",
        hasContent: true,
      },
    ] satisfies ProjectEpisodeFixture[];
    const project = createProjectFixture(episodeDownloads);
    const renderReadingChapter = (chapterNumber: number, volume: number) => {
      setupProjectReadingApiMock(undefined, null, {
        project,
        chapterEndpoint: `/api/public/projects/projeto-teste/chapters/${chapterNumber}?volume=${volume}`,
        chapterResponse: createLexicalChapterResponse({
          number: chapterNumber,
          volume,
          title: `Capitulo ${chapterNumber} - Volume ${volume}`,
        }),
      });

      return render(
        <MemoryRouter
          initialEntries={[`/projeto/projeto-teste/leitura/${chapterNumber}?volume=${volume}`]}
        >
          <ProjectReading />
        </MemoryRouter>,
      );
    };

    const firstRender = renderReadingChapter(1, 0);
    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo 1 - Volume 0/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Cap.tulo anterior/i })).not.toBeInTheDocument();
    const firstNextLink = screen.getByRole("link", {
      name: /Pr.ximo cap.tulo/i,
    });
    expect(firstNextLink).toHaveClass(
      "project-reading-nav-btn",
      "project-reading-nav-btn--next",
      "project-reading-chapter-nav__button--next",
      "ml-auto",
    );
    expect(firstNextLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/2?volume=0");
    firstRender.unmount();

    const secondRender = renderReadingChapter(2, 0);
    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo 2 - Volume 0/i }),
    ).toBeInTheDocument();
    const secondNextLink = screen.getByRole("link", {
      name: /Pr.ximo cap.tulo/i,
    });
    expect(secondNextLink).toHaveClass(
      "project-reading-nav-btn",
      "project-reading-nav-btn--next",
      "project-reading-chapter-nav__button--next",
      "ml-auto",
    );
    expect(secondNextLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/1?volume=1");
    secondRender.unmount();

    renderReadingChapter(1, 1);
    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo 1 - Volume 1/i }),
    ).toBeInTheDocument();
    const previousLink = screen.getByRole("link", {
      name: /Cap.tulo anterior/i,
    });
    expect(previousLink).toHaveClass(
      "project-reading-nav-btn",
      "project-reading-nav-btn--secondary",
    );
    expect(previousLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/2?volume=0");
  });

  it("preserva readingOrder manual antes da regra especial do volume zero", async () => {
    const orderedEpisodes = [
      {
        number: 1,
        volume: 1,
        title: "Capitulo 1 - Volume 1",
        synopsis: "Resumo do capitulo 1 v1",
        content: "<p>Conteudo 1 v1</p>",
        hasContent: true,
        readingOrder: 1,
      },
      {
        number: 2,
        volume: 1,
        title: "Capitulo 2 - Volume 1",
        synopsis: "Resumo do capitulo 2 v1",
        content: "<p>Conteudo 2 v1</p>",
        hasContent: true,
        readingOrder: 2,
      },
      {
        number: 1,
        volume: 0,
        title: "Capitulo 1 - Volume 0",
        synopsis: "Resumo do capitulo 1 v0",
        content: "<p>Conteudo 1 v0</p>",
        hasContent: true,
        readingOrder: 3,
      },
    ] satisfies ProjectEpisodeFixture[];
    const project = createProjectFixture(orderedEpisodes);

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterEndpoint: "/api/public/projects/projeto-teste/chapters/1?volume=1",
      chapterResponse: createLexicalChapterResponse({
        number: 1,
        volume: 1,
        title: "Capitulo 1 - Volume 1",
      }),
    });

    const firstRender = render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=1"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo 1 - Volume 1/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Cap.tulo anterior/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Pr.ximo cap.tulo/i })).toHaveAttribute(
      "href",
      "/projeto/projeto-teste/leitura/2?volume=1",
    );
    firstRender.unmount();

    setupProjectReadingApiMock(undefined, null, {
      project,
      chapterEndpoint: "/api/public/projects/projeto-teste/chapters/1?volume=0",
      chapterResponse: createLexicalChapterResponse({
        number: 1,
        volume: 0,
        title: "Capitulo 1 - Volume 0",
      }),
    });

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=0"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo 1 - Volume 0/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cap.tulo anterior/i })).toHaveAttribute(
      "href",
      "/projeto/projeto-teste/leitura/2?volume=1",
    );
    expect(screen.queryByRole("link", { name: /Pr.ximo cap.tulo/i })).not.toBeInTheDocument();
  });

  it("usa sinopse do volume quando a sinopse do capitulo estiver vazia", async () => {
    const project = createProjectFixture([
      {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        content: "<p>Conteudo</p>",
        hasContent: true,
      },
    ]);
    project.volumeEntries = [
      {
        volume: 2,
        synopsis: "Sinopse do volume 2",
        coverImageUrl: "",
        coverImageAlt: "",
      },
    ];

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        if (
          endpoint === "/api/public/projects/projeto-teste" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, { project });
        }
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, {
            chapter: {
              number: 1,
              volume: 2,
              title: "Capitulo 1",
              synopsis: "",
              content: "<p>Conteudo</p>",
              contentFormat: "lexical",
            },
          });
        }
        if (endpoint === "/api/public/me" && (!options?.method || options.method === "GET")) {
          return mockJsonResponse(true, { user: null });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && options?.method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    expect(screen.getByText("Sinopse do volume 2")).toBeInTheDocument();
  });

  it("usa sinopse do projeto quando capitulo e volume nao tiverem sinopse", async () => {
    const project = createProjectFixture([
      {
        number: 1,
        volume: 2,
        title: "Capitulo 1",
        content: "<p>Conteudo</p>",
        hasContent: true,
      },
    ]);
    project.synopsis = "Sinopse principal do projeto";
    project.volumeEntries = [
      {
        volume: 2,
        synopsis: "",
        coverImageUrl: "",
        coverImageAlt: "",
      },
    ];

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        if (
          endpoint === "/api/public/projects/projeto-teste" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, { project });
        }
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, {
            chapter: {
              number: 1,
              volume: 2,
              title: "Capitulo 1",
              synopsis: "",
              content: "<p>Conteudo</p>",
              contentFormat: "lexical",
            },
          });
        }
        if (endpoint === "/api/public/me" && (!options?.method || options.method === "GET")) {
          return mockJsonResponse(true, { user: null });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && options?.method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    expect(screen.getByText("Sinopse principal do projeto")).toBeInTheDocument();
  });

  it("prioriza a capa do capitulo no hero do leitor textual", async () => {
    const project = createProjectFixture();
    project.volumeCovers = [
      {
        volume: 2,
        coverImageUrl: "/uploads/volume-2-cover.jpg",
        coverImageAlt: "Capa do volume 2",
      },
    ];

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        if (
          endpoint === "/api/public/projects/projeto-teste" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, { project });
        }
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, {
            chapter: {
              number: 1,
              volume: 2,
              title: "Capitulo 1",
              synopsis: "Resumo do capitulo",
              content: "<p>Conteudo</p>",
              contentFormat: "lexical",
              coverImageUrl: "/uploads/chapter-1-cover.jpg",
              coverImageAlt: "Capa do capitulo 1",
            },
          });
        }
        if (endpoint === "/api/public/me" && (!options?.method || options.method === "GET")) {
          return mockJsonResponse(true, { user: null });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && options?.method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    expect(screen.getByRole("img", { name: "Capa do capitulo 1" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Capa do volume 2" })).not.toBeInTheDocument();
  });

  it("usa a capa do volume no hero quando o capitulo nao possui capa propria", async () => {
    const project = createProjectFixture();
    project.volumeCovers = [
      {
        volume: 2,
        coverImageUrl: "/uploads/volume-2-cover.jpg",
        coverImageAlt: "Capa do volume 2",
      },
    ];

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        if (
          endpoint === "/api/public/projects/projeto-teste" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, { project });
        }
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          (!options?.method || options.method === "GET")
        ) {
          return mockJsonResponse(true, {
            chapter: {
              number: 1,
              volume: 2,
              title: "Capitulo 1",
              synopsis: "Resumo do capitulo",
              content: "<p>Conteudo</p>",
              contentFormat: "lexical",
            },
          });
        }
        if (endpoint === "/api/public/me" && (!options?.method || options.method === "GET")) {
          return mockJsonResponse(true, { user: null });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && options?.method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    expect(screen.getByRole("img", { name: "Capa do volume 2" })).toBeInTheDocument();
  });
});
