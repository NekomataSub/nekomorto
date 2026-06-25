import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import {
  createPublicSiteRuntime,
  PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
  PUBLIC_BOOTSTRAP_MODE_FULL,
  PUBLIC_BOOTSTRAP_MODE_SHELL,
} from "../../server/lib/public-site-runtime.js";

const createDeps = (overrides = {}) => ({
  bootstrapPwaEnabled: true,
  buildProjectOgRevision: () => "project-og-rev-1",
  buildPublicBootstrapPayload: (payload) => ({ ...payload }),
  buildPublicRoutePayload: (payload) => ({ ...payload }),
  buildPublicMediaVariants: () => ({ variants: true }),
  buildPublicPostDetail: ({ post, resolvePostCover }) => ({
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    author: post.author,
    publishedAt: post.publishedAt,
    coverImageUrl: resolvePostCover(post).coverImageUrl,
    coverAlt: resolvePostCover(post).coverAlt,
    projectId: post.projectId || "",
    tags: Array.isArray(post.tags) ? post.tags : [],
    views: Number(post.views || 0),
    commentsCount: Number(post.commentsCount || 0),
    content: post.content || "",
    contentFormat: post.contentFormat,
    seoTitle: post.seoTitle || null,
    seoDescription: post.seoDescription || null,
  }),
  buildPublicTeamMembers: () => [{ id: "team-1", avatarUrl: "/uploads/team-1.png" }],
  buildUserPayload: (user) => ({ ...user, built: true }),
  createGuid: () => "uuid-1",
  createSlug: (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-"),
  extractLocalStylesheetHrefs: () => ["/assets/app.css"],
  getPublicInProgressItems: () => [
    {
      projectId: "project-ln",
      projectTitle: "NouKin",
      projectType: "Light Novel",
      number: 3,
      volume: 0,
      entryKind: "main",
      displayLabel: "",
      progressStage: "traducao",
      completedStages: ["aguardando-raw"],
    },
  ],
  getPublicVisiblePosts: () => [
    {
      id: "post-1",
      slug: "hello-world",
      title: "Hello",
      excerpt: "Resumo",
      content: "<p>Conteudo</p>",
      contentFormat: "lexical",
      author: "Equipe",
      publishedAt: "2026-03-28T10:00:00.000Z",
      tags: ["noticia"],
      coverImageUrl: "/uploads/post.jpg",
      projectId: "project-1",
      views: 5,
      commentsCount: 2,
      seoTitle: "SEO Hello",
      seoDescription: "Resumo SEO",
    },
  ],
  getPublicVisibleProjects: () => [
    {
      id: "project-1",
      title: "Projeto",
      cover: "/uploads/project-cover.jpg",
      banner: "/uploads/project-banner.jpg",
      heroImageUrl: "/uploads/project-hero.jpg",
      heroLogoUrl: "/uploads/project-hero-logo.png",
      heroLogoAlt: "Marca oficial do Projeto",
      forceHero: true,
      updatedAt: "2026-03-28T11:00:00.000Z",
      episodeDownloads: [{ number: 5, volume: 1, coverImageUrl: "/uploads/chapter-5.jpg" }],
      volumeEntries: [{ volume: 1, coverImageUrl: "/uploads/volume-1.jpg" }],
      volumeCovers: [{ volume: 1, coverImageUrl: "/uploads/volume-cover-1.jpg" }],
    },
  ],
  getPublicVisibleUpdates: () => [
    {
      id: "update-1",
      projectId: "project-1",
      projectTitle: "Projeto",
      kind: "Lançamento",
      reason: "Capitulo novo",
      updatedAt: "2026-03-28T12:00:00.000Z",
      episodeNumber: 5,
      volume: 1,
      unit: "Capítulo",
    },
  ],
  injectBootstrapGlobals: ({ html, publicBootstrap, publicMe, pwaEnabled, skipPublicFetch }) =>
    `${html}|bootstrap:${publicBootstrap ? "yes" : "no"}|me:${publicMe ? "yes" : "no"}|pwa:${pwaEnabled ? "yes" : "no"}|skip:${skipPublicFetch ? "yes" : "no"}`,
  injectHomeHeroShell: ({ html, shellMarkup }) => `${html}|shell:${shellMarkup ? "yes" : "no"}`,
  injectPreloadLinks: ({ html, preloads }) => `${html}|preloads:${preloads.length}`,
  loadLinkTypes: () => [{ id: "site", label: "Site" }],
  loadPages: () => ({ home: { shareImage: "/uploads/home.jpg", shareImageAlt: "Home" } }),
  loadSiteSettings: () => ({
    updatedAt: "2026-03-28T09:00:00.000Z",
    site: { defaultShareImage: "/uploads/default-og.jpg" },
    theme: { accent: "#08D6FF", mode: "dark", useAccentInProgressCard: false },
  }),
  loadTagTranslations: () => ({ tags: {}, genres: {}, staffRoles: {} }),
  primaryAppOrigin: "https://example.com",
  resolveHomeHeroPreloadFromSlide: ({ imageUrl }) =>
    imageUrl ? { href: imageUrl, imagesrcset: `${imageUrl} 1x`, imagesizes: "100vw" } : null,
  resolveMetaImageVariantUrl: (value) => value,
  resolvePublicDonationsRoutePayload: async () => ({
    pixQrCodeUrl: "data:image/png;base64,pix",
    cryptoQrCodeUrls: { 0: "data:image/png;base64,btc" },
  }),
  resolvePostCover: (post) => ({
    coverImageUrl: post.coverImageUrl || "",
    coverAlt: "cover-alt",
  }),
  resolvePublicPostCoverPreload: ({ coverUrl }) =>
    coverUrl ? { href: coverUrl, as: "image" } : null,
  resolveProjectPosterPreload: ({ coverUrl, imagesizes }) =>
    coverUrl ? { href: coverUrl, imagesizes, as: "image" } : null,
  resolvePublicProjectsListPreloads: ({ projects }) =>
    Array.isArray(projects) && projects.length
      ? [{ href: "/uploads/project-hero.jpg", as: "image" }]
      : [],
  resolvePublicReaderHeroPreload: ({ imageUrl }) =>
    imageUrl ? { href: imageUrl, as: "image" } : null,
  resolveBootstrapPwaEnabled: undefined,
  resolvePublicRouteModulePreloads: (pathname) =>
    pathname === "/projetos"
      ? [{ rel: "modulepreload", href: "/assets/projects-route.js", crossorigin: "anonymous" }]
      : [],
  resolvePublicTeamAvatarPreload: ({ teamMembers }) =>
    Array.isArray(teamMembers) && teamMembers.length
      ? { href: "/uploads/team-1.png", as: "image" }
      : null,
  sitemapStaticPublicPaths: ["/", "/projetos"],
  stripHtml: (value) => {
    const dom = new JSDOM(`<body>${String(value || "")}</body>`);
    try {
      return String(dom.window.document.body.textContent || "");
    } finally {
      dom.window.close();
    }
  },
  ...overrides,
});

describe("public-site-runtime", () => {
  it("fails early when required dependencies are missing", () => {
    expect(() => createPublicSiteRuntime()).toThrow(/missing required dependencies/i);
  });

  it("builds sitemap and RSS items from public visibility inputs", () => {
    const runtime = createPublicSiteRuntime(createDeps());

    expect(runtime.buildPublicSitemapEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ loc: "https://example.com/" }),
        expect.objectContaining({ loc: "https://example.com/projeto/project-1" }),
        expect.objectContaining({ loc: "https://example.com/postagem/hello-world" }),
      ]),
    );
    expect(runtime.buildPostsRssItems()).toEqual([
      expect.objectContaining({
        link: "https://example.com/postagem/hello-world",
      }),
    ]);
    expect(runtime.buildLaunchesRssItems()).toEqual([
      expect.objectContaining({
        guid: "https://example.com/projeto/project-1#update-update-1",
      }),
    ]);
  });

  it("builds public bootstrap payloads and injects bootstrap HTML", async () => {
    const runtime = createPublicSiteRuntime(createDeps());

    const fullPayload = runtime.buildPublicBootstrapResponsePayload({
      payloadMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });
    const criticalPayload = runtime.buildPublicBootstrapResponsePayload({
      payloadMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });

    expect(fullPayload.payloadMode).toBe("full");
    expect(fullPayload.mediaVariants).toEqual({ variants: true });
    expect(fullPayload.homeHero).toEqual(
      expect.objectContaining({
        initialSlideId: "project-1",
        latestSlideId: "project-1",
        slides: [
          expect.objectContaining({
            heroLogoUrl: "/uploads/project-hero-logo.png",
            heroLogoAlt: "Marca oficial do Projeto",
          }),
        ],
      }),
    );
    expect(fullPayload.inProgressItems).toEqual([
      expect.objectContaining({
        projectId: "project-ln",
        projectTitle: "NouKin",
        projectType: "Light Novel",
        number: 3,
        volume: 0,
      }),
    ]);
    expect(fullPayload.currentPostDetail).toBeNull();
    expect(criticalPayload.payloadMode).toBe("critical-home");
    expect(criticalPayload.settings).toEqual({
      theme: {
        accent: "#08D6FF",
        mode: "dark",
        useAccentInProgressCard: false,
      },
    });
    expect(Array.isArray(criticalPayload.projects)).toBe(true);
    expect(criticalPayload.inProgressItems).toEqual(fullPayload.inProgressItems);
    expect(criticalPayload.homeHero).toEqual(
      expect.objectContaining({
        slides: [
          expect.objectContaining({
            id: "project-1",
            title: "Projeto",
            heroLogoUrl: "/uploads/project-hero-logo.png",
            heroLogoAlt: "Marca oficial do Projeto",
          }),
        ],
      }),
    );
    const shellPayload = runtime.buildPublicBootstrapResponsePayload({
      payloadMode: PUBLIC_BOOTSTRAP_MODE_SHELL,
    });
    expect(shellPayload.payloadMode).toBe("full");

    const publicHtml = await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/",
        session: { user: { id: "user-1" } },
      },
      settings: {},
      pages: {},
      includeHeroImagePreload: true,
      includeProjectsImagePreloads: true,
      includeHomeHeroShell: true,
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });
    const dashboardHtml = runtime.injectDashboardBootstrapHtml({
      html: "<html></html>",
      req: {
        session: { user: { id: "user-1" } },
      },
      settings: {},
    });

    expect(publicHtml).toContain("bootstrap:yes");
    expect(publicHtml).toContain("pwa:no");
    expect(publicHtml).toContain("preloads:2");
    expect(publicHtml).toContain("shell:yes");
    expect(dashboardHtml).toContain("bootstrap:no");
    expect(dashboardHtml).toContain("pwa:no");
    expect(dashboardHtml).toContain("skip:yes");
  });

  it("injects a resolved astro document bootstrap without recomputing the payload", async () => {
    let capturedBootstrap = null;
    let capturedRoutePayload = null;
    const runtime = createPublicSiteRuntime(
      createDeps({
        injectBootstrapGlobals: ({ html, publicBootstrap, publicRoutePayload }) => {
          capturedBootstrap = publicBootstrap ?? null;
          capturedRoutePayload = publicRoutePayload ?? null;
          return `${html}|route:${publicRoutePayload?.kind || "none"}`;
        },
      }),
    );

    const publicBootstrap = runtime.buildPublicBootstrapResponsePayload({
      payloadMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });
    const providedRoutePayload = {
      kind: "team",
      generatedAt: "2026-05-17T00:00:00.000Z",
      teamMembers: [],
    };

    const result = await runtime.injectResolvedPublicDocumentHtml({
      html: '<html><head><link rel="stylesheet" href="/assets/app.css"></head></html>',
      pathname: "/equipe",
      publicBootstrap,
      publicMe: { id: "user-1" },
      publicRoutePayload: providedRoutePayload,
      settings: {},
    });

    expect(result.html).toContain("route:team");
    expect(result.html).toContain("preloads:2");
    expect(capturedBootstrap).toBe(publicBootstrap);
    expect(capturedRoutePayload).toEqual(
      expect.objectContaining({
        kind: "team",
        teamMembers: [expect.objectContaining({ id: "team-1" })],
        teamLinkTypes: [expect.objectContaining({ id: "site" })],
      }),
    );
  });

  it("injects a crawlable seo snapshot for indexable public pages", async () => {
    const runtime = createPublicSiteRuntime(
      createDeps({
        loadPages: () => ({
          about: {
            heroTitle: "",
            heroSubtitle: "",
            highlights: [],
            manifestoParagraphs: [],
            pillars: [],
            values: [],
          },
          faq: {
            heroTitle: "",
            heroSubtitle: "",
            introCards: [],
            groups: [],
          },
          recruitment: {
            heroTitle: "",
            heroSubtitle: "",
            roles: [],
            ctaTitle: "",
            ctaSubtitle: "",
            ctaButtonLabel: "",
          },
        }),
      }),
    );

    const html = await runtime.injectPublicBootstrapHtml({
      html: '<html><body><div id="root"></div></body></html>',
      req: {
        path: "/faq",
      },
      settings: {},
      pages: {},
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });

    expect(html).toContain('id="seo-snapshot"');
    expect(html).toContain("<main>");
    expect(html).toContain("<h1>Perguntas frequentes</h1>");
    expect(html).toContain('href="/sobre"');
  });

  it("does not inject an seo snapshot for noindex reading routes", async () => {
    const runtime = createPublicSiteRuntime(createDeps());

    const html = await runtime.injectPublicBootstrapHtml({
      html: '<html><body><div id="root"></div></body></html>',
      req: {
        path: "/projeto/project-1/leitura/5",
        params: { id: "project-1", chapter: "5" },
      },
      settings: {},
      pages: {},
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });

    expect(html).not.toContain('id="seo-snapshot"');
  });

  it("inclui currentPostDetail apenas na rota pública de post", async () => {
    let capturedPublicBootstrap: { currentPostDetail?: unknown } | null = null;
    const runtime = createPublicSiteRuntime(
      createDeps({
        injectBootstrapGlobals: ({ html, publicBootstrap }) => {
          capturedPublicBootstrap =
            (publicBootstrap as { currentPostDetail?: unknown } | null | undefined) || null;
          return html;
        },
      }),
    );

    await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/postagem/hello-world",
        params: { slug: "hello-world" },
      },
      settings: {},
      pages: {},
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });

    const routePostBootstrap = capturedPublicBootstrap as unknown as {
      currentPostDetail?: unknown;
    };
    expect(routePostBootstrap).not.toBeNull();
    expect(routePostBootstrap.currentPostDetail).toEqual(
      expect.objectContaining({
        slug: "hello-world",
        content: "<p>Conteudo</p>",
        seoTitle: "SEO Hello",
      }),
    );

    await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/projetos",
      },
      settings: {},
      pages: {},
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_FULL,
    });

    const projectsBootstrap = capturedPublicBootstrap as unknown as {
      currentPostDetail?: unknown;
    };
    expect(projectsBootstrap).not.toBeNull();
    expect(projectsBootstrap.currentPostDetail).toBeNull();
  });

  it("injeta bootstrap shell, payload de rota e modulepreload nas rotas públicas internas", async () => {
    let capturedPublicBootstrap: { payloadMode?: string } | null = null;
    let capturedRoutePayload: { kind?: string; projects?: unknown[] } | null = null;
    let capturedPreloads: Array<{ href?: string; rel?: string; as?: string }> = [];
    const runtime = createPublicSiteRuntime(
      createDeps({
        injectBootstrapGlobals: ({ html, publicBootstrap, publicRoutePayload }) => {
          capturedPublicBootstrap =
            (publicBootstrap as { payloadMode?: string } | null | undefined) || null;
          capturedRoutePayload =
            (publicRoutePayload as { kind?: string; projects?: unknown[] } | null | undefined) ||
            null;
          return html;
        },
        injectPreloadLinks: ({ html, preloads }) => {
          capturedPreloads = preloads as Array<{ href?: string; rel?: string; as?: string }>;
          return html;
        },
      }),
    );

    await runtime.injectPublicBootstrapHtml({
      html: '<html><head><link rel="stylesheet" href="/assets/app.css"></head></html>',
      req: {
        path: "/projetos",
      },
      settings: {},
      pages: {},
      includeProjectsImagePreloads: true,
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_SHELL,
    });

    expect(capturedPublicBootstrap).toEqual(
      expect.objectContaining({
        payloadMode: "shell",
      }),
    );
    expect(capturedRoutePayload).toEqual(
      expect.objectContaining({
        kind: "projects-list",
        projects: [expect.objectContaining({ id: "project-1" })],
      }),
    );
    expect(capturedPreloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rel: "modulepreload",
          href: "/assets/projects-route.js",
        }),
        expect.objectContaining({
          as: "style",
          href: "/assets/app.css",
        }),
        expect.objectContaining({
          as: "image",
          href: "/uploads/project-hero.jpg",
        }),
      ]),
    );
  });

  it("skips home hero preload when the static home hero shell is enabled", async () => {
    const runtime = createPublicSiteRuntime(createDeps());

    const withShell = await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/",
      },
      settings: {},
      pages: {},
      includeHeroImagePreload: true,
      includeProjectsImagePreloads: false,
      includeHomeHeroShell: true,
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });
    const withoutShell = await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/",
      },
      settings: {},
      pages: {},
      includeHeroImagePreload: true,
      includeProjectsImagePreloads: false,
      includeHomeHeroShell: false,
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });

    expect(withShell).toContain("preloads:1");
    expect(withoutShell).toContain("preloads:2");
  });

  it("keeps the bootstrap pwa flag disabled even when legacy pwa deps are present", async () => {
    const runtime = createPublicSiteRuntime(
      createDeps({
        bootstrapPwaEnabled: undefined,
        resolveBootstrapPwaEnabled: (req) => String(req?.hostname || "") === "localhost",
      }),
    );

    const publicHtml = await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        hostname: "dev.nekomata.moe",
        path: "/",
      },
      settings: {},
      pages: {},
    });
    const dashboardHtml = runtime.injectDashboardBootstrapHtml({
      html: "<html></html>",
      req: {
        hostname: "localhost",
      },
      settings: {},
    });

    expect(publicHtml).toContain("pwa:no");
    expect(dashboardHtml).toContain("pwa:no");
  });

  it("builds the home hero shell using only the initial hero image", async () => {
    let capturedShellMarkup = "";
    let capturedCriticalCss = "";
    const runtime = createPublicSiteRuntime(
      createDeps({
        injectHomeHeroShell: ({ html, shellMarkup, criticalCss }) => {
          capturedShellMarkup = shellMarkup;
          capturedCriticalCss = String(criticalCss || "");
          return html;
        },
      }),
    );

    await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/",
      },
      settings: {},
      pages: {},
      includeHomeHeroShell: true,
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });

    expect(capturedShellMarkup).toContain(
      'class="public-home-hero-shell public-home-hero-viewport"',
    );
    expect(capturedShellMarkup).toContain('class="public-home-hero-shell__image"');
    expect(capturedShellMarkup).toContain("public-home-hero-shell__overlay--highlight");
    expect(capturedShellMarkup).toContain("public-home-hero-shell__overlay--directional");
    expect(capturedShellMarkup).toContain("public-home-hero-shell__overlay--bottom");
    expect(capturedShellMarkup).toContain('class="public-home-hero-shell__navbar-overlay"');
    expect(capturedShellMarkup).toContain("/uploads/project-hero.jpg");
    expect(capturedShellMarkup).not.toContain("public-home-hero-shell__veil");
    expect(capturedShellMarkup).not.toContain("public-home-hero-shell__header");
    expect(capturedShellMarkup).not.toContain("public-home-hero-shell__content-wrap");
    expect(capturedShellMarkup).not.toContain("public-home-hero-shell__controls");
    expect(capturedCriticalCss).toContain(".public-home-hero-shell");
    expect(capturedCriticalCss).toContain(".public-home-hero-shell__image");
    expect(capturedCriticalCss).toContain("opacity: 0;");
    expect(capturedCriticalCss).toContain(".public-home-hero-shell__overlay--directional");
    expect(capturedCriticalCss).toContain(".public-home-hero-shell__overlay--bottom");
    expect(capturedCriticalCss).toContain(".public-home-hero-shell__navbar-overlay");
    expect(capturedCriticalCss).not.toContain("78svh");
    expect(capturedCriticalCss).not.toContain("@font-face");
    expect(capturedCriticalCss).not.toContain("public-home-hero-shell__header");
  });

  it("keeps the image-only shell even when a user session exists", async () => {
    let capturedShellMarkup = "";
    const runtime = createPublicSiteRuntime(
      createDeps({
        injectHomeHeroShell: ({ html, shellMarkup }) => {
          capturedShellMarkup = shellMarkup;
          return html;
        },
      }),
    );

    await runtime.injectPublicBootstrapHtml({
      html: "<html></html>",
      req: {
        path: "/",
        session: {
          user: {
            id: "user-1",
            name: "José Gabriel",
            avatarUrl: "/uploads/jose-avatar.png",
            revision: 7,
          },
        },
      },
      settings: {},
      pages: {},
      includeHomeHeroShell: true,
      bootstrapMode: PUBLIC_BOOTSTRAP_MODE_CRITICAL_HOME,
    });

    expect(capturedShellMarkup).toContain('class="public-home-hero-shell__image"');
    expect(capturedShellMarkup).toContain("public-home-hero-shell__overlay--directional");
    expect(capturedShellMarkup).toContain("/uploads/project-hero.jpg");
    expect(capturedShellMarkup).not.toContain("José Gabriel");
    expect(capturedShellMarkup).not.toContain("public-home-hero-shell__user-button");
  });
});
