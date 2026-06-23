import sharp, { type Metadata } from "sharp";
import { describe, expect, it, vi } from "vitest";

import {
  OG_MAX_RECOMMENDED_BYTES,
  OG_PUBLIC_DEFAULT_TARGET_KB,
  OG_PUBLIC_JPEG_MAX_BYTES,
  OG_PUBLIC_JPEG_QUALITY_LADDER,
  optimizeOgPngBuffer,
  optimizeOgPublicImageBuffer,
  resolveOgPublicImageEncodingConfig,
} from "../../server/lib/og-image-output.js";

describe("og image output helper", () => {
  it("uses safe defaults when no OG env config is provided", () => {
    const config = resolveOgPublicImageEncodingConfig({ env: {} });

    expect(config).toEqual({
      targetKb: OG_PUBLIC_DEFAULT_TARGET_KB,
      maxBytes: OG_PUBLIC_JPEG_MAX_BYTES,
      qualityLadder: [...OG_PUBLIC_JPEG_QUALITY_LADDER],
    });
  });

  it("normalizes OG env config and falls back safely for invalid values", () => {
    const validConfig = resolveOgPublicImageEncodingConfig({
      env: {
        OG_PUBLIC_TARGET_KB: "280",
        OG_PUBLIC_JPEG_QUALITIES: "100, 90, 84, foo, 84, 76, 59, 101, 72",
      },
    });
    const invalidConfig = resolveOgPublicImageEncodingConfig({
      env: {
        OG_PUBLIC_TARGET_KB: "120",
        OG_PUBLIC_JPEG_QUALITIES: "foo, 59, 101",
      },
    });

    expect(validConfig).toEqual({
      targetKb: 280,
      maxBytes: 280 * 1024,
      qualityLadder: [100, 90, 84, 76, 72],
    });
    expect(invalidConfig).toEqual({
      targetKb: OG_PUBLIC_DEFAULT_TARGET_KB,
      maxBytes: OG_PUBLIC_JPEG_MAX_BYTES,
      qualityLadder: [...OG_PUBLIC_JPEG_QUALITY_LADDER],
    });
  });

  it("warns when invalid OG env config values are discarded or defaulted", () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = resolveOgPublicImageEncodingConfig({
      env: {
        OG_PUBLIC_TARGET_KB: "120",
        OG_PUBLIC_JPEG_QUALITIES: "100, foo, 59, 101",
      },
    });

    expect(config).toEqual({
      targetKb: OG_PUBLIC_DEFAULT_TARGET_KB,
      maxBytes: OG_PUBLIC_JPEG_MAX_BYTES,
      qualityLadder: [100],
    });
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "og_public_image_encoding_config_invalid",
      expect.objectContaining({
        targetKbRaw: "120",
        targetKbEffective: OG_PUBLIC_DEFAULT_TARGET_KB,
        qualityValuesRaw: "100, foo, 59, 101",
        qualityLadderEffective: [100],
        discardedQualityValues: ["foo", "59", "101"],
        usedDefaultTargetKb: true,
        usedDefaultQualityLadder: false,
      }),
    );

    consoleWarnSpy.mockRestore();
  });

  it("returns original buffer when already below max size", async () => {
    const input = Buffer.from("tiny-png");
    const optimized = await optimizeOgPngBuffer({
      buffer: input,
      maxBytes: 1024,
    });

    expect(optimized).toBe(input);
  });

  it("attempts lossless recompression below the size threshold when alwaysAttempt is true", async () => {
    const width = 320;
    const height = 180;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 23) % 256;
    }
    const uncompressed = await sharp(raw, {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const optimized = await optimizeOgPngBuffer({
      buffer: uncompressed,
      maxBytes: uncompressed.length + 1024,
      mode: "lossless",
      alwaysAttempt: true,
    });

    expect(optimized.length).toBeLessThan(uncompressed.length);
  });

  it("compresses png when buffer is above max size", async () => {
    const width = 420;
    const height = 260;
    const random = Buffer.alloc(width * height * 3);
    for (let index = 0; index < random.length; index += 1) {
      random[index] = (index * 31) % 256;
    }
    const rawPng = await sharp(random, {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const optimized = await optimizeOgPngBuffer({
      buffer: rawPng,
      maxBytes: Math.floor(rawPng.length * 0.6),
    });

    expect(Buffer.isBuffer(optimized)).toBe(true);
    expect(optimized.length).toBeLessThan(rawPng.length);
  });

  it("keeps project OG compression lossless and returns the original buffer when recompression does not improve", async () => {
    const width = 320;
    const height = 180;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 17) % 256;
    }
    const alreadyCompressed = await sharp(raw, {
      raw: { width, height, channels: 4 },
    })
      .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    const optimized = await optimizeOgPngBuffer({
      buffer: alreadyCompressed,
      maxBytes: Math.floor(alreadyCompressed.length * 0.5),
      mode: "lossless",
    });

    expect(optimized).toBe(alreadyCompressed);
  });

  it("uses non-palette lossless compression when it can still reduce the file", async () => {
    const width = 420;
    const height = 260;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 29) % 256;
    }
    const uncompressed = await sharp(raw, {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const optimized = await optimizeOgPngBuffer({
      buffer: uncompressed,
      maxBytes: Math.floor(uncompressed.length * 0.5),
      mode: "lossless",
    });
    const metadata = await sharp(optimized).metadata();
    const paletteBitDepth = (metadata as Metadata & { paletteBitDepth?: number }).paletteBitDepth;

    expect(optimized.length).toBeLessThan(uncompressed.length);
    expect(paletteBitDepth).toBeUndefined();
  });

  it("returns the original buffer when alwaysAttempt lossless does not improve it", async () => {
    const width = 320;
    const height = 180;
    const raw = Buffer.alloc(width * height * 4);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 17) % 256;
    }
    const alreadyCompressed = await sharp(raw, {
      raw: { width, height, channels: 4 },
    })
      .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    const optimized = await optimizeOgPngBuffer({
      buffer: alreadyCompressed,
      maxBytes: alreadyCompressed.length + 1024,
      mode: "lossless",
      alwaysAttempt: true,
    });

    expect(optimized).toBe(alreadyCompressed);
  });

  it("falls back to original buffer when png optimization fails", async () => {
    const invalid = Buffer.alloc(OG_MAX_RECOMMENDED_BYTES + 8, 1);
    const optimized = await optimizeOgPngBuffer({
      buffer: invalid,
      maxBytes: OG_MAX_RECOMMENDED_BYTES,
    });

    expect(optimized).toBe(invalid);
  });

  it("encodes public OG images as jpeg using the conservative quality ladder", {
    timeout: 15000,
  }, async () => {
    const width = 1200;
    const height = 630;
    const raw = Buffer.alloc(width * height * 3);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 37) % 256;
    }
    const inputPng = await sharp(raw, {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const encodedCandidates = await Promise.all(
      OG_PUBLIC_JPEG_QUALITY_LADDER.map(async (quality) => ({
        quality,
        buffer: await sharp(inputPng)
          .flatten({ background: { r: 2, g: 5, b: 11 } })
          .jpeg({
            quality,
            mozjpeg: true,
            progressive: true,
            chromaSubsampling: "4:4:4",
          })
          .toBuffer(),
      })),
    );
    const expectedChoice =
      encodedCandidates.find((candidate) => candidate.buffer.length <= OG_PUBLIC_JPEG_MAX_BYTES) ||
      encodedCandidates.reduce((best, candidate) =>
        candidate.buffer.length < best.buffer.length ? candidate : best,
      );

    const optimized = await optimizeOgPublicImageBuffer({
      buffer: inputPng,
      sourceContentType: "image/png",
      targetFormat: "jpeg",
      profile: "visually-lossless",
    });

    expect(optimized.contentType).toBe("image/jpeg");
    expect(optimized.format).toBe("jpeg");
    expect(optimized.quality).toBe(expectedChoice.quality);
    expect(optimized.buffer.length).toBe(expectedChoice.buffer.length);
    expect(optimized.buffer.length).toBeLessThan(inputPng.length);
  });

  it("respects the configured maxBytes and quality ladder for public OG images", async () => {
    const width = 1200;
    const height = 630;
    const raw = Buffer.alloc(width * height * 3);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 41) % 256;
    }
    const inputPng = await sharp(raw, {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const customLadder = [88, 82, 74];
    const customMaxBytes = 260 * 1024;
    const encodedCandidates = await Promise.all(
      customLadder.map(async (quality) => ({
        quality,
        buffer: await sharp(inputPng)
          .flatten({ background: { r: 2, g: 5, b: 11 } })
          .jpeg({
            quality,
            mozjpeg: true,
            progressive: true,
            chromaSubsampling: "4:4:4",
          })
          .toBuffer(),
      })),
    );
    const expectedChoice =
      encodedCandidates.find((candidate) => candidate.buffer.length <= customMaxBytes) ||
      encodedCandidates.reduce((best, candidate) =>
        candidate.buffer.length < best.buffer.length ? candidate : best,
      );

    const optimized = await optimizeOgPublicImageBuffer({
      buffer: inputPng,
      sourceContentType: "image/png",
      targetFormat: "jpeg",
      profile: "visually-lossless",
      maxBytes: customMaxBytes,
      qualityLadder: customLadder,
    });

    expect(optimized.contentType).toBe("image/jpeg");
    expect(optimized.quality).toBe(expectedChoice.quality);
    expect(optimized.buffer.length).toBe(expectedChoice.buffer.length);
  });

  it("accepts quality 100 and uses it when configured explicitly", async () => {
    const width = 1200;
    const height = 630;
    const raw = Buffer.alloc(width * height * 3);
    for (let index = 0; index < raw.length; index += 1) {
      raw[index] = (index * 43) % 256;
    }
    const inputPng = await sharp(raw, {
      raw: { width, height, channels: 3 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();

    const optimized = await optimizeOgPublicImageBuffer({
      buffer: inputPng,
      sourceContentType: "image/png",
      targetFormat: "jpeg",
      profile: "visually-lossless",
      maxBytes: 350 * 1024,
      qualityLadder: [100],
    });

    expect(optimized.contentType).toBe("image/jpeg");
    expect(optimized.format).toBe("jpeg");
    expect(optimized.quality).toBe(100);
  });

  it("keeps the original buffer when it is already smaller than the best jpeg candidate", async () => {
    const inputPng = await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 4,
        background: { r: 2, g: 5, b: 11, alpha: 1 },
      },
    })
      .png({ palette: false, compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    const optimized = await optimizeOgPublicImageBuffer({
      buffer: inputPng,
      sourceContentType: "image/png",
      targetFormat: "jpeg",
      profile: "visually-lossless",
    });

    expect(optimized.buffer).toBe(inputPng);
    expect(optimized.contentType).toBe("image/png");
    expect(optimized.format).toBe("png");
    expect(optimized.quality).toBeNull();
  });
});
