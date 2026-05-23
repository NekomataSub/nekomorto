import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PublicLink from "@/components/PublicLink";

describe("PublicLink", () => {
  it("renderiza href interno publico com prefetch Astro", () => {
    render(<PublicLink href="/projetos">Projetos</PublicLink>);

    const link = screen.getByRole("link", { name: "Projetos" });
    expect(link).toHaveAttribute("href", "/projetos");
    expect(link).toHaveAttribute("data-astro-prefetch", "hover");
  });

  it("preserva outras rotas publicas Astro como links normais", () => {
    render(<PublicLink href="/equipe">Equipe</PublicLink>);

    const link = screen.getByRole("link", { name: "Equipe" });
    expect(link).toHaveAttribute("href", "/equipe");
    expect(link).toHaveAttribute("data-astro-prefetch", "hover");
  });

  it("mantem a navegacao nativa em clique com modificador", () => {
    window.history.replaceState(null, "", "/");

    render(<PublicLink href="/projetos">Projetos</PublicLink>);

    fireEvent.click(screen.getByRole("link", { name: "Projetos" }), { ctrlKey: true });

    expect(window.location.pathname).toBe("/");
  });
});
