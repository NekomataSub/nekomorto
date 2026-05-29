import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import PublicProjectCard, {
  getPublicProjectCardClampClass,
  normalizePublicProjectCardClampLines,
  PUBLIC_PROJECT_CARD_CLAMP_PROFILES,
  resolvePublicProjectCardClampState,
  resolvePublicProjectCardResponsiveMaxLines,
} from "@/components/project/PublicProjectCard";

describe("PublicProjectCard", () => {
  it("normaliza linhas de clamp e compartilha perfis responsivos por variant", () => {
    expect(
      normalizePublicProjectCardClampLines({ lines: undefined, fallbackLines: 2, maxLines: 4 }),
    ).toBe(2);
    expect(normalizePublicProjectCardClampLines({ lines: 9, fallbackLines: 2, maxLines: 4 })).toBe(
      4,
    );
    expect(getPublicProjectCardClampClass({ lines: 0, family: "safe" })).toBe("hidden");
    expect(getPublicProjectCardClampClass({ lines: 3, family: "safe" })).toBe("clamp-safe-3");
    expect(getPublicProjectCardClampClass({ lines: 2, family: "search" })).toBe(
      "projects-public-search-synopsis-clamp-2",
    );
    expect(getPublicProjectCardClampClass({ lines: 1, family: "projects" })).toBe(
      "projects-public-synopsis-clamp-1",
    );

    expect(
      resolvePublicProjectCardResponsiveMaxLines({
        profile: PUBLIC_PROJECT_CARD_CLAMP_PROFILES.catalog,
        columnWidth: 280,
      }),
    ).toBe(2);
    expect(
      resolvePublicProjectCardResponsiveMaxLines({
        profile: PUBLIC_PROJECT_CARD_CLAMP_PROFILES.catalog,
        columnWidth: 360,
      }),
    ).toBe(3);
    expect(
      resolvePublicProjectCardResponsiveMaxLines({
        profile: PUBLIC_PROJECT_CARD_CLAMP_PROFILES.embed,
        columnWidth: 520,
      }),
    ).toBe(4);
    expect(
      resolvePublicProjectCardClampState({
        profile: PUBLIC_PROJECT_CARD_CLAMP_PROFILES.search,
        lines: undefined,
      }),
    ).toEqual({
      synopsisLines: 3,
      synopsisClampClass: "projects-public-search-synopsis-clamp-3",
    });
    expect(
      resolvePublicProjectCardClampState({
        profile: PUBLIC_PROJECT_CARD_CLAMP_PROFILES.search,
        lines: 0,
      }),
    ).toEqual({
      synopsisLines: 0,
      synopsisClampClass: "projects-public-search-synopsis-clamp-0",
    });
  });

  it("renderiza a variante catalog com badge clicavel e pills de meta", () => {
    const onClickHref = vi.fn();

    render(
      <MemoryRouter>
        <PublicProjectCard
          variant="catalog"
          model={{
            href: "/projeto/project-1",
            title: "Projeto Catalogo",
            coverSrc: "/placeholder.svg",
            coverAlt: "Projeto Catalogo",
            eyebrow: "Anime",
            synopsis: "Sinopse de catalogo",
            synopsisKey: "project-1",
            synopsisLines: 2,
            synopsisClampClass: "projects-public-synopsis-clamp-2",
            primaryBadges: [
              {
                key: "tag-acao",
                label: "Acao",
                variant: "secondary",
                href: "/projetos?tag=acao",
                ariaLabel: "Filtrar por tag Acao",
                onClickHref,
              },
            ],
            metaPills: [
              {
                key: "status",
                label: "Em andamento",
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    const cardLink = screen.getByRole("link", { name: /Projeto Catalogo/i });
    const coverImage = screen.getByAltText("Projeto Catalogo");
    const badge = screen.getByRole("button", { name: /Filtrar por tag Acao/i });
    expect(cardLink).toHaveClass("projects-public-card");
    expect(coverImage).toHaveClass("projects-public-card__media");
    expect(coverImage).not.toHaveClass(
      "interactive-media-transition",
      "group-hover:scale-105",
      "group-focus-within:scale-105",
    );
    expect(screen.getByText("Sinopse de catalogo")).toHaveAttribute("data-synopsis-lines", "2");
    expect(screen.getByText("Em andamento")).toBeInTheDocument();

    fireEvent.click(badge);
    expect(onClickHref).toHaveBeenCalledWith("/projetos?tag=acao", expect.any(Object));
  });

  it("mantem a variante search com estrutura compartilhada de title, synopsis e badges", () => {
    render(
      <MemoryRouter>
        <PublicProjectCard
          variant="search"
          model={{
            href: "/projeto/project-search",
            title: "Projeto Busca",
            coverSrc: "/placeholder.svg",
            coverAlt: "Projeto Busca",
            synopsis: "Sinopse da busca",
            synopsisKey: "project-search",
            synopsisLines: 1,
            synopsisClampClass: "projects-public-search-synopsis-clamp-1",
            secondaryBadges: [
              {
                key: "tag-busca",
                label: "Acao",
                variant: "secondary",
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    const synopsis = screen.getByText("Sinopse da busca");
    const cardLink = screen.getByRole("link", { name: /Projeto Busca/i });
    const shell = cardLink.parentElement;
    const column = cardLink.querySelector('[data-synopsis-role="column"]');
    const badges = screen.getByText("Acao").closest('[data-synopsis-role="badges"]');

    expect(shell).toHaveClass("public-interactive-card-shell--no-lift");
    expect(screen.getByText("Projeto Busca")).toHaveAttribute("data-synopsis-role", "title");
    expect(column).toHaveClass("overflow-hidden");
    expect(synopsis).toHaveAttribute("data-synopsis-role", "synopsis");
    expect(synopsis).toHaveAttribute("data-synopsis-lines", "1");
    expect(synopsis).toHaveClass("projects-public-search-synopsis-clamp-1", "shrink-0");
    expect(synopsis).not.toHaveClass("flex-1", "clamp-safe-1", "line-clamp-1");
    expect(badges).toBeInTheDocument();
    expect(badges).toHaveClass("mt-auto");
  });

  it("mapeia test ids e estatisticas na variante sidebar", () => {
    render(
      <MemoryRouter>
        <PublicProjectCard
          variant="sidebar"
          testIdBase="top-project-item-1"
          model={{
            href: "/projeto/project-2",
            title: "Projeto Sidebar",
            coverSrc: "/placeholder.svg",
            coverAlt: "Projeto Sidebar",
            eyebrow: "Anime",
            synopsis: "Sinopse lateral",
            synopsisKey: "project-2",
            synopsisLines: 2,
            synopsisClampClass: "clamp-safe-2",
            trailingStats: [
              {
                key: "rank",
                label: 1,
                ariaLabel: "Posicao: 1",
                icon: "hash",
              },
              {
                key: "metric",
                label: "120",
                ariaLabel: "Visualizacoes: 120",
                icon: "eye",
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("top-project-item-1-meta-row")).toBeInTheDocument();
    expect(screen.getByTestId("top-project-item-1-rank")).toHaveTextContent("1");
    expect(screen.getByTestId("top-project-item-1-metric")).toHaveTextContent("120");
    expect(screen.getByAltText("Projeto Sidebar")).toHaveClass("home-card-media-transition");
    expect(screen.getByAltText("Projeto Sidebar")).not.toHaveClass(
      "group-hover:scale-[1.025]",
      "group-focus-within:scale-[1.025]",
    );
    expect(screen.getByText("Sinopse lateral")).toHaveAttribute("data-synopsis-lines", "2");
    expect(screen.getByText("Sinopse lateral")).toHaveClass("clamp-safe-2");
  });

  it("usa a animacao de zoom da home na variante related", () => {
    render(
      <MemoryRouter>
        <PublicProjectCard
          variant="related"
          model={{
            href: "/projeto/project-related",
            title: "Projeto Relacionado",
            coverSrc: "/placeholder.svg",
            coverAlt: "Projeto Relacionado",
            eyebrow: "Sequencia",
            supportingText: "TV • Em andamento",
          }}
        />
      </MemoryRouter>,
    );

    const cardLink = screen.getByRole("link", { name: /Projeto Relacionado/i });
    const coverImage = screen.getByAltText("Projeto Relacionado");

    expect(cardLink).toHaveClass(
      "related-project-link",
      "border",
      "border-border/50",
      "hover:border-primary/60",
    );
    expect(coverImage).toHaveClass("home-card-media-transition");
    expect(coverImage).not.toHaveClass(
      "interactive-media-transition",
      "group-hover:scale-105",
      "group-focus-visible:scale-105",
    );
  });

  it("preserva a estrutura esperada da variante embed", () => {
    render(
      <MemoryRouter>
        <PublicProjectCard
          variant="embed"
          testIdBase="project-embed"
          model={{
            href: "/projeto/project-3",
            title: "Projeto Embed",
            coverSrc: "/placeholder.svg",
            coverAlt: "Projeto Embed",
            eyebrow: "Anime",
            synopsis: "Sinopse embed",
            synopsisKey: "project-3",
            synopsisClampClass: "clamp-safe-2",
            synopsisLines: 2,
            primaryBadges: [
              {
                key: "status",
                label: "Em andamento",
                variant: "outline",
              },
            ],
            secondaryBadges: [
              {
                key: "tag-drama",
                label: "Drama",
                variant: "secondary",
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("project-embed-row")).toBeInTheDocument();
    expect(screen.getByTestId("project-embed-primary-badges")).toBeInTheDocument();
    expect(screen.getByTestId("project-embed-status-badge")).toHaveTextContent("Em andamento");
    expect(screen.getByTestId("project-embed-tags")).toBeInTheDocument();
  });
});
