import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProjectPage from "@/pages/Project";
import { clearPublicRoutePreloadCacheForTests } from "@/routes/public-preload";

const apiFetchMock = vi.hoisted(() => vi.fn());
const useSiteSettingsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchBestEffort: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => useSiteSettingsMock(),
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ slug: "projeto-teste" }),
  };
});

vi.mock("@/components/CommentsSection", () => ({
  default: () => null,
}));

vi.mock("@/components/ThemedSvgLogo", () => ({
  default: () => null,
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const classTokens = (element: HTMLElement) =>
  String(element.className).split(/\s+/).filter(Boolean);

const expectSharedPrimaryButtonTokens = (element: HTMLElement) => {
  const tokens = classTokens(element);

  expect(tokens).toEqual(
    expect.arrayContaining([
      "rounded-xl",
      "border-primary/70",
      "bg-primary/10",
      "text-foreground",
      "hover:border-primary",
      "hover:bg-primary",
      "hover:text-primary-foreground",
      "focus-visible:border-primary",
      "focus-visible:bg-primary",
      "focus-visible:text-primary-foreground",
      "shadow-none",
    ]),
  );
  expect(tokens).not.toContain("interactive-lift-sm");
  expect(tokens).not.toContain("pressable");
  expect(tokens.some((token) => token.startsWith("hover:shadow"))).toBe(false);
};

const expectOutlineActionTokens = (element: HTMLElement) => {
  const tokens = classTokens(element);

  expect(tokens).toEqual(
    expect.arrayContaining([
      "border-border/70",
      "bg-background",
      "text-foreground/70",
      "hover:border-primary/60",
      "hover:bg-primary/5",
      "shadow-none",
    ]),
  );
  expect(tokens).not.toContain("border-primary/70");
  expect(tokens).not.toContain("bg-primary/10");
  expect(tokens).not.toContain("interactive-lift-sm");
  expect(tokens).not.toContain("pressable");
};

const baseProject = {
  id: "projeto-teste",
  title: "Projeto Teste",
  synopsis: "Sinopse",
  description: "Descricao",
  type: "Light Novel",
  status: "Em andamento",
  year: "2026",
  studio: "Studio Teste",
  episodes: "12 capitulos",
  tags: [],
  genres: [],
  cover: "/placeholder.svg",
  banner: "/placeholder.svg",
  season: "",
  schedule: "",
  rating: "",
  country: "JP",
  source: "Original",
  producers: [],
  score: null,
  startDate: "",
  endDate: "",
  relations: [],
  staff: [],
  animeStaff: [],
  trailerUrl: "",
  forceHero: false,
  heroImageUrl: "",
  heroImageAlt: "",
  volumeEntries: [],
  volumeCovers: [],
  episodeDownloads: [],
  views: 0,
  commentsCount: 0,
};

const setupApiMock = (project: Record<string, unknown>) => {
  apiFetchMock.mockImplementation(
    async (_apiBase: string, endpoint: string, options?: RequestInit) => {
      if (
        endpoint === "/api/public/projects/projeto-teste" &&
        (!options?.method || options.method === "GET")
      ) {
        return mockJsonResponse(true, { project });
      }
      if (endpoint === "/api/public/projects" && (!options?.method || options.method === "GET")) {
        return mockJsonResponse(true, { projects: [project] });
      }
      if (
        endpoint === "/api/public/tag-translations" &&
        (!options?.method || options.method === "GET")
      ) {
        return mockJsonResponse(true, { tags: {}, genres: {}, staffRoles: {} });
      }
      if (endpoint === "/api/public/me" && (!options?.method || options.method === "GET")) {
        return mockJsonResponse(true, { user: null });
      }
      if (
        endpoint === `/api/public/projects/${project.id}/view` &&
        String(options?.method || "").toUpperCase() === "POST"
      ) {
        return mockJsonResponse(true, { views: 1 });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    },
  );
};

describe("Project public readable chapters", () => {
  beforeEach(() => {
    clearPublicRoutePreloadCacheForTests();
    apiFetchMock.mockReset();
    useSiteSettingsMock.mockReset();
    useSiteSettingsMock.mockReturnValue({
      settings: {
        site: { defaultShareImage: "", defaultShareImageAlt: "" },
        downloads: { sources: [] },
      },
    });
  });

  it("exibe capítulos de light novel publicados quando o payload público só informa hasContent", async () => {
    const project = {
      ...baseProject,
      type: "Light Novel",
      volumeEntries: [
        {
          volume: 2,
          synopsis: "Volume 2",
          coverImageUrl: "",
          coverImageAlt: "",
        },
      ],
      episodeDownloads: [
        {
          number: 1,
          volume: 2,
          title: "Capitulo 1",
          synopsis: "Resumo do capitulo",
          releaseDate: "2026-03-10",
          duration: "",
          sourceType: "Web",
          sources: [{ label: "Proton Drive", url: "https://example.com/proton" }],
          publicationStatus: "published",
          hasContent: true,
        },
      ],
    };

    setupApiMock(project);

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const downloadsLink = screen.getByRole("link", { name: /Ver cap.tulos/i });
    expect(downloadsLink).toHaveAttribute("href", "#downloads");
    expectSharedPrimaryButtonTokens(downloadsLink);
    const heroReadLink = screen.getByRole("link", { name: /Come.ar leitura/i });
    expect(heroReadLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/1?volume=2");
    expect(heroReadLink).toHaveClass("order-last");
    expectOutlineActionTokens(heroReadLink);

    const volumeTrigger = screen.getByRole("button", { name: /Volume 2/i });
    fireEvent.click(volumeTrigger);

    const sourceLink = await screen.findByRole("link", { name: "Proton Drive" });
    expect(sourceLink).toHaveAttribute("href", "https://example.com/proton");
    expect(classTokens(sourceLink)).toEqual(
      expect.arrayContaining([
        "rounded-full",
        "bg-card/70",
        "hover:bg-(--download-source-hover-bg)",
      ]),
    );
    expect(classTokens(sourceLink)).not.toContain("bg-primary/10");
    const readLink = await screen.findByRole("link", { name: /Ler cap.tulo/i });
    expect(readLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/1?volume=2");
    expectSharedPrimaryButtonTokens(readLink);
    expect(screen.queryByText(/Nenhum cap.tulo publicado ainda/i)).not.toBeInTheDocument();
  });

  it("exibe capítulos de manga publicados quando o payload público só informa hasPages", async () => {
    const project = {
      ...baseProject,
      type: "Manga",
      volumeEntries: [
        {
          volume: 1,
          synopsis: "Volume 1",
          coverImageUrl: "",
          coverImageAlt: "",
        },
      ],
      episodeDownloads: [
        {
          number: 3,
          volume: 1,
          title: "Capitulo 3",
          synopsis: "Capitulo por imagens",
          releaseDate: "2026-03-11",
          duration: "",
          sourceType: "Web",
          sources: [],
          publicationStatus: "published",
          hasPages: true,
        },
      ],
    };

    setupApiMock(project);

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const downloadsLink = screen.getByRole("link", { name: /Ver cap.tulos/i });
    expect(downloadsLink).toHaveAttribute("href", "#downloads");
    expectSharedPrimaryButtonTokens(downloadsLink);
    const heroReadLink = screen.getByRole("link", { name: /Come.ar leitura/i });
    expect(heroReadLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/3?volume=1");
    expect(heroReadLink).toHaveClass("order-last");
    expectOutlineActionTokens(heroReadLink);

    const volumeTrigger = screen.getByRole("button", { name: /Volume 1/i });
    fireEvent.click(volumeTrigger);

    const readLink = await screen.findByRole("link", { name: /Abrir leitor/i });
    expect(readLink).toHaveAttribute("href", "/projeto/projeto-teste/leitura/3?volume=1");
    expectSharedPrimaryButtonTokens(readLink);
    expect(screen.queryByText(/Nenhum cap.tulo publicado ainda/i)).not.toBeInTheDocument();
  });

  it("lista todos os capitulos publicados em multiplos volumes com extras e numeros repetidos", async () => {
    const project = {
      ...baseProject,
      type: "Light Novel",
      volumeEntries: [
        {
          volume: 2,
          synopsis: "Volume 2",
          coverImageUrl: "",
          coverImageAlt: "",
        },
        {
          volume: 7,
          synopsis: "Volume 7",
          coverImageUrl: "",
          coverImageAlt: "",
        },
        {
          volume: 14,
          synopsis: "Volume 14",
          coverImageUrl: "",
          coverImageAlt: "",
        },
      ],
      episodeDownloads: [
        {
          number: 100000,
          volume: 2,
          title: "Table of Contents",
          entryKind: "extra",
          displayLabel: "Table of Contents",
          readingOrder: 1,
          sources: [],
          publicationStatus: "published",
          hasContent: true,
        },
        {
          number: 1,
          volume: 2,
          title: "Previously",
          entryKind: "main",
          readingOrder: 13,
          sources: [],
          publicationStatus: "published",
          hasContent: true,
        },
        {
          number: 100000,
          volume: 7,
          title: "Table of Contents",
          entryKind: "extra",
          displayLabel: "Extra",
          readingOrder: 2,
          sources: [],
          publicationStatus: "published",
          hasContent: true,
        },
        {
          number: 57,
          volume: 7,
          title: "Chapter 57: The Mysterious Kidnappers",
          entryKind: "main",
          readingOrder: 15,
          sources: [],
          publicationStatus: "published",
          hasContent: true,
        },
        {
          number: 100000,
          volume: 14,
          title: "Table of Contents",
          entryKind: "extra",
          displayLabel: "Extra",
          readingOrder: 1,
          sources: [],
          publicationStatus: "published",
          hasContent: true,
        },
        {
          number: 101,
          volume: 14,
          title: "Chapter 101: The Elven Village",
          entryKind: "main",
          readingOrder: 10,
          sources: [],
          publicationStatus: "published",
          hasContent: true,
        },
      ],
    };

    setupApiMock(project);

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    expect(screen.getByText(/6\s+dispon.veis/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Volume 2/i })).toHaveTextContent(
      /2 cap.tulos dispon.veis/i,
    );
    expect(screen.getByRole("button", { name: /Volume 7/i })).toHaveTextContent(
      /2 cap.tulos dispon.veis/i,
    );
    expect(screen.getByRole("button", { name: /Volume 14/i })).toHaveTextContent(
      /2 cap.tulos dispon.veis/i,
    );

    fireEvent.click(screen.getByRole("button", { name: /Volume 2/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volume 7/i }));
    fireEvent.click(screen.getByRole("button", { name: /Volume 14/i }));

    expect(screen.getAllByText("Table of Contents")).toHaveLength(3);
    expect(screen.getByText("Previously")).toBeInTheDocument();
    expect(screen.getByText("Chapter 57: The Mysterious Kidnappers")).toBeInTheDocument();
    expect(screen.getByText("Chapter 101: The Elven Village")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Ler (cap.tulo|extra)/i })).toHaveLength(6);
  });
});
