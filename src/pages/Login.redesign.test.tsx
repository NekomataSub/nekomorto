import Login from "@/pages/Login";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/lib/public-document-navigation", () => ({
  navigatePublicDocument: (href: string, options?: unknown) => navigateMock(href, options),
  usePublicDocumentLocation: () => {
    const parsed = new URL(locationHref, "http://localhost");
    return {
      hash: parsed.hash,
      href: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      pathname: parsed.pathname,
      search: parsed.search,
    };
  },
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

const originalLocation = window.location;
let locationHref = "http://localhost/login";

const installLocationMock = () => {
  locationHref = "http://localhost/login";
  const locationMock = {
    get href() {
      return locationHref;
    },
    set href(value: string) {
      locationHref = value;
    },
    get hash() {
      return new URL(locationHref, "http://localhost").hash;
    },
    get origin() {
      return new URL(locationHref, "http://localhost").origin;
    },
    get pathname() {
      return new URL(locationHref, "http://localhost").pathname;
    },
    get search() {
      return new URL(locationHref, "http://localhost").search;
    },
    assign(value: string) {
      locationHref = value;
    },
  } as unknown as Location;

  Object.defineProperty(window, "location", {
    configurable: true,
    value: locationMock,
  });
};

const mockResponse = (ok: boolean) =>
  ({
    ok,
    json: async () => ({}),
  }) as Response;

const renderLogin = async (route = "/login") => {
  locationHref = `http://localhost${route}`;
  const utils = render(
    <MemoryRouter initialEntries={[route]}>
      <Login />
    </MemoryRouter>,
  );
  // Wait for the initial session check to settle (renders UI or navigates away)
  await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
  return utils;
};

describe("Login redesign", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    navigateMock.mockReset();
    installLocationMock();
    apiFetchMock.mockResolvedValue(mockResponse(false));
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renderiza a estrutura principal com classes de redesign", async () => {
    await renderLogin();

    expect(document.querySelector(".login-shell")).not.toBeNull();
    expect(document.querySelector(".login-backdrop")).not.toBeNull();
    const card = document.querySelector(".login-card");
    expect(card).not.toBeNull();
    expect(card).not.toHaveClass("p-1");
    expect(document.querySelector(".login-card-content")).not.toBeNull();
    expect(document.querySelector(".login-actions")).not.toBeNull();
    expect(document.querySelector(".login-providers")).not.toBeNull();
    const discordBtn = screen.getByRole("button", { name: "Entrar com Discord" });
    expect(discordBtn).toHaveClass("login-provider-btn", "login-provider-btn--discord");
    const googleBtn = screen.getByRole("button", { name: "Entrar com Google" });
    expect(googleBtn).toHaveClass("login-provider-btn", "login-provider-btn--google");
    expect(screen.queryByRole("button", { name: "Entrar com senha" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Identificador")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  });

  it("exibe mensagem de erro e atributos de acessibilidade quando error existe", async () => {
    await renderLogin("/login?error=state_mismatch");

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("login-alert");
    expect(alert).toHaveAttribute("aria-live", "polite");
    expect(alert).toHaveTextContent("Falha de segurança na autenticação. Tente novamente.");
  });

  it("explica quando o usuário ainda não foi liberado", async () => {
    await renderLogin("/login?error=preprovision_required");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Seu usuário ainda não foi liberado por um owner.",
    );
  });

  it("explica conflito de conta já vinculada", async () => {
    await renderLogin("/login?error=identity_already_linked");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Essa conta já está conectada a outro usuário.",
    );
  });

  it("explica quando o provedor não confirma o e-mail", async () => {
    await renderLogin("/login?error=email_not_verified");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível confirmar seu e-mail no provedor escolhido.",
    );
  });

  it("explica quando há conflito ambíguo de conta", async () => {
    await renderLogin("/login?error=ambiguous_candidate");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Encontramos um conflito de conta e não foi possível concluir o acesso automaticamente.",
    );
  });

  it("explica conflito de provedor já existente para o e-mail", async () => {
    await renderLogin("/login?error=same_provider_conflict");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Já existe uma conta desse provedor vinculada para este e-mail.",
    );
  });

  it("mantém mensagem legada de unauthorized como falta de liberação", async () => {
    await renderLogin("/login?error=unauthorized");

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Seu usuário ainda não foi liberado por um owner.",
    );
  });

  it("redireciona para dashboard quando já há sessão", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: "user-1", name: "User One" } }),
    } as Response);

    renderLogin();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });

  it("permite resposta de /api/me com authMethods no bootstrap", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: {
          id: "user-1",
          name: "User One",
          authMethods: [{ provider: "google", linked: true }],
        },
      }),
    } as Response);

    renderLogin();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalled();
    });
  });

  it("monta URL de autenticacao com next no clique de entrar com Discord", async () => {
    await renderLogin("/login?next=/dashboard/posts");

    fireEvent.click(screen.getByRole("button", { name: "Entrar com Discord" }));

    expect(locationHref).toBe("http://api.local/auth/discord?next=%2Fdashboard%2Fposts");
  });

  it("monta URL de autenticacao com next no clique de entrar com Discord", async () => {
    await renderLogin("/login?next=/dashboard/posts");

    fireEvent.click(screen.getByRole("button", { name: "Entrar com Discord" }));

    expect(locationHref).toBe("http://api.local/auth/discord?next=%2Fdashboard%2Fposts");
  });

  it("usa fallback de autenticacao sem next", async () => {
    await renderLogin("/login");

    fireEvent.click(screen.getByRole("button", { name: "Entrar com Discord" }));

    expect(locationHref).toBe("http://api.local/auth/discord");
  });

  it("monta URL de autenticacao do Google com next", async () => {
    await renderLogin("/login?next=/dashboard/posts");

    fireEvent.click(screen.getByRole("button", { name: "Entrar com Google" }));

    expect(locationHref).toBe("http://api.local/auth/google?next=%2Fdashboard%2Fposts");
  });

  it("aplica foco forte fino ao campo de V2F publico", async () => {
    await renderLogin("/login?mfa=required");

    expect(screen.getByPlaceholderText("000000 ou ABCDE-12345")).toHaveClass(
      "focus-visible:border-primary",
      "focus-visible:ring-1",
      "focus-visible:ring-primary/45",
      "focus-visible:ring-inset",
    );
  });

  it("cancela login de V2F com logout explicito e redireciona para home", async () => {
    apiFetchMock
      .mockResolvedValueOnce(mockResponse(false))
      .mockResolvedValueOnce(mockResponse(true));

    await renderLogin("/login?mfa=required");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar login" }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenNthCalledWith(2, "http://api.local", "/api/logout", {
        method: "POST",
        auth: true,
      });
    });
    await waitFor(() => {
      expect(locationHref).toBe("/");
    });
  });

  it("redireciona para home mesmo quando logout falha (fail-open)", async () => {
    apiFetchMock
      .mockResolvedValueOnce(mockResponse(false))
      .mockRejectedValueOnce(new Error("network"));

    await renderLogin("/login?mfa=required");

    fireEvent.click(screen.getByRole("button", { name: "Cancelar login" }));

    await waitFor(() => {
      expect(locationHref).toBe("/");
    });
  });
});
