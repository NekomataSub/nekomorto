import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  buildLegacyProjectOgImageResponse,
  buildLegacyProjectOgScene,
  buildProjectOgCardModel,
  buildProjectOgFonts,
  buildProjectOgImagePath,
  buildProjectOgImageResponse,
  buildProjectOgScene,
  loadProjectOgArtworkDataUrl,
  loadProjectOgFontBuffers,
  loadProjectOgProcessedBackdropDataUrl,
  loadProjectOgStaticAssetDataUrl,
  OG_PROJECT_HEIGHT,
  OG_PROJECT_WIDTH,
  resolveProjectOgPalette,
} from "../../server/lib/project-og.js";

const baseSettings = {
  theme: {
    accent: "#3173ff",
  },
};

const baseProject = {
  id: "oshi-no-ko",
  title: "Oshi no Ko",
  type: "Anime",
  status: "Finalizado",
  studio: "Doga Kobo",
  genres: ["drama", "misterio"],
  tags: ["psicologico", "sobrenatural"],
  cover: "/uploads/projects/oshi-no-ko/cover.jpg",
  heroImageUrl: "/uploads/projects/oshi-no-ko/hero.jpg",
  banner: "/uploads/projects/oshi-no-ko/banner.jpg",
};

const transparentDataUrl = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

type TestElementProps = Record<string, unknown> & {
  children?: unknown;
  style?: Record<string, unknown>;
};

type TestElement = {
  props?: TestElementProps;
};

const toArray = (value: unknown) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
};

const findElement = (
  node: unknown,
  predicate: (candidate: TestElement) => boolean,
): TestElement | null => {
  if (!node || typeof node !== "object") {
    return null;
  }
  const candidate = node as TestElement;
  if (predicate(candidate)) {
    return candidate;
  }
  const children = toArray(candidate.props?.children);
  for (const child of children) {
    const match = findElement(child, predicate);
    if (match) {
      return match;
    }
  }
  return null;
};

const findAllElements = (
  node: unknown,
  predicate: (candidate: TestElement) => boolean,
): TestElement[] => {
  if (!node || typeof node !== "object") {
    return [];
  }
  const candidate = node as TestElement;
  const matches = predicate(candidate) ? [candidate] : [];
  const children = toArray(candidate.props?.children);
  return children.reduce<TestElement[]>(
    (all, child) => all.concat(findAllElements(child, predicate)),
    matches,
  );
};

const assertRenderedPng = async (buffer: Buffer) => {
  const metadata = await sharp(buffer).metadata();
  expect(metadata.width).toBe(OG_PROJECT_WIDTH);
  expect(metadata.height).toBe(OG_PROJECT_HEIGHT);

  const stats = await sharp(buffer).ensureAlpha().stats();
  const alpha = stats.channels[3];
  expect(alpha).toBeDefined();
  expect(alpha.max).toBeGreaterThan(0);
};

const decodeDataUrlBuffer = (value: string) => {
  const normalized = String(value || "").trim();
  const separatorIndex = normalized.indexOf(",");
  if (!normalized.startsWith("data:") || separatorIndex < 0) {
    return Buffer.alloc(0);
  }
  return Buffer.from(normalized.slice(separatorIndex + 1), "base64");
};

const parsePolygonPoints = (value: string) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",");
      return { x: Number(x), y: Number(y) };
    })
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

const resolveDiagonalXAtY = (panelPoints: string, y: number) => {
  const points = parsePolygonPoints(panelPoints);
  const topRight = points[1];
  const bottomRight = points[2];
  if (!topRight || !bottomRight || bottomRight.y === topRight.y) {
    return 0;
  }
  const progress = (y - topRight.y) / (bottomRight.y - topRight.y);
  return topRight.x + (bottomRight.x - topRight.x) * progress;
};

const resolveExpectedTitleLineMaxWidth = ({
  layout,
  fontSize,
  lineIndex,
  inset = 64,
}: {
  layout: Record<string, number | string>;
  fontSize: number;
  lineIndex: number;
  inset?: number;
}) => {
  const lineHeightPx = fontSize * 1.2;
  const centerY = Number(layout.titleTop) + lineIndex * lineHeightPx + lineHeightPx / 2;
  const diagonalX = resolveDiagonalXAtY(String(layout.panelPoints || ""), centerY);
  const rawWidth = diagonalX - Number(layout.titleLeft) - inset;
  return Math.min(
    OG_PROJECT_WIDTH - Number(layout.titleLeft),
    Math.max(Number(layout.titleWidth), rawWidth),
  );
};

const resolveExpectedTagRowMaxWidth = ({
  layout,
  rowIndex,
  inset = 64,
}: {
  layout: Record<string, number | string>;
  rowIndex: number;
  inset?: number;
}) => {
  void rowIndex;
  const rowTop = Number(layout.tagsTop);
  const centerY = rowTop + Number(layout.tagHeight) / 2;
  const diagonalX = resolveDiagonalXAtY(String(layout.panelPoints || ""), centerY);
  const rawWidth = diagonalX - Number(layout.tagsLeft) - inset;
  return Math.min(
    OG_PROJECT_WIDTH - Number(layout.tagsLeft),
    Math.max(Number(layout.tagsMaxWidth), rawWidth),
  );
};

describe("project og helper", () => {
  it("builds encoded project OG path", () => {
    expect(buildProjectOgImagePath("id com espaco")).toBe("/api/og/project/id%20com%20espaco");
  });

  it("builds stable card model with translations, chips and artwork source resolution", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama", "misterio", "drama"],
        tags: ["psicologico", "sobrenatural", "psicologico"],
      },
      settings: baseSettings,
      tagTranslations: {
        psicologico: "Psicologico",
        sobrenatural: "Sobrenatural",
      },
      genreTranslations: {
        drama: "Drama",
        misterio: "Misterio",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string, preset: string) => `${value}?preset=${preset}`,
    });

    expect(model.width).toBe(OG_PROJECT_WIDTH);
    expect(model.height).toBe(OG_PROJECT_HEIGHT);
    expect(model.eyebrow).toBe("Anime \u2022 Finalizado");
    expect(model.eyebrowParts).toEqual(["Anime", "Finalizado"]);
    expect(model.eyebrowSeparator).toBe("\u2022");
    expect(model.title).toBe("Oshi no Ko");
    expect(model.subtitle).toBe("Doga Kobo");
    expect(model.chips).toEqual(["Drama", "Misterio", "Psicologico", "Sobrenatural"]);
    expect(model.artworkSource).toBe("cover");
    expect(model.artworkUrl).toBe("/uploads/projects/oshi-no-ko/cover.jpg?preset=poster");
    expect(model.backdropSource).toBe("banner");
    expect(model.backdropUrl).toBe("/uploads/projects/oshi-no-ko/banner.jpg?preset=hero");
    expect(model.sceneVersion).toBeTruthy();
  });

  it("keeps studio as the subtitle when studio and author staff are both present", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        animeStaff: [
          {
            role: "Original Creator",
            members: ["Aka Akasaka"],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.subtitle).toBe("Doga Kobo");
  });

  it("falls back to the first original creator when the project has no studio", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        studio: "",
        animeStaff: [
          {
            role: "Original Creator",
            members: ["Aka Akasaka", "Mengo Yokoyari"],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.subtitle).toBe("Aka Akasaka");
  });

  it("accepts equivalent anime staff author roles in portuguese and english", () => {
    const authorOriginalModel = buildProjectOgCardModel({
      project: {
        ...baseProject,
        studio: "",
        animeStaff: [
          {
            role: "Autor original",
            members: ["Inio Asano"],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const storyModel = buildProjectOgCardModel({
      project: {
        ...baseProject,
        studio: "",
        animeStaff: [
          {
            role: "Story",
            members: ["Naoki Urasawa"],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(authorOriginalModel.subtitle).toBe("Inio Asano");
    expect(storyModel.subtitle).toBe("Naoki Urasawa");
  });

  it("uses the manga author as subtitle when the project has no studio", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        type: "Mangá",
        studio: "",
        animeStaff: [
          {
            role: "Story & Art",
            members: ["Satoru Nii"],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.subtitle).toBe("Satoru Nii");
  });

  it("keeps the subtitle empty when there is no studio or matching author role", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        studio: "",
        animeStaff: [
          {
            role: "Director",
            members: ["Hiroshi Seko"],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.subtitle).toBe("");
  });

  it("falls back to default accent palette when color is invalid", () => {
    expect(resolveProjectOgPalette("not-a-color")).toEqual(resolveProjectOgPalette("#9667e0"));
  });

  it("returns neutral static assets and real Geist font buffers", () => {
    expect(loadProjectOgStaticAssetDataUrl("overlayShadow")).toBe(transparentDataUrl);
    expect(loadProjectOgStaticAssetDataUrl("anything")).toBe(transparentDataUrl);
    expect(loadProjectOgFontBuffers()).toEqual(
      expect.objectContaining({
        title: expect.any(Buffer),
        eyebrow: expect.any(Buffer),
        subtitle: expect.any(Buffer),
        chip: expect.any(Buffer),
      }),
    );
    expect(buildProjectOgFonts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Geist", weight: 700 }),
        expect.objectContaining({ name: "Geist", weight: 500 }),
        expect.objectContaining({ name: "Geist", weight: 300 }),
        expect.objectContaining({ name: "Geist", weight: 200 }),
      ]),
    );
  });

  it("returns local artwork data urls when available and can build a processed backdrop data url", async () => {
    const dataUrl = "data:image/png;base64,AAA";
    await expect(
      loadProjectOgArtworkDataUrl({ artworkUrl: "https://example.com/image.png" }),
    ).resolves.toBe("");
    await expect(loadProjectOgArtworkDataUrl({ artworkUrl: dataUrl })).resolves.toBe(dataUrl);

    const model = buildProjectOgCardModel({
      project: baseProject,
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const processedBackdrop = await loadProjectOgProcessedBackdropDataUrl({
      artworkUrl: transparentDataUrl,
      layout: model.layout,
    });

    expect(processedBackdrop.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("clips the processed backdrop exactly to the diagonal divider", async () => {
    const inputBuffer = await sharp({
      create: {
        width: OG_PROJECT_WIDTH,
        height: OG_PROJECT_HEIGHT,
        channels: 4,
        background: { r: 255, g: 32, b: 128, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const model = buildProjectOgCardModel({
      project: baseProject,
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const processedBackdrop = await loadProjectOgProcessedBackdropDataUrl({
      artworkUrl: `data:image/png;base64,${inputBuffer.toString("base64")}`,
      layout: model.layout,
    });
    const { data, info } = await sharp(decodeDataUrlBuffer(processedBackdrop))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const sampleY = Math.floor(OG_PROJECT_HEIGHT / 2);
    const diagonalX = resolveDiagonalXAtY(model.layout.panelPoints, sampleY);
    const insideX = Math.max(0, Math.floor(diagonalX) - 8);
    const outsideX = Math.min(info.width - 1, Math.ceil(diagonalX) + 8);
    const insideAlpha = data[(sampleY * info.width + insideX) * info.channels + 3];
    const outsideAlpha = data[(sampleY * info.width + outsideX) * info.channels + 3];

    expect(insideAlpha).toBeGreaterThan(0);
    expect(outsideAlpha).toBe(0);
  });

  it("pushes the studio label down when the project name wraps", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        title:
          "Um titulo de projeto longo o bastante para quebrar em multiplas linhas no card Open Graph",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.titleLines.length).toBeGreaterThan(1);
    expect(model.subtitleTop).toBe(
      model.layout.titleTop + model.titleHeight + model.layout.subtitleGap,
    );
    expect(model.subtitleBottom).toBeLessThanOrEqual(
      model.layout.tagsTop - model.layout.subtitleLimitGap,
    );
  });

  it("keeps the oshi no ko title at the visual maximum size", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        title: "[Oshi no Ko]",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.titleFontSize).toBeCloseTo(72.0604476928711, 4);
    expect(model.titleLines).toEqual(["[Oshi no Ko]"]);
    expect(model.titleTruncated).toBe(false);
  });

  it("truncates fallback author subtitles and keeps the subtitle position limits", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        studio: "",
        title:
          "Um titulo de projeto longo o bastante para quebrar em multiplas linhas no card Open Graph",
        animeStaff: [
          {
            role: "Original Story",
            members: [
              "Um nome de autor extremamente longo para validar truncamento na linha secundaria",
            ],
          },
        ],
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.subtitle.endsWith("...")).toBe(true);
    expect(model.subtitle.length).toBeLessThanOrEqual(42);
    expect(model.subtitleTop).toBe(
      model.layout.titleTop + model.titleHeight + model.layout.subtitleGap,
    );
    expect(model.subtitleBottom).toBeLessThanOrEqual(
      model.layout.tagsTop - model.layout.subtitleLimitGap,
    );
  });

  it("recalibrates the visual minimum title size from the rekishi reference case", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        type: "Light Novel",
        status: "Em andamento",
        studio: "Izumi Ookido",
        title:
          "Rekishi ni Nokoru Akujo ni Naruzo: Akuyaku Reijou ni Naru hodo Ouji no Dekiai wa Kasoku Suru you desu!",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.layout.titleMinFontSize).toBeCloseTo(58.5, 4);
    expect(model.titleFontSize).toBeCloseTo(model.layout.titleMinFontSize, 4);
    expect(model.titleLines.length).toBeGreaterThan(model.layout.titleMaxLines);
    expect(model.titleTruncated).toBe(false);
    expect(model.subtitleBottom).toBeLessThanOrEqual(
      model.layout.tagsTop - model.layout.subtitleLimitGap,
    );
  });

  it("keeps the classroom title larger and without ellipsis while the studio still fits", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        title: "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 3rd",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.titleFontSize).toBeGreaterThan(model.layout.titleMinFontSize);
    expect(model.titleTruncated).toBe(false);
    expect(model.titleLineLayouts).toHaveLength(model.titleLines.length);
    expect(model.titleLineLayouts[0]?.maxWidth).toBeGreaterThan(model.layout.titleWidth);
    expect(model.titleLines.at(-1)).not.toContain("...");
    expect(model.titleLines.join(" ")).toContain("3rd");
    expect(model.subtitleBottom).toBeLessThanOrEqual(
      model.layout.tagsTop - model.layout.subtitleLimitGap,
    );
  });

  it("calculates title line widths from the panel diagonal geometry", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        title: "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 3rd",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.titleLineLayouts.length).toBeGreaterThan(0);
    model.titleLineLayouts.forEach((line, index) => {
      expect(line.maxWidth).toBeCloseTo(
        resolveExpectedTitleLineMaxWidth({
          layout: model.layout as unknown as Record<string, number | string>,
          fontSize: model.titleFontSize,
          lineIndex: index,
        }),
        3,
      );
      if (index > 0) {
        expect(line.maxWidth).toBeLessThan(model.titleLineLayouts[index - 1].maxWidth);
      }
    });
  });

  it("allows titles longer than four lines without truncating while preserving subtitle spacing", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        title:
          "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e 3rd Season Extended Director Cut Deluxe Edition Ultimate Complete Broadcast Remaster Collection",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.titleLines.length).toBeGreaterThan(model.layout.titleMaxLines);
    expect(model.titleFontSize).toBeLessThan(model.layout.titleMinFontSize);
    expect(model.titleFontSize).toBeGreaterThanOrEqual(28);
    expect(model.titleTruncated).toBe(false);
    expect(model.titleLines.at(-1)).not.toContain("...");
    expect(model.subtitleBottom).toBeLessThanOrEqual(
      model.layout.tagsTop - model.layout.subtitleLimitGap,
    );
  });

  it("extends the first chip row toward the diagonal and can show more than four short chips", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama", "acao", "idol"],
        tags: ["escola", "slice", "mecha"],
      },
      settings: baseSettings,
      tagTranslations: {
        escola: "Escola",
        slice: "Slice",
        mecha: "Mecha",
      },
      genreTranslations: {
        drama: "Drama",
        acao: "Acao",
        idol: "Idol",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });

    expect(model.chips.length).toBeGreaterThan(4);
    expect(model.chipLayouts.length).toBe(model.chips.length);
    expect(model.chipLayouts.every((chip) => chip.truncated === false)).toBe(true);
    expect(model.chipLayouts[0]?.maxWidth).toBeGreaterThan(model.layout.tagsMaxWidth);
    expect(model.chipLayouts[0]?.maxWidth).toBeCloseTo(
      resolveExpectedTagRowMaxWidth({
        layout: model.layout as unknown as Record<string, number | string>,
        rowIndex: 0,
      }),
      3,
    );
  });

  it("skips an oversized badge in the middle and only reuses it as the final deferred fallback", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama", "protagonista masculino de elite extremamente analitico", "acao"],
        tags: ["idol", "slice", "mecha"],
      },
      settings: baseSettings,
      tagTranslations: {
        "protagonista masculino de elite extremamente analitico":
          "Protagonista masculino de elite extremamente analitico",
        idol: "Idol",
        slice: "Slice",
        mecha: "Mecha",
      },
      genreTranslations: {
        drama: "Drama",
        acao: "Acao",
        "protagonista masculino de elite extremamente analitico":
          "Protagonista masculino de elite extremamente analitico",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const lastChip = model.chipLayouts.at(-1);

    expect(model.chipLayouts.map((chip) => chip.sourceIndex)).toEqual([0, 2, 3, 4, 5]);
    expect(model.chipLayouts.every((chip) => chip.truncated === false)).toBe(true);
    expect(model.chipLayouts.some((chip) => chip.fallbackDeferred)).toBe(false);
    expect(lastChip).toBeDefined();
    expect(lastChip?.row).toBe(0);
    expect(lastChip?.truncated).toBe(false);
    expect(lastChip?.text).toBe("Mecha");
    expect(lastChip?.maxWidth).toBeCloseTo(
      resolveExpectedTagRowMaxWidth({
        layout: model.layout as unknown as Record<string, number | string>,
        rowIndex: 0,
      }),
      3,
    );
  });

  it("prioritizes word-boundary truncation for the final deferred badge", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama", "misterio"],
        tags: ["protagonista masculino de elite extremamente analitico"],
      },
      settings: baseSettings,
      tagTranslations: {
        "protagonista masculino de elite extremamente analitico":
          "Protagonista masculino de elite extremamente analitico",
      },
      genreTranslations: {
        drama: "Drama",
        misterio: "Misterio",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const lastChip = model.chipLayouts.at(-1);

    expect(lastChip).toBeDefined();
    expect(lastChip?.truncated).toBe(true);
    expect(lastChip?.fallbackDeferred).toBe(true);
    expect(lastChip?.text).toBe("Protagonista masculino de elite...");
  });

  it("omits the final deferred badge when only a tiny fallback would fit", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama"],
        tags: ["psicologico", "escola", "elenco coral", "protagonista masculino"],
      },
      settings: baseSettings,
      tagTranslations: {
        psicologico: "Psicologico",
        escola: "Escola",
        "elenco coral": "Elenco coral",
        "protagonista masculino": "Protagonista masculino",
      },
      genreTranslations: {
        drama: "Drama",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const lastChip = model.chipLayouts.at(-1);

    expect(model.chips).toEqual([
      "Drama",
      "Psicologico",
      "Escola",
      "Elenco coral",
      "Protagonista masculino",
    ]);
    expect(model.chipLayouts.map((chip) => chip.text)).toEqual([
      "Drama",
      "Psicologico",
      "Escola",
      "Elenco coral",
    ]);
    expect(model.chipLayouts.some((chip) => chip.fallbackDeferred)).toBe(false);
    expect(lastChip?.text).toBe("Elenco coral");
  });

  it("omits a deferred single-word badge when no word-boundary truncation is possible", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama", "acao", "escola"],
        tags: ["supercalifragilisticexpialidociousultralongo", "idol", "slice"],
      },
      settings: baseSettings,
      tagTranslations: {
        supercalifragilisticexpialidociousultralongo:
          "supercalifragilisticexpialidociousultralongo",
        idol: "Idol",
        slice: "Slice",
      },
      genreTranslations: {
        drama: "Drama",
        acao: "Acao",
        escola: "Escola",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const lastChip = model.chipLayouts.at(-1);

    expect(model.chipLayouts.every((chip) => chip.truncated === false)).toBe(true);
    expect(lastChip).toBeDefined();
    expect(lastChip?.fallbackDeferred).toBe(false);
    expect(lastChip?.sourceIndex).toBe(5);
    expect(lastChip?.truncated).toBe(false);
    expect(lastChip?.text).toBe("Slice");
  });

  it("stops adding chips when there is not enough useful space for another deferred fallback", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        genres: ["drama", "acao", "idol"],
        tags: ["escola", "slice", "mecha", "retro"],
      },
      settings: baseSettings,
      tagTranslations: {
        escola: "Escola",
        slice: "Slice",
        mecha: "Mecha",
        retro: "Retro",
      },
      genreTranslations: {
        drama: "Drama",
        acao: "Acao",
        idol: "Idol",
      },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const lastChip = model.chipLayouts.at(-1);

    expect(lastChip).toBeDefined();
    expect(model.chipLayouts.every((chip) => chip.row === 0 && chip.y === 0)).toBe(true);
    expect(model.chipLayouts.length).toBeLessThan(model.chips.length);
    expect(model.chipLayouts.some((chip) => chip.fallbackDeferred)).toBe(false);
    expect(lastChip?.truncated).toBe(false);
    expect(lastChip?.text).not.toContain("...");
  });

  it("renders title and chips with nowrap styles and revised chip padding", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        title: "Youkoso Jitsuryoku Shijou Shugi no Kyoushitsu e",
        tags: ["psicologico", "escola", "protagonista masculino", "slice"],
      },
      settings: baseSettings,
      tagTranslations: {
        psicologico: "Psicologico",
        escola: "Escola",
        "protagonista masculino": "Protagonista masculino",
        slice: "Slice",
      },
      genreTranslations: { drama: "Drama", misterio: "Misterio" },
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const scene = buildProjectOgScene(model);
    const titleNode = findElement(scene, (candidate) =>
      Boolean(
        candidate.props?.style &&
          (candidate.props.style as Record<string, unknown>).fontWeight === 700 &&
          (candidate.props.style as Record<string, unknown>).left === model.layout.titleLeft &&
          (candidate.props.style as Record<string, unknown>).top === model.layout.titleTop,
      ),
    );
    const tagsNode = findElement(scene, (candidate) =>
      Boolean(
        candidate.props?.style &&
          (candidate.props.style as Record<string, unknown>).left === model.layout.tagsLeft &&
          (candidate.props.style as Record<string, unknown>).top === model.layout.tagsTop,
      ),
    );

    expect(titleNode).not.toBeNull();
    expect(titleNode?.props?.style).toEqual(
      expect.objectContaining({
        width: model.titleRenderWidth,
      }),
    );
    const titleLines = toArray(titleNode?.props?.children) as Array<{
      props?: Record<string, unknown>;
    }>;
    expect(titleLines[0]?.props?.style).toEqual(
      expect.objectContaining({
        width: model.titleLineLayouts[0]?.maxWidth,
        maxWidth: model.titleLineLayouts[0]?.maxWidth,
        whiteSpace: "nowrap",
      }),
    );

    expect(tagsNode).not.toBeNull();
    const chips = toArray(tagsNode?.props?.children) as Array<{ props?: Record<string, unknown> }>;
    expect(tagsNode?.props?.style).toEqual(
      expect.objectContaining({
        width: expect.any(Number),
        height: model.layout.tagHeight,
      }),
    );
    expect(chips[0]?.props?.style).toEqual(
      expect.objectContaining({
        position: "absolute",
        left: model.chipLayouts[0]?.x,
        top: 0,
        whiteSpace: "nowrap",
        paddingLeft: 14.5,
        paddingRight: 14.5,
      }),
    );
  });

  it("renders the smoother panel gradient and keeps the processed backdrop above the cover", () => {
    const model = buildProjectOgCardModel({
      project: baseProject,
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const scene = buildProjectOgScene({
      ...model,
      artworkDataUrl: transparentDataUrl,
      backdropDataUrl: transparentDataUrl,
    });
    const children = toArray(scene.props?.children) as TestElement[];
    const artworkIndex = children.findIndex(
      (child) => child?.props?.["data-og-part"] === "artwork",
    );
    const backdropIndex = children.findIndex(
      (child) =>
        child?.props?.["data-og-part"] === "backdrop" &&
        child?.props?.["data-og-processed"] === "true",
    );
    const gradientStops = findAllElements(
      scene,
      (candidate) =>
        typeof candidate.props?.offset === "string" &&
        typeof candidate.props?.stopColor === "string",
    );
    const stopOffsets = gradientStops.map((stop) => stop.props?.offset);
    const stopOpacities = gradientStops.map((stop) => stop.props?.stopOpacity);

    expect(artworkIndex).toBeGreaterThanOrEqual(0);
    expect(backdropIndex).toBeGreaterThan(artworkIndex);
    expect(gradientStops).toHaveLength(7);
    expect(stopOffsets).toEqual(["0%", "12%", "28%", "46%", "66%", "84%", "100%"]);
    expect(stopOpacities).toEqual(["0.86", "0.867", "0.874", "0.881", "0.888", "0.894", "0.90"]);
    expect(gradientStops[0]?.props?.stopColor).toBe(model.palette.accentDarkStart);
    expect(gradientStops[6]?.props?.stopColor).toBe(model.palette.accentDarkEnd);
    expect(gradientStops[1]?.props?.stopColor).not.toBe(model.palette.accentDarkStart);
    expect(gradientStops[5]?.props?.stopColor).not.toBe(model.palette.accentDarkEnd);
  });

  it("uses the reduced artwork bleed while keeping cover fit and fallback geometry aligned", () => {
    const model = buildProjectOgCardModel({
      project: baseProject,
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const sceneWithArtwork = buildProjectOgScene({
      ...model,
      artworkDataUrl: transparentDataUrl,
    });
    const artworkNode = findElement(
      sceneWithArtwork,
      (candidate) => candidate.props?.["data-og-part"] === "artwork",
    );

    expect(model.layout.artworkTop).toBe(-1);
    expect(model.layout.artworkHeight).toBe(632);
    expect(artworkNode).not.toBeNull();
    expect(artworkNode?.props?.style).toEqual(
      expect.objectContaining({
        top: -1,
        height: 632,
        objectFit: "cover",
      }),
    );

    const fallbackModel = buildProjectOgCardModel({
      project: {
        ...baseProject,
        cover: "",
        heroImageUrl: "",
        banner: "",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const fallbackScene = buildProjectOgScene(fallbackModel);
    const fallbackNode = findElement(
      fallbackScene,
      (candidate) => candidate.props?.["data-og-part"] === "artwork-fallback",
    );

    expect(fallbackNode).not.toBeNull();
    expect(fallbackNode?.props?.style).toEqual(
      expect.objectContaining({
        top: -1,
        height: 632,
      }),
    );
  });

  it("renders a dark artwork fallback and no empty image nodes when the project has no images", () => {
    const model = buildProjectOgCardModel({
      project: {
        ...baseProject,
        cover: "",
        heroImageUrl: "",
        banner: "",
      },
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const scene = buildProjectOgScene(model);
    const children = toArray(scene.props?.children) as Array<{ props?: Record<string, unknown> }>;
    const artworkNode = children.find((child) => child?.props?.["data-og-part"] === "artwork");
    const artworkFallbackNode = children.find(
      (child) => child?.props?.["data-og-part"] === "artwork-fallback",
    );
    const backdropNode = children.find((child) => child?.props?.["data-og-part"] === "backdrop");

    expect(artworkNode).toBeUndefined();
    expect(backdropNode).toBeUndefined();
    expect(artworkFallbackNode).toBeDefined();
    expect(artworkFallbackNode?.props?.style).toEqual(
      expect.objectContaining({
        backgroundColor: model.palette.bgBase,
        background: `linear-gradient(180deg, ${model.palette.accentDarkStart} 0%, ${model.palette.accentDarkEnd} 100%)`,
      }),
    );
    expect(
      String(artworkFallbackNode?.props?.style?.["background"] || "").toLowerCase(),
    ).not.toContain("#fff");
    expect(
      String(artworkFallbackNode?.props?.style?.["backgroundColor"] || "").toLowerCase(),
    ).not.toBe("#ffffff");
  });

  it("builds the current and legacy scenes with the project card layer", () => {
    const currentScene = buildProjectOgScene({});
    const legacyScene = buildLegacyProjectOgScene({});
    const currentProps = currentScene.props as Record<string, unknown>;
    const legacyProps = legacyScene.props as Record<string, unknown>;

    expect(currentProps["data-og-layer"]).toBe("project-og-card");
    expect(legacyProps["data-og-layer"]).toBe("project-og-card");
    expect(currentProps.style).toEqual(
      expect.objectContaining({
        display: "flex",
        width: OG_PROJECT_WIDTH,
        height: OG_PROJECT_HEIGHT,
        backgroundColor: "#02050b",
      }),
    );
  });

  it("renders a project PNG through ImageResponse for project OG", async () => {
    const model = buildProjectOgCardModel({
      project: baseProject,
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const response = buildProjectOgImageResponse(model);
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toContain("image/png");
    expect(buffer.length).toBeGreaterThan(0);
    await assertRenderedPng(buffer);
  });

  it("renders a project PNG through legacy ImageResponse path", async () => {
    const model = buildProjectOgCardModel({
      project: baseProject,
      settings: baseSettings,
      tagTranslations: {},
      genreTranslations: {},
      origin: "https://nekomata.moe",
      resolveVariantUrl: (value: string) => value,
    });
    const response = buildLegacyProjectOgImageResponse(model);
    const buffer = Buffer.from(await response.arrayBuffer());

    expect(response.headers.get("content-type")).toContain("image/png");
    expect(buffer.length).toBeGreaterThan(0);
    await assertRenderedPng(buffer);
  });
});
