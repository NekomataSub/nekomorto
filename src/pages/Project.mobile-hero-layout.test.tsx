import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Project, ProjectEpisode } from "@/data/projects";
import ProjectPage from "@/pages/Project";
import { clearPublicRoutePreloadCacheForTests } from "@/routes/public-preload";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchBestEffort: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({
    settings: {
      site: { defaultShareImage: "" },
      downloads: { sources: [] },
    },
  }),
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ slug: "project-1" }),
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

const expectContextualSourceButtonTokens = (element: HTMLElement) => {
  const tokens = classTokens(element);

  expect(tokens).toEqual(
    expect.arrayContaining(["rounded-full", "bg-card/70", "hover:bg-(--download-source-hover-bg)"]),
  );
  expect(tokens).not.toContain("hover:bg-primary/10");
  expect(tokens).not.toContain("border-primary/70");
  expect(tokens).not.toContain("bg-primary/10");
};

const findAncestor = (
  element: HTMLElement,
  predicate: (candidate: HTMLElement) => boolean,
): HTMLElement | null => {
  let current = element.parentElement;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
};

const createProjectEpisodeFixture = (overrides: Partial<ProjectEpisode> = {}): ProjectEpisode => ({
  number: 1,
  title: "Capitulo 1",
  synopsis: "",
  releaseDate: "",
  duration: "",
  sourceType: "TV",
  sources: [],
  ...overrides,
});

const projectFixture: Project = {
  id: "project-1",
  title: "Projeto Teste",
  titleOriginal: "",
  titleEnglish: "",
  synopsis: "Sinopse de teste",
  description: "Descricao de teste",
  type: "Anime",
  status: "Em andamento",
  year: "2026",
  studio: "Studio Teste",
  episodes: "12 episodios",
  tags: [],
  genres: [],
  cover: "/uploads/cover-default.jpg",
  banner: "/uploads/banner-default.jpg",
  season: "Temporada 1",
  schedule: "Sabado",
  rating: "14",
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
  volumeEntries: [],
  volumeCovers: [],
  episodeDownloads: [],
  views: 0,
  commentsCount: 0,
};

const lightNovelProjectFixture: Project = {
  ...projectFixture,
  type: "Light Novel",
  episodeDownloads: [
    createProjectEpisodeFixture({
      number: 1,
      volume: 2,
      title: "Capitulo 1",
      synopsis: "Resumo do capitulo",
      content: "<p>Conteudo</p>",
    }),
  ],
};

const mangaProjectFixture: Project = {
  ...projectFixture,
  type: "Mangá",
  episodeDownloads: [
    createProjectEpisodeFixture({
      number: 1,
      volume: 3,
      title: "Capitulo 1",
      synopsis: "Resumo do capitulo",
      sources: [{ label: "Drive", url: "https://example.com/file" }],
    }),
  ],
};

type TaxonomyTranslationsPayload = {
  tags?: Record<string, string>;
  genres?: Record<string, string>;
  staffRoles?: Record<string, string>;
};

type SetupApiMockOptions = {
  includeDetailTranslations?: boolean;
  stallTagTranslations?: boolean;
};

const setupApiMock = (
  project: Project = projectFixture,
  translations: TaxonomyTranslationsPayload = {},
  mockOptions: SetupApiMockOptions = {},
) => {
  clearPublicRoutePreloadCacheForTests();
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(
    async (_apiBase: string, endpoint: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      const mediaVariants = {
        "/uploads/banner-default.jpg": {
          variantsVersion: 1,
          variants: {
            hero: {
              formats: {
                fallback: { url: "/uploads/_variants/project-1/hero-v1.jpeg" },
              },
            },
          },
          focalPoints: {
            hero: { x: 0.2, y: 0.8 },
          },
        },
        "/uploads/hero-fallback.jpg": {
          variantsVersion: 1,
          variants: {
            hero: {
              formats: {
                fallback: { url: "/uploads/_variants/project-1/hero-fallback-v1.jpeg" },
              },
            },
          },
          focalPoints: {
            hero: { x: 0.25, y: 0.75 },
          },
        },
        "/uploads/cover-only.jpg": {
          variantsVersion: 1,
          variants: {
            hero: {
              formats: {
                fallback: { url: "/uploads/_variants/project-1/cover-only-hero-v1.jpeg" },
              },
            },
          },
          focalPoints: {
            hero: { x: 0.3, y: 0.7 },
          },
        },
        "/uploads/banner-only.jpg": {
          variantsVersion: 1,
          variants: {
            hero: {
              formats: {
                fallback: { url: "/uploads/_variants/project-1/banner-only-hero-v1.jpeg" },
              },
            },
          },
          focalPoints: {
            hero: { x: 0.35, y: 0.65 },
          },
        },
      };

      if (endpoint === "/api/public/projects/project-1" && method === "GET") {
        return mockJsonResponse(true, {
          project,
          mediaVariants,
          ...(mockOptions.includeDetailTranslations
            ? {
                translations: {
                  tags: translations.tags || {},
                  genres: translations.genres || {},
                  staffRoles: translations.staffRoles || {},
                },
              }
            : {}),
        });
      }
      if (endpoint === "/api/public/projects" && method === "GET") {
        return mockJsonResponse(true, { projects: [project] });
      }
      if (endpoint === "/api/public/tag-translations" && method === "GET") {
        if (mockOptions.stallTagTranslations) {
          return new Promise<Response>(() => undefined);
        }
        return mockJsonResponse(true, {
          tags: translations.tags || {},
          genres: translations.genres || {},
          staffRoles: translations.staffRoles || {},
        });
      }
      if (endpoint === "/api/public/projects/project-1/view" && method === "POST") {
        return mockJsonResponse(true, { views: 1 });
      }
      if (endpoint === "/api/public/me" && method === "GET") {
        return mockJsonResponse(true, { user: null });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    },
  );
};

describe("Project mobile hero layout", () => {
  beforeEach(() => {
    setupApiMock();
  });

  it("centraliza todo o hero no mobile e preserva alinhamento desktop", async () => {
    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    const hero = await screen.findByTestId("project-hero");
    const heroTokens = classTokens(hero);
    expect(heroTokens).not.toContain("border-b");
    const bannerImage = within(hero).getByRole("img", { name: "Banner do projeto Projeto Teste" });
    const coverImage = within(hero).getByRole("img", { name: "Projeto Teste" });
    expect(bannerImage.getAttribute("src")).toContain("/uploads/_variants/project-1/hero-v1.jpeg");
    expect(bannerImage).toHaveStyle({ objectPosition: "20% 80%" });
    expect(coverImage.getAttribute("src")).toContain("/uploads/cover-default.jpg");
    expect(coverImage).toHaveClass("object-cover", "object-center");
    expect(coverImage).not.toHaveClass("object-contain");

    const heading = await screen.findByRole("heading", { name: "Projeto Teste" });
    const headingTokens = classTokens(heading);
    expect(headingTokens).toContain("text-center");
    expect(headingTokens).toContain("md:text-left");
    expect(headingTokens).not.toContain("md:text-center");

    const coverWrapper = screen.getByTestId("project-hero-cover-shell");
    const coverWrapperTokens = classTokens(coverWrapper);
    expect(coverWrapperTokens).toContain("mx-auto");
    expect(coverWrapperTokens).toContain("md:mx-0");
    expect(coverWrapperTokens).toContain("w-64");
    expect(coverWrapperTokens).toContain("self-start");
    expect(coverWrapperTokens).toContain("md:w-[320px]");
    expect(coverWrapperTokens).toContain("lg:w-[340px]");
    expect(coverWrapperTokens).not.toContain("md:h-full");

    const heroLayout = screen.getByTestId("project-hero-layout");
    const heroLayoutTokens = classTokens(heroLayout);
    expect(heroLayoutTokens).toContain("items-start");
    expect(heroLayoutTokens).toContain("md:items-stretch");
    expect(heroLayoutTokens).toContain("gap-10");
    expect(heroLayoutTokens).toContain("lg:gap-12");
    expect(heroLayoutTokens).toContain("md:grid-cols-[320px_minmax(0,1fr)]");
    expect(heroLayoutTokens).toContain("lg:grid-cols-[340px_minmax(0,1fr)]");

    const heroInnerContainer = heroLayout.parentElement as HTMLElement | null;
    expect(heroInnerContainer).not.toBeNull();
    const heroInnerTokens = classTokens(heroInnerContainer as HTMLElement);
    expect(heroInnerTokens).toContain("pb-14");
    expect(heroInnerTokens).toContain("md:pb-16");
    expect(heroInnerTokens).toContain("lg:pb-20");

    const contentSection = hero.nextElementSibling as HTMLElement | null;
    expect(contentSection).not.toBeNull();
    const contentSectionTokens = classTokens(contentSection as HTMLElement);
    expect(contentSectionTokens).toContain("pt-8");
    expect(contentSectionTokens).toContain("md:pt-10");

    const infoPanel = screen.getByTestId("project-hero-info-panel");
    const infoPanelTokens = classTokens(infoPanel);
    expect(infoPanel.contains(coverWrapper)).toBe(false);
    expect(within(infoPanel).queryByTestId("project-hero-cover-shell")).not.toBeInTheDocument();
    expect(infoPanelTokens).toContain("md:h-full");
    expect(infoPanelTokens).not.toContain("bg-card/45");
    expect(infoPanelTokens).not.toContain("border");
    expect(infoPanelTokens).not.toContain("backdrop-blur-md");

    const coverFrame = screen.getByTestId("project-hero-cover-frame");
    const coverFrameTokens = classTokens(coverFrame);
    expect(coverFrameTokens).not.toContain("h-full");
    expect(coverFrameTokens).not.toContain("md:max-h-[620px]");
    expect(coverFrameTokens).toContain("shadow-project-cover-card");
    expect(coverFrameTokens).not.toContain("shadow-[0_30px_100px_-55px_rgba(0,0,0,0.95)]");
    expect(coverFrame.style.aspectRatio).toBe("9 / 14");

    const contentColumn = heading.parentElement as HTMLElement | null;
    expect(contentColumn).not.toBeNull();

    const contentColumnTokens = classTokens(contentColumn as HTMLElement);
    expect(contentColumnTokens).toContain("w-full");
    expect(contentColumnTokens).toContain("items-center");
    expect(contentColumnTokens).toContain("text-center");
    expect(contentColumnTokens).toContain("md:items-start");
    expect(contentColumnTokens).toContain("md:text-left");

    const typeLabel = within(contentColumn as HTMLElement).getByText("Anime");
    const metaRow = typeLabel.closest("div") as HTMLElement | null;
    expect(metaRow).not.toBeNull();

    const metaRowTokens = classTokens(metaRow as HTMLElement);
    expect(metaRowTokens).toContain("w-full");
    expect(metaRowTokens).toContain("justify-center");
    expect(metaRowTokens).toContain("text-center");
    expect(metaRowTokens).toContain("md:w-auto");
    expect(metaRowTokens).toContain("md:justify-start");
    expect(metaRowTokens).toContain("md:text-left");

    expect(within(metaRow as HTMLElement).getByText(/•/)).toBeInTheDocument();
    expect(within(metaRow as HTMLElement).getByText("Em andamento")).toBeInTheDocument();

    const synopsis = within(contentColumn as HTMLElement).getByText("Sinopse de teste");
    const synopsisTokens = classTokens(synopsis as HTMLElement);
    expect(synopsisTokens).toContain("text-center");
    expect(synopsisTokens).toContain("md:text-left");

    const actionsRow = screen.getByTestId("project-hero-actions-row");
    const actionsRowTokens = classTokens(actionsRow);
    expect(actionsRowTokens).toContain("w-full");
    expect(actionsRowTokens).toContain("justify-center");
    expect(actionsRowTokens).toContain("md:justify-start");
    expect(actionsRowTokens).toContain("md:mt-auto");
    expectSharedPrimaryButtonTokens(
      within(actionsRow).getByRole("link", { name: /Ver epis.dios/i }),
    );
  });

  it("renderiza tags e generos clicaveis como links com a pill neutra compartilhada", async () => {
    setupApiMock(
      {
        ...projectFixture,
        tags: ["acao"],
        genres: ["drama"],
      },
      {
        tags: { acao: "Ação traduzida" },
        genres: { drama: "Drama traduzido" },
      },
    );

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    const tagLink = await screen.findByRole("link", { name: "Ação traduzida" });
    expect(tagLink).toHaveAttribute("href", "/projetos?tag=acao");
    expect(classTokens(tagLink)).toContain("rounded-full");
    expect(classTokens(tagLink)).toContain("border-border/70");
    expect(classTokens(tagLink)).toContain("bg-background");
    expect(classTokens(tagLink)).toContain("text-foreground/70");
    expect(classTokens(tagLink)).toContain("hover:border-accent/60");
    expect(classTokens(tagLink)).toContain("hover:bg-accent/15");
    expect(classTokens(tagLink)).toContain("hover:text-foreground");
    expect(classTokens(tagLink)).toContain("focus-visible:border-accent/60");
    expect(classTokens(tagLink)).toContain("focus-visible:bg-accent/15");
    expect(classTokens(tagLink)).toContain("focus-visible:text-foreground");

    const aboutSection = findAncestor(screen.getByText("Sobre o projeto"), (candidate) =>
      classTokens(candidate).includes("bg-card/80"),
    );
    expect(aboutSection).not.toBeNull();

    const genreLink = within(aboutSection as HTMLElement).getByRole("link", {
      name: "Drama traduzido",
    });
    expect(genreLink).toHaveAttribute("href", "/projetos?genero=drama");
    expect(classTokens(genreLink)).toContain("rounded-full");
    expect(classTokens(genreLink)).toContain("border-border/70");
    expect(classTokens(genreLink)).toContain("bg-background");
    expect(classTokens(genreLink)).toContain("text-foreground/70");
    expect(classTokens(genreLink)).toContain("hover:border-accent/60");
    expect(classTokens(genreLink)).toContain("hover:bg-accent/15");
    expect(classTokens(genreLink)).toContain("hover:text-foreground");
    expect(classTokens(genreLink)).toContain("focus-visible:border-accent/60");
    expect(classTokens(genreLink)).toContain("focus-visible:bg-accent/15");
    expect(classTokens(genreLink)).toContain("focus-visible:text-foreground");
  });

  it("usa as traducoes vindas do detalhe do projeto sem esperar o fetch posterior de taxonomy", async () => {
    setupApiMock(
      {
        ...projectFixture,
        tags: ["acao"],
        genres: ["drama"],
        animeStaff: [{ role: "director", members: ["Taro Sato"] }],
      },
      {
        tags: { acao: "Ação traduzida" },
        genres: { drama: "Drama traduzido" },
        staffRoles: { director: "Direção" },
      },
      {
        includeDetailTranslations: true,
        stallTagTranslations: true,
      },
    );

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    const tagLink = await screen.findByRole("link", { name: "Ação traduzida" });
    expect(tagLink).toHaveAttribute("href", "/projetos?tag=acao");

    const aboutSection = findAncestor(screen.getByText("Sobre o projeto"), (candidate) =>
      classTokens(candidate).includes("bg-card/80"),
    );
    expect(aboutSection).not.toBeNull();
    expect(
      within(aboutSection as HTMLElement).getByRole("link", {
        name: "Drama traduzido",
      }),
    ).toHaveAttribute("href", "/projetos?genero=drama");
    expect(await screen.findByText("Direção")).toBeInTheDocument();
  });

  it("usa fallback de banner com heroImageUrl e depois cover", async () => {
    setupApiMock({
      ...projectFixture,
      banner: "",
      heroImageUrl: "/uploads/hero-fallback.jpg",
      cover: "/uploads/cover-fallback.jpg",
    });

    const firstRender = render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const heroWithHeroFallback = screen.getByTestId("project-hero");
    const bannerFromHeroImage = within(heroWithHeroFallback).getByRole("img", {
      name: "Banner do projeto Projeto Teste",
    });
    expect(bannerFromHeroImage.getAttribute("src")).toContain(
      "/uploads/_variants/project-1/hero-fallback-v1.jpeg",
    );
    expect(bannerFromHeroImage).toHaveStyle({ objectPosition: "25% 75%" });
    firstRender.unmount();

    setupApiMock({
      ...projectFixture,
      banner: "",
      heroImageUrl: "",
      cover: "/uploads/cover-only.jpg",
    });

    const secondRender = render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const heroWithCoverFallback = screen.getByTestId("project-hero");
    const bannerFromCover = within(heroWithCoverFallback).getByRole("img", {
      name: "Banner do projeto Projeto Teste",
    });
    expect(bannerFromCover.getAttribute("src")).toContain(
      "/uploads/_variants/project-1/cover-only-hero-v1.jpeg",
    );
    expect(bannerFromCover).toHaveStyle({ objectPosition: "30% 70%" });

    const secondRenderCoverImage = within(heroWithCoverFallback).getByRole("img", {
      name: "Projeto Teste",
    });
    expect(secondRenderCoverImage.getAttribute("src")).toContain("/uploads/cover-only.jpg");
    expect(secondRenderCoverImage).toHaveClass("object-cover", "object-center");
    expect(secondRenderCoverImage).not.toHaveClass("object-contain");
    secondRender.unmount();

    setupApiMock({
      ...projectFixture,
      banner: "/uploads/banner-only.jpg",
      heroImageUrl: "",
      cover: "",
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const heroWithBannerCoverFallback = screen.getByTestId("project-hero");
    const coverFromBannerFallback = within(heroWithBannerCoverFallback).getByRole("img", {
      name: "Projeto Teste",
    });
    expect(coverFromBannerFallback.getAttribute("src")).toContain("/uploads/banner-only.jpg");
    expect(coverFromBannerFallback).toHaveClass("object-cover", "object-center");
    expect(coverFromBannerFallback).not.toHaveClass("object-contain");
  });

  it("aplica proporcao 9:14 nas capas dos projetos relacionados", async () => {
    const projectWithRelation = {
      ...projectFixture,
      relations: [
        {
          relation: "SEQUEL",
          title: "Projeto Relacionado",
          format: "Anime",
          status: "Em andamento",
          image: "/uploads/related-cover.jpg",
          projectId: "project-2",
        },
      ],
    };

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();

        if (endpoint === "/api/public/projects/project-1" && method === "GET") {
          return mockJsonResponse(true, { project: projectWithRelation });
        }
        if (endpoint === "/api/public/projects" && method === "GET") {
          return mockJsonResponse(true, {
            projects: [projectWithRelation, { id: "project-2", title: "Projeto Relacionado" }],
          });
        }
        if (endpoint === "/api/public/tag-translations" && method === "GET") {
          return mockJsonResponse(true, { tags: {}, genres: {}, staffRoles: {} });
        }
        if (endpoint === "/api/public/projects/project-1/view" && method === "POST") {
          return mockJsonResponse(true, { views: 1 });
        }
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, { user: null });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    const relationImage = await screen.findByRole("img", { name: "Projeto Relacionado" });
    const relationPicture = relationImage.parentElement as HTMLElement | null;
    const relationCover = relationPicture?.parentElement as HTMLElement | null;
    const relationLink = relationImage.closest("a") as HTMLElement | null;
    const relationContent = relationCover?.nextElementSibling as HTMLElement | null;
    expect(relationCover).not.toBeNull();
    expect(relationLink).not.toBeNull();
    expect(relationContent).not.toBeNull();
    expect(classTokens(relationLink as HTMLElement)).toContain("overflow-hidden");
    expect(classTokens(relationCover as HTMLElement)).toContain("w-18");
    expect(classTokens(relationCover as HTMLElement)).toContain("sm:w-20");
    expect(classTokens(relationCover as HTMLElement)).not.toContain("rounded-lg");
    expect(classTokens(relationContent as HTMLElement)).toContain("p-4.5");
    expect(classTokens(relationCover as HTMLElement)).not.toContain("aspect-2/3");
    expect(classTokens(relationImage as HTMLElement)).not.toContain("scale-110");
    expect(relationCover?.style.aspectRatio).toBe("9 / 14");
  });

  it("remove a borda apenas dos cards externos de sobre, relacionados, staff e compartilhar", async () => {
    const projectWithSections = {
      ...projectFixture,
      relations: [
        {
          relation: "SEQUEL",
          title: "Projeto Relacionado",
          format: "Anime",
          status: "Em andamento",
          image: "/uploads/related-cover.jpg",
          projectId: "project-2",
        },
      ],
      staff: [{ role: "Tradução", members: ["Ana"] }],
      animeStaff: [{ role: "Director", members: ["Taro"] }],
    };

    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();

        if (endpoint === "/api/public/projects/project-1" && method === "GET") {
          return mockJsonResponse(true, { project: projectWithSections });
        }
        if (endpoint === "/api/public/projects" && method === "GET") {
          return mockJsonResponse(true, {
            projects: [projectWithSections, { id: "project-2", title: "Projeto Relacionado" }],
          });
        }
        if (endpoint === "/api/public/tag-translations" && method === "GET") {
          return mockJsonResponse(true, { tags: {}, genres: {}, staffRoles: {} });
        }
        if (endpoint === "/api/public/projects/project-1/view" && method === "POST") {
          return mockJsonResponse(true, { views: 1 });
        }
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, { user: null });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByText("Sobre o projeto");

    const formatField = findAncestor(screen.getByText("Formato"), (candidate) =>
      classTokens(candidate).includes("border-border/50"),
    );
    expect(formatField).not.toBeNull();
    expect(classTokens(formatField as HTMLElement)).toContain("hover:border-primary/60");

    const findSectionCard = (label: string) => {
      const element = screen.getByText(label);
      const card = findAncestor(element as HTMLElement, (candidate) => {
        const tokens = classTokens(candidate);
        return (
          tokens.includes("bg-card/80") ||
          tokens.includes("bg-card/70") ||
          tokens.includes("bg-card")
        );
      });

      expect(card).not.toBeNull();
      return card as HTMLElement;
    };

    const sectionCards = [
      findSectionCard("Sobre o projeto"),
      findSectionCard("Relacionados"),
      findSectionCard("Equipe da fansub"),
      findSectionCard("Staff do anime"),
      findSectionCard("Compartilhar"),
    ];

    sectionCards.forEach((card) => {
      expect(classTokens(card)).not.toContain("border");
      expect(classTokens(card)).not.toContain("border-border/60");
      expect(classTokens(card)).not.toContain("border-border");
      expect(classTokens(card)).not.toContain("hover:border-primary/60");
      expect(classTokens(card)).not.toContain("hover:-translate-y-1");
      expect(classTokens(card)).not.toContain("hover:bg-card/90");
      expect(classTokens(card)).not.toContain("hover:shadow-lg");
    });

    const relatedItem = screen.getByRole("link", { name: /Projeto Relacionado/i });
    expect(classTokens(relatedItem)).toContain("border");
    expect(classTokens(relatedItem)).toContain("border-border/50");
    expect(classTokens(relatedItem)).toContain("hover:border-primary/60");
    expect(classTokens(relatedItem)).toContain("related-project-link");
    expect(screen.getByAltText("Projeto Relacionado")).toHaveClass("home-card-media-transition");
  });

  it("renderiza CTA de leitura para light novel com capitulo publicado", async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();

        if (endpoint === "/api/public/projects/project-1" && method === "GET") {
          return mockJsonResponse(true, {
            project: {
              ...lightNovelProjectFixture,
              trailerUrl: "https://example.com/trailer",
            },
          });
        }
        if (endpoint === "/api/public/projects" && method === "GET") {
          return mockJsonResponse(true, {
            projects: [
              {
                ...lightNovelProjectFixture,
                trailerUrl: "https://example.com/trailer",
              },
            ],
          });
        }
        if (endpoint === "/api/public/tag-translations" && method === "GET") {
          return mockJsonResponse(true, { tags: {}, genres: {}, staffRoles: {} });
        }
        if (endpoint === "/api/public/projects/project-1/view" && method === "POST") {
          return mockJsonResponse(true, { views: 1 });
        }
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, { user: null });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const readLink = screen.getByRole("link", { name: /Come.* leitura/i });
    expect(readLink).toHaveAttribute("href", "/projeto/project-1/leitura/1?volume=2");
    const actionsRow = screen.getByTestId("project-hero-actions-row");
    expectSharedPrimaryButtonTokens(
      within(actionsRow).getByRole("link", { name: /Ver cap.tulos/i }),
    );
    expectOutlineActionTokens(readLink);
    const actionLinks = within(actionsRow).getAllByRole("link");
    expect(actionLinks.at(-1)).toBe(readLink);
    expect(classTokens(readLink)).toContain("order-last");
  });

  it("mantem leitura e download no mesmo card compacto de light novel", async () => {
    setupApiMock({
      ...lightNovelProjectFixture,
      episodeDownloads: [
        {
          ...lightNovelProjectFixture.episodeDownloads[0],
          synopsis: "Resumo do capitulo",
          sources: [{ label: "Drive", url: "https://example.com/drive" }],
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const volumeTrigger = screen.getByRole("button", { name: /Volume 2/i });
    expect(volumeTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(volumeTrigger);
    await waitFor(() => {
      expect(volumeTrigger).toHaveAttribute("aria-expanded", "true");
    });
    const readLink = screen.getByRole("link", { name: /Ler cap.tulo/i });
    const readCard = findAncestor(readLink, (candidate) =>
      classTokens(candidate).includes("chapter-download-card"),
    );
    expect(readCard).not.toBeNull();
    expect(classTokens(readCard as HTMLElement)).toContain("w-full");
    expect(classTokens(readCard as HTMLElement)).toContain("group/chapter-card");
    expect(classTokens(readCard as HTMLElement)).not.toContain("hover:-translate-y-1");
    expect(classTokens(readCard as HTMLElement)).not.toContain("hover:!translate-y-0");
    expect(classTokens(readCard as HTMLElement)).not.toContain("hover:border-primary/60");
    expect((readCard as HTMLElement).querySelector(".chapter-download-card__thumb")).toBeNull();
    const chapterTitle = within(readCard as HTMLElement).getByText(/Cap.tulo 1/i);
    expect(classTokens(chapterTitle as HTMLElement)).toContain("chapter-download-card__title");
    expect(classTokens(chapterTitle as HTMLElement)).toContain("text-base");
    expect(within(readCard as HTMLElement).queryByText(/Vol\.\s*2/i)).not.toBeInTheDocument();
    const sourceLink = within(readCard as HTMLElement).getByRole("link", { name: "Drive" });
    expect(sourceLink).toHaveAttribute("href", "https://example.com/drive");
    expectContextualSourceButtonTokens(sourceLink);
    expectSharedPrimaryButtonTokens(readLink);
    const actionsRow = findAncestor(sourceLink, (candidate) =>
      classTokens(candidate).includes("chapter-download-card__actions"),
    );
    expect(actionsRow).not.toBeNull();
    expect(actionsRow).toContainElement(readLink);
    const actionLinks = within(actionsRow as HTMLElement).getAllByRole("link");
    expect(actionLinks.at(-1)).toBe(readLink);
    expect(classTokens(readLink)).toContain("order-last");
    expect(classTokens(actionsRow as HTMLElement)).toContain("flex-wrap");
    expect(classTokens(actionsRow as HTMLElement)).toContain("gap-2");
    expect(
      within(readCard as HTMLElement).queryByText("Resumo do capitulo"),
    ).not.toBeInTheDocument();
  });

  it("mantem o CTA do leitor como ultima acao do hero para mangas", async () => {
    setupApiMock({
      ...mangaProjectFixture,
      type: "Manga",
      trailerUrl: "https://example.com/trailer",
      episodeDownloads: [
        {
          ...mangaProjectFixture.episodeDownloads[0],
          hasPages: true,
          contentFormat: "images",
          pages: [{ position: 1, imageUrl: "/uploads/page-1.jpg" }],
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const actionsRow = screen.getByTestId("project-hero-actions-row");
    const readLink = within(actionsRow).getByRole("link", { name: /Come.* leitura/i });
    expectSharedPrimaryButtonTokens(
      within(actionsRow).getByRole("link", { name: /Ver cap.tulos/i }),
    );
    expectOutlineActionTokens(readLink);
    const actionLinks = within(actionsRow).getAllByRole("link");
    expect(actionLinks.at(-1)).toBe(readLink);
    expect(classTokens(readLink)).toContain("order-last");
    expect(readLink).toHaveAttribute("href", "/projeto/project-1/leitura/1?volume=3");
  });

  it("mantem a sinopse do volume apenas no cabecalho quando o capitulo nao possui resumo", async () => {
    setupApiMock({
      ...lightNovelProjectFixture,
      episodeDownloads: [
        {
          ...lightNovelProjectFixture.episodeDownloads[0],
          synopsis: "",
          sources: [{ label: "Drive", url: "https://example.com/drive" }],
        },
      ],
      volumeEntries: [
        {
          volume: 2,
          synopsis: "Sinopse fallback do volume 2",
          coverImageUrl: "/uploads/volume-2-cover.jpg",
          coverImageAlt: "Capa do volume 2",
        },
      ],
      volumeCovers: [
        {
          volume: 2,
          coverImageUrl: "/uploads/volume-2-cover.jpg",
          coverImageAlt: "Capa do volume 2",
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const volumeTrigger = screen.getByRole("button", { name: /Volume 2/i });
    expect(volumeTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(volumeTrigger);
    await waitFor(() => {
      expect(volumeTrigger).toHaveAttribute("aria-expanded", "true");
    });
    const readLink = screen.getByRole("link", { name: /Ler cap.tulo/i });
    const readCard = findAncestor(readLink, (candidate) =>
      classTokens(candidate).includes("chapter-download-card"),
    );
    expect(readCard).not.toBeNull();
    expect(
      within(readCard as HTMLElement).queryByText("Sinopse fallback do volume 2"),
    ).not.toBeInTheDocument();
    expect(within(volumeTrigger).getByText("Sinopse fallback do volume 2")).toBeInTheDocument();
  });

  it("usa o rotulo numerico como titulo quando o capitulo nao tem nome customizado", async () => {
    setupApiMock({
      ...lightNovelProjectFixture,
      episodeDownloads: [
        {
          ...lightNovelProjectFixture.episodeDownloads[0],
          title: "",
          sources: [{ label: "Drive", url: "https://example.com/drive" }],
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const volumeTrigger = screen.getByRole("button", { name: /Volume 2/i });
    fireEvent.click(volumeTrigger);
    const readLink = await screen.findByRole("link", { name: /Ler cap.tulo/i });
    const readCard = findAncestor(readLink, (candidate) =>
      classTokens(candidate).includes("chapter-download-card"),
    );
    expect(readCard).not.toBeNull();
    expect(within(readCard as HTMLElement).getByText(/Cap.tulo 1/i)).toBeInTheDocument();
    expect(within(readCard as HTMLElement).queryByText(/Vol\.\s*2/i)).not.toBeInTheDocument();
  });

  it("exibe capa por volume em grupos de light novel", async () => {
    setupApiMock({
      ...lightNovelProjectFixture,
      volumeEntries: [
        {
          volume: 2,
          synopsis: "Sinopse do volume 2",
          coverImageUrl: "/uploads/volume-2-cover.jpg",
          coverImageAlt: "Capa do volume 2",
        },
      ],
      volumeCovers: [
        {
          volume: 2,
          coverImageUrl: "/uploads/volume-2-cover.jpg",
          coverImageAlt: "Capa do volume 2",
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const volumeTrigger = screen.getByRole("button", { name: /Volume 2/i });
    expect(volumeTrigger).toHaveAttribute("aria-expanded", "false");
    const volumeCard = findAncestor(volumeTrigger, (candidate) =>
      classTokens(candidate).includes("bg-card/80"),
    );
    expect(volumeCard).not.toBeNull();
    expect((volumeCard as HTMLElement).querySelectorAll("button").length).toBe(1);
    expect(classTokens(volumeTrigger)).toContain("items-start");
    expect(classTokens(volumeTrigger)).toContain("px-5");
    expect(classTokens(volumeTrigger)).toContain("py-5");
    expect(classTokens(volumeTrigger)).toContain("hover:no-underline");

    const triggerGrid = (volumeTrigger as HTMLElement).querySelector(
      '[class*="md:grid-cols-[128px_minmax(0,1fr)_auto]"]',
    ) as HTMLElement | null;
    expect(triggerGrid).not.toBeNull();
    expect(classTokens(triggerGrid as HTMLElement)).toContain("md:items-start");
    expect(classTokens(triggerGrid as HTMLElement)).toContain("md:gap-5");
    expect((triggerGrid as HTMLElement).querySelector('[class*="self-start"]')).not.toBeNull();
    expect((triggerGrid as HTMLElement).querySelector('[class*="w-28"]')).not.toBeNull();

    const volumeTitle = within(volumeTrigger).getByText("Volume 2");
    const volumeSynopsis = within(volumeTrigger).getByText("Sinopse do volume 2");
    expect(within(volumeTrigger).getAllByRole("img", { name: "Capa do volume 2" }).length).toBe(1);
    expect(within(volumeTrigger).getByText("1 capítulos disponíveis")).toBeInTheDocument();
    expect(within(volumeTrigger).getByText("1 capítulos")).toBeInTheDocument();
    expect(volumeSynopsis).toBeInTheDocument();
    expect(classTokens(volumeTitle)).toContain("text-base");
    expect(classTokens(volumeTitle)).not.toContain("text-sm");
    expect(classTokens(volumeSynopsis)).toContain("text-sm");
    expect(classTokens(volumeSynopsis)).not.toContain("text-xs");
  });

  it("exibe capa por volume em grupos de mangá", async () => {
    setupApiMock({
      ...mangaProjectFixture,
      volumeEntries: [
        {
          volume: 3,
          synopsis: "Sinopse do volume 3",
          coverImageUrl: "/uploads/volume-3-cover.jpg",
          coverImageAlt: "Capa do volume 3",
        },
      ],
      volumeCovers: [
        {
          volume: 3,
          coverImageUrl: "/uploads/volume-3-cover.jpg",
          coverImageAlt: "Capa do volume 3",
        },
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const volumeTrigger = screen.getByRole("button", { name: /Volume 3/i });
    expect(volumeTrigger).toHaveAttribute("aria-expanded", "false");
    const volumeCard = findAncestor(volumeTrigger, (candidate) =>
      classTokens(candidate).includes("bg-card/80"),
    );
    expect(volumeCard).not.toBeNull();
    expect((volumeCard as HTMLElement).querySelectorAll("button").length).toBe(1);
    expect(classTokens(volumeTrigger)).toContain("items-start");
    expect(classTokens(volumeTrigger)).toContain("px-5");
    expect(classTokens(volumeTrigger)).toContain("py-5");

    const triggerGrid = (volumeTrigger as HTMLElement).querySelector(
      '[class*="md:grid-cols-[128px_minmax(0,1fr)_auto]"]',
    ) as HTMLElement | null;
    expect(triggerGrid).not.toBeNull();
    expect(classTokens(triggerGrid as HTMLElement)).toContain("md:items-start");
    expect((triggerGrid as HTMLElement).querySelector('[class*="self-start"]')).not.toBeNull();
    expect((triggerGrid as HTMLElement).querySelector('[class*="w-28"]')).not.toBeNull();

    const volumeTitle = within(volumeTrigger).getByText("Volume 3");
    const volumeSynopsis = within(volumeTrigger).getByText("Sinopse do volume 3");
    const volumeCoverImage = within(volumeTrigger).getByRole("img", { name: "Capa do volume 3" });
    expect(volumeCoverImage).toBeInTheDocument();
    expect(classTokens(volumeCoverImage)).toContain("transition-transform");
    expect(classTokens(volumeCoverImage)).toContain("duration-300");
    expect(classTokens(volumeCoverImage)).toContain("group-hover/download-card:scale-105");
    expect(within(volumeTrigger).getByText("1 capítulos disponíveis")).toBeInTheDocument();
    expect(within(volumeTrigger).getByText("1 capítulos")).toBeInTheDocument();
    expect(volumeSynopsis).toBeInTheDocument();
    expect(classTokens(volumeTitle)).toContain("text-base");
    expect(classTokens(volumeTitle)).not.toContain("text-sm");
    expect(classTokens(volumeSynopsis)).toContain("text-sm");
    expect(classTokens(volumeSynopsis)).not.toContain("text-xs");
  });

  it("remove centralizacao do grid de downloads no manga e mantem cards com largura fluida", async () => {
    setupApiMock(mangaProjectFixture);

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const volumeTrigger = screen.getByRole("button", { name: /Volume 3/i });
    expect(volumeTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(volumeTrigger);
    await waitFor(() => {
      expect(volumeTrigger).toHaveAttribute("aria-expanded", "true");
    });
    const downloadsSection = document.getElementById("downloads");
    expect(downloadsSection).not.toBeNull();
    expect(
      (downloadsSection as HTMLElement).querySelector('[class*="justify-items-center"]'),
    ).toBeNull();

    const chapterTitle = screen.getByText(/Cap.tulo 1/i);
    const episodeCard = findAncestor(chapterTitle, (candidate) =>
      classTokens(candidate).includes("chapter-download-card"),
    );
    expect(episodeCard).not.toBeNull();
    expect(classTokens(episodeCard as HTMLElement)).toContain("w-full");
    expect(classTokens(episodeCard as HTMLElement)).toContain("group/chapter-card");
    expect(classTokens(episodeCard as HTMLElement)).not.toContain("hover:-translate-y-1");
    expect(classTokens(episodeCard as HTMLElement)).not.toContain("hover:!translate-y-0");
    expect(classTokens(episodeCard as HTMLElement)).not.toContain("hover:border-primary/60");
    expect((episodeCard as HTMLElement).querySelector(".chapter-download-card__thumb")).toBeNull();
    expect(within(episodeCard as HTMLElement).queryByRole("link", { name: /Ler/i })).toBeNull();
    expect(within(episodeCard as HTMLElement).getByRole("link", { name: "Drive" })).toHaveAttribute(
      "href",
      "https://example.com/file",
    );
  });

  it("mantem cards de anime com altura fixa no desktop", async () => {
    setupApiMock({
      ...projectFixture,
      episodeDownloads: [
        createProjectEpisodeFixture({
          number: 1,
          title: "Episodio 1",
          releaseDate: "2025-01-01",
          duration: "24 min",
          sourceType: "TV",
          sizeBytes: 734003200,
          hash: "ABC123",
          sources: [{ label: "Drive", url: "https://example.com/1" }],
        }),
        createProjectEpisodeFixture({
          number: 2,
          title: "Episodio 2",
          sourceType: "TV",
          sources: [{ label: "Drive", url: "https://example.com/2" }],
        }),
      ],
    });

    render(
      <MemoryRouter>
        <ProjectPage />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Teste" });
    const episodeOneTitle = screen.getByText("Episodio 1");
    const episodeOneCard = findAncestor(episodeOneTitle, (candidate) =>
      classTokens(candidate).includes("bg-gradient-card"),
    );
    expect(episodeOneCard).not.toBeNull();
    expect(classTokens(episodeOneCard as HTMLElement)).toContain("md:h-[210px]");
    expect(classTokens(episodeOneCard as HTMLElement)).not.toContain("md:min-h-[185px]");
  });
});
