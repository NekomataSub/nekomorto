import { describe, expect, it } from "vitest";

import {
  extractLocalStylesheetHrefs,
  injectBootstrapGlobals,
  injectHomeHeroShell,
  injectPreloadLinks,
} from "../../server/lib/html-bootstrap.js";
import {
  resolvePublicPostCoverPreload,
  resolvePublicReaderHeroPreload,
} from "../../server/lib/public-media-variants.js";

describe("html bootstrap injection", () => {
  it("injeta bootstrap publico/settings com bootstrap-init inline e preload critico", () => {
    const baseHtml =
      "<!doctype html><html><head><!-- APP_PRELOADS --><!-- APP_BOOTSTRAP --></head><body></body></html>";
    const withBootstrap = injectBootstrapGlobals({
      html: baseHtml,
      publicBootstrap: {
        settings: { site: { name: "Nekomata" } },
        projects: [],
        posts: [],
      },
      settings: { site: { name: "Nekomata" } },
      publicMe: {
        id: "user-1",
        name: "Admin",
      },
    });
    const result = injectPreloadLinks({
      html: withBootstrap,
      preloads: [
        {
          href: "/uploads/_variants/hero-v1.avif",
          as: "image",
          type: "image/avif",
          imagesrcset:
            "/uploads/_variants/heroSm-v1.avif 960w, /uploads/_variants/heroMd-v1.avif 1280w, /uploads/_variants/hero-v1.avif 1600w",
          imagesizes: "100vw",
          fetchpriority: "high",
        },
      ],
    });

    expect(result).toContain('type="application/json" id="nekomata-bootstrap-public"');
    expect(result).toContain('type="application/json" id="nekomata-bootstrap-route"');
    expect(result).toContain('type="application/json" id="nekomata-bootstrap-settings"');
    expect(result).toContain('type="application/json" id="nekomata-bootstrap-public-me"');
    expect(result).toContain('type="application/json" id="nekomata-bootstrap-pwa-enabled"');
    expect(result).toContain('type="application/json" id="nekomata-bootstrap-skip-public-fetch"');
    expect(result).toContain("readSerializedBootstrapValue('nekomata-bootstrap-public'");
    expect(result).toContain("window.__BOOTSTRAP_PWA_ENABLED__");
    expect(result).toContain("window.__BOOTSTRAP_SKIP_PUBLIC_FETCH__");
    expect(result).toContain("window.__BOOTSTRAP_PUBLIC_PROMISE__");
    expect(result).toContain("normalizeThemeColor");
    expect(result).toContain("meta.setAttribute('content', normalizeThemeColor(accentHex));");
    expect(result).toContain("root.style.setProperty('--primary', primaryValue);");
    expect(result).toContain("root.style.setProperty('--accent', accentValue);");
    expect(result).not.toContain("resolveThemeColorSection");
    expect(result).not.toContain("THEME_COLOR_OFFSETS");
    expect(result).not.toContain("applyThemeColor(window.location.pathname");
    expect(result).toContain("fetch('/api/public/bootstrap'");
    expect(result).toContain('rel="preload"');
    expect(result).toContain('href="/uploads/_variants/hero-v1.avif"');
    expect(result).toContain('as="image"');
    expect(result).toContain('type="image/avif"');
    expect(result).toContain(
      'imagesrcset="/uploads/_variants/heroSm-v1.avif 960w, /uploads/_variants/heroMd-v1.avif 1280w, /uploads/_variants/hero-v1.avif 1600w"',
    );
    expect(result).toContain('imagesizes="100vw"');
    expect(result).toContain('fetchpriority="high"');
  });

  it("extrai apenas hrefs locais de stylesheet para preload", () => {
    const html =
      '<html><head><link rel="stylesheet" href="/assets/index-abc.css"><link rel="preload" href="/assets/other.css" as="style"><link href="/assets/theme-def.css" rel="stylesheet"><link rel="stylesheet" href="https://cdn.exemplo.com/site.css"></head></html>';

    expect(extractLocalStylesheetHrefs(html)).toEqual([
      "/assets/index-abc.css",
      "/assets/theme-def.css",
    ]);
  });

  it("deduplica preload por href+as e preserva atributos opcionais", () => {
    const result = injectPreloadLinks({
      html: "<html><head><!-- APP_PRELOADS --></head></html>",
      preloads: [
        { href: "/assets/index-abc.css", as: "style", crossorigin: "anonymous" },
        { href: "/assets/index-abc.css", as: "style", crossorigin: "anonymous" },
        {
          href: "/uploads/hero.avif",
          as: "image",
          type: "image/avif",
          imagesrcset: "/uploads/hero-sm.avif 960w, /uploads/hero.avif 1600w",
          imagesizes: "100vw",
          fetchpriority: "high",
          media: "(min-width: 768px)",
        },
      ],
    });

    expect((result.match(/href="\/assets\/index-abc\.css"/g) || []).length).toBe(1);
    expect(result).toContain('as="style"');
    expect(result).toContain('crossorigin="anonymous"');
    expect(result).toContain('href="/uploads/hero.avif"');
    expect(result).toContain('type="image/avif"');
    expect(result).toContain('imagesrcset="/uploads/hero-sm.avif 960w, /uploads/hero.avif 1600w"');
    expect(result).toContain('imagesizes="100vw"');
    expect(result).toContain('fetchpriority="high"');
    expect(result).toContain('media="(min-width: 768px)"');
  });

  it("injeta somente script inline no marker de bootstrap", () => {
    const result = injectBootstrapGlobals({
      html: "<!doctype html><html><head><!-- APP_BOOTSTRAP --></head><body></body></html>",
      publicBootstrap: {
        settings: {},
        projects: [],
        posts: [],
      },
      settings: {},
      publicMe: null,
    });

    expect(result).toContain('<script type="application/json" id="nekomata-bootstrap-public">');
    expect(result).toContain("<script>");
    expect(result).not.toContain('<script src="/bootstrap-init.js"></script>');
    expect(result).toContain("readSerializedBootstrapValue('nekomata-bootstrap-public'");
  });

  it("permite bootstrap leve sem fetch publico inicial", () => {
    const result = injectBootstrapGlobals({
      html: "<!doctype html><html><head><!-- APP_BOOTSTRAP --></head><body></body></html>",
      publicBootstrap: null,
      publicRoutePayload: {
        kind: "donations",
        generatedAt: "2026-05-12T12:00:00.000Z",
        pixQrCodeUrl: "data:image/png;base64,pix",
        cryptoQrCodeUrls: {},
      },
      settings: { site: { name: "Nekomata" } },
      publicMe: { id: "user-1", name: "Admin" },
      pwaEnabled: true,
      skipPublicFetch: true,
    });

    expect(result).toContain('<script type="application/json" id="nekomata-bootstrap-public">');
    expect(result).toContain("\nnull\n</script>");
    expect(result).toContain('id="nekomata-bootstrap-route"');
    expect(result).toContain('"kind":"donations"');
    expect(result).toContain('id="nekomata-bootstrap-settings"');
    expect(result).toContain('id="nekomata-bootstrap-public-me"');
    expect(result).toContain('id="nekomata-bootstrap-pwa-enabled"');
    expect(result).toContain("\ntrue\n</script>");
    expect(result).toContain('id="nekomata-bootstrap-skip-public-fetch"');
    expect(result).toContain("window.__BOOTSTRAP_PUBLIC_PROMISE__");
    expect(result).toContain("fetch('/api/public/bootstrap'");
  });

  it("escapa payload inline para nao quebrar o HTML", () => {
    const result = injectBootstrapGlobals({
      html: "<html><head><!-- APP_BOOTSTRAP --></head></html>",
      publicBootstrap: {
        settings: {},
        projects: [{ title: "</script><script>alert(1)</script>" }],
        posts: [],
      },
      publicRoutePayload: {
        kind: "projects-list",
        generatedAt: "2026-05-12T12:00:00.000Z",
        projects: [{ title: "</script><script>alert(3)</script>" }],
        tagTranslations: {
          tags: {},
          genres: {},
          staffRoles: {},
        },
        mediaVariants: {},
      },
      settings: {},
      publicMe: { id: "user-1", name: "</script><script>alert(2)</script>" },
    });

    expect(result).not.toContain("</script><script>alert(1)</script>");
    expect(result).not.toContain("</script><script>alert(2)</script>");
    expect(result).not.toContain("</script><script>alert(3)</script>");
    expect(result).toContain("\\u003C/script\\u003E");
  });

  it("suporta rel modulepreload sem atributo as", () => {
    const result = injectPreloadLinks({
      html: "<html><head><!-- APP_PRELOADS --></head></html>",
      preloads: [
        {
          rel: "modulepreload",
          href: "/assets/projects-route.js",
          crossorigin: "anonymous",
        },
      ],
    });

    expect(result).toContain('rel="modulepreload"');
    expect(result).toContain('href="/assets/projects-route.js"');
    expect(result).toContain('crossorigin="anonymous"');
    expect(result).not.toContain('as="fetch"');
  });

  it("injeta shell estatico da home no marcador dedicado", () => {
    const result = injectHomeHeroShell({
      html: '<!doctype html><html><head></head><body><!-- APP_HOME_HERO_SHELL --><div id="root"></div></body></html>',
      shellMarkup: '<div id="home-hero-shell"></div>',
      criticalCss: ".public-home-hero-shell{opacity:1;}",
    });

    expect(result).toContain("<!-- APP_HOME_HERO_SHELL -->");
    expect(result).toContain('<div id="home-hero-shell"></div>');
    expect(result).toContain("<style data-home-hero-shell-critical>");
    expect(result).toContain(".public-home-hero-shell{opacity:1;}");
  });

  it("gera preload do LCP da postagem no HTML", () => {
    const preload = resolvePublicPostCoverPreload({
      coverUrl: "/uploads/posts/post-1-cover.jpg",
      mediaVariants: {
        "/uploads/posts/post-1-cover.jpg": {
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
      resolveVariantUrl: () => "",
    });

    const result = injectPreloadLinks({
      html: "<!doctype html><html><head><!-- APP_PRELOADS --></head><body></body></html>",
      preloads: preload ? [preload] : [],
    });

    expect(result).toContain('href="/uploads/_variants/post-1/card-v1.jpeg"');
    expect(result).toContain('as="image"');
    expect(result).toContain('fetchpriority="high"');
  });

  it("gera preload responsivo da hero de leitura no HTML", () => {
    const preload = resolvePublicReaderHeroPreload({
      imageUrl: "/uploads/projects/project-1/hero.jpg",
      mediaVariants: {
        "/uploads/projects/project-1/hero.jpg": {
          variantsVersion: 1,
          variants: {
            heroSm: {
              width: 960,
              height: 540,
              formats: {
                avif: { url: "/uploads/_variants/project-1/heroSm-v1.avif" },
              },
            },
            hero: {
              width: 1600,
              height: 900,
              formats: {
                avif: { url: "/uploads/_variants/project-1/hero-v1.avif" },
              },
            },
          },
        },
      },
      resolveVariantUrl: () => "",
    });

    const result = injectPreloadLinks({
      html: "<!doctype html><html><head><!-- APP_PRELOADS --></head><body></body></html>",
      preloads: preload ? [preload] : [],
    });

    expect(result).toContain('href="/uploads/_variants/project-1/hero-v1.avif"');
    expect(result).toContain('type="image/avif"');
    expect(result).toContain(
      'imagesrcset="/uploads/_variants/project-1/heroSm-v1.avif 960w, /uploads/_variants/project-1/hero-v1.avif 1600w"',
    );
    expect(result).toContain('imagesizes="100vw"');
    expect(result).toContain('fetchpriority="high"');
  });
});
