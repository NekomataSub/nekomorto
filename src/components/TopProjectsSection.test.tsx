import TopProjectsSection from "@/components/TopProjectsSection";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const usePublicBootstrapMock = vi.hoisted(() => vi.fn());
const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView;

vi.mock("@/hooks/use-public-bootstrap", () => ({
  usePublicBootstrap: () => usePublicBootstrapMock(),
}));

vi.mock("@/components/UploadPicture", () => ({
  default: ({
    src,
    alt,
    className,
    imgClassName,
  }: {
    src?: string;
    alt?: string;
    className?: string;
    imgClassName?: string;
  }) => (
    <picture className={className}>
      <img src={src || ""} alt={alt || ""} className={imgClassName} />
    </picture>
  ),
}));

const createProject = ({
  id,
  title,
  views,
  viewsDaily = {},
}: {
  id: string;
  title: string;
  views: number;
  viewsDaily?: Record<string, number>;
}) => ({
  id,
  title,
  synopsis: `${title} synopsis`,
  description: `${title} description`,
  type: "Anime",
  status: "Em andamento",
  tags: [],
  cover: "/uploads/cover.jpg",
  coverAlt: `${title} cover`,
  banner: "",
  bannerAlt: "",
  heroImageUrl: "",
  heroImageAlt: "",
  forceHero: false,
  trailerUrl: "",
  volumeCovers: [],
  episodeDownloads: [],
  views,
  viewsDaily,
});

const getUtcDayKeyFromOffset = (offsetDays: number) => {
  const day = new Date(FIXED_GENERATED_AT);
  day.setUTCHours(0, 0, 0, 0);
  day.setUTCDate(day.getUTCDate() - offsetDays);
  return day.toISOString().slice(0, 10);
};

const FIXED_GENERATED_AT = "2026-05-12T12:00:00.000Z";

const classTokens = (element: HTMLElement) =>
  String(element.className).split(/\s+/).filter(Boolean);

describe("TopProjectsSection", () => {
  beforeEach(() => {
    usePublicBootstrapMock.mockReset();
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it("ordena por views acumuladas por padrao, limita top 10 e exibe ranking/metricas discretas", async () => {
    const projects = Array.from({ length: 12 }, (_, index) =>
      createProject({
        id: `project-${index + 1}`,
        title: `Projeto ${String(index + 1).padStart(2, "0")}`,
        views: (index + 1) * 10,
      }),
    );

    usePublicBootstrapMock.mockReturnValue({
      isLoading: false,
      data: {
        generatedAt: FIXED_GENERATED_AT,
        projects,
        mediaVariants: {},
      },
    });
    render(
      <MemoryRouter>
        <TopProjectsSection />
      </MemoryRouter>,
    );

    const headings = screen.getAllByRole("heading", {
      level: 3,
      name: /Projeto /i,
    });
    const cardRoot = screen
      .getByRole("heading", { name: "Projetos Populares" })
      .closest<HTMLElement>("[data-reveal]");
    expect(headings).toHaveLength(10);
    expect(cardRoot).not.toBeNull();
    expect(cardRoot).not.toHaveClass("lift-hover");
    expect(cardRoot).toHaveClass("shadow-none", "border", "border-border/60");
    expect(cardRoot).not.toHaveClass("public-interactive-card-shell");
    expect(cardRoot).not.toHaveClass("shadow-xs");
    expect(headings[0]).toHaveTextContent("Projeto 12");
    expect(headings[0]).toHaveClass("clamp-safe-2");
    expect(screen.queryByRole("heading", { level: 3, name: "Projeto 01" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 3, name: "Projeto 02" })).not.toBeInTheDocument();
    expect(screen.queryByText("#1")).not.toBeInTheDocument();
    const firstMetaRow = screen.getByTestId("top-project-item-1-meta-row");
    const firstType = screen.getByTestId("top-project-item-1-type");
    const firstRank = screen.getByTestId("top-project-item-1-rank");
    const firstMetric = screen.getByTestId("top-project-item-1-metric");
    expect(firstType).toHaveTextContent("Anime");
    expect(firstMetaRow).toContainElement(firstType);
    expect(firstMetaRow).toContainElement(firstRank);
    expect(firstMetaRow).toContainElement(firstMetric);
    expect(screen.getByTestId("top-project-item-1-rank")).toHaveTextContent("1");
    expect(screen.getByTestId("top-project-item-1-metric")).toHaveTextContent("120");
    expect(screen.queryByText(/views acumuladas/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/views nos.*30 dias/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Em andamento")).not.toBeInTheDocument();
    expect(screen.getByTestId("top-projects-mode-trigger")).toHaveTextContent(/sempre/i);
    expect(screen.getByTestId("top-projects-mode-trigger")).toHaveClass(
      "min-h-8",
      "w-[108px]",
      "sm:w-[112px]",
      "px-2.5",
      "focus-visible:border-primary",
      "focus-visible:ring-1",
      "focus-visible:ring-primary/45",
      "focus-visible:ring-inset",
    );

    fireEvent.click(
      screen.getByRole("combobox", {
        name: /ordenar top 10 por visualiza/i,
      }),
    );
    const topProjectsListbox = await screen.findByRole("listbox");
    const topProjectsPopover = topProjectsListbox.parentElement as HTMLElement;
    expect(topProjectsPopover).toHaveClass(
      "w-(--radix-popover-trigger-width)",
      "min-w-(--radix-popover-trigger-width)",
      "max-w-[calc(100vw-2rem)]",
      "p-2",
    );
    expect(classTokens(topProjectsPopover)).not.toContain("min-w-[min(16rem,calc(100vw-2rem))]");
    expect(await screen.findByRole("option", { name: /^sempre$/i })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /^7d$/i })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: /^30d$/i })).toBeInTheDocument();

    const synopsisFirst = screen.getByText("Projeto 12 synopsis");
    const synopsisSecond = screen.getByText("Projeto 11 synopsis");
    const synopsisThird = screen.getByText("Projeto 10 synopsis");
    expect(synopsisFirst).toHaveClass("clamp-safe-2");
    expect(synopsisSecond).toHaveClass("clamp-safe-2");
    expect(synopsisThird).toHaveClass("clamp-safe-2");
    expect(synopsisFirst).toHaveAttribute("data-synopsis-lines", "2");
    expect(synopsisSecond).toHaveAttribute("data-synopsis-lines", "2");
    expect(synopsisThird).toHaveAttribute("data-synopsis-lines", "2");

    const list = screen.getByTestId("top-projects-list");
    const scrollRegion = screen.getByTestId("top-projects-scroll-region");
    const viewport = scrollRegion.parentElement as HTMLElement | null;
    expect(viewport).not.toBeNull();
    expect(viewport).toHaveClass("top-projects-viewport");
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion).toHaveClass("no-scrollbar", "top-projects-scroll-region");
    expect(list).toHaveClass("top-projects-list");
    expect(list).not.toHaveClass("-my-1");
    expect(String(scrollRegion.getAttribute("style") || "")).toContain("--top-card-h: 164px");
    expect(String(scrollRegion.getAttribute("style") || "")).toContain("--top-gap: 12px");
    const firstItem = screen.getByTestId("top-project-item-1");
    const firstItemShell = firstItem.parentElement as HTMLElement | null;
    expect(firstItemShell).not.toBeNull();
    expect(firstItemShell).toHaveClass(
      "public-interactive-card-shell",
      "public-interactive-card-shell--no-shadow",
      "group/top-project-item",
    );
    expect(firstItemShell).not.toHaveClass("public-interactive-card-shell--compact");
    expect(firstItem).toHaveClass("top-projects-link", "rounded-2xl");
    expect(firstItem).not.toHaveClass("interactive-lift-md", "interactive-surface-transition");
    expect(firstItem).not.toHaveClass("bg-gradient-card", "shadow-xs", "hover:shadow-lg");
    expect(firstItem).toHaveClass("hover:border-primary/60");
    const firstCoverImage = screen.getByAltText("Projeto 12");
    const firstCoverPicture = firstCoverImage.parentElement as HTMLElement | null;
    const firstCoverShell = firstCoverPicture?.parentElement as HTMLElement | null;
    expect(firstCoverPicture).not.toBeNull();
    expect(firstCoverShell).not.toBeNull();
    expect(firstItem.firstElementChild).toBe(firstCoverShell);
    expect(classTokens(firstCoverShell as HTMLElement)).toContain("h-full");
    expect(classTokens(firstCoverShell as HTMLElement)).not.toContain("rounded-xl");
    expect(classTokens(firstCoverShell as HTMLElement)).not.toContain("w-18");
    expect(classTokens(firstCoverShell as HTMLElement)).not.toContain("sm:w-20");
    expect(firstCoverShell?.style.width).toBe("calc(var(--top-card-h) * 9 / 14)");
    expect(firstCoverShell?.style.aspectRatio).toBe("9 / 14");
    const titleBlock = firstMetaRow.parentElement as HTMLElement | null;
    expect(titleBlock).not.toBeNull();
    expect(titleBlock).toHaveAttribute("data-synopsis-role", "title");
    const synopsisColumn = titleBlock?.parentElement as HTMLElement | null;
    expect(synopsisColumn).not.toBeNull();
    expect(classTokens(synopsisColumn as HTMLElement)).toContain("top-projects-link-body");
    expect(classTokens(synopsisColumn as HTMLElement)).toContain("flex-1");
    const firstLink = headings[0].closest("a");
    expect(firstLink).toHaveClass("rounded-2xl");
  });

  it("permite alternar para ranking 7d e 30d via dropdown", async () => {
    const todayKey = getUtcDayKeyFromOffset(0);
    const tenDaysAgo = getUtcDayKeyFromOffset(10);
    const oldKey = getUtcDayKeyFromOffset(40);

    usePublicBootstrapMock.mockReturnValue({
      isLoading: false,
      data: {
        generatedAt: FIXED_GENERATED_AT,
        projects: [
          createProject({
            id: "alfa",
            title: "Projeto Alfa",
            views: 500,
            viewsDaily: {
              [todayKey]: 1,
            },
          }),
          createProject({
            id: "beta",
            title: "Projeto Beta",
            views: 120,
            viewsDaily: {
              [todayKey]: 40,
            },
          }),
          createProject({
            id: "gama",
            title: "Projeto Gama",
            views: 300,
            viewsDaily: {
              [tenDaysAgo]: 80,
              [oldKey]: 200,
            },
          }),
        ],
        mediaVariants: {},
      },
    });

    render(
      <MemoryRouter>
        <TopProjectsSection />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("heading", { level: 3, name: /Projeto /i })[0]).toHaveTextContent(
      "Projeto Alfa",
    );
    expect(screen.getByTestId("top-project-item-1-metric")).toHaveTextContent("500");

    fireEvent.click(
      screen.getByRole("combobox", {
        name: /ordenar top 10 por visualiza/i,
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^7d$/i }));

    expect(screen.getAllByRole("heading", { level: 3, name: /Projeto /i })[0]).toHaveTextContent(
      "Projeto Beta",
    );
    expect(screen.getByTestId("top-project-item-1-metric")).toHaveTextContent("40");
    expect(screen.getByTestId("top-projects-mode-trigger")).toHaveTextContent("7d");

    fireEvent.click(
      screen.getByRole("combobox", {
        name: /ordenar top 10 por visualiza/i,
      }),
    );
    fireEvent.click(await screen.findByRole("option", { name: /^30d$/i }));

    expect(screen.getAllByRole("heading", { level: 3, name: /Projeto /i })[0]).toHaveTextContent(
      "Projeto Gama",
    );
    expect(screen.getByTestId("top-project-item-1-metric")).toHaveTextContent("80");
    expect(screen.getByTestId("top-projects-mode-trigger")).toHaveTextContent("30d");
  });

  it("exibe estado vazio quando nao ha projetos no bootstrap", () => {
    usePublicBootstrapMock.mockReturnValue({
      isLoading: false,
      data: {
        generatedAt: FIXED_GENERATED_AT,
        projects: [],
        mediaVariants: {},
      },
    });

    render(
      <MemoryRouter>
        <TopProjectsSection />
      </MemoryRouter>,
    );

    expect(screen.getByText("Sem visualizações suficientes")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Os projetos mais acessados aparecem aqui depois que houver dados de leitura.",
      ),
    ).toBeInTheDocument();
  });
});
