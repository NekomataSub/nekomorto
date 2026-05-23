import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";

const scheduleOnBrowserLoadIdleMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/browser-idle", () => ({
  scheduleOnBrowserLoadIdle: (
    callback: (deadline: IdleDeadline) => void,
    options?: { delayMs?: number },
  ) => scheduleOnBrowserLoadIdleMock(callback, options),
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => <div data-testid="deferred-sonner" />,
}));

vi.mock("./routes/DashboardRoutes", () => ({
  default: () => {
    throw new Promise(() => undefined);
  },
}));

vi.mock("@/hooks/use-reveal", () => ({
  useReveal: () => undefined,
}));

vi.mock("@/hooks/site-settings-provider", () => ({
  SiteSettingsProvider: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock("@/hooks/theme-mode-provider", () => ({
  ThemeModeProvider: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock("@/hooks/accessibility-announcer", () => ({
  AccessibilityAnnouncerProvider: ({ children }: { children: unknown }) => <>{children}</>,
}));

vi.mock("@/hooks/global-shortcuts-provider", () => ({
  GlobalShortcutsProvider: ({ children }: { children: unknown }) => <>{children}</>,
  RoutedGlobalShortcutsProvider: ({ children }: { children: unknown }) => <>{children}</>,
}));

describe("App route loading fallback", () => {
  beforeEach(() => {
    scheduleOnBrowserLoadIdleMock.mockReset();
    scheduleOnBrowserLoadIdleMock.mockImplementation(() => () => undefined);
    window.history.replaceState({}, "", "/dashboard");
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  it("mostra fallback compartilhado quando as rotas lazy ainda nao carregaram", async () => {
    render(<App />);

    expect(await screen.findByText("Carregando...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
