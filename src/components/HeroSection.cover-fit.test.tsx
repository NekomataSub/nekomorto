import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HeroSection from "@/components/HeroSection";

const usePublicBootstrapMock = vi.hoisted(() => vi.fn());
const browserIdleState = vi.hoisted(() => ({
  autoRun: true,
  callbacks: [] as Array<(deadline: IdleDeadline) => void>,
}));
const carouselState = vi.hoisted(() => ({
  api: null as null | {
    scrollNext: () => void;
    scrollPrev: () => void;
    scrollTo: (index: number) => void;
  },
  scrollNext: vi.fn(),
  scrollPrev: vi.fn(),
  scrollTo: vi.fn(),
  selectedIndex: 0,
  slideCount: 0,
}));

vi.mock("@/hooks/use-public-bootstrap", () => ({
  usePublicBootstrap: () => usePublicBootstrapMock(),
}));

vi.mock("@/lib/browser-idle", () => ({
  scheduleOnBrowserIdle: (callback: (deadline: IdleDeadline) => void) => {
    const deadline = {
      didTimeout: false,
      timeRemaining: () => 16,
    } as IdleDeadline;
    browserIdleState.callbacks.push(callback);
    if (browserIdleState.autoRun) {
      callback(deadline);
    }
    return () => {
      const callbackIndex = browserIdleState.callbacks.indexOf(callback);
      if (callbackIndex >= 0) {
        browserIdleState.callbacks.splice(callbackIndex, 1);
      }
    };
  },
  scheduleOnBrowserLoadIdle: (callback: (deadline: IdleDeadline) => void) => {
    const deadline = {
      didTimeout: false,
      timeRemaining: () => 16,
    } as IdleDeadline;
    browserIdleState.callbacks.push(callback);
    if (browserIdleState.autoRun) {
      callback(deadline);
    }
    return () => {
      const callbackIndex = browserIdleState.callbacks.indexOf(callback);
      if (callbackIndex >= 0) {
        browserIdleState.callbacks.splice(callbackIndex, 1);
      }
    };
  },
}));

vi.mock("@/components/ui/carousel", () => {
  const Carousel = ({
    children,
    setApi,
  }: {
    children: ReactNode;
    setApi?: (api: {
      selectedScrollSnap: () => number;
      scrollNext: () => void;
      on: (event: string, callback: () => void) => void;
      off: (event: string, callback: () => void) => void;
    }) => void;
  }) => {
    React.useEffect(() => {
      if (!setApi) {
        return;
      }

      const listeners = new Map<string, Set<() => void>>();
      const notify = (event: string) => {
        listeners.get(event)?.forEach((callback) => callback());
      };
      const api = {
        selectedScrollSnap: () => carouselState.selectedIndex,
        scrollNext: () => {
          carouselState.scrollNext();
          const slideCount = Math.max(carouselState.slideCount, 1);
          carouselState.selectedIndex = (carouselState.selectedIndex + 1) % slideCount;
          notify("select");
        },
        scrollPrev: () => {
          carouselState.scrollPrev();
          const slideCount = Math.max(carouselState.slideCount, 1);
          carouselState.selectedIndex = (carouselState.selectedIndex - 1 + slideCount) % slideCount;
          notify("select");
        },
        scrollTo: (index: number) => {
          carouselState.scrollTo(index);
          const slideCount = Math.max(carouselState.slideCount, 1);
          carouselState.selectedIndex = ((index % slideCount) + slideCount) % slideCount;
          notify("select");
        },
        on: (event: string, callback: () => void) => {
          const callbacks = listeners.get(event) || new Set<() => void>();
          callbacks.add(callback);
          listeners.set(event, callbacks);
        },
        off: (event: string, callback: () => void) => {
          listeners.get(event)?.delete(callback);
        },
      };

      carouselState.api = api;
      setApi(api);

      return () => {
        carouselState.api = null;
        listeners.clear();
      };
    }, [setApi]);

    return <div>{children}</div>;
  };

  const CarouselContent = ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => {
    carouselState.slideCount = React.Children.count(children);
    return <div className={className}>{children}</div>;
  };

  const CarouselItem = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );

  const CarouselPrevious = ({
    className,
    onClick,
  }: {
    className?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => {
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        carouselState.api?.scrollPrev();
      }
    };

    return (
      <button
        type="button"
        aria-label="previous slide"
        className={className}
        onClick={handleClick}
      />
    );
  };

  const CarouselNext = ({
    className,
    onClick,
  }: {
    className?: string;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => {
    const handleClick: React.MouseEventHandler<HTMLButtonElement> = (event) => {
      onClick?.(event);
      if (!event.defaultPrevented) {
        carouselState.api?.scrollNext();
      }
    };

    return (
      <button type="button" aria-label="next slide" className={className} onClick={handleClick} />
    );
  };

  return {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselPrevious,
    CarouselNext,
  };
});

const setupBootstrapMock = ({
  includeSecondProject = false,
  projectTitle = "Projeto com Hero",
  trailerUrl = "",
}: {
  includeSecondProject?: boolean;
  projectTitle?: string;
  trailerUrl?: string;
} = {}) => {
  const projects = [
    {
      id: "project-1",
      title: projectTitle,
      synopsis: "Sinopse de teste",
      description: "Descricao de teste",
      type: "Anime",
      status: "Em andamento",
      heroImageUrl: "/uploads/hero-fit.jpg",
      banner: "",
      cover: "",
      trailerUrl,
      forceHero: true,
    },
  ];
  const updates = [
    {
      projectId: "project-1",
      kind: "lancamento",
      updatedAt: "2026-02-10T12:00:00.000Z",
    },
  ];

  if (includeSecondProject) {
    projects.push({
      id: "project-2",
      title: "Projeto Secundario",
      synopsis: "Sinopse secundaria",
      description: "Descricao secundaria",
      type: "Manga",
      status: "Completo",
      heroImageUrl: "/uploads/hero-fit-2.jpg",
      banner: "",
      cover: "",
      trailerUrl: "",
      forceHero: false,
    });
    updates.push({
      projectId: "project-2",
      kind: "lancamento",
      updatedAt: "2026-02-08T10:00:00.000Z",
    });
  }

  usePublicBootstrapMock.mockReturnValue({
    isFetched: true,
    data: {
      projects,
      updates,
      mediaVariants: {
        "/uploads/hero-fit.jpg": {
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
      },
    },
  });
};

const classTokens = (element: HTMLElement) =>
  String(element.className).split(/\s+/).filter(Boolean);

const expectHeroPrimaryButtonTokens = (element: HTMLElement) => {
  const tokens = classTokens(element);

  expect(tokens).toEqual(expect.arrayContaining(["inline-flex", "gap-2"]));
};

describe("HeroSection cover fit", () => {
  beforeEach(() => {
    usePublicBootstrapMock.mockReset();
    browserIdleState.autoRun = true;
    browserIdleState.callbacks.splice(0, browserIdleState.callbacks.length);
    carouselState.api = null;
    carouselState.scrollNext.mockReset();
    carouselState.scrollPrev.mockReset();
    carouselState.scrollTo.mockReset();
    carouselState.selectedIndex = 0;
    carouselState.slideCount = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renderiza o slide com altura responsiva e imagem em cover central", async () => {
    setupBootstrapMock();

    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto com Hero" });

    const heroSection = container.querySelector("section");
    expect(heroSection).not.toBeNull();
    expect(heroSection).toHaveClass("public-home-hero-viewport");
    expectHeroPrimaryButtonTokens(
      screen.getByRole("link", { name: /Acessar p.gina de Projeto com Hero/i }),
    );
    expect(
      screen.getByRole("link", { name: "Acessar página de Projeto com Hero" }),
    ).toHaveAttribute("href", "/projeto/project-1");

    const backgroundImage = container.querySelector(
      "img[aria-hidden='true']",
    ) as HTMLImageElement | null;
    expect(backgroundImage).not.toBeNull();
    expect(backgroundImage).toHaveClass("h-full", "w-full", "object-cover", "object-center");
    expect(backgroundImage?.getAttribute("src")).toContain(
      "/uploads/_variants/project-1/hero-v1.jpeg",
    );
    expect(backgroundImage).toHaveStyle({ objectPosition: "20% 80%" });
    expect(backgroundImage?.getAttribute("fetchpriority")).toBe("high");
    expect(backgroundImage?.getAttribute("loading")).toBe("eager");
  });

  it("mantem badge de ultimo lancamento acima de tipo/status no mobile", async () => {
    setupBootstrapMock();

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto com Hero" });

    const meta = await screen.findByTestId("hero-slide-meta-project-1");

    const latest = screen.getByTestId("hero-slide-latest-project-1");
    const typeStatus = screen.getByTestId("hero-slide-type-status-project-1");
    expect(latest).toBeInTheDocument();
    expect(typeStatus).toBeInTheDocument();

    const children = Array.from(meta.children);
    expect(children.indexOf(latest)).toBeGreaterThanOrEqual(0);
    expect(children.indexOf(typeStatus)).toBeGreaterThanOrEqual(0);
    expect(children.indexOf(latest)).toBeLessThan(children.indexOf(typeStatus));

    expect(typeStatus).toHaveTextContent("Anime • Em andamento");
    expectHeroPrimaryButtonTokens(
      screen.getByRole("link", { name: /Acessar p.gina de Projeto com Hero/i }),
    );
    expect(typeStatus).toHaveClass("hero-home__meta-text");
  });

  it("diferencia o nome acessivel do link de trailer pelo titulo do slide", async () => {
    setupBootstrapMock({ trailerUrl: "https://youtube.example/trailer-1" });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const trailer = await screen.findByRole("link", {
      name: "Assistir trailer de Projeto com Hero",
    });

    expect(trailer).toHaveAttribute("href", "https://youtube.example/trailer-1");
    expect(trailer).toHaveTextContent("Assistir trailer");
  });

  it("aplica animacao escalonada em meta e titulo no modo carrossel", async () => {
    setupBootstrapMock({ includeSecondProject: true });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByTestId("hero-slide-meta-project-2");

    const typeStatus = await screen.findByTestId("hero-slide-type-status-project-1");
    expectHeroPrimaryButtonTokens(
      screen.getByRole("link", { name: /Acessar p.gina de Projeto com Hero/i }),
    );
    expect(typeStatus).toHaveTextContent("Anime • Em andamento");
    expect(typeStatus).toHaveClass("animate-slide-up", "hero-home__meta-text");
    expect(typeStatus).toHaveStyle({ animationDelay: "80ms" });

    const heading = screen.getByRole("heading", { name: "Projeto com Hero" });
    expect(heading).toHaveClass("animate-slide-up");
    expect(heading).toHaveStyle({ animationDelay: "220ms" });
  });

  it("aplica clamp no titulo longo e preserva texto completo no atributo title", async () => {
    const longTitle =
      "Rekishi ni Nokoru Akujo ni Naruzo: Akuyaku Reijou ni Naru hodo Ouji no Dekiai wa Kasoku Suru you desu!";
    setupBootstrapMock({ projectTitle: longTitle });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const heading = await screen.findByRole("heading", { name: longTitle });
    expect(heading).toHaveClass("hero-home__title");
    expect(heading).toHaveAttribute("title", longTitle);
  });

  it("mantem botoes de acao na coluna de conteudo e fora do bloco direito antigo", async () => {
    setupBootstrapMock();

    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto com Hero" });

    const actionGroup = screen
      .getByRole("link", { name: /Acessar p.gina de Projeto com Hero/i })
      .closest("div.hero-home__action-group");
    expect(actionGroup).not.toBeNull();
    expect(actionGroup?.closest("div.hero-home__copy")).not.toBeNull();
    expect(container.querySelector(".hero-home__actions")).toBeNull();
  });

  it("monta a estrutura completa do carrossel no primeiro render mesmo antes do idle", () => {
    browserIdleState.autoRun = false;
    setupBootstrapMock({ includeSecondProject: true });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("hero-slide-meta-project-1")).toBeInTheDocument();
    expect(screen.getByTestId("hero-slide-meta-project-2")).toBeInTheDocument();
    expect(screen.getByTestId("hero-carousel-dock-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("hero-carousel-dock-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("hero-carousel-counter-desktop")).toHaveTextContent("01/02");
    expect(screen.getByTestId("hero-carousel-counter-mobile")).toHaveTextContent("01/02");
  });

  it("nao renderiza dock de navegacao quando existe apenas um slide", async () => {
    setupBootstrapMock();

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto com Hero" });
    expect(screen.queryByTestId("hero-carousel-dock-desktop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hero-carousel-dock-mobile")).not.toBeInTheDocument();
  });

  it("remove as animacoes de entrada do primeiro slide quando o shell inicial existe", async () => {
    setupBootstrapMock();
    const shell = document.createElement("div");
    shell.id = "home-hero-shell";
    document.body.appendChild(shell);

    const { unmount } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const heading = await screen.findByRole("heading", { name: "Projeto com Hero" });
    const latestBadge = screen.getByTestId("hero-slide-latest-project-1");
    const actions = screen
      .getByRole("link", { name: /Acessar p.gina de Projeto com Hero/i })
      .closest("div.hero-home__action-group");

    expect(heading).not.toHaveClass("animate-slide-up");
    expect(latestBadge).not.toHaveClass("animate-slide-up");
    expect(actions).not.toHaveClass("animate-slide-up");

    unmount();
    shell.remove();
  });

  it("inicia autoplay do carrossel em 6s", async () => {
    vi.useFakeTimers();
    setupBootstrapMock({ includeSecondProject: true });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("hero-slide-meta-project-2")).toBeInTheDocument();
    expect(carouselState.scrollNext).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(5999);
    });
    expect(carouselState.scrollNext).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(carouselState.scrollNext).toHaveBeenCalledTimes(1);
  });

  it("retoma autoplay 3s depois de interacao manual e volta a avancar apos 6s", async () => {
    vi.useFakeTimers();
    setupBootstrapMock({ includeSecondProject: true });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("hero-slide-meta-project-2")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(carouselState.scrollNext).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: /pr.ximo slide/i })[0]);
    expect(carouselState.scrollNext).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(8999);
    });
    expect(carouselState.scrollNext).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(carouselState.scrollNext).toHaveBeenCalledTimes(2);
  });

  it("mantem o mesmo dock montado ao navegar entre slides", async () => {
    setupBootstrapMock({ includeSecondProject: true });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByTestId("hero-slide-meta-project-2");

    const initialDock = screen.getByTestId("hero-carousel-dock-desktop");
    expect(screen.getByTestId("hero-carousel-dock-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("hero-carousel-counter-desktop")).toHaveTextContent("01/02");
    expect(screen.getByTestId("hero-carousel-counter-mobile")).toHaveTextContent("01/02");

    fireEvent.click(screen.getAllByRole("button", { name: /pr.ximo slide/i })[0]);

    const dockAfterNext = screen.getByTestId("hero-carousel-dock-desktop");
    const mobileDockAfterNext = screen.getByTestId("hero-carousel-dock-mobile");
    expect(dockAfterNext).toBe(initialDock);
    expect(mobileDockAfterNext).toBeInTheDocument();
    expect(screen.getByTestId("hero-carousel-counter-desktop")).toHaveTextContent("02/02");
    expect(screen.getByTestId("hero-carousel-counter-mobile")).toHaveTextContent("02/02");
  });

  it("mantem o overlay superior montado para o CSS alinhar a navbar sem divergir na hidratacao", async () => {
    setupBootstrapMock();

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto com Hero" });
    expect(screen.getByTestId("hero-navbar-overlay")).toBeInTheDocument();
  });

  it("prioriza o ultimo lancamento de manga quando o bootstrap publico o inclui nos updates", async () => {
    usePublicBootstrapMock.mockReturnValue({
      isFetched: true,
      data: {
        projects: [
          {
            id: "project-anime",
            title: "Projeto Anime",
            synopsis: "Sinopse anime",
            description: "Descricao anime",
            type: "Anime",
            status: "Em andamento",
            heroImageUrl: "/uploads/hero-anime.jpg",
            banner: "",
            cover: "",
            trailerUrl: "",
            forceHero: false,
          },
          {
            id: "project-manga",
            title: "Projeto Manga",
            synopsis: "Sinopse manga",
            description: "Descricao manga",
            type: "Manga",
            status: "Em andamento",
            heroImageUrl: "/uploads/hero-manga.jpg",
            banner: "",
            cover: "",
            trailerUrl: "",
            forceHero: false,
          },
        ],
        updates: [
          {
            projectId: "project-anime",
            kind: "lancamento",
            updatedAt: "2026-02-10T12:00:00.000Z",
          },
          {
            projectId: "project-manga",
            kind: "lancamento",
            updatedAt: "2026-02-12T12:00:00.000Z",
          },
        ],
        mediaVariants: {},
      },
    });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto Manga" });
    expect(
      screen.getByRole("link", {
        name: /Acessar p.gina de Projeto Manga/i,
      }),
    ).toHaveAttribute("href", "/projeto/project-manga");
  });

  it("renderiza a marca oficial do projeto quando heroLogoUrl existe", async () => {
    usePublicBootstrapMock.mockReturnValue({
      isFetched: true,
      data: {
        projects: [
          {
            id: "project-1",
            title: "Projeto com Marca",
            synopsis: "Sinopse de teste",
            description: "Descricao de teste",
            type: "Anime",
            status: "Em andamento",
            heroImageUrl: "/uploads/hero-fit.jpg",
            heroLogoUrl: "/uploads/hero-logo.png",
            heroLogoAlt: "Marca oficial do Projeto com Marca",
            banner: "",
            cover: "",
            trailerUrl: "",
            forceHero: true,
          },
        ],
        updates: [
          {
            projectId: "project-1",
            kind: "lancamento",
            updatedAt: "2026-02-10T12:00:00.000Z",
          },
        ],
        mediaVariants: {},
      },
    });

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Projeto com Marca" });
    expect(screen.getByAltText("Marca oficial do Projeto com Marca")).toBeInTheDocument();
    expect(screen.queryByTestId("hero-slide-brand-fallback-project-1")).not.toBeInTheDocument();
  });
});
