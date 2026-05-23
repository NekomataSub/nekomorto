import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HeroSection from "@/components/HeroSection";
import { HOME_HERO_READY_EVENT } from "@/lib/home-hero";

const themeModeState = vi.hoisted(() => ({
  effectiveMode: "dark" as "light" | "dark",
}));
const usePublicBootstrapMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-public-bootstrap", () => ({
  usePublicBootstrap: () => usePublicBootstrapMock(),
}));

vi.mock("@/hooks/use-theme-mode", () => ({
  useThemeMode: () => ({
    globalMode: "dark",
    effectiveMode: themeModeState.effectiveMode,
    preference: "global",
    isOverridden: false,
    setPreference: vi.fn(),
  }),
}));

vi.mock("@/lib/browser-idle", () => ({
  scheduleOnBrowserIdle: () => () => undefined,
  scheduleOnBrowserLoadIdle: () => () => undefined,
}));

vi.mock("@/components/ui/carousel", () => {
  const Carousel = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  const CarouselContent = ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>;
  const CarouselItem = ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  const CarouselPrevious = () => null;
  const CarouselNext = () => null;

  return {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselPrevious,
    CarouselNext,
  };
});

const installDeterministicRaf = () => {
  let nextId = 1;
  const pending = new Map<number, number>();

  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId++;
    const timeoutId = window.setTimeout(() => {
      pending.delete(id);
      callback(performance.now());
    }, 16);
    pending.set(id, timeoutId);
    return id;
  });

  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    const timeoutId = pending.get(id);
    if (timeoutId === undefined) {
      return;
    }
    window.clearTimeout(timeoutId);
    pending.delete(id);
  });
};

const flushHeroReadyFrame = async () => {
  await vi.advanceTimersByTimeAsync(40);
};

const setupBootstrapMock = () => {
  usePublicBootstrapMock.mockReturnValue({
    isFetched: true,
    data: {
      projects: [
        {
          id: "project-1",
          title: "Projeto com Hero",
          synopsis: "Sinopse de teste",
          description: "Descricao de teste",
          type: "Anime",
          status: "Em andamento",
          heroImageUrl: "/uploads/hero-fit.jpg",
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
        },
      },
    },
  });
};

describe("HeroSection home hero readiness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    usePublicBootstrapMock.mockReset();
    themeModeState.effectiveMode = "dark";
    installDeterministicRaf();
    setupBootstrapMock();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("dispatches the hero ready event once after the primary image loads", async () => {
    const onReady = vi.fn();
    window.addEventListener(HOME_HERO_READY_EVENT, onReady);

    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Projeto com Hero" })).toBeInTheDocument();
    const image = container.querySelector("img[aria-hidden='true']") as HTMLImageElement | null;
    expect(image).not.toBeNull();

    act(() => {
      fireEvent.load(image as HTMLImageElement);
      fireEvent.load(image as HTMLImageElement);
    });
    await flushHeroReadyFrame();

    expect(onReady).toHaveBeenCalledTimes(1);
    window.removeEventListener(HOME_HERO_READY_EVENT, onReady);
  });

  it("dispatches the hero ready event when the primary image is already complete", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(1600);
    const onReady = vi.fn();
    window.addEventListener(HOME_HERO_READY_EVENT, onReady);

    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Projeto com Hero" })).toBeInTheDocument();
    await flushHeroReadyFrame();

    expect(onReady).toHaveBeenCalledTimes(1);
    window.removeEventListener(HOME_HERO_READY_EVENT, onReady);
  });

  it("dispatches the hero ready event when the primary image errors", async () => {
    usePublicBootstrapMock.mockReturnValue({
      isFetched: true,
      data: {
        projects: [
          {
            id: "project-1",
            title: "Projeto com Hero",
            synopsis: "Sinopse de teste",
            description: "Descricao de teste",
            type: "Anime",
            status: "Em andamento",
            heroImageUrl: "/uploads/hero-fit.jpg",
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
    const onReady = vi.fn();
    window.addEventListener(HOME_HERO_READY_EVENT, onReady);

    const { container } = render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Projeto com Hero" })).toBeInTheDocument();
    const image = container.querySelector("img[aria-hidden='true']") as HTMLImageElement | null;
    expect(image).not.toBeNull();

    act(() => {
      fireEvent.error(image as HTMLImageElement);
    });
    await flushHeroReadyFrame();

    expect(onReady).toHaveBeenCalledTimes(1);
    window.removeEventListener(HOME_HERO_READY_EVENT, onReady);
  });
});
