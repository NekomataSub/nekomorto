import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetchMock = vi.hoisted(() => vi.fn());
const postRouteImportMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock("@/lib/browser-idle", () => ({
  scheduleOnBrowserLoadIdle: (callback: (deadline: IdleDeadline) => void) => {
    callback({
      didTimeout: false,
      timeRemaining: () => 0,
    } as IdleDeadline);
    return () => undefined;
  },
}));

vi.mock("@/pages/Post", () => {
  postRouteImportMock();
  return { default: () => null };
});

import {
  clearPublicRoutePreloadCacheForTests,
  peekPreloadedPublicRoutePayload,
  preloadPublicRoute,
  schedulePublicRouteIdlePreload,
} from "@/routes/public-preload";

const mockJsonResponse = (ok: boolean, payload: unknown, status = ok ? 200 : 500) =>
  ({
    ok,
    status,
    json: async () => payload,
  }) as Response;

describe("preloadPublicRoute", () => {
  beforeEach(() => {
    clearPublicRoutePreloadCacheForTests();
    apiFetchMock.mockReset();
    postRouteImportMock.mockClear();
    (window as Window & { __BOOTSTRAP_PUBLIC__?: unknown }).__BOOTSTRAP_PUBLIC__ = {
      settings: {},
      pages: {},
      projects: [
        {
          id: "project-2",
          title: "Projeto Seguinte",
          synopsis: "",
          description: "",
          type: "Anime",
          status: "Em andamento",
          year: "2026",
          tags: [],
          genres: [],
          cover: "/uploads/project-next-cover.jpg",
          coverAlt: "",
          banner: "/uploads/project-next-banner.jpg",
          bannerAlt: "",
          season: "",
          schedule: "",
          rating: "",
          country: "",
          source: "",
          heroImageUrl: "",
          heroImageAlt: "",
          heroLogoUrl: "",
          heroLogoAlt: "",
          forceHero: false,
          trailerUrl: "",
          studio: "",
          animationStudios: [],
          episodes: "",
          producers: [],
          score: null,
          startDate: "",
          endDate: "",
          staff: [],
          animeStaff: [],
          relations: [],
          volumeEntries: [],
          volumeCovers: [],
          episodeDownloads: [],
          views: 0,
          viewsDaily: {},
          commentsCount: 0,
        },
      ],
      inProgressItems: [],
      posts: [],
      updates: [],
      teamMembers: [],
      teamLinkTypes: [],
      mediaVariants: {},
      tagTranslations: {
        tags: {},
        genres: {},
        staffRoles: {},
      },
      generatedAt: "2026-05-19T01:30:00.000Z",
      payloadMode: "full",
    };
  });

  it("does not inject document prefetch links for public routes", async () => {
    const initialLinkCount = document.head.querySelectorAll('link[rel="prefetch"]').length;

    await preloadPublicRoute("/postagem/exemplo");

    expect(document.head.querySelectorAll('link[rel="prefetch"]').length).toBe(initialLinkCount);
  });

  it("ignores invalid paths", async () => {
    const initialLinkCount = document.head.querySelectorAll('link[rel="prefetch"]').length;

    await preloadPublicRoute("https://example.com/fora");

    expect(document.head.querySelectorAll('link[rel="prefetch"]').length).toBe(initialLinkCount);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it("prefetches and caches project detail payloads", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockJsonResponse(true, {
        project: {
          id: "project-2",
          title: "Projeto Seguinte",
          synopsis: "Sinopse seguinte",
          description: "Descricao seguinte",
          type: "Anime",
          status: "Em andamento",
          year: "2026",
          tags: [],
          genres: [],
          cover: "/uploads/project-next-cover.jpg",
          coverAlt: "",
          banner: "/uploads/project-next-banner.jpg",
          bannerAlt: "",
          season: "",
          schedule: "",
          rating: "",
          country: "",
          source: "",
          heroImageUrl: "",
          heroImageAlt: "",
          heroLogoUrl: "",
          heroLogoAlt: "",
          forceHero: false,
          trailerUrl: "",
          studio: "",
          animationStudios: [],
          episodes: "",
          producers: [],
          score: null,
          startDate: "",
          endDate: "",
          staff: [],
          animeStaff: [],
          relations: [],
          volumeEntries: [],
          volumeCovers: [],
          episodeDownloads: [],
          views: 0,
          viewsDaily: {},
          commentsCount: 0,
        },
        revision: "revision-project-2",
        mediaVariants: {},
        translations: {
          tags: {},
          genres: {},
          staffRoles: {},
        },
      }),
    );

    const payload = await preloadPublicRoute("/projeto/project-2");

    expect(apiFetchMock).toHaveBeenCalledWith("", "/api/public/projects/project-2", {
      cache: "force-cache",
    });
    expect(payload).toMatchObject({
      kind: "project-detail",
      revision: "revision-project-2",
    });
    expect(peekPreloadedPublicRoutePayload("/projeto/project-2")).toMatchObject({
      kind: "project-detail",
      revision: "revision-project-2",
    });

    await preloadPublicRoute("/projeto/project-2");

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("schedules idle preloads once per path", async () => {
    apiFetchMock.mockResolvedValue(
      mockJsonResponse(true, {
        project: {
          id: "project-2",
          title: "Projeto Seguinte",
          synopsis: "Sinopse seguinte",
          description: "Descricao seguinte",
          type: "Anime",
          status: "Em andamento",
          year: "2026",
          tags: [],
          genres: [],
          cover: "/uploads/project-next-cover.jpg",
          coverAlt: "",
          banner: "/uploads/project-next-banner.jpg",
          bannerAlt: "",
          season: "",
          schedule: "",
          rating: "",
          country: "",
          source: "",
          heroImageUrl: "",
          heroImageAlt: "",
          heroLogoUrl: "",
          heroLogoAlt: "",
          forceHero: false,
          trailerUrl: "",
          studio: "",
          animationStudios: [],
          episodes: "",
          producers: [],
          score: null,
          startDate: "",
          endDate: "",
          staff: [],
          animeStaff: [],
          relations: [],
          volumeEntries: [],
          volumeCovers: [],
          episodeDownloads: [],
          views: 0,
          viewsDaily: {},
          commentsCount: 0,
        },
        revision: "revision-project-2",
        mediaVariants: {},
        translations: {
          tags: {},
          genres: {},
          staffRoles: {},
        },
      }),
    );

    schedulePublicRouteIdlePreload(["/projeto/project-2", "/projeto/project-2"], {
      delayMs: 0,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith("", "/api/public/projects/project-2", {
      cache: "force-cache",
    });
  });

  it("keeps idle preloads payload-only so route code waits for user intent", async () => {
    apiFetchMock.mockResolvedValueOnce(
      mockJsonResponse(true, {
        post: {
          id: "post-1",
          slug: "exemplo",
          title: "Post exemplo",
          coverImageUrl: "/uploads/post.jpg",
        },
      }),
    );

    schedulePublicRouteIdlePreload(["/postagem/exemplo"], {
      delayMs: 0,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(apiFetchMock).toHaveBeenCalledWith("", "/api/public/posts/exemplo", {
      cache: "force-cache",
    });
    expect(postRouteImportMock).not.toHaveBeenCalled();
  });
});
