import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProjectHero from "@/components/project/ProjectHero";
import type { PublicBootstrapProject } from "@/types/public-bootstrap";

const projectFixture: PublicBootstrapProject = {
  id: "21878",
  title: "Gabriel Dropout",
  titleOriginal: "",
  titleEnglish: "",
  synopsis: "Sinopse do projeto",
  description: "",
  type: "Anime",
  status: "Finalizado",
  year: "2017",
  studio: "Doga Kobo",
  animationStudios: [],
  episodes: "12",
  tags: ["Angels"],
  genres: ["Comedy"],
  cover: "/uploads/project-cover.jpg",
  coverAlt: "",
  banner: "/uploads/project-banner.jpg",
  bannerAlt: "",
  season: "",
  schedule: "",
  rating: "",
  country: "",
  source: "",
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
  heroLogoUrl: "",
  heroLogoAlt: "",
  volumeEntries: [],
  volumeCovers: [],
  episodeDownloads: [],
  views: 0,
  viewsDaily: {},
  commentsCount: 0,
};

describe("ProjectHero", () => {
  it("mantem o container reveal visivel para a shell Astro do projeto", () => {
    render(<ProjectHero project={projectFixture} />);

    const layout = screen.getByTestId("project-hero-layout");
    expect(layout).toHaveClass("reveal");
    expect(layout).toHaveClass("reveal-visible");
  });

  it("renderiza actionItems com variantes de botao compartilhadas", () => {
    render(
      <ProjectHero
        project={projectFixture}
        actionItems={[
          { href: "#downloads", key: "downloads", label: "Ver episódios" },
          {
            href: "https://example.com/trailer",
            key: "trailer",
            label: "Assistir trailer",
            variant: "outline",
            external: true,
          },
        ]}
      />,
    );

    const downloads = screen.getByRole("link", { name: "Ver episódios" });
    const trailer = screen.getByRole("link", { name: "Assistir trailer" });

    expect(downloads.className).toContain("rounded-xl");
    expect(downloads.className).toContain("border-primary/70");
    expect(trailer.className).toContain("rounded-xl");
    expect(trailer.className).toContain("border-border/70");
  });

  it("renderiza tags com o mesmo padrao compacto de pilula do detalhe hidratado", () => {
    render(
      <ProjectHero
        project={projectFixture}
        tagItems={[{ href: "/projetos?tag=Angels", key: "Angels", label: "Anjos" }]}
      />,
    );

    const tag = screen.getByRole("link", { name: "Anjos" });

    expect(tag.className).toContain("rounded-full");
    expect(tag.className).toContain("text-[10px]");
    expect(tag.className).toContain("uppercase");
    expect(tag.className).toContain("bg-background");
  });
});
