import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DashboardUsers from "@/pages/DashboardUsers";

const { apiFetchMock, toastMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/components/DashboardShell", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ImageLibraryDialog", () => ({
  default: () => null,
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({
    settings: {
      teamRoles: [],
    },
  }),
}));

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const buildUser = ({
  id,
  name,
  accessRole = "normal",
  permissions = [],
  order,
}: {
  id: string;
  name: string;
  accessRole?: "normal" | "admin";
  permissions?: string[];
  order: number;
}) => ({
  id,
  name,
  phrase: "",
  bio: "",
  avatarUrl: null,
  socials: [],
  favoriteWorks: { manga: [], anime: [] },
  status: "active" as const,
  permissions,
  roles: [],
  accessRole,
  order,
});

type ApiHandlerContext = {
  method: string;
  path: string;
  options?: RequestInit & { json?: Record<string, unknown> };
};

const configureApiFetch = ({
  currentUser,
  users,
  ownerIds,
  handlers = {},
}: {
  currentUser: Record<string, unknown>;
  users: Array<ReturnType<typeof buildUser>>;
  ownerIds: string[];
  handlers?: Partial<Record<string, (context: ApiHandlerContext) => Response | Promise<Response>>>;
}) => {
  apiFetchMock.mockImplementation(async (_base: string, path: string, options?: RequestInit) => {
    const method = String(options?.method || "GET").toUpperCase();
    const key = `${method} ${path}`;
    if (handlers[key]) {
      return handlers[key]!({
        method,
        path,
        options: options as RequestInit & { json?: Record<string, unknown> },
      });
    }
    if (path === "/api/users" && method === "GET") {
      return mockJsonResponse(true, {
        users,
        ownerIds,
        primaryOwnerId: currentUser.primaryOwnerId ?? ownerIds[0] ?? null,
      });
    }
    if (path === "/api/me" && method === "GET") {
      return mockJsonResponse(true, currentUser);
    }
    if (path === "/api/link-types" && method === "GET") {
      return mockJsonResponse(true, { items: [] });
    }
    return mockJsonResponse(false, { error: "not_found" }, 404);
  });
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/dashboard/usuarios"]}>
      <DashboardUsers />
    </MemoryRouter>,
  );

const openNewUserDialog = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Adicionar usuário" }));
  return screen.findByRole("dialog", { name: /Adicionar usuário/i });
};

const openUserDialog = async (name: string) => {
  fireEvent.click(
    await screen.findByRole("button", { name: new RegExp(`Abrir usuário ${name}`, "i") }),
  );
  return screen.findByRole("dialog", { name: /Editar usuário/i });
};

const toggleOwnerSwitch = (dialog: HTMLElement) => {
  const ownerSwitch = within(dialog).getAllByRole("switch")[0];
  fireEvent.click(ownerSwitch);
  return ownerSwitch;
};

describe("DashboardUsers owner governance", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    toastMock.mockReset();
  });

  it("creates a user without owner_secondary in the payload and promotes via /api/owners", async () => {
    configureApiFetch({
      currentUser: {
        id: "owner-1",
        name: "Dono Primário",
        username: "owner1",
        primaryOwnerId: "owner-1",
        grants: {
          usuarios: true,
        },
      },
      users: [buildUser({ id: "owner-1", name: "Dono Primário", permissions: ["*"], order: 0 })],
      ownerIds: ["owner-1"],
      handlers: {
        "POST /api/users": ({ options }) =>
          mockJsonResponse(
            true,
            {
              user: {
                ...buildUser({ id: "user-2", name: "LuckShiba", order: 1 }),
                ...(options?.json || {}),
                id: "user-2",
              },
            },
            201,
          ),
        "PUT /api/owners": ({ options }) =>
          mockJsonResponse(true, {
            ownerIds: ["owner-1", "user-2"],
            primaryOwnerId: "owner-1",
            requestBody: String(options?.body || ""),
          }),
      },
    });

    renderPage();

    const dialog = await openNewUserDialog();
    fireEvent.change(within(dialog).getByLabelText("ID do Discord"), {
      target: { value: "user-2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "LuckShiba" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "luckshiba@example.com" },
    });
    toggleOwnerSwitch(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const createCall = apiFetchMock.mock.calls.find((call) => {
        const path = call[1];
        const method = String((call[2] as RequestInit | undefined)?.method || "GET").toUpperCase();
        return path === "/api/users" && method === "POST";
      });
      expect(createCall).toBeTruthy();
      expect((createCall?.[2] as { json?: Record<string, unknown> }).json).toMatchObject({
        name: "LuckShiba",
        discordUserID: "user-2",
        accessRole: "normal",
      });
      expect((createCall?.[2] as { json?: Record<string, unknown> }).json?.accessRole).not.toBe(
        "owner_secondary",
      );
    });

    await waitFor(() => {
      const ownersCall = apiFetchMock.mock.calls.find((call) => {
        const path = call[1];
        const method = String((call[2] as RequestInit | undefined)?.method || "GET").toUpperCase();
        return path === "/api/owners" && method === "PUT";
      });
      expect(ownersCall).toBeTruthy();
      expect(
        JSON.parse(String((ownersCall?.[2] as RequestInit | undefined)?.body || "{}")),
      ).toEqual({
        ownerIds: ["owner-1", "user-2"],
      });
    });
  });

  it("updates an existing user without owner_secondary in the payload and then promotes via /api/owners", async () => {
    configureApiFetch({
      currentUser: {
        id: "owner-1",
        name: "Dono Primário",
        username: "owner1",
        primaryOwnerId: "owner-1",
        grants: {
          usuarios: true,
        },
      },
      users: [
        buildUser({ id: "owner-1", name: "Dono Primário", permissions: ["*"], order: 0 }),
        buildUser({ id: "user-2", name: "LuckShiba", order: 1 }),
      ],
      ownerIds: ["owner-1"],
      handlers: {
        "PUT /api/users/user-2": ({ options }) =>
          mockJsonResponse(true, {
            user: {
              ...buildUser({ id: "user-2", name: "LuckShiba", order: 1 }),
              ...(options?.json || {}),
            },
          }),
        "PUT /api/owners": ({ options }) =>
          mockJsonResponse(true, {
            ownerIds: ["owner-1", "user-2"],
            primaryOwnerId: "owner-1",
            requestBody: String(options?.body || ""),
          }),
      },
    });

    renderPage();

    const dialog = await openUserDialog("LuckShiba");
    expect(within(dialog).getByLabelText("ID do Discord")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("E-mail de acesso")).toBeInTheDocument();
    toggleOwnerSwitch(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const updateCall = apiFetchMock.mock.calls.find((call) => {
        const path = call[1];
        const method = String((call[2] as RequestInit | undefined)?.method || "GET").toUpperCase();
        return path === "/api/users/user-2" && method === "PUT";
      });
      expect(updateCall).toBeTruthy();
      expect((updateCall?.[2] as { json?: Record<string, unknown> }).json?.accessRole).toBe(
        "normal",
      );
      expect((updateCall?.[2] as { json?: Record<string, unknown> }).json?.accessRole).not.toBe(
        "owner_secondary",
      );
    });

    await waitFor(() => {
      const ownersCall = apiFetchMock.mock.calls.find((call) => {
        const path = call[1];
        const method = String((call[2] as RequestInit | undefined)?.method || "GET").toUpperCase();
        return path === "/api/owners" && method === "PUT";
      });
      expect(ownersCall).toBeTruthy();
      expect(
        JSON.parse(String((ownersCall?.[2] as RequestInit | undefined)?.body || "{}")),
      ).toEqual({
        ownerIds: ["owner-1", "user-2"],
      });
    });
  });

  it("rebaixa um owner via /api/owners sem enviar owner_secondary no payload do usuário", async () => {
    configureApiFetch({
      currentUser: {
        id: "owner-1",
        name: "Dono Primário",
        username: "owner1",
        primaryOwnerId: "owner-1",
        grants: {
          usuarios: true,
        },
      },
      users: [
        buildUser({ id: "owner-1", name: "Dono Primário", permissions: ["*"], order: 0 }),
        buildUser({ id: "owner-2", name: "Dono Secundário", order: 1 }),
      ],
      ownerIds: ["owner-1", "owner-2"],
      handlers: {
        "PUT /api/users/owner-2": ({ options }) =>
          mockJsonResponse(true, {
            user: {
              ...buildUser({ id: "owner-2", name: "Dono Secundário", order: 1 }),
              ...(options?.json || {}),
            },
          }),
        "PUT /api/owners": ({ options }) =>
          mockJsonResponse(true, {
            ownerIds: ["owner-1"],
            primaryOwnerId: "owner-1",
            requestBody: String(options?.body || ""),
          }),
      },
    });

    renderPage();

    const dialog = await openUserDialog("Dono Secundário");
    const ownerSwitch = within(dialog).getAllByRole("switch")[0];
    expect(ownerSwitch).toHaveAttribute("data-state", "checked");
    fireEvent.click(ownerSwitch);

    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const updateCall = apiFetchMock.mock.calls.find((call) => {
        const path = call[1];
        const method = String((call[2] as RequestInit | undefined)?.method || "GET").toUpperCase();
        return path === "/api/users/owner-2" && method === "PUT";
      });
      expect(updateCall).toBeTruthy();
      expect((updateCall?.[2] as { json?: Record<string, unknown> }).json?.accessRole).toBe(
        "normal",
      );
      expect((updateCall?.[2] as { json?: Record<string, unknown> }).json?.accessRole).not.toBe(
        "owner_secondary",
      );
    });

    await waitFor(() => {
      const ownersCall = apiFetchMock.mock.calls.find((call) => {
        const path = call[1];
        const method = String((call[2] as RequestInit | undefined)?.method || "GET").toUpperCase();
        return path === "/api/owners" && method === "PUT";
      });
      expect(ownersCall).toBeTruthy();
      expect(
        JSON.parse(String((ownersCall?.[2] as RequestInit | undefined)?.body || "{}")),
      ).toEqual({
        ownerIds: ["owner-1"],
      });
    });
  });

  it("shows a specific toast when the backend returns owner_role_requires_owner_governance", async () => {
    configureApiFetch({
      currentUser: {
        id: "owner-1",
        name: "Dono Primário",
        username: "owner1",
        primaryOwnerId: "owner-1",
        grants: {
          usuarios: true,
        },
      },
      users: [buildUser({ id: "owner-1", name: "Dono Primário", permissions: ["*"], order: 0 })],
      ownerIds: ["owner-1"],
      handlers: {
        "POST /api/users": () =>
          mockJsonResponse(false, { error: "owner_role_requires_owner_governance" }, 403),
      },
    });

    renderPage();

    const dialog = await openNewUserDialog();
    fireEvent.change(within(dialog).getByLabelText("ID do Discord"), {
      target: { value: "user-2" },
    });
    fireEvent.change(within(dialog).getByLabelText("Nome"), {
      target: { value: "LuckShiba" },
    });
    fireEvent.change(within(dialog).getByLabelText("E-mail de acesso"), {
      target: { value: "luckshiba@example.com" },
    });
    toggleOwnerSwitch(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "A promoção para dono é aplicada separadamente",
          variant: "destructive",
        }),
      );
    });
  });
});
