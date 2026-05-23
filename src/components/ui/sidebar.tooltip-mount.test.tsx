import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SidebarMenuButton, SidebarProvider } from "@/components/ui/sidebar";

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  Tooltip: ({ children }: { children: ReactNode }) => (
    <div data-testid="sidebar-tooltip-root">{children}</div>
  ),
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="sidebar-tooltip-content">{children}</div>
  ),
}));

const originalMatchMedia = window.matchMedia;
const clearSidebarCookie = () => {
  document.cookie = "sidebar:state=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};

const mockMatchMedia = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
  })) as unknown as typeof window.matchMedia;
};

describe("SidebarMenuButton tooltip mounting", () => {
  afterEach(() => {
    clearSidebarCookie();
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
  });

  it("monta tooltip apenas quando a sidebar desktop esta colapsada", () => {
    mockMatchMedia(false);
    clearSidebarCookie();

    render(
      <SidebarProvider open={false}>
        <SidebarMenuButton tooltip="Posts">Posts</SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(screen.getByTestId("sidebar-tooltip-root")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-tooltip-content")).toHaveTextContent("Posts");
  });

  it("nao monta tooltip quando a sidebar desktop esta expandida", () => {
    mockMatchMedia(false);
    clearSidebarCookie();

    render(
      <SidebarProvider open>
        <SidebarMenuButton tooltip="Posts">Posts</SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(screen.queryByTestId("sidebar-tooltip-root")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-tooltip-content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Posts" })).toBeInTheDocument();
  });

  it("mantem o mesmo peso de texto no botao ativo da sidebar", () => {
    mockMatchMedia(false);
    clearSidebarCookie();

    render(
      <SidebarProvider open>
        <SidebarMenuButton isActive tooltip="Posts">
          Posts
        </SidebarMenuButton>
      </SidebarProvider>,
    );

    const button = screen.getByRole("button", { name: "Posts" });

    expect(button).toHaveAttribute("data-active", "true");
    expect(button).toHaveClass("font-semibold");
    expect(button.className).not.toContain("data-[active=true]:font-medium");
  });

  it("nao monta tooltip em mobile mesmo com a sidebar colapsada", () => {
    mockMatchMedia(true);
    clearSidebarCookie();

    render(
      <SidebarProvider open={false}>
        <SidebarMenuButton tooltip="Posts">Posts</SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(screen.queryByTestId("sidebar-tooltip-root")).not.toBeInTheDocument();
    expect(screen.queryByTestId("sidebar-tooltip-content")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Posts" })).toBeInTheDocument();
  });
});
