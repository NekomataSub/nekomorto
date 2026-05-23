import {
  GlobalShortcutsProvider,
  RoutedGlobalShortcutsProvider,
} from "@/hooks/global-shortcuts-provider";
import { useGlobalShortcuts } from "@/hooks/use-global-shortcuts";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ShortcutHarness = ({ dashboardHref = "/dashboard/posts" }: { dashboardHref?: string }) => {
  const [searchCount, setSearchCount] = useState(0);
  const location = useLocation();

  useGlobalShortcuts({
    getDashboardHref: () => dashboardHref,
    onOpenSearch: () => {
      setSearchCount((current) => current + 1);
    },
  });

  return (
    <div>
      <div data-testid="pathname">{location.pathname}</div>
      <div data-testid="search-count">{String(searchCount)}</div>
      <input aria-label="Campo editável" />
      <button type="button">Ação</button>
    </div>
  );
};

const renderHarness = (dashboardHref?: string) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <RoutedGlobalShortcutsProvider>
        <ShortcutHarness dashboardHref={dashboardHref} />
      </RoutedGlobalShortcutsProvider>
    </MemoryRouter>,
  );

const renderDocumentNavigationHarness = (navigateToHref: (href: string) => void) =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <GlobalShortcutsProvider navigateToHref={navigateToHref}>
        <ShortcutHarness dashboardHref="/dashboard/analytics" />
      </GlobalShortcutsProvider>
    </MemoryRouter>,
  );

describe("GlobalShortcutsProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("abre a busca com / fora de elementos interativos", () => {
    renderHarness();

    fireEvent.keyDown(window, { key: "/" });

    expect(screen.getByTestId("search-count")).toHaveTextContent("1");
  });

  it("ignora / em elementos interativos", () => {
    renderHarness();

    const input = screen.getByRole("textbox", { name: "Campo editável" });
    const button = screen.getByRole("button", { name: "Ação" });

    fireEvent.keyDown(input, { key: "/" });
    fireEvent.keyDown(button, { key: "/" });

    expect(screen.getByTestId("search-count")).toHaveTextContent("0");
  });

  it("navega com g seguido de d usando o resolver registrado", () => {
    renderHarness("/dashboard/analytics");

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });

    expect(screen.getByTestId("pathname")).toHaveTextContent("/dashboard/analytics");
  });

  it("permite trocar a estrategia de navegacao do provider base", () => {
    const navigateToHref = vi.fn();
    renderDocumentNavigationHarness(navigateToHref);

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });

    expect(navigateToHref).toHaveBeenCalledWith("/dashboard/analytics");
    expect(screen.getByTestId("pathname")).toHaveTextContent("/");
  });

  it("cancela o chord quando expira ou quando a segunda tecla é inválida", () => {
    renderHarness("/dashboard/analytics");

    fireEvent.keyDown(window, { key: "g" });
    vi.advanceTimersByTime(801);
    fireEvent.keyDown(window, { key: "d" });
    expect(screen.getByTestId("pathname")).toHaveTextContent("/");

    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "x" });
    fireEvent.keyDown(window, { key: "d" });

    expect(screen.getByTestId("pathname")).toHaveTextContent("/");
  });
});
