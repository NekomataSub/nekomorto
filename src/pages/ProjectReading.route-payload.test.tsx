import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PublicBootstrapProvider } from "@/hooks/public-bootstrap-provider";
import { PUBLIC_ANALYTICS_INGEST_PATH } from "@/lib/public-analytics";
import ProjectReading from "@/pages/ProjectReading";
import { emptyPublicBootstrapPayload } from "@/types/public-bootstrap";
import type {
  PublicBootstrapPayload,
  PublicRouteProjectReadingPayload,
} from "@/types/public-bootstrap";

const apiFetchMock = vi.hoisted(() => vi.fn());
const originalIntersectionObserver = window.IntersectionObserver;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  apiFetchBestEffort: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/hooks/use-page-meta", () => ({
  usePageMeta: () => undefined,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ slug: "projeto-teste", chapter: "1" }),
  };
});

vi.mock("@/components/lexical/LexicalViewer", () => ({
  default: () => <div data-testid="lexical-viewer" />,
}));

vi.mock("@/components/CommentsSection", () => ({
  default: () => <div data-testid="comments-section" />,
}));

vi.mock("@/components/Header", () => ({
  default: ({ variant = "fixed" }: { variant?: "fixed" | "static" }) => (
    <div data-testid="public-header" data-variant={variant} />
  ),
}));

vi.mock("@/components/Footer", () => ({
  default: () => <div data-testid="public-footer" />,
}));

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

const publicBootstrap = {
  ...emptyPublicBootstrapPayload,
  projects: [],
  inProgressItems: [],
  posts: [],
  updates: [],
  teamMembers: [],
  teamLinkTypes: [],
  mediaVariants: {},
  tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
  generatedAt: "2026-03-10T00:00:00.000Z",
  payloadMode: "full",
} as PublicBootstrapPayload;

const routePayload = {
  kind: "project-reading",
  generatedAt: "2026-03-10T00:00:00.000Z",
  project: {
    id: "projeto-teste",
    title: "Projeto Route",
    titleOriginal: "",
    titleEnglish: "",
    synopsis: "Sinopse principal",
    description: "Descrição",
    type: "Light Novel",
    status: "Em andamento",
    tags: [],
    genres: [],
    cover: "/uploads/project-cover.jpg",
    coverAlt: "Capa",
    banner: "",
    bannerAlt: "",
    heroImageUrl: "/uploads/project-hero.jpg",
    heroImageAlt: "Hero",
    heroLogoUrl: "",
    heroLogoAlt: "",
    forceHero: false,
    trailerUrl: "",
    studio: "Studio Teste",
    animationStudios: [],
    episodes: "12 capítulos",
    producers: [],
    staff: [],
    animeStaff: [],
    volumeEntries: [],
    volumeCovers: [],
    episodeDownloads: [
      {
        number: 1,
        volume: 2,
        title: "Capítulo Route",
        contentFormat: "lexical",
        releaseDate: "2026-02-10",
        duration: "Leitura",
        coverImageUrl: "/uploads/chapter-1.jpg",
        coverImageAlt: "Capítulo 1",
        sourceType: "Web",
        sources: [],
        progressStage: "",
        completedStages: [],
        chapterUpdatedAt: "2026-02-10T00:00:00.000Z",
        hasContent: true,
      },
    ],
    views: 0,
    viewsDaily: {},
  },
  chapter: {
    number: 1,
    volume: 2,
    title: "Capítulo Route",
    content: "<p>Conteudo de rota</p>",
    contentFormat: "lexical",
    releaseDate: "2026-02-10",
    duration: "Leitura",
    coverImageUrl: "/uploads/chapter-1.jpg",
    coverImageAlt: "Capítulo 1",
    sourceType: "Web",
    sources: [],
    progressStage: "",
    completedStages: [],
    chapterUpdatedAt: "2026-02-10T00:00:00.000Z",
    hasContent: true,
  },
  readerConfig: {},
  mediaVariants: {},
  tagTranslations: { tags: {}, genres: {}, staffRoles: {} },
} satisfies PublicRouteProjectReadingPayload;

describe("ProjectReading route payload", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(
      async (_apiBase: string, endpoint: string, options?: RequestInit) => {
        const method = String(options?.method || "GET").toUpperCase();
        if (endpoint === PUBLIC_ANALYTICS_INGEST_PATH && method === "POST") {
          return mockJsonResponse(true, { ok: true });
        }
        return mockJsonResponse(false, { error: "unexpected_request" }, 500);
      },
    );

    class MockIntersectionObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    }

    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver,
    });
  });

  afterEach(() => {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    Object.defineProperty(window, "IntersectionObserver", {
      configurable: true,
      writable: true,
      value: originalIntersectionObserver,
    });
  });

  it("renderiza o capitulo inicial sem buscar o endpoint do capitulo", () => {
    render(
      <PublicBootstrapProvider
        initialCurrentUser={null}
        initialPublicBootstrap={publicBootstrap}
        initialPublicRoutePayload={routePayload}
      >
        <MemoryRouter initialEntries={["/projeto/projeto-teste/leitura/1?volume=2"]}>
          <ProjectReading />
        </MemoryRouter>
      </PublicBootstrapProvider>,
    );

    expect(screen.getByRole("heading", { name: "Capítulo Route" })).toBeInTheDocument();
    expect(screen.getByText("Projeto Route")).toBeInTheDocument();
    expect(screen.getByTestId("lexical-viewer")).toBeInTheDocument();

    const calledEndpoints = apiFetchMock.mock.calls.map((call) => String(call[1] || ""));
    expect(calledEndpoints).not.toContain("/api/public/projects/projeto-teste/chapters/1?volume=2");
    expect(calledEndpoints).not.toContain("/api/public/projects/projeto-teste");
  });
});
