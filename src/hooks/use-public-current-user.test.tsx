import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { usePublicCurrentUser } from "@/hooks/use-public-current-user";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const Consumer = ({ testId }: { testId: string }) => {
  const { currentUser } = usePublicCurrentUser();
  return <div data-testid={testId}>{currentUser?.name || "anon"}</div>;
};

const GrantsConsumer = () => {
  const { currentUser } = usePublicCurrentUser();
  return (
    <div data-testid="grants-state">
      {currentUser?.grants?.posts === true && currentUser?.grants?.configuracoes === true
        ? "hydrated"
        : "partial"}
    </div>
  );
};

describe("usePublicCurrentUser", () => {
  it("dedupes /api/public/me across concurrent consumers", async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, {
            user: {
              id: "user-1",
              name: "Admin",
              username: "admin",
              permissions: ["posts"],
            },
          });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    (
      window as Window & {
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = null;

    render(
      <>
        <Consumer testId="consumer-a" />
        <Consumer testId="consumer-b" />
      </>,
    );

    await waitFor(() => {
      const meCalls = apiFetchMock.mock.calls.filter(
        (call) => String(call[1] || "") === "/api/public/me",
      );
      expect(meCalls).toHaveLength(1);
    });

    expect(await screen.findByTestId("consumer-a")).toHaveTextContent("Admin");
    expect(await screen.findByTestId("consumer-b")).toHaveTextContent("Admin");
  });

  it("prefers /api/public/me over partial bootstrap when access grants are missing", async () => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === "/api/public/me" && method === "GET") {
          return mockJsonResponse(true, {
            user: {
              id: "user-1",
              name: "Admin",
              username: "admin",
              grants: {
                posts: true,
                configuracoes: true,
              },
            },
          });
        }
        return mockJsonResponse(false, { error: "not_found" }, 404);
      },
    );

    (
      window as Window & {
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__ = {
      id: "user-1",
      name: "Admin",
      username: "admin",
    };

    render(<GrantsConsumer />);

    expect(screen.getByTestId("grants-state")).toHaveTextContent("partial");
    await waitFor(() => {
      expect(screen.getByTestId("grants-state")).toHaveTextContent("hydrated");
    });
  });
});
