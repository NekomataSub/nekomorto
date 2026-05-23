import { act, render, screen, waitFor } from "@testing-library/react";
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
  default: () => <div data-testid="dashboard-routes" />,
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

describe("App toast defer", () => {
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

  it("nao monta toaster no first render e agenda gate idle com delay de 4000ms", () => {
    render(<App />);

    expect(screen.queryByTestId("deferred-sonner")).not.toBeInTheDocument();
    expect(scheduleOnBrowserLoadIdleMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ delayMs: 4000 }),
    );
  });

  it("monta toaster quando o callback idle e executado", async () => {
    let idleCallback: ((deadline: IdleDeadline) => void) | null = null;
    scheduleOnBrowserLoadIdleMock.mockImplementation(
      (callback: (deadline: IdleDeadline) => void) => {
        idleCallback = callback;
        return () => undefined;
      },
    );

    render(<App />);

    expect(screen.queryByTestId("deferred-sonner")).not.toBeInTheDocument();

    act(() => {
      idleCallback?.({
        didTimeout: false,
        timeRemaining: () => 16,
      } as IdleDeadline);
    });

    await waitFor(() => {
      expect(screen.getByTestId("deferred-sonner")).toBeInTheDocument();
    });
  });
});
