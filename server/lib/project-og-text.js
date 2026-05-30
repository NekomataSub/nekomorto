import { hexToRgb, normalizeHex, rgbToHex } from "./og-color.js";
import { OG_PROJECT_HEIGHT, OG_PROJECT_WIDTH } from "./project-og-assets.js";
import {
  buildProjectOgChipLayouts,
  buildProjectOgTitleLayout,
  cloneProjectOgLayout,
} from "./project-og-layout.js";

const DEFAULT_ACCENT_HEX = "#9667e0";
const DEFAULT_BACKGROUND = "#02050b";
const EYEBROW_SEPARATOR = "\u2022";

export const PROJECT_OG_SCENE_VERSION = "project-og-v4";

const truncateText = (value, maxLength) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

export const normalizeProjectOgKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const PROJECT_OG_AUTHOR_ROLE_PRIORITY = [
  "original creator",
  "autor original",
  "story & art",
  "story and art",
  "historia e arte",
  "original story",
  "historia original",
  "story",
  "historia",
  "art",
  "arte",
  "writer",
  "roteiro",
  "illustration",
  "ilustracao",
];

const normalizeProjectOgRoleKey = (value) =>
  normalizeProjectOgKey(
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );

const resolveProjectOgSubtitle = (project) => {
  const studio = String(project?.studio || "").trim();
  if (studio) {
    return studio;
  }

  const animeStaff = Array.isArray(project?.animeStaff) ? project.animeStaff : [];
  for (const roleKey of PROJECT_OG_AUTHOR_ROLE_PRIORITY) {
    const staffEntry = animeStaff.find(
      (entry) => normalizeProjectOgRoleKey(entry?.role) === roleKey,
    );
    if (!staffEntry) {
      continue;
    }
    const authorName = (Array.isArray(staffEntry?.members) ? staffEntry.members : [])
      .map((member) => String(member || "").trim())
      .find(Boolean);
    if (authorName) {
      return authorName;
    }
  }

  return "";
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const rgbToHsl = ({ r, g, b }) => {
  const normalizedR = r / 255;
  const normalizedG = g / 255;
  const normalizedB = b / 255;
  const max = Math.max(normalizedR, normalizedG, normalizedB);
  const min = Math.min(normalizedR, normalizedG, normalizedB);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === normalizedR) {
      hue = ((normalizedG - normalizedB) / delta) % 6;
    } else if (max === normalizedG) {
      hue = (normalizedB - normalizedR) / delta + 2;
    } else {
      hue = (normalizedR - normalizedG) / delta + 4;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return {
    h: Math.round(hue),
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
};

const hslToRgb = ({ h, s, l }) => {
  const normalizedHue = ((Number(h) % 360) + 360) % 360;
  const normalizedSaturation = clamp(Number(s), 0, 100) / 100;
  const normalizedLightness = clamp(Number(l), 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const hueSegment = normalizedHue / 60;
  const x = chroma * (1 - Math.abs((hueSegment % 2) - 1));

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hueSegment >= 0 && hueSegment < 1) {
    red = chroma;
    green = x;
  } else if (hueSegment >= 1 && hueSegment < 2) {
    red = x;
    green = chroma;
  } else if (hueSegment >= 2 && hueSegment < 3) {
    green = chroma;
    blue = x;
  } else if (hueSegment >= 3 && hueSegment < 4) {
    green = x;
    blue = chroma;
  } else if (hueSegment >= 4 && hueSegment < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const match = normalizedLightness - chroma / 2;
  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  };
};

const hslToHex = (value) => rgbToHex(hslToRgb(value));

const rgba = (rgb, alpha) =>
  `rgba(${clamp(Math.round(rgb.r), 0, 255)}, ${clamp(Math.round(rgb.g), 0, 255)}, ${clamp(
    Math.round(rgb.b),
    0,
    255,
  )}, ${alpha})`;

const toTranslationMap = (record) => {
  const map = new Map();
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return map;
  }
  Object.entries(record).forEach(([key, value]) => {
    const normalized = normalizeProjectOgKey(key);
    if (!normalized) {
      return;
    }
    map.set(normalized, String(value || "").trim());
  });
  return map;
};

const translateValue = (value, map) => {
  const normalized = normalizeProjectOgKey(value);
  if (!normalized) {
    return "";
  }
  const translated = map.get(normalized);
  return translated && translated.trim() ? translated : String(value || "").trim();
};

const pickProjectImageCandidate = (project, candidates, resolveVariantUrl, origin) => {
  const safeCandidates = Array.isArray(candidates) ? candidates : [];

  for (const candidate of safeCandidates) {
    if (!candidate.url) {
      continue;
    }
    const resolvedUrl =
      typeof resolveVariantUrl === "function"
        ? String(resolveVariantUrl(candidate.url, candidate.preset) || "").trim()
        : candidate.url;
    const finalUrl = resolvedUrl || candidate.url;
    if (!finalUrl) {
      continue;
    }
    if (finalUrl.startsWith("/") && !finalUrl.startsWith("/uploads/") && origin) {
      return {
        artworkSource: candidate.source,
        artworkUrl: `${String(origin).replace(/\/+$/, "")}${finalUrl}`,
      };
    }
    return {
      artworkSource: candidate.source,
      artworkUrl: finalUrl,
    };
  }

  return {
    artworkSource: "none",
    artworkUrl: "",
  };
};

const pickArtworkCandidate = (project, resolveVariantUrl, origin) =>
  pickProjectImageCandidate(
    project,
    [
      { source: "cover", url: String(project?.cover || "").trim(), preset: "poster" },
      { source: "heroImageUrl", url: String(project?.heroImageUrl || "").trim(), preset: "hero" },
      { source: "banner", url: String(project?.banner || "").trim(), preset: "hero" },
    ],
    resolveVariantUrl,
    origin,
  );

const pickBackdropCandidate = (project, resolveVariantUrl, origin) =>
  pickProjectImageCandidate(
    project,
    [
      { source: "banner", url: String(project?.banner || "").trim(), preset: "hero" },
      { source: "heroImageUrl", url: String(project?.heroImageUrl || "").trim(), preset: "hero" },
      { source: "cover", url: String(project?.cover || "").trim(), preset: "poster" },
    ],
    resolveVariantUrl,
    origin,
  );

export const resolveProjectOgPalette = (accentHex) => {
  const accentPrimary = normalizeHex(accentHex) || DEFAULT_ACCENT_HEX;
  const rgb = hexToRgb(accentPrimary) || hexToRgb(DEFAULT_ACCENT_HEX);
  const hsl = rgbToHsl(rgb);

  return {
    accentPrimary,
    accentDivider: accentPrimary,
    accentLine: accentPrimary,
    accentGlow: rgba(rgb, 0.28),
    accentDarkStart: hslToHex({
      h: hsl.h,
      s: clamp(Math.max(hsl.s - 6, 46), 0, 100),
      l: 9,
    }),
    accentDarkEnd: hslToHex({
      h: hsl.h,
      s: clamp(Math.max(hsl.s - 18, 34), 0, 100),
      l: 4,
    }),
    bgBase: DEFAULT_BACKGROUND,
  };
};

export const buildProjectOgCardModel = ({
  project,
  settings,
  tagTranslations,
  genreTranslations,
  origin,
  resolveVariantUrl,
  titleLayoutOptions,
} = {}) => {
  const safeProject = project && typeof project === "object" ? project : {};
  const layout = cloneProjectOgLayout();
  const title = String(safeProject.title || "").trim() || "Projeto";
  const titleLayout = buildProjectOgTitleLayout(title, layout, titleLayoutOptions);
  const subtitle = truncateText(resolveProjectOgSubtitle(safeProject), 42);
  const eyebrowParts = [safeProject.type, safeProject.status]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const imageAlt = `Card de compartilhamento do projeto ${title}`;

  const genreMap = toTranslationMap(genreTranslations);
  const tagMap = toTranslationMap(tagTranslations);
  const sourceValues = [
    ...(Array.isArray(safeProject.genres)
      ? safeProject.genres.map((value) => translateValue(value, genreMap))
      : []),
    ...(Array.isArray(safeProject.tags)
      ? safeProject.tags.map((value) => translateValue(value, tagMap))
      : []),
  ];

  const seenChips = new Set();
  const chips = [];
  sourceValues.forEach((value) => {
    const normalized = normalizeProjectOgKey(value);
    if (!normalized || seenChips.has(normalized)) {
      return;
    }
    seenChips.add(normalized);
    chips.push(String(value || "").trim());
  });

  const palette = resolveProjectOgPalette(settings?.theme?.accent);
  const artwork = pickArtworkCandidate(safeProject, resolveVariantUrl, origin);
  const backdrop = pickBackdropCandidate(safeProject, resolveVariantUrl, origin);
  const chipLayouts = buildProjectOgChipLayouts(chips, layout);

  return {
    width: OG_PROJECT_WIDTH,
    height: OG_PROJECT_HEIGHT,
    eyebrow: eyebrowParts.join(` ${EYEBROW_SEPARATOR} `),
    eyebrowParts,
    eyebrowSeparator: EYEBROW_SEPARATOR,
    title,
    titleLines: titleLayout.lines,
    titleLineLayouts: titleLayout.lineLayouts,
    subtitle,
    subtitleTop: titleLayout.subtitleTop,
    subtitleBottom: titleLayout.subtitleBottom,
    subtitleBottomLimit: titleLayout.subtitleBottomLimit,
    titleTruncated: titleLayout.truncated,
    chips,
    chipLayouts,
    imageAlt,
    artworkUrl: artwork.artworkUrl,
    artworkSource: artwork.artworkSource,
    artworkDataUrl: "",
    backdropUrl: backdrop.artworkUrl,
    backdropSource: backdrop.artworkSource,
    backdropDataUrl: "",
    sceneVersion: PROJECT_OG_SCENE_VERSION,
    palette,
    titleFontSize: titleLayout.fontSize,
    titleLineHeight: titleLayout.lineHeight,
    titleRenderWidth: titleLayout.renderWidth,
    titleHeight: titleLayout.height,
    layout,
    fontFamilies: {
      title: "Geist",
      eyebrow: "Geist",
      subtitle: "Geist",
      chip: "Geist",
    },
  };
};
