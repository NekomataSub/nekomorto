import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import PublicLayout from "@/components/PublicLayout";

vi.mock("@/components/Header", () => ({
  default: ({ variant = "fixed" }: { variant?: "fixed" | "static" }) => (
    <div data-testid="public-header" data-variant={variant} />
  ),
}));

vi.mock("@/components/Footer", () => ({
  default: () => <div data-testid="public-footer" />,
}));

describe("PublicLayout", () => {
  it("renders header, skip link, main outlet, and footer", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<div data-testid="public-outlet">Conteudo publico</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("public-header")).toBeInTheDocument();
    expect(screen.getByTestId("public-header")).toHaveAttribute("data-variant", "fixed");
    expect(screen.getByTestId("public-footer")).toBeInTheDocument();
    expect(screen.getByTestId("public-outlet")).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveAttribute("id", "public-main-content");
    expect(screen.getByRole("main")).toHaveClass("a11y-focus-target");
    expect(screen.getByRole("link", { name: "Pular para o conteúdo" })).toHaveAttribute(
      "href",
      "#public-main-content",
    );
    expect(screen.getByRole("main").parentElement).toHaveClass("bg-background", "text-foreground");
    expect(screen.getByRole("main").parentElement).not.toHaveClass("bg-gradient-surface");
  });

  it("aplica o gradiente de surface na rota /projetos", () => {
    render(
      <MemoryRouter initialEntries={["/projetos"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/projetos" element={<div data-testid="public-outlet">Projetos</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("main").parentElement).toHaveClass(
      "bg-gradient-surface",
      "text-foreground",
    );
  });

  it("oculta o chrome global nas rotas de leitura publica", () => {
    render(
      <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1"]}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route
              path="/projeto/:slug/leitura/:chapter"
              element={<div data-testid="public-outlet">Leitor</div>}
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("public-header")).not.toBeInTheDocument();
    expect(screen.getByTestId("public-outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("public-footer")).not.toBeInTheDocument();
  });
});
