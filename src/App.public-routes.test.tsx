import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "@/App";

const scheduleOnBrowserLoadIdleMock = vi.hoisted(() => vi.fn());
const PUBLIC_SCROLLBAR_GUTTER_CLASS = "public-scrollbar-gutter-stable";

vi.mock("@/lib/browser-idle", () => ({
  scheduleOnBrowserLoadIdle: (
    callback: (deadline: IdleDeadline) => void,
    options?: { delayMs?: number },
  ) => scheduleOnBrowserLoadIdleMock(callback, options),
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

vi.mock("./routes/DashboardRoutes", () => ({
  default: () => <div>dashboard-route</div>,
}));

vi.mock("@/components/Header", () => ({
  default: () => <div data-testid="public-header" />,
}));

vi.mock("@/components/Footer", () => ({
  default: () => <div data-testid="public-footer" />,
}));

vi.mock("@/pages/Index", () => ({
  default: () => <div>public-home-route</div>,
}));

vi.mock("@/pages/About", () => ({
  default: () => <div>public-about-route</div>,
}));

vi.mock("@/pages/Projects", () => ({
  default: () => <div>public-projects-route</div>,
}));

vi.mock("@/pages/Project", () => ({
  default: () => <div>public-project-route</div>,
}));

vi.mock("@/pages/ProjectReading", () => ({
  default: () => <div>public-reading-route</div>,
}));

vi.mock("@/pages/Post", () => ({
  default: () => <div>public-post-route</div>,
}));

vi.mock("@/pages/FAQ", () => ({
  default: () => <div>public-faq-route</div>,
}));

vi.mock("@/pages/Team", () => ({
  default: () => <div>public-team-route</div>,
}));

vi.mock("@/pages/Donations", () => ({
  default: () => <div>public-donations-route</div>,
}));

vi.mock("@/pages/Recruitment", () => ({
  default: () => <div>public-recruitment-route</div>,
}));

vi.mock("@/pages/TermsOfService", () => ({
  default: () => <div>public-tos-route</div>,
}));

vi.mock("@/pages/PrivacyPolicy", () => ({
  default: () => <div>public-privacy-route</div>,
}));

vi.mock("@/pages/Login", () => ({
  default: () => <div>public-login-route</div>,
}));

vi.mock("@/pages/NotFound", () => ({
  default: () => <div>public-not-found-route</div>,
}));

describe("App public routes in dev", () => {
  beforeEach(() => {
    scheduleOnBrowserLoadIdleMock.mockReset();
    scheduleOnBrowserLoadIdleMock.mockImplementation(() => () => undefined);
    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    document.documentElement.classList.remove(PUBLIC_SCROLLBAR_GUTTER_CLASS);
    document.body.classList.remove(PUBLIC_SCROLLBAR_GUTTER_CLASS);
  });

  afterEach(() => {
    document.documentElement.classList.remove(PUBLIC_SCROLLBAR_GUTTER_CLASS);
    document.body.classList.remove(PUBLIC_SCROLLBAR_GUTTER_CLASS);
  });

  it("renders the home route instead of falling into a reload loop", async () => {
    window.history.replaceState({}, "", "/");

    render(<App />);

    expect(await screen.findByText("public-home-route")).toBeInTheDocument();
    expect(screen.getByTestId("public-header")).toBeInTheDocument();
    expect(screen.getByTestId("public-footer")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass(PUBLIC_SCROLLBAR_GUTTER_CLASS);
    expect(document.body).toHaveClass(PUBLIC_SCROLLBAR_GUTTER_CLASS);
  });

  it("renders an institutional public route inside the dev router", async () => {
    window.history.replaceState({}, "", "/sobre");

    render(<App />);

    expect(await screen.findByText("public-about-route")).toBeInTheDocument();
    expect(document.documentElement).toHaveClass(PUBLIC_SCROLLBAR_GUTTER_CLASS);
    expect(document.body).toHaveClass(PUBLIC_SCROLLBAR_GUTTER_CLASS);
  });

  it("does not keep the public scrollbar gutter class on dashboard routes", async () => {
    window.history.replaceState({}, "", "/dashboard");
    document.documentElement.classList.add(PUBLIC_SCROLLBAR_GUTTER_CLASS);
    document.body.classList.add(PUBLIC_SCROLLBAR_GUTTER_CLASS);

    render(<App />);

    expect(await screen.findByText("dashboard-route")).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass(PUBLIC_SCROLLBAR_GUTTER_CLASS);
    expect(document.body).not.toHaveClass(PUBLIC_SCROLLBAR_GUTTER_CLASS);
  });
});
