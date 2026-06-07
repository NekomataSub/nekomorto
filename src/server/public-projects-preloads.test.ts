import { describe, expect, it } from "vitest";

import {
  DESKTOP_PROJECTS_PRELOAD_MEDIA,
  PROJECTS_LIST_IMAGE_SIZES,
  resolvePublicProjectsListPreloads,
} from "../../server/lib/public-projects-preloads.js";

const EXPECTED_PROJECTS_LIST_IMAGE_SIZES = "(max-width: 767px) 129px, 154px";

describe("public projects list preloads", () => {
  it("ordena os projetos da listagem e pre-carrega as seis primeiras capas", () => {
    const projects = [
      { title: "Zeta", cover: "/uploads/projects/zeta.png" },
      { title: "Alpha", cover: "/uploads/projects/alpha.png" },
      { title: "Beta", cover: "/uploads/projects/beta.png" },
      { title: "Delta", cover: "/uploads/projects/delta.png" },
      { title: "Gamma", cover: "/uploads/projects/gamma.png" },
      { title: "Epsilon", cover: "/uploads/projects/epsilon.png" },
      { title: "Eta", cover: "/uploads/projects/eta.png" },
    ];
    const mediaVariants = Object.fromEntries(
      ["alpha", "beta", "delta", "epsilon", "eta", "gamma", "zeta"].map((slug) => [
        `/uploads/projects/${slug}.png`,
        {
          variantsVersion: 3,
          variants: {
            posterThumb: {
              width: 320,
              formats: {
                avif: { url: `/uploads/_variants/${slug}/poster-thumb-v3.avif` },
                fallback: { url: `/uploads/_variants/${slug}/poster-thumb-v3.jpeg` },
              },
            },
            poster: {
              width: 920,
              formats: {
                avif: { url: `/uploads/_variants/${slug}/poster-v3.avif` },
                fallback: { url: `/uploads/_variants/${slug}/poster-v3.jpeg` },
              },
            },
          },
        },
      ]),
    );

    const preloads = resolvePublicProjectsListPreloads({
      projects,
      mediaVariants,
      resolveVariantUrl: () => "",
    });

    expect(PROJECTS_LIST_IMAGE_SIZES).toBe(EXPECTED_PROJECTS_LIST_IMAGE_SIZES);
    expect(preloads).toHaveLength(6);
    expect(preloads[0]).toEqual(
      expect.objectContaining({
        href: "/uploads/_variants/alpha/poster-thumb-v3.jpeg",
        as: "image",
        type: "image/avif",
        imagesizes: EXPECTED_PROJECTS_LIST_IMAGE_SIZES,
        imagesrcset: expect.stringContaining("/uploads/_variants/alpha/poster-thumb-v3.avif 320w"),
        fetchpriority: "high",
      }),
    );
    expect(preloads[0]).not.toHaveProperty("media");
    expect(preloads[0]?.imagesrcset).toContain("/uploads/_variants/alpha/poster-v3.avif 920w");
    expect(preloads[1]).toEqual(
      expect.objectContaining({
        href: "/uploads/_variants/beta/poster-thumb-v3.jpeg",
        fetchpriority: "high",
        media: DESKTOP_PROJECTS_PRELOAD_MEDIA,
      }),
    );
    expect(preloads[2]).toEqual(
      expect.objectContaining({
        href: "/uploads/_variants/delta/poster-thumb-v3.jpeg",
        fetchpriority: "high",
        media: DESKTOP_PROJECTS_PRELOAD_MEDIA,
      }),
    );
    expect(preloads[3]).toEqual(
      expect.objectContaining({
        href: "/uploads/_variants/epsilon/poster-thumb-v3.jpeg",
        fetchpriority: "high",
        media: DESKTOP_PROJECTS_PRELOAD_MEDIA,
      }),
    );
    expect(preloads[4]).toEqual(
      expect.objectContaining({
        href: "/uploads/_variants/eta/poster-thumb-v3.jpeg",
        fetchpriority: "high",
        media: DESKTOP_PROJECTS_PRELOAD_MEDIA,
      }),
    );
    expect(preloads[5]).toEqual(
      expect.objectContaining({
        href: "/uploads/_variants/gamma/poster-thumb-v3.jpeg",
        fetchpriority: "high",
        media: DESKTOP_PROJECTS_PRELOAD_MEDIA,
      }),
    );
  });

  it("nao emite preload quando a unica opcao seria a imagem original", () => {
    const preloads = resolvePublicProjectsListPreloads({
      projects: [{ title: "Original pesado", cover: "/uploads/projects/original.jpeg" }],
      mediaVariants: {},
      resolveVariantUrl: (value) => value,
    });

    expect(preloads).toEqual([]);
  });
});
