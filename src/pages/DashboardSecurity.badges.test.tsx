import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardSecurity, { __testing } from "@/pages/DashboardSecurity";

const apiFetchMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const dismissToastMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/DashboardShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
  dismissToast: (...args: unknown[]) => dismissToastMock(...args),
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const createDeferredResponse = () => {
  let resolve: ((value: Response) => void) | null = null;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return {
    promise,
    resolve: (value: Response) => {
      if (!resolve) {
        throw new Error("Expected deferred response resolver");
      }
      resolve(value);
    },
  };
};
const classTokens = (element: Element | null) =>
  String(element?.className || "")
    .split(/\s+/)
    .filter(Boolean);

describe("DashboardSecurity semantic badges", () => {
  beforeEach(() => {
    __testing.clearSecurityCache();
    apiFetchMock.mockReset();
    toastMock.mockReset();
    toastMock.mockReturnValue("dashboard-security-refresh-toast");
    dismissToastMock.mockReset();
    apiFetchMock.mockImplementation(async (_base: string, path: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      if (path === "/api/me" && method === "GET") {
        return mockJsonResponse(true, { id: "1", name: "Admin", username: "admin" });
      }
      if (String(path).startsWith("/api/admin/sessions/active?") && method === "GET") {
        return mockJsonResponse(true, {
          sessions: [
            {
              sid: "current-session",
              userId: "1",
              userName: "Admin",
              userAvatarUrl: null,
              createdAt: "2026-02-20T10:00:00.000Z",
              lastSeenAt: "2026-02-20T10:05:00.000Z",
              lastIp: "127.0.0.1",
              userAgent: "Current Browser",
              isPendingMfa: false,
              currentForViewer: true,
            },
            {
              sid: "pending-session",
              userId: "2",
              userName: "Moderator",
              userAvatarUrl: null,
              createdAt: "2026-02-20T09:00:00.000Z",
              lastSeenAt: "2026-02-20T09:05:00.000Z",
              lastIp: "127.0.0.2",
              userAgent: "Pending Browser",
              isPendingMfa: true,
              currentForViewer: false,
            },
          ],
          total: 2,
        });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    });
  });

  it("uses semantic variants for current-session and V2F badges", async () => {
    render(<DashboardSecurity />);

    await screen.findByRole("heading", { name: /Ativas/i });
    await screen.findByText("Admin");

    const headerBadge = screen.getByTestId("dashboard-security-header-badge");
    const pageSection = headerBadge.closest("section");
    const sessionsCard = screen.getByTestId("dashboard-security-sessions-card");
    const firstSessionCard = screen.getByText("Admin").closest("article");

    expect(headerBadge).toHaveTextContent("Seguran\u00E7a");
    expect(pageSection).not.toBeNull();
    expect(classTokens(pageSection as HTMLElement)).toContain("reveal");
    expect(pageSection).toHaveAttribute("data-reveal");
    expect(classTokens(sessionsCard)).toContain("animate-slide-up");
    expect(classTokens(sessionsCard)).toContain("bg-card");
    expect(firstSessionCard).not.toBeNull();
    expect(classTokens(firstSessionCard as HTMLElement)).toContain("animate-slide-up");
    expect(classTokens(firstSessionCard as HTMLElement)).toContain("bg-background");
    expect(classTokens(firstSessionCard as HTMLElement)).toContain("hover:border-primary/40");
    expect(await screen.findByText("Sua sess\u00E3o atual")).toHaveClass(
      "border-[hsl(var(--badge-success-border))]",
      "bg-[hsl(var(--badge-success-bg))]",
      "text-[hsl(var(--badge-success-fg))]",
    );
    expect(screen.getByText("Pendente V2F")).toHaveClass(
      "border-[hsl(var(--badge-warning-border))]",
      "bg-[hsl(var(--badge-warning-bg))]",
      "text-[hsl(var(--badge-warning-fg))]",
    );
  });

  it("keeps the mobile revoke CTA on the identity row with an icon-first responsive button", async () => {
    render(<DashboardSecurity />);

    const revokeButton = await screen.findByRole("button", {
      name: "Encerrar sessão de Moderator",
    });
    const sessionCard = screen.getByText("Moderator").closest("article");
    const headerRow = revokeButton.parentElement as HTMLElement | null;
    const identityText = screen.getByText("Moderator").parentElement as HTMLElement | null;
    const identityRow = identityText?.parentElement as HTMLElement | null;
    const badgesRow = screen.getByText("Pendente V2F").parentElement as HTMLElement | null;
    const userId = screen.getByText("ID: 2");
    const desktopLabel = within(revokeButton).getByText("Encerrar");
    const revokeIcon = revokeButton.querySelector("svg");

    expect(sessionCard).not.toBeNull();
    expect(headerRow).not.toBeNull();
    expect(identityText).not.toBeNull();
    expect(identityRow).not.toBeNull();
    expect(badgesRow).not.toBeNull();
    expect(revokeIcon).not.toBeNull();

    expect(classTokens(headerRow as HTMLElement)).toContain("grid");
    expect(classTokens(headerRow as HTMLElement)).toContain("min-w-0");
    expect(classTokens(headerRow as HTMLElement)).toContain("gap-3");
    expect(classTokens(headerRow as HTMLElement)).toContain("md:flex");

    expect(classTokens(identityRow as HTMLElement)).toContain("flex");
    expect(classTokens(identityRow as HTMLElement)).toContain("min-w-0");
    expect(classTokens(identityText as HTMLElement)).toContain("min-w-0");
    expect(classTokens(userId as HTMLElement)).toContain("break-all");

    expect(classTokens(revokeButton)).toContain("h-9");
    expect(classTokens(revokeButton)).toContain("w-full");
    expect(classTokens(revokeButton)).toContain("justify-center");
    expect(classTokens(revokeButton)).toContain("px-3");
    expect(classTokens(revokeButton)).toContain("md:order-3");
    expect(classTokens(revokeButton)).toContain("md:w-auto");
    expect(classTokens(revokeIcon)).not.toContain("md:hidden");

    expect(classTokens(badgesRow)).toContain("min-w-0");
    expect(classTokens(badgesRow)).toContain("md:order-2");

    expect(classTokens(desktopLabel as HTMLElement)).not.toContain("hidden");
  });

  it("mantem a lista visivel durante a paginacao enquanto a proxima pagina carrega", async () => {
    const pageTwoDeferred = createDeferredResponse();

    apiFetchMock.mockImplementation(async (_base: string, path: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      if (path === "/api/me" && method === "GET") {
        return mockJsonResponse(true, { id: "1", name: "Admin", username: "admin" });
      }
      if (String(path).startsWith("/api/admin/sessions/active?page=1") && method === "GET") {
        return mockJsonResponse(true, {
          sessions: [
            {
              sid: "page-1-session",
              userId: "1",
              userName: "Admin",
              userAvatarUrl: null,
              createdAt: "2026-02-20T10:00:00.000Z",
              lastSeenAt: "2026-02-20T10:05:00.000Z",
              lastIp: "127.0.0.1",
              userAgent: "Current Browser",
              isPendingMfa: false,
              currentForViewer: true,
            },
          ],
          total: 150,
        });
      }
      if (String(path).startsWith("/api/admin/sessions/active?page=2") && method === "GET") {
        return pageTwoDeferred.promise;
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    });

    render(<DashboardSecurity />);

    expect(await screen.findByText("Admin")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: /pr.*xima p.*gina/i }));

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-security-loading")).not.toBeInTheDocument();
    expect(screen.queryByText(/Atualizando sessões/i)).not.toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Atualizando sessões",
        intent: "info",
      }),
    );

    pageTwoDeferred.resolve(
      mockJsonResponse(true, {
        sessions: [
          {
            sid: "page-2-session",
            userId: "2",
            userName: "Moderator",
            userAvatarUrl: null,
            createdAt: "2026-02-20T09:00:00.000Z",
            lastSeenAt: "2026-02-20T09:05:00.000Z",
            lastIp: "127.0.0.2",
            userAgent: "Pending Browser",
            isPendingMfa: false,
            currentForViewer: false,
          },
        ],
        total: 150,
      }),
    );

    expect(await screen.findByText("Moderator")).toBeInTheDocument();

    await waitFor(() => {
      expect(dismissToastMock).toHaveBeenCalledWith("dashboard-security-refresh-toast");
      expect(screen.queryByText("Admin")).not.toBeInTheDocument();
    });
  });

  it("shows loading placeholders before the session payload resolves", () => {
    apiFetchMock.mockImplementation(async () => new Promise<Response>(() => undefined));

    render(<DashboardSecurity />);

    expect(screen.getByTestId("dashboard-security-loading")).toBeInTheDocument();
    expect(screen.queryByText(/Total ativo:/i)).not.toBeInTheDocument();
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("exibe erro bloqueante com acao de nova tentativa", async () => {
    apiFetchMock.mockImplementation(async (_base: string, path: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      if (path === "/api/me" && method === "GET") {
        return mockJsonResponse(true, { id: "1", name: "Admin", username: "admin" });
      }
      if (String(path).startsWith("/api/admin/sessions/active?") && method === "GET") {
        return mockJsonResponse(false, { error: "load_failed" }, 500);
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    });

    render(<DashboardSecurity />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar as sessões",
    );
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("exibe estado vazio quando nao ha sessoes ativas", async () => {
    apiFetchMock.mockImplementation(async (_base: string, path: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();
      if (path === "/api/me" && method === "GET") {
        return mockJsonResponse(true, { id: "1", name: "Admin", username: "admin" });
      }
      if (String(path).startsWith("/api/admin/sessions/active?") && method === "GET") {
        return mockJsonResponse(true, { sessions: [], total: 0 });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    });

    render(<DashboardSecurity />);

    expect(await screen.findByText("Nenhuma sessão ativa")).toBeInTheDocument();
    expect(
      screen.getByText("Sessões autenticadas aparecem aqui quando houver usuários conectados."),
    ).toBeInTheDocument();
  });
});
