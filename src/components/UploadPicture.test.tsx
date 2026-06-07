import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import UploadPicture from "@/components/UploadPicture";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";

describe("UploadPicture", () => {
  it("renderiza sources avif/webp e fallback de variante quando disponivel", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 3,
        variants: {
          card: {
            formats: {
              avif: { url: "/uploads/_variants/u123/card-v3.avif" },
              webp: { url: "/uploads/_variants/u123/card-v3.webp" },
              fallback: { url: "/uploads/_variants/u123/card-v3.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Capa teste"
        preset="card"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute("type", "image/avif");
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/card-v3.avif"),
    );
    expect(sources[1]).toHaveAttribute("type", "image/webp");
    expect(sources[1]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/card-v3.webp"),
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/card-v3.jpeg"),
    );
  });

  it("usa src original quando nao ha variantes", () => {
    const { container } = render(
      <UploadPicture
        src="/uploads/posts/original.jpg"
        alt="Original"
        preset="hero"
        mediaVariants={{}}
      />,
    );
    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(0);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("src", expect.stringContaining("/uploads/posts/original.jpg"));
  });

  it("usa o src original no img quando a variante salva apenas avif", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 6,
        variants: {
          hero: {
            formats: {
              avif: { url: "/uploads/_variants/u123/hero-v6.avif" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Somente avif"
        preset="hero"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(1);
    expect(sources[0]).toHaveAttribute("type", "image/avif");
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/hero-v6.avif"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/posts/capa.png"),
    );
  });

  it("resolve a variante cardWide quando disponivel", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 4,
        variants: {
          cardWide: {
            formats: {
              avif: { url: "/uploads/_variants/u123/cardWide-v4.avif" },
              webp: { url: "/uploads/_variants/u123/cardWide-v4.webp" },
              fallback: { url: "/uploads/_variants/u123/cardWide-v4.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Capa wide"
        preset="cardWide"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardWide-v4.avif"),
    );
    expect(sources[1]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardWide-v4.webp"),
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/cardWide-v4.jpeg"),
    );
  });

  it("aplica srcset responsivo para cardHome quando variantes sm/base existem", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 1,
        variants: {
          cardHomeXs: {
            formats: {
              avif: { url: "/uploads/_variants/u123/cardHomeXs-v1.avif" },
              webp: { url: "/uploads/_variants/u123/cardHomeXs-v1.webp" },
              fallback: { url: "/uploads/_variants/u123/cardHomeXs-v1.jpeg" },
            },
          },
          cardHomeSm: {
            formats: {
              avif: { url: "/uploads/_variants/u123/cardHomeSm-v1.avif" },
              webp: { url: "/uploads/_variants/u123/cardHomeSm-v1.webp" },
              fallback: { url: "/uploads/_variants/u123/cardHomeSm-v1.jpeg" },
            },
          },
          cardHome: {
            formats: {
              avif: { url: "/uploads/_variants/u123/cardHome-v1.avif" },
              webp: { url: "/uploads/_variants/u123/cardHome-v1.webp" },
              fallback: { url: "/uploads/_variants/u123/cardHome-v1.jpeg" },
            },
          },
          card: {
            formats: {
              avif: { url: "/uploads/_variants/u123/card-v1.avif" },
              webp: { url: "/uploads/_variants/u123/card-v1.webp" },
              fallback: { url: "/uploads/_variants/u123/card-v1.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="CardHome responsivo"
        preset="cardHome"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardHomeXs-v1.avif 480w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardHomeSm-v1.avif 800w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardHome-v1.avif 960w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/card-v1.avif 1280w"),
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardHomeXs-v1.jpeg 480w"),
    );
    expect(img).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardHomeSm-v1.jpeg 800w"),
    );
    expect(img).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/cardHome-v1.jpeg 960w"),
    );
    expect(img).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/card-v1.jpeg 1280w"),
    );
  });

  it("resolve a variante poster quando disponivel", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/projects/capa.png": {
        variantsVersion: 2,
        variants: {
          poster: {
            formats: {
              avif: { url: "/uploads/_variants/u123/poster-v2.avif" },
              webp: { url: "/uploads/_variants/u123/poster-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/poster-v2.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/projects/capa.png"
        alt="Poster"
        preset="poster"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.avif"),
    );
    expect(sources[1]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.webp"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.jpeg"),
    );
  });

  it("aplica srcset responsivo para posterThumb quando variantes sm/base existem", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/projects/capa.png": {
        variantsVersion: 2,
        variants: {
          posterThumbSm: {
            formats: {
              avif: { url: "/uploads/_variants/u123/posterThumbSm-v2.avif" },
              webp: { url: "/uploads/_variants/u123/posterThumbSm-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/posterThumbSm-v2.jpeg" },
            },
          },
          posterThumb: {
            formats: {
              avif: { url: "/uploads/_variants/u123/posterThumb-v2.avif" },
              webp: { url: "/uploads/_variants/u123/posterThumb-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/posterThumb-v2.jpeg" },
            },
          },
          poster: {
            formats: {
              avif: { url: "/uploads/_variants/u123/poster-v2.avif" },
              webp: { url: "/uploads/_variants/u123/poster-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/poster-v2.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/projects/capa.png"
        alt="Poster thumb responsivo"
        preset="posterThumb"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/posterThumbSm-v2.avif 192w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/posterThumb-v2.avif 320w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.avif 920w"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/posterThumbSm-v2.jpeg 192w"),
    );
  });

  it("aplica srcset responsivo para posterThumbSm em thumbnails compactos", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/projects/capa.png": {
        variantsVersion: 2,
        variants: {
          posterThumbSm: {
            formats: {
              avif: { url: "/uploads/_variants/u123/posterThumbSm-v2.avif" },
              webp: { url: "/uploads/_variants/u123/posterThumbSm-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/posterThumbSm-v2.jpeg" },
            },
          },
          posterThumb: {
            formats: {
              avif: { url: "/uploads/_variants/u123/posterThumb-v2.avif" },
              webp: { url: "/uploads/_variants/u123/posterThumb-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/posterThumb-v2.jpeg" },
            },
          },
          poster: {
            formats: {
              avif: { url: "/uploads/_variants/u123/poster-v2.avif" },
              webp: { url: "/uploads/_variants/u123/poster-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/poster-v2.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/projects/capa.png"
        alt="Poster thumb compacto"
        preset="posterThumbSm"
        mediaVariants={mediaVariants}
        sizes="105px"
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/posterThumbSm-v2.avif 192w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/posterThumb-v2.avif 320w"),
    );
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.avif 920w"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/posterThumbSm-v2.jpeg 192w"),
    );
    expect(container.querySelector("img")).toHaveAttribute("sizes", "105px");
  });

  it("faz fallback de posterThumb para poster quando necessario", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/projects/capa.png": {
        variantsVersion: 2,
        variants: {
          poster: {
            formats: {
              avif: { url: "/uploads/_variants/u123/poster-v2.avif" },
              webp: { url: "/uploads/_variants/u123/poster-v2.webp" },
              fallback: { url: "/uploads/_variants/u123/poster-v2.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/projects/capa.png"
        alt="Poster thumb com fallback"
        preset="posterThumb"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.avif"),
    );
    expect(sources[1]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.webp"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/poster-v2.jpeg"),
    );
  });

  it("resolve a variante square quando disponivel", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/users/avatar.png": {
        variantsVersion: 7,
        variants: {
          square: {
            formats: {
              avif: { url: "/uploads/_variants/u123/square-v7.avif" },
              webp: { url: "/uploads/_variants/u123/square-v7.webp" },
              fallback: { url: "/uploads/_variants/u123/square-v7.png" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/users/avatar.png"
        alt="Avatar"
        preset="square"
        mediaVariants={mediaVariants}
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/square-v7.avif"),
    );
    expect(sources[1]).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/square-v7.webp"),
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/square-v7.png"),
    );
  });

  it("aplica object-position quando solicitado e ha foco disponivel", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 1,
        variants: {
          hero: {
            formats: {
              fallback: { url: "/uploads/_variants/u123/hero-v1.jpeg" },
            },
          },
        },
        focalPoints: {
          hero: { x: 0.25, y: 0.75 },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Hero com foco"
        preset="hero"
        mediaVariants={mediaVariants}
        applyFocalObjectPosition
      />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveStyle({ objectPosition: "25% 75%" });
  });

  it("mantem comportamento padrao quando applyFocalObjectPosition esta desativado ou sem foco", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 1,
        variants: {
          hero: {
            formats: {
              fallback: { url: "/uploads/_variants/u123/hero-v1.jpeg" },
            },
          },
        },
        focalPoints: {
          hero: { x: 0.25, y: 0.75 },
        },
      },
      "/uploads/posts/sem-foco.png": {
        variantsVersion: 1,
        variants: {
          hero: {
            formats: {
              fallback: { url: "/uploads/_variants/u123/hero-v1.jpeg" },
            },
          },
        },
      },
    };

    const { container: disabledContainer } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Sem aplicar foco"
        preset="hero"
        mediaVariants={mediaVariants}
      />,
    );
    const disabledImg = disabledContainer.querySelector("img");
    expect(disabledImg).not.toBeNull();
    expect(disabledImg?.style.objectPosition).toBe("");

    const { container: missingFocalContainer } = render(
      <UploadPicture
        src="/uploads/posts/sem-foco.png"
        alt="Sem foco"
        preset="hero"
        mediaVariants={mediaVariants}
        applyFocalObjectPosition
      />,
    );
    const missingFocalImg = missingFocalContainer.querySelector("img");
    expect(missingFocalImg).not.toBeNull();
    expect(missingFocalImg).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/hero-v1.jpeg"),
    );
    expect(missingFocalImg?.style.objectPosition).toBe("");
  });

  it("propaga sizes para sources e fallback quando informado", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 1,
        variants: {
          card: {
            formats: {
              avif: { url: "/uploads/_variants/u123/card-v1.avif" },
              webp: { url: "/uploads/_variants/u123/card-v1.webp" },
              fallback: { url: "/uploads/_variants/u123/card-v1.jpeg" },
            },
          },
        },
      },
    };

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Com sizes"
        preset="card"
        mediaVariants={mediaVariants}
        sizes="(min-width: 1024px) 364px, 100vw"
      />,
    );

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources).toHaveLength(2);
    expect(sources[0]).toHaveAttribute("sizes", "(min-width: 1024px) 364px, 100vw");
    expect(sources[1]).toHaveAttribute("sizes", "(min-width: 1024px) 364px, 100vw");

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute("sizes", "(min-width: 1024px) 364px, 100vw");
    expect(img).toHaveAttribute(
      "srcset",
      expect.stringContaining("/uploads/_variants/u123/card-v1.jpeg"),
    );
  });

  it("propaga crossOrigin para o img renderizado", () => {
    const { container } = render(
      <UploadPicture
        src="/uploads/users/avatar.png"
        alt="Avatar"
        preset="square"
        mediaVariants={{}}
        crossOrigin="anonymous"
      />,
    );

    expect(container.querySelector("img")).toHaveAttribute("crossorigin", "anonymous");
  });

  it("faz fallback para o src original quando a variant falha sem repetir o erro indefinidamente", () => {
    const mediaVariants: UploadMediaVariantsMap = {
      "/uploads/posts/capa.png": {
        variantsVersion: 1,
        variants: {
          hero: {
            formats: {
              avif: { url: "/uploads/_variants/u123/hero-v1.avif" },
              fallback: { url: "/uploads/_variants/u123/hero-v1.jpeg" },
            },
          },
        },
      },
    };
    const onError = vi.fn();

    const { container } = render(
      <UploadPicture
        src="/uploads/posts/capa.png"
        alt="Hero com fallback"
        preset="hero"
        mediaVariants={mediaVariants}
        onError={onError}
      />,
    );

    let img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(container.querySelectorAll("source")).toHaveLength(1);
    expect(img).toHaveAttribute(
      "src",
      expect.stringContaining("/uploads/_variants/u123/hero-v1.jpeg"),
    );

    fireEvent.error(img as HTMLImageElement);

    img = container.querySelector("img");
    expect(container.querySelectorAll("source")).toHaveLength(0);
    expect(img).toHaveAttribute("src", expect.stringContaining("/uploads/posts/capa.png"));
    expect(onError).not.toHaveBeenCalled();

    fireEvent.error(img as HTMLImageElement);

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
