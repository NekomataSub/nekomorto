import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUBLIC_ANALYTICS_INGEST_PATH } from "@/lib/public-analytics";
import ProjectReading from "@/pages/ProjectReading";

const apiFetchMock = vi.hoisted(() => vi.fn());
const originalIntersectionObserver = window.IntersectionObserver;
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
    useParams: () => ({ slug: "projeto-teste", chapter: "1" }),
  };
});

vi.mock("@/components/lexical/LexicalViewer", () => ({
  default: () => <div data-testid="lexical-viewer" />,
}));

vi.mock("@/components/CommentsSection", () => ({
  default: () => <div data-testid="comments-section" />,
}));

vi.mock("@/components/Header", () => ({
  default: ({ variant = "fixed" }: { variant?: "fixed" | "static" }) => (
    <div data-testid="public-header" data-variant={variant} />
  ),
}));

vi.mock("@/components/Footer", () => ({
  default: () => <div data-testid="public-footer" />,
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

describe("ProjectReading bootstrap-first", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          method === "GET"
        ) {
          return await new Promise<Response>(() => undefined);
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

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
          id: "projeto-teste",
          title: "Projeto Bootstrap",
          titleOriginal: "",
          titleEnglish: "",
          synopsis: "Sinopse principal",
          description: "Descrição",
          type: "Light Novel",
          status: "Em andamento",
          tags: [],
          genres: [],
          cover: "/uploads/project-cover.jpg",
          coverAlt: "Capa",
          banner: "",
          bannerAlt: "",
          heroImageUrl: "/uploads/project-hero.jpg",
          heroImageAlt: "Hero",
          forceHero: false,
          trailerUrl: "",
          studio: "Studio Teste",
          episodes: "12 capítulos",
          producers: [],
          volumeEntries: [
            {
              volume: 2,
              synopsis: "Sinopse do volume",
              coverImageUrl: "/uploads/volume-2.jpg",
              coverImageAlt: "Volume 2",
            },
          ],
          volumeCovers: [],
          episodeDownloads: [
            {
              number: 1,
              volume: 2,
              title: "Capítulo Bootstrap",
              content: "<p>Conteudo bootstrap</p>",
              contentFormat: "lexical",
              releaseDate: "2026-02-10",
              duration: "Leitura",
              coverImageUrl: "/uploads/chapter-1.jpg",
              coverImageAlt: "Capítulo 1",
              sourceType: "Web",
              sources: [],
              progressStage: "",
              completedStages: [],
              chapterUpdatedAt: "2026-02-10T00:00:00.000Z",
              hasContent: true,
            },
          ],
          views: 0,
          viewsDaily: {},
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
        __BOOTSTRAP_ROUTE__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = {
      id: "user-1",
      name: "Admin",
      username: "admin",
      permissions: ["projetos"],
      grants: { projetos: true },
    };

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }

    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: originalIntersectionObserver,
    });
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
        __BOOTSTRAP_ROUTE__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC__;
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
        __BOOTSTRAP_ROUTE__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__;
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
        __BOOTSTRAP_ROUTE__?: unknown;
      }
    ).__BOOTSTRAP_ROUTE__;
  });

  it("usa bootstrap para hero e navegacao sem requisitar o projeto novamente", () => {
    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Capítulo Bootstrap" })).toBeInTheDocument();
    expect(screen.getByText("Projeto Bootstrap")).toBeInTheDocument();
    expect(screen.getByText("Sinopse do volume")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Editar capítulo/i })).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );

    const calledEndpoints = apiFetchMock.mock.calls.map((call) => String(call[1] || ""));
    expect(calledEndpoints).toContain("/api/public/projects/projeto-teste/chapters/1?volume=2");
    expect(calledEndpoints).not.toContain("/api/public/projects/projeto-teste");
    expect(calledEndpoints).not.toContain("/api/public/me");
    expect(screen.queryByTestId("comments-section")).not.toBeInTheDocument();
  });

  it("usa grants do bootstrap para exibir editar capítulo sem permissions legadas", () => {
    (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = {
      id: "user-1",
      name: "Admin",
      username: "admin",
      permissions: [],
      grants: { projetos: true },
    };

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /Editar capítulo/i })).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );
    const calledEndpoints = apiFetchMock.mock.calls.map((call) => String(call[1] || ""));
    expect(calledEndpoints).not.toContain("/api/public/me");
  });

  it("corrige o estado de permissao quando o bootstrap inicial vem anonimo", async () => {
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          method === "GET"
        ) {
          return await new Promise<Response>(() => undefined);
        }
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, {
            user: {
              id: "user-1",
              name: "Admin",
              username: "admin",
              permissions: ["projetos"],
              grants: { projetos: true },
            },
          });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = null;

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo Bootstrap/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "",
        "/api/public/me",
        expect.objectContaining({ auth: true, cache: "no-store" }),
      );
    });
    expect(await screen.findByRole("link", { name: /Editar cap.tulo/i })).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );
  });

  it("corrige o estado de permissao via /api/public/me para owner secundario sem permissions legadas", async () => {
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (
          endpoint === "/api/public/projects/projeto-teste/chapters/1?volume=2" &&
          method === "GET"
        ) {
          return await new Promise<Response>(() => undefined);
        }
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, {
            user: {
              id: "owner-2",
              name: "Admin",
              username: "admin",
              permissions: [],
              accessRole: "owner_secondary",
              ownerIds: ["owner-1", "owner-2"],
              primaryOwnerId: "owner-1",
            },
          });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = null;

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: /Cap.*tulo Bootstrap/i }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "",
        "/api/public/me",
        expect.objectContaining({ auth: true, cache: "no-store" }),
      );
    });
    expect(await screen.findByRole("link", { name: /Editar cap.tulo/i })).toHaveAttribute(
      "href",
      "/dashboard/projetos/projeto-teste/capitulos/1?volume=2",
    );
  });

  it("reidrata o projeto quando o bootstrap parcial nao traz capitulos para o menu do leitor", async () => {
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === "/api/public/projects/projeto-teste" && method === "GET") {
          return mockJsonResponse(true, {
            project: {
              id: "projeto-teste",
              title: "Projeto Bootstrap",
              titleOriginal: "",
              titleEnglish: "",
              synopsis: "Sinopse principal",
              description: "Descricao",
              type: "manga",
              status: "Em andamento",
              tags: [],
              genres: [],
              cover: "/uploads/project-cover.jpg",
              coverAlt: "Capa",
              banner: "",
              bannerAlt: "",
              heroImageUrl: "/uploads/project-hero.jpg",
              heroImageAlt: "Hero",
              forceHero: false,
              trailerUrl: "",
              studio: "Studio Teste",
              episodes: "12 capitulos",
              producers: [],
              volumeEntries: [],
              volumeCovers: [],
              episodeDownloads: [
                {
                  number: 1,
                  title: "Capitulo 1",
                  contentFormat: "images",
                  pages: [
                    { position: 0, imageUrl: "/uploads/chapter-1-page-1.jpg" },
                    { position: 1, imageUrl: "/uploads/chapter-1-page-2.jpg" },
                  ],
                },
                {
                  number: 2,
                  title: "Capitulo 2",
                  contentFormat: "images",
                  pages: [
                    { position: 0, imageUrl: "/uploads/chapter-2-page-1.jpg" },
                    { position: 1, imageUrl: "/uploads/chapter-2-page-2.jpg" },
                  ],
                },
              ],
            },
          });
        }
        if (endpoint === "/api/public/projects/projeto-teste/chapters/1" && method === "GET") {
          return mockJsonResponse(true, {
            chapter: {
              number: 1,
              title: "Capitulo 1",
              synopsis: "Resumo do capitulo",
              contentFormat: "images",
              pages: [
                { position: 0, imageUrl: "/uploads/chapter-1-page-1.jpg" },
                { position: 1, imageUrl: "/uploads/chapter-1-page-2.jpg" },
              ],
              hasPages: true,
            },
            readerConfig: {
              layout: "single",
              background: "theme",
              imageFit: "both",
            },
          });
        }
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

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
          id: "projeto-teste",
          title: "Projeto Bootstrap",
          titleOriginal: "",
          titleEnglish: "",
          synopsis: "Sinopse principal",
          description: "Descricao",
          type: "manga",
          status: "Em andamento",
          tags: [],
          genres: [],
          cover: "/uploads/project-cover.jpg",
          coverAlt: "Capa",
          banner: "",
          bannerAlt: "",
          heroImageUrl: "/uploads/project-hero.jpg",
          heroImageAlt: "Hero",
          forceHero: false,
          trailerUrl: "",
          studio: "Studio Teste",
          episodes: "12 capitulos",
          producers: [],
          volumeEntries: [],
          volumeCovers: [],
          episodeDownloads: [],
          views: 0,
          viewsDaily: {},
        },
      ],
      posts: [],
      updates: [],
      teamMembers: [],
      teamLinkTypes: [],
      mediaVariants: {},
      tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
      generatedAt: "2026-03-10T00:00:00.000Z",
      payloadMode: "critical-home",
    };
    (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = null;

    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1"]}>
        <ProjectReading />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: /Cap.*tulo 1/i });
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith("", "/api/public/projects/projeto-teste");
    });

    fireEvent.click(await screen.findByTestId("project-reader-menu-button"));

    const chapterTrigger = await screen.findByRole("combobox", {
      name: /Selecionar cap.tulo/i,
    });
    fireEvent.click(chapterTrigger);

    expect(await screen.findByRole("option", { name: /Cap.*tulo 1/i })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /Cap.*tulo 2/i })).toBeInTheDocument();
  });
});
