import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Post from "@/pages/Post";

const apiFetchMock = vi.hoisted(() => vi.fn());
const originalIntersectionObserver = window.IntersectionObserver;

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchBestEffort: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/hooks/use-site-settings", () => ({
  useSiteSettings: () => ({
    settings: {
      site: { defaultShareImage: "" },
      teamRoles: [],
    },
  }),
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("@/lib/public-document-navigation", async () => {
  const actual = await vi.importActual<typeof import("@/lib/public-document-navigation")>(
    "@/lib/public-document-navigation",
  );
  const router = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    usePublicDocumentLocation: () => {
      const location = router.useLocation();
      return {
        hash: location.hash,
        href: `${location.pathname}${location.search}${location.hash}`,
        pathname: location.pathname,
        search: location.search,
      };
    },
  };
});

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ slug: "post-teste" }),
  };
});

vi.mock("@/components/ProjectEmbedCard", () => ({
  default: () => <div data-testid="project-embed-card" />,
}));

vi.mock("@/components/CommentsSection", () => ({
  default: () => <div data-testid="comments-section" />,
}));

vi.mock("@/components/lexical/LexicalViewer", () => ({
  default: () => <div data-testid="lexical-viewer" />,
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const installIntersectionObserver = () => {
  const observe = vi.fn();
  const disconnect = vi.fn();
  let callbackRef: IntersectionObserverCallback | null = null;

  class MockIntersectionObserver {
    observe = observe;
    disconnect = disconnect;

    constructor(callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
      callbackRef = callback;
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    configurable: true,
    writable: true,
    value: MockIntersectionObserver,
  });

  return {
    observe,
    disconnect,
    triggerIntersecting: (target: Element) => {
      if (!callbackRef) {
        return;
      }
      callbackRef(
        [
          {
            isIntersecting: true,
            target,
          } as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      );
    },
  };
};

const postFixture = {
  id: "post-1",
  title: "Post de Teste",
  slug: "post-teste",
  coverImageUrl: "/uploads/capa-post.jpg",
  coverAlt: "Capa de teste",
  excerpt: "Resumo",
  content: "<p>Conteudo</p>",
  contentFormat: "lexical" as const,
  author: "Admin",
  publishedAt: "2026-02-10T12:00:00.000Z",
  views: 10,
  commentsCount: 2,
  projectId: "project-1",
};

const authorFixture = {
  id: "user-1",
  name: "Admin",
  avatarUrl: "/uploads/users/admin.png",
  phrase: "Frase do admin",
  bio: "Bio do admin",
  roles: ["Membro"],
  socials: [{ label: "site", href: "https://admin.dev" }],
  favoriteWorks: { manga: [], anime: [] },
  status: "active",
};

const usersMediaVariants = {
  "/uploads/users/admin.png": {
    variantsVersion: 1,
    variants: {
      square: {
        formats: {
          fallback: { url: "/uploads/_variants/admin/square-v1.png" },
        },
      },
    },
  },
};

const setupApiMock = (users: unknown[]) => {
  apiFetchMock.mockReset();
  (
    window as Window & {
      __BOOTSTRAP_PUBLIC__?: unknown;
      __BOOTSTRAP_PUBLIC_ME__?: unknown;
    }
  ).__BOOTSTRAP_PUBLIC__ = {
    settings: {},
    pages: {},
    projects: [],
    posts: [],
    updates: [],
    teamMembers: users,
    teamLinkTypes: [{ id: "site", label: "Site", icon: "globe" }],
    mediaVariants: usersMediaVariants,
    tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
    generatedAt: "2026-03-10T00:00:00.000Z",
    payloadMode: "full",
  };
  (
    window as Window & {
      __BOOTSTRAP_PUBLIC__?: unknown;
      __BOOTSTRAP_PUBLIC_ME__?: unknown;
    }
  ).__BOOTSTRAP_PUBLIC_ME__ = null;
  apiFetchMock.mockImplementation(
    async (_apiBase: string, endpoint: string, options?: RequestInit) => {
      const method = String(options?.method || "GET").toUpperCase();

      if (endpoint === "/api/public/posts/post-teste" && method === "GET") {
        return mockJsonResponse(true, {
          post: postFixture,
          mediaVariants: {
            "/uploads/capa-post.jpg": {
              variantsVersion: 1,
              variants: {
                card: {
                  formats: {
                    fallback: { url: "/uploads/_variants/post-1/card-v1.jpeg" },
                  },
                },
              },
            },
          },
        });
      }
      if (endpoint === "/api/public/posts/post-teste/view" && method === "POST") {
        return mockJsonResponse(true, { views: 11 });
      }
      return mockJsonResponse(false, { error: "not_found" }, 404);
    },
  );
};

describe("Post author card", () => {
  afterEach(() => {
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: originalIntersectionObserver,
    });
  });

  beforeEach(() => {
    apiFetchMock.mockReset();
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC__;
    delete (
      window as Window & {
        __BOOTSTRAP_PUBLIC__?: unknown;
        __BOOTSTRAP_PUBLIC_ME__?: unknown;
      }
    ).__BOOTSTRAP_PUBLIC_ME__;
  });

  it("renderiza o card do autor entre embed e comentarios quando encontra um unico membro", async () => {
    setupApiMock([authorFixture]);

    render(
      <MemoryRouter initialEntries={["/postagem/post-teste#comment-1"]}>
        <Post />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Post de Teste" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { level: 2, name: "Sobre o autor" }),
    ).toBeInTheDocument();
    const authorCard = await screen.findByTestId("post-author-card");

    expect(
      within(authorCard).getByRole("heading", { level: 3, name: "Admin" }),
    ).toBeInTheDocument();
    expect(within(authorCard).getByText('"Frase do admin"')).toBeInTheDocument();
    expect(within(authorCard).getByText("Bio do admin")).toBeInTheDocument();
    expect(authorCard.querySelector(".team-member-avatar-shell")).not.toBeNull();
    expect(authorCard.querySelector(".team-member-avatar-frame")).not.toBeNull();

    const embedCard = screen.getByTestId("project-embed-card");
    const comments = screen.getByTestId("comments-section");

    expect(
      embedCard.compareDocumentPosition(authorCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      authorCard.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("renderiza autor e comentarios apos observar o sentinel quando a rota nao inicia com hash", async () => {
    const observer = installIntersectionObserver();
    setupApiMock([authorFixture]);

    render(
      <MemoryRouter initialEntries={["/postagem/post-teste"]}>
        <Post />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Post de Teste" }),
    ).toBeInTheDocument();

    expect(screen.queryByTestId("project-embed-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("post-author-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("comments-section")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(observer.observe).toHaveBeenCalledTimes(1);
    });

    const observedSentinel = observer.observe.mock.calls[0]?.[0] as Element | undefined;
    expect(observedSentinel).toBeInstanceOf(HTMLDivElement);

    act(() => {
      observer.triggerIntersecting(observedSentinel as Element);
    });

    const authorCard = await screen.findByTestId("post-author-card");
    const embedCard = await screen.findByTestId("project-embed-card");
    const comments = await screen.findByTestId("comments-section");

    expect(
      within(authorCard).getByRole("heading", { level: 3, name: "Admin" }),
    ).toBeInTheDocument();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(
      embedCard.compareDocumentPosition(authorCard) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(
      authorCard.compareDocumentPosition(comments) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it("oculta o card do autor quando nao encontra correspondencia unica", async () => {
    setupApiMock([]);

    render(
      <MemoryRouter initialEntries={["/postagem/post-teste#comment-1"]}>
        <Post />
      </MemoryRouter>,
    );

    await screen.findByRole("heading", { name: "Post de Teste" });
    await screen.findByTestId("comments-section");

    await waitFor(() => {
      expect(screen.queryByTestId("post-author-card")).not.toBeInTheDocument();
    });
  });
});
