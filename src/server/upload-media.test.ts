import fs from "fs";
import os from "os";
import path from "path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import {
  attachUploadMediaMetadata,
  buildStorageAreaSummary,
  DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY,
  generateUploadVariants,
  POST_UPLOAD_VARIANT_PRESET_KEYS,
  PROJECT_UPLOAD_VARIANT_PRESET_KEYS,
  resolveUploadVariantAvifQuality,
  resolveUploadVariantPresetKeysForArea,
  UPLOAD_VARIANT_PRESET_KEYS,
  USER_UPLOAD_VARIANT_PRESET_KEYS,
} from "../../server/lib/upload-media.js";
import { storeUploadImageBuffer } from "../../server/lib/uploads-import.js";

const tempDirs: string[] = [];
const PROJECT_AND_POST_UPLOAD_VARIANT_PRESET_KEYS = UPLOAD_VARIANT_PRESET_KEYS.filter(
  (presetKey) =>
    PROJECT_UPLOAD_VARIANT_PRESET_KEYS.includes(presetKey) ||
    POST_UPLOAD_VARIANT_PRESET_KEYS.includes(presetKey),
);
type TestUploadVariant = {
  formats?: {
    avif?: { size?: number; url?: string };
    webp?: { size?: number; url?: string };
    fallback?: { size?: number; url?: string };
  };
};

const createTempUploadsDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nekomorto-upload-media-"));
  tempDirs.push(dir);
  return dir;
};

const createPatternSourceImage = async (
  sourcePath: string,
  {
    width = 1280,
    height = 1800,
  }: {
    width?: number;
    height?: number;
  } = {},
) => {
  const channels = 3;
  const buffer = Buffer.alloc(width * height * channels);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * channels;
      buffer[index] = (x * 17 + y * 11) % 256;
      buffer[index + 1] = (x * 7 + y * 19 + ((x ^ y) % 97)) % 256;
      buffer[index + 2] = (x * 13 + y * 5 + ((x * y) % 251)) % 256;
    }
  }

  await sharp(buffer, { raw: { width, height, channels } }).png().toFile(sourcePath);
};

afterEach(() => {
  tempDirs.splice(0).forEach((dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("upload-media", () => {
  it("resolve perfis de variantes por area", () => {
    expect(resolveUploadVariantPresetKeysForArea("projects/demo")).toEqual(
      PROJECT_UPLOAD_VARIANT_PRESET_KEYS,
    );
    expect(resolveUploadVariantPresetKeysForArea("posts")).toEqual(POST_UPLOAD_VARIANT_PRESET_KEYS);
    expect(resolveUploadVariantPresetKeysForArea("users/avatar")).toEqual(
      USER_UPLOAD_VARIANT_PRESET_KEYS,
    );
    expect(resolveUploadVariantPresetKeysForArea("")).toEqual([]);
    expect(resolveUploadVariantPresetKeysForArea("branding/logo")).toEqual([]);
    expect(resolveUploadVariantPresetKeysForArea("shared/banners")).toEqual([]);
    expect(resolveUploadVariantPresetKeysForArea("downloads/report")).toEqual([]);
    expect(resolveUploadVariantPresetKeysForArea("socials/card")).toEqual([]);
    expect(resolveUploadVariantPresetKeysForArea("tmp/epub-imports/demo")).toEqual([]);
    expect(resolveUploadVariantPresetKeysForArea("future-area")).toEqual(
      UPLOAD_VARIANT_PRESET_KEYS,
    );
  });

  it("usa o default 90 quando o env de qualidade avif nao existe", () => {
    expect(resolveUploadVariantAvifQuality("card", { env: {} })).toBe(
      DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY,
    );
  });

  it("aceita qualidade avif valida via env", () => {
    expect(
      resolveUploadVariantAvifQuality("card", {
        env: { UPLOAD_VARIANT_AVIF_QUALITY: "75" },
      }),
    ).toBe(75);
  });

  it("faz fallback para 90 quando o env de qualidade avif e invalido", () => {
    expect(
      resolveUploadVariantAvifQuality("card", {
        env: { UPLOAD_VARIANT_AVIF_QUALITY: "abc" },
      }),
    ).toBe(DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY);
    expect(
      resolveUploadVariantAvifQuality("card", {
        env: { UPLOAD_VARIANT_AVIF_QUALITY: "75.5" },
      }),
    ).toBe(DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY);
  });

  it("faz fallback para 90 quando o env de qualidade avif sai da faixa valida", () => {
    expect(
      resolveUploadVariantAvifQuality("card", {
        env: { UPLOAD_VARIANT_AVIF_QUALITY: "0" },
      }),
    ).toBe(DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY);
    expect(
      resolveUploadVariantAvifQuality("card", {
        env: { UPLOAD_VARIANT_AVIF_QUALITY: "101" },
      }),
    ).toBe(DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY);
  });

  it("usa a qualidade resolvida para todos os presets", () => {
    expect(
      UPLOAD_VARIANT_PRESET_KEYS.every(
        (presetKey) =>
          resolveUploadVariantAvifQuality(presetKey, {
            env: { UPLOAD_VARIANT_AVIF_QUALITY: "90" },
          }) === 90,
      ),
    ).toBe(true);
  });

  it("gera apenas avif e evita upscale em imagens pequenas", async () => {
    const uploadsDir = createTempUploadsDir();
    const sourcePath = path.join(uploadsDir, "source.png");

    await sharp({
      create: {
        width: 230,
        height: 326,
        channels: 3,
        background: { r: 220, g: 140, b: 90 },
      },
    })
      .png()
      .toFile(sourcePath);

    const generated = await generateUploadVariants({
      uploadsDir,
      uploadId: "upload-1",
      sourcePath,
      sourceMime: "image/png",
      variantsVersion: 1,
    });

    const variantDir = path.join(uploadsDir, "_variants", "upload-1");
    const files = fs.readdirSync(variantDir);

    expect(files).toHaveLength(14);
    expect(files).toEqual(
      expect.arrayContaining([
        "card-v1.avif",
        "cardHomeXs-v1.avif",
        "cardHomeSm-v1.avif",
        "cardHome-v1.avif",
        "cardWide-v1.avif",
        "heroXs-v1.avif",
        "heroSm-v1.avif",
        "heroMd-v1.avif",
        "hero-v1.avif",
        "og-v1.avif",
        "poster-v1.avif",
        "posterThumbSm-v1.avif",
        "posterThumb-v1.avif",
        "square-v1.avif",
      ]),
    );
    expect(files.every((file) => file.endsWith(".avif"))).toBe(true);
    expect(generated.variantBytes).toBeGreaterThan(0);
    const generatedVariants = Object.values(generated.variants) as TestUploadVariant[];
    expect(generated.variantBytes).toBe(
      generatedVariants.reduce((sum, variant) => {
        const size = Number(variant?.formats?.avif?.size || 0);
        return sum + size;
      }, 0),
    );

    for (const preset of generatedVariants) {
      expect(preset?.formats?.avif?.url || "").toContain(".avif");
      expect(preset?.formats?.webp).toBeUndefined();
      expect(preset?.formats?.fallback).toBeUndefined();
    }

    const cardMetadata = await sharp(path.join(variantDir, "card-v1.avif")).metadata();
    expect(Number(cardMetadata.width || 0)).toBeLessThanOrEqual(230);
    expect(Number(cardMetadata.height || 0)).toBeLessThanOrEqual(326);
  });

  it("resume uploads com variantes esparsas e legadas sem perder contagem", () => {
    const summary = buildStorageAreaSummary([
      {
        area: "posts",
        size: 100,
        variants: {
          card: {
            formats: {
              avif: { size: 30 },
            },
          },
        },
      },
      {
        area: "posts",
        size: 50,
        variants: {
          hero: {
            formats: {
              avif: { size: 20 },
              webp: { size: 25 },
              fallback: { size: 35 },
            },
          },
        },
      },
    ]);

    expect(summary.totals.originalBytes).toBe(150);
    expect(summary.totals.variantBytes).toBe(110);
    expect(summary.totals.variantFiles).toBe(4);
    expect(summary.areas).toEqual([
      {
        area: "posts",
        originalBytes: 150,
        variantBytes: 110,
        totalBytes: 260,
        originalFiles: 2,
        variantFiles: 4,
        totalFiles: 6,
      },
    ]);
  });

  it("gera apenas o perfil enxuto para uploads de projects quando solicitado", async () => {
    const uploadsDir = createTempUploadsDir();
    const sourcePath = path.join(uploadsDir, "project-source.png");

    await createPatternSourceImage(sourcePath, { width: 160, height: 225 });

    const generated = await generateUploadVariants({
      uploadsDir,
      uploadId: "project-upload",
      sourcePath,
      sourceMime: "image/png",
      variantsVersion: 1,
      variantPresetKeys: PROJECT_UPLOAD_VARIANT_PRESET_KEYS,
    });

    const variantDir = path.join(uploadsDir, "_variants", "project-upload");
    const files = fs.readdirSync(variantDir);

    expect(files).toHaveLength(PROJECT_UPLOAD_VARIANT_PRESET_KEYS.length);
    expect(Object.keys(generated.variants)).toEqual(PROJECT_UPLOAD_VARIANT_PRESET_KEYS);
    expect(files).toEqual(
      expect.not.arrayContaining(["card-v1.avif", "og-v1.avif", "square-v1.avif"]),
    );
    expect(files).toEqual(
      expect.arrayContaining([
        "cardHomeXs-v1.avif",
        "cardHomeSm-v1.avif",
        "cardHome-v1.avif",
        "cardWide-v1.avif",
        "heroXs-v1.avif",
        "heroSm-v1.avif",
        "heroMd-v1.avif",
        "hero-v1.avif",
        "poster-v1.avif",
        "posterThumbSm-v1.avif",
        "posterThumb-v1.avif",
      ]),
    );
  }, 30_000);

  it("remove variantes e apaga o diretorio quando o perfil explicito fica vazio", async () => {
    const uploadsDir = createTempUploadsDir();
    const sourcePath = path.join(uploadsDir, "post-source.png");

    await createPatternSourceImage(sourcePath, { width: 640, height: 900 });

    const initial = await attachUploadMediaMetadata({
      uploadsDir,
      entry: {
        id: "post-upload",
        url: "/uploads/posts/post-source.png",
        fileName: "post-source.png",
        folder: "posts",
        area: "posts",
        mime: "image/png",
      },
      sourcePath,
      sourceMime: "image/png",
      hashSha256: "hash-1",
      regenerateVariants: true,
      variantPresetKeys: POST_UPLOAD_VARIANT_PRESET_KEYS,
    });

    const variantDir = path.join(uploadsDir, "_variants", "post-upload");
    expect(fs.existsSync(variantDir)).toBe(true);
    expect(Object.keys(initial.variants)).toEqual(POST_UPLOAD_VARIANT_PRESET_KEYS);
    expect(Number(initial.variantBytes || 0)).toBeGreaterThan(0);

    const cleared = await attachUploadMediaMetadata({
      uploadsDir,
      entry: initial,
      sourcePath,
      sourceMime: "image/png",
      hashSha256: "hash-1",
      regenerateVariants: true,
      variantPresetKeys: [],
    });

    expect(cleared.variants).toEqual({});
    expect(cleared.variantBytes).toBe(0);
    expect(fs.existsSync(variantDir)).toBe(false);
  }, 15_000);

  it("gera apenas square para uploads fresh de users", async () => {
    const uploadsDir = createTempUploadsDir();
    const buffer = await sharp({
      create: {
        width: 640,
        height: 640,
        channels: 3,
        background: { r: 52, g: 96, b: 180 },
      },
    })
      .png()
      .toBuffer();

    const stored = await storeUploadImageBuffer({
      uploadsDir,
      uploads: [],
      buffer,
      mime: "image/png",
      filename: "avatar.png",
      folder: "users",
    });

    expect(stored.dedupeHit).toBe(false);
    expect(stored.variantsGenerated).toBe(true);
    expect(Object.keys(stored.uploadEntry.variants)).toEqual(USER_UPLOAD_VARIANT_PRESET_KEYS);
  });

  it("gera apenas o perfil de posts para uploads fresh de posts", async () => {
    const uploadsDir = createTempUploadsDir();
    const buffer = await sharp({
      create: {
        width: 1600,
        height: 900,
        channels: 3,
        background: { r: 164, g: 72, b: 88 },
      },
    })
      .png()
      .toBuffer();

    const stored = await storeUploadImageBuffer({
      uploadsDir,
      uploads: [],
      buffer,
      mime: "image/png",
      filename: "post-cover.png",
      folder: "posts",
    });

    expect(stored.dedupeHit).toBe(false);
    expect(stored.variantsGenerated).toBe(true);
    expect(Object.keys(stored.uploadEntry.variants)).toEqual(POST_UPLOAD_VARIANT_PRESET_KEYS);
  });

  it("nao gera variantes para uploads fresh de tmp epub imports", async () => {
    const uploadsDir = createTempUploadsDir();
    const buffer = await sharp({
      create: {
        width: 1200,
        height: 1600,
        channels: 3,
        background: { r: 96, g: 132, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const stored = await storeUploadImageBuffer({
      uploadsDir,
      uploads: [],
      buffer,
      mime: "image/png",
      filename: "chapter-cover.png",
      folder: "tmp/epub-imports/user/import-1",
    });

    expect(stored.dedupeHit).toBe(false);
    expect(stored.variantsGenerated).toBe(true);
    expect(stored.variantGenerationError).toBe("");
    expect(stored.uploadEntry.variants).toEqual({});
    expect(stored.uploadEntry.variantBytes).toBe(0);
    expect(
      fs.existsSync(path.join(uploadsDir, "_variants", String(stored.uploadEntry.id || ""))),
    ).toBe(false);
  });

  it("mantem variantes compartilhadas e adiciona so o necessario quando projects deduplica com posts", async () => {
    const uploadsDir = createTempUploadsDir();
    const buffer = await sharp({
      create: {
        width: 1280,
        height: 1800,
        channels: 3,
        background: { r: 180, g: 96, b: 120 },
      },
    })
      .png()
      .toBuffer();

    const first = await storeUploadImageBuffer({
      uploadsDir,
      uploads: [],
      buffer,
      mime: "image/png",
      filename: "project-cover.png",
      folder: "projects/demo",
    });

    expect(Object.keys(first.uploadEntry.variants)).toEqual(PROJECT_UPLOAD_VARIANT_PRESET_KEYS);

    const second = await storeUploadImageBuffer({
      uploadsDir,
      uploads: first.uploads,
      buffer,
      mime: "image/png",
      filename: "post-cover.png",
      folder: "posts",
    });

    expect(second.dedupeHit).toBe(true);
    expect(second.uploadEntry.id).toBe(first.uploadEntry.id);
    expect(second.variantsGenerated).toBe(true);
    expect(Object.keys(second.uploadEntry.variants)).toEqual(
      PROJECT_AND_POST_UPLOAD_VARIANT_PRESET_KEYS,
    );
    expect(second.uploadEntry.variants.card?.formats?.avif?.url).toContain("/card-v1.avif");
    expect(second.uploadEntry.variants.cardWide?.formats?.avif?.url).toContain("/cardWide-v1.avif");
    expect(second.uploadEntry.variants.poster?.formats?.avif?.url).toContain("/poster-v1.avif");
  }, 15_000);

  it("expande variantes deduplicadas quando a mesma imagem sai de area sem perfil para projects", async () => {
    const uploadsDir = createTempUploadsDir();
    const buffer = await sharp({
      create: {
        width: 1280,
        height: 1800,
        channels: 3,
        background: { r: 112, g: 96, b: 164 },
      },
    })
      .png()
      .toBuffer();

    const first = await storeUploadImageBuffer({
      uploadsDir,
      uploads: [],
      buffer,
      mime: "image/png",
      filename: "tmp-cover.png",
      folder: "tmp/epub-imports/user/import-2",
    });

    expect(first.uploadEntry.variants).toEqual({});

    const second = await storeUploadImageBuffer({
      uploadsDir,
      uploads: first.uploads,
      buffer,
      mime: "image/png",
      filename: "project-cover.png",
      folder: "projects/demo",
    });

    expect(second.dedupeHit).toBe(true);
    expect(second.variantsGenerated).toBe(true);
    expect(second.uploadEntry.id).toBe(first.uploadEntry.id);
    expect(Object.keys(second.uploadEntry.variants)).toEqual(PROJECT_UPLOAD_VARIANT_PRESET_KEYS);
  }, 15_000);
});
