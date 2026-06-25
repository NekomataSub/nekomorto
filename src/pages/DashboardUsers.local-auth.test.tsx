import { DashboardSessionContext } from "@/hooks/dashboard-session-context";
import DashboardUsers from "@/pages/DashboardUsers";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const linkSocialMock = vi.hoisted(() => vi.fn());
const addPasskeyMock = vi.hoisted(() => vi.fn());
const authFetchMock = vi.hoisted(() => vi.fn());

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
  useSiteSettings: () => ({ settings: { teamRoles: [] } }),
}));

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    $fetch: (...args: unknown[]) => authFetchMock(...args),
    linkSocial: (...args: unknown[]) => linkSocialMock(...args),
    unlinkAccount: vi.fn(),
    passkey: { addPasskey: (...args: unknown[]) => addPasskeyMock(...args) },
    twoFactor: {
      enable: vi.fn(),
      verifyTotp: vi.fn(),
      verifyBackupCode: vi.fn(),
      disable: vi.fn(),
    },
  },
}));

vi.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => toastMock(...args),
}));

const originalLocation = window.location;
const originalPublicKeyCredential = Object.getOwnPropertyDescriptor(window, "PublicKeyCredential");
let locationHref = "http://localhost/dashboard/usuarios?edit=me";

const currentUserValue = {
  id: "user-1",
  name: "Admin",
  accessRole: "admin",
  grants: {
    usuarios: true,
    uploads: true,
  },
  authMethods: [{ provider: "discord", linked: true }],
};

const normalCurrentUserValue = {
  id: "user-2",
  name: "Colaborador",
  accessRole: "normal",
  grants: {
    usuarios: false,
    uploads: false,
  },
  authMethods: [{ provider: "discord", linked: true }],
};

const buildUsersPayload = (user = currentUserValue) => ({
  users: [
    {
      id: user.id,
      name: user.name,
      phrase: "",
      bio: "",
      email: "user@example.com",
      avatarUrl: null,
      socials: [],
      favoriteWorks: { manga: [], anime: [] },
      status: "active",
      permissions: user.accessRole === "admin" ? ["usuarios", "usuarios"] : [],
      roles: [],
      accessRole: user.accessRole,
      order: 0,
    },
  ],
  ownerIds: [],
  primaryOwnerId: null,
});

const buildMePayload = (user = currentUserValue, includeAuthMethods = true) => ({
  id: user.id,
  name: user.name,
  username: user.accessRole === "admin" ? "admin" : "colaborador",
  accessRole: user.accessRole,
  ...(includeAuthMethods ? { authMethods: [{ provider: "discord", linked: true }] } : {}),
  grants: user.grants,
  ownerIds: [],
  primaryOwnerId: null,
});

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({ ok, status, json: async () => payload }) as Response;

const installLocationMock = () => {
  locationHref = "http://localhost/dashboard/usuarios?edit=me";
  const locationMock = {
    get href() {
      return locationHref;
    },
    set href(value: string) {
      locationHref = value;
    },
  } as unknown as Location;

  Object.defineProperty(window, "location", {
    configurable: true,
    value: locationMock,
  });
};

const setupApiMock = ({
  includeAuthMethods = true,
  currentUser = currentUserValue,
}: {
  includeAuthMethods?: boolean;
  currentUser?: typeof currentUserValue;
} = {}) => {
  apiFetchMock.mockReset();
  toastMock.mockReset();
  linkSocialMock.mockReset();
  addPasskeyMock.mockReset();
  authFetchMock.mockReset();
  linkSocialMock.mockResolvedValue({ data: { redirect: true }, error: null });
  addPasskeyMock.mockResolvedValue({ data: { id: "passkey-1" }, error: null });
  authFetchMock.mockResolvedValue({ data: { status: true }, error: null });
  apiFetchMock.mockImplementation(async (_base: string, path: string, options?: RequestInit) => {
    const method = String(options?.method || "GET").toUpperCase();

    if (path === "/api/users" && method === "GET") {
      return mockJsonResponse(true, buildUsersPayload(currentUser));
    }
    if (path === "/api/users" && method === "POST") {
      return mockJsonResponse(true, {
        user: {
          id: "user_generated_1",
          name: "Alice",
          phrase: "",
          bio: "",
          email: "alice@example.com",
          avatarUrl: null,
          socials: [],
          favoriteWorks: { manga: [], anime: [] },
          status: "active",
          permissions: [],
          roles: [],
          accessRole: "normal",
          order: 1,
        },
      });
    }
    if (path === "/api/me" && method === "GET") {
      return mockJsonResponse(true, buildMePayload(currentUser, includeAuthMethods));
    }
    if (path === "/api/me/security" && method === "GET") {
      return mockJsonResponse(true, {
        totpEnabled: false,
        recoveryCodesRemaining: 0,
        activeSessionsCount: 1,
        oauthEmailSuggested: "user@example.com",
        identities: [
          {
            provider: "discord",
            linked: true,
            emailNormalized: "user@example.com",
            emailVerified: true,
            linkedAt: "2026-04-12T21:44:00.000Z",
            lastUsedAt: "2026-04-12T21:45:09.000Z",
          },
        ],
        passkeys: [
          {
            id: "passkey-existing",
            name: "Passkey Nekomorto",
            deviceType: "singleDevice",
            backedUp: false,
            createdAt: "2026-04-12T21:44:00.000Z",
          },
        ],
      });
    }
    if (path === "/api/me/sessions" && method === "GET") {
      return mockJsonResponse(true, {
        sessions: [
          {
            sid: "session-current",
            createdAt: "2026-04-12T21:44:00.000Z",
            lastSeenAt: "2026-04-12T21:45:09.000Z",
            lastIp: "203.0.113.42",
            userAgent: "Mozilla/5.0",
            current: true,
          },
        ],
      });
    }
    if (path === "/api/link-types" && method === "GET") {
      return mockJsonResponse(true, { items: [] });
    }

    return mockJsonResponse(false, { error: "not_found" }, 404);
  });
};

const renderDashboardUsers = (
  initialEntry: string,
  currentUser: typeof currentUserValue = currentUserValue,
) =>
  render(
    <DashboardSessionContext.Provider
      value={{
        hasProvider: true,
        currentUser: currentUser as never,
        hasResolved: true,
        isLoading: false,
        refresh: async () => currentUser as never,
        setCurrentUser: () => undefined,
      }}
    >
      <MemoryRouter initialEntries={[initialEntry]}>
        <DashboardUsers />
      </MemoryRouter>
    </DashboardSessionContext.Provider>,
  );

const openNewUserDialog = async () => {
  const addButton = await screen.findByRole("button", { name: /adicionar usuário/i });
  fireEvent.click(addButton);
  await screen.findByLabelText(/id interno/i);
};

const clickSave = () => {
  fireEvent.click(screen.getByRole("button", { name: /^salvar$/i }));
};

describe("DashboardUsers connected accounts", () => {
  it("renderiza métodos de acesso sem UI de login com senha", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me");

    await screen.findByRole("heading", { name: /gest.o de usu.rios/i });
    await screen.findByText(/editar usu.rio/i);

    expect(screen.getAllByText(/métodos de acesso/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Discord$/)).toBeInTheDocument();
    expect(screen.getByText(/^Google$/)).toBeInTheDocument();
    expect(screen.getAllByText(/não conectada/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/configurar login com senha/i)).not.toBeInTheDocument();
  });

  it("cadastra e remove passkeys no editor do próprio perfil", async () => {
    Object.defineProperty(window, "PublicKeyCredential", {
      configurable: true,
      value: class PublicKeyCredential {},
    });
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me");

    fireEvent.click(await screen.findByRole("button", { name: "Adicionar passkey" }));
    await waitFor(() => expect(addPasskeyMock).toHaveBeenCalledWith({ name: "Passkey Nekomorto" }));

    fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remover passkey" }));
    await waitFor(() =>
      expect(authFetchMock).toHaveBeenCalledWith("/passkey/delete-passkey", {
        method: "POST",
        body: { id: "passkey-existing" },
      }),
    );
  });

  it("inicia o fluxo manual de conexão de provider", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me");

    await screen.findAllByText(/métodos de acesso/i);

    const googleBadge = screen.getByText(/^Google$/);
    const accessSection = googleBadge.closest(
      "div.flex.flex-wrap.items-center.justify-between",
    ) as HTMLElement | null;
    expect(accessSection).not.toBeNull();
    fireEvent.click(within(accessSection as HTMLElement).getByRole("button", { name: "Conectar" }));

    await waitFor(() =>
      expect(linkSocialMock).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/dashboard/usuarios?edit=me",
      }),
    );
  });

  it("mostra erro de link quando a identidade já está ligada a outro usuário", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me&error=identity_already_linked");

    await screen.findAllByText(/métodos de acesso/i);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Essa conta já está conectada a outro usuário",
        variant: "destructive",
      }),
    );
  });

  it("mostra feedback de sucesso ao voltar do link manual", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me&linked=google");

    await screen.findAllByText(/métodos de acesso/i);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Conta Google conectada com sucesso" }),
    );
  });

  it("mantém o e-mail readonly em métodos de acesso e mostra o campo editável no self-edit de admin", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me");

    await screen.findAllByText(/métodos de acesso/i);
    expect(screen.getByLabelText(/e-mail de acesso/i)).toHaveAttribute("type", "email");
    expect(screen.getByText(/e-mail:\s*user@example.com/i)).toBeInTheDocument();
  });

  it("mantém o id interno visível no self-edit de admin", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios?edit=me");

    await screen.findAllByText(/métodos de acesso/i);
    expect(screen.getByLabelText(/id interno/i)).toBeInTheDocument();
  });

  it("esconde o campo editável de e-mail para usuário sem gestão", async () => {
    installLocationMock();
    setupApiMock({ currentUser: normalCurrentUserValue });

    renderDashboardUsers("/dashboard/usuarios?edit=me", normalCurrentUserValue);

    await screen.findByRole("heading", { name: /gest.o de usu.rios/i });
    await screen.findByText(/editar usu.rio/i);
    expect(screen.queryByLabelText(/e-mail de acesso/i)).not.toBeInTheDocument();
  });

  it("esconde também o id interno para usuário sem gestão", async () => {
    installLocationMock();
    setupApiMock({ currentUser: normalCurrentUserValue });

    renderDashboardUsers("/dashboard/usuarios?edit=me", normalCurrentUserValue);

    await screen.findByRole("heading", { name: /gest.o de usu.rios/i });
    await screen.findByText(/editar usu.rio/i);
    expect(screen.queryByLabelText(/id interno/i)).not.toBeInTheDocument();
  });

  it("explica que o id interno pode ser gerado automaticamente", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios");
    await openNewUserDialog();

    expect(
      screen.getByText(/você pode deixar em branco para gerar o id interno automaticamente/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/será definido ao salvar/i)).toBeInTheDocument();
    expect(
      screen.getByText(/o id interno será gerado automaticamente ao salvar/i),
    ).toBeInTheDocument();
  });

  it("mostra os campos de id interno e e-mail de acesso na criação", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios");
    await openNewUserDialog();

    expect(screen.getByLabelText(/id interno/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/e-mail de acesso/i)).toHaveAttribute("type", "email");
  });

  it("mostra feedback ao tentar criar usuário sem e-mail", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios");
    await openNewUserDialog();
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: "Alice" } });
    clickSave();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Informe o e-mail de acesso",
        variant: "destructive",
      }),
    );
  });

  it("mostra feedback ao tentar criar usuário sem nome", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios");
    await openNewUserDialog();
    fireEvent.change(screen.getByLabelText(/e-mail de acesso/i), {
      target: { value: "alice@example.com" },
    });
    clickSave();

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Informe pelo menos o nome do usuário",
        variant: "destructive",
      }),
    );
  });

  it("envia id nulo ao criar usuário sem preencher id manual", async () => {
    installLocationMock();
    setupApiMock();

    renderDashboardUsers("/dashboard/usuarios");
    await openNewUserDialog();
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/e-mail de acesso/i), {
      target: { value: "Alice@Example.com" },
    });
    clickSave();

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        "http://api.local",
        "/api/users",
        expect.objectContaining({
          method: "POST",
          auth: true,
          json: expect.objectContaining({
            id: null,
            name: "Alice",
            email: "alice@example.com",
          }),
        }),
      );
    });
  });

  it("preserva fallback quando /api/me ainda não traz authMethods", async () => {
    installLocationMock();
    setupApiMock({ includeAuthMethods: false });

    renderDashboardUsers("/dashboard/usuarios?edit=me");

    await screen.findAllByText(/métodos de acesso/i);
    expect(screen.getByText(/^Discord$/)).toBeInTheDocument();
    expect(screen.getByText(/^Google$/)).toBeInTheDocument();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    if (originalPublicKeyCredential) {
      Object.defineProperty(window, "PublicKeyCredential", originalPublicKeyCredential);
    } else {
      Reflect.deleteProperty(window, "PublicKeyCredential");
    }
  });
});
