import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getPublicRoutePreloadHandlersMock = vi.hoisted(() => vi.fn());

vi.mock("@/routes/public-preload", () => ({
  getPublicRoutePreloadHandlers: (path: string) => getPublicRoutePreloadHandlersMock(path),
}));

import PublicLink from "@/components/PublicLink";

describe("PublicLink", () => {
  beforeEach(() => {
    getPublicRoutePreloadHandlersMock.mockReset();
    getPublicRoutePreloadHandlersMock.mockImplementation(() => ({
      onFocus: vi.fn(),
      onMouseEnter: vi.fn(),
      onTouchStart: vi.fn(),
    }));
  });

  it("renderiza href interno publico sem prefetch Astro automatico", () => {
    render(<PublicLink href="/projetos">Projetos</PublicLink>);

    const link = screen.getByRole("link", { name: "Projetos" });
    expect(link).toHaveAttribute("href", "/projetos");
    expect(link).not.toHaveAttribute("data-astro-prefetch");
    expect(getPublicRoutePreloadHandlersMock).toHaveBeenCalledWith("/projetos");
  });

  it("ativa preload interno em outras rotas publicas Astro", () => {
    render(<PublicLink href="/equipe">Equipe</PublicLink>);

    const link = screen.getByRole("link", { name: "Equipe" });
    expect(link).toHaveAttribute("href", "/equipe");
    expect(link).not.toHaveAttribute("data-astro-prefetch");
    expect(getPublicRoutePreloadHandlersMock).toHaveBeenCalledWith("/equipe");
  });

  it("aciona preload interno em hover, focus e touch", () => {
    const onFocusPreload = vi.fn();
    const onMouseEnterPreload = vi.fn();
    const onTouchStartPreload = vi.fn();
    getPublicRoutePreloadHandlersMock.mockReturnValue({
      onFocus: onFocusPreload,
      onMouseEnter: onMouseEnterPreload,
      onTouchStart: onTouchStartPreload,
    });
    render(<PublicLink href="/projetos">Projetos</PublicLink>);

    const link = screen.getByRole("link", { name: "Projetos" });
    fireEvent.mouseEnter(link);
    fireEvent.focus(link);
    fireEvent.touchStart(link);

    expect(onMouseEnterPreload).toHaveBeenCalledTimes(1);
    expect(onFocusPreload).toHaveBeenCalledTimes(1);
    expect(onTouchStartPreload).toHaveBeenCalledTimes(1);
  });

  it("preserva handlers do caller ao acionar preload interno", () => {
    const onMouseEnterPreload = vi.fn();
    const onMouseEnter = vi.fn();
    getPublicRoutePreloadHandlersMock.mockReturnValue({
      onFocus: vi.fn(),
      onMouseEnter: onMouseEnterPreload,
      onTouchStart: vi.fn(),
    });
    render(
      <PublicLink href="/projetos" onMouseEnter={onMouseEnter}>
        Projetos
      </PublicLink>,
    );

    fireEvent.mouseEnter(screen.getByRole("link", { name: "Projetos" }));

    expect(onMouseEnter).toHaveBeenCalledTimes(1);
    expect(onMouseEnterPreload).toHaveBeenCalledTimes(1);
  });

  it("permite desativar prefetch e preload quando preload=false", () => {
    render(
      <PublicLink href="/equipe" preload={false}>
        Equipe
      </PublicLink>,
    );

    const link = screen.getByRole("link", { name: "Equipe" });
    expect(link).toHaveAttribute("data-astro-prefetch", "false");
    expect(getPublicRoutePreloadHandlersMock).not.toHaveBeenCalled();
  });

  it("preserva prefetch Astro explicito quando configurado", () => {
    render(
      <PublicLink href="/equipe" data-astro-prefetch="hover">
        Equipe
      </PublicLink>,
    );

    const link = screen.getByRole("link", { name: "Equipe" });
    expect(link).toHaveAttribute("data-astro-prefetch", "hover");
  });

  it("mantem a navegacao nativa em clique com modificador", () => {
    window.history.replaceState(null, "", "/");

    render(<PublicLink href="/projetos">Projetos</PublicLink>);

    fireEvent.click(screen.getByRole("link", { name: "Projetos" }), { ctrlKey: true });

    expect(window.location.pathname).toBe("/");
  });
});
