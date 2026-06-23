import { describe, expect, it } from "vitest";

import {
  resolvePostPageMeta,
  resolveProjectPageMeta,
} from "../../src-astro/lib/public-phase3-meta";

const baseInput = {
  fallbackOrigin: "https://nekomata.moe",
  publicBootstrap: null,
  siteSettings: {
    site: {
      defaultShareImage: "/share.png",
      defaultShareImageAlt: "Compartilhamento",
      description: "Descrição do site",
    },
  } as never,
};

describe("public phase 3 meta", () => {
  it("marks a missing project as non-indexable", () => {
    const meta = resolveProjectPageMeta({
      ...baseInput,
      pathname: "/projeto/inexistente",
      routePayload: null,
    });

    expect(meta.robots).toBe("noindex, nofollow");
    expect(meta.canonicalUrl).toBe("https://nekomata.moe/projeto/inexistente");
  });

  it("marks a resolved project as indexable", () => {
    const meta = resolveProjectPageMeta({
      ...baseInput,
      pathname: "/projeto/86864",
      routePayload: {
        kind: "project-detail",
        project: { id: "86864", title: "Gabriel Dropout" },
        revision: "revision",
      } as never,
    });

    expect(meta.robots).toBe("index, follow");
    expect(meta.title).toBe("Gabriel Dropout");
  });

  it("disambiguates projects with the same public title by type", () => {
    const meta = resolveProjectPageMeta({
      ...baseInput,
      pathname: "/projeto/86864",
      publicBootstrap: {
        projects: [
          { id: "86864", title: "Gabriel Dropout", type: "Mangá" },
          { id: "21878", title: "Gabriel Dropout", type: "Anime" },
        ],
      } as never,
      routePayload: {
        kind: "project-detail",
        project: { id: "86864", title: "Gabriel Dropout", type: "Mangá" },
        revision: "revision",
      } as never,
    });

    expect(meta.title).toBe("Gabriel Dropout (Mangá)");
  });

  it("marks a missing post as non-indexable", () => {
    const meta = resolvePostPageMeta({
      ...baseInput,
      pathname: "/postagem/inexistente",
    });

    expect(meta.robots).toBe("noindex, nofollow");
  });

  it("disambiguates posts with the same title by publication date", () => {
    const meta = resolvePostPageMeta({
      ...baseInput,
      pathname: "/postagem/love-live-superstar-01s",
      publicBootstrap: {
        currentPostDetail: {
          title: "Love Live! Superstar!! 01",
          publishedAt: "2026-02-08T20:12:31.425Z",
        },
        posts: [{ title: "Love Live! Superstar!! 01" }, { title: "Love Live! Superstar!! 01" }],
      } as never,
    });

    expect(meta.title).toBe("Love Live! Superstar!! 01 — 08/02/2026");
  });
});
