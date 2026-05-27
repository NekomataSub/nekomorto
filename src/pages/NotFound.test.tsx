import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NotFound from "@/pages/NotFound";

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: vi.fn(),
}));

vi.mock("@/lib/public-document-navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-document-navigation")>();
  return {
    ...actual,
    usePublicDocumentLocation: () => ({
      pathname: "/rota-inexistente",
      search: "?origem=teste",
      hash: "#ancora",
    }),
  };
});

describe("NotFound", () => {
  it("mostra caminho solicitado e caminhos de recuperacao", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "Página não encontrada" })).toBeInTheDocument();
    expect(screen.getByText("/rota-inexistente?origem=teste#ancora")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar para a página inicial" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "Explorar projetos" })).toHaveAttribute(
      "href",
      "/projetos",
    );
    expect(screen.getByRole("link", { name: "Ir para recrutamento" })).toHaveAttribute(
      "href",
      "/recrutamento",
    );
  });
});
