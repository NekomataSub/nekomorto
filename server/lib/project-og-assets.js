import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "@shuding/opentype.js/dist/opentype.module.js";
import sharp from "sharp";

export const OG_PROJECT_WIDTH = 1200;
export const OG_PROJECT_HEIGHT = 630;

export const PROJECT_OG_TITLE_FONT_WEIGHT = 700;
export const PROJECT_OG_EYEBROW_FONT_WEIGHT = 300;
export const PROJECT_OG_SUBTITLE_FONT_WEIGHT = 500;
export const PROJECT_OG_CHIP_FONT_WEIGHT = 200;

export const DEFAULT_PROJECT_OG_LAYOUT = Object.freeze({
  artworkLeft: 747,
  artworkTop: -1,
  artworkWidth: 453,
  artworkHeight: 632,
  backdropLeft: 0,
  backdropTop: 0,
  backdropWidth: 803,
  backdropHeight: 630,
  eyebrowLeft: 57.57,
  eyebrowTop: 55,
  eyebrowFontSize: 28.636211395263672,
  eyebrowDotLeftInset: 7.97,
  eyebrowDotSize: 6.94,
  eyebrowDotGap: 7.81,
  titleLeft: 53,
  titleTop: 93.83402252197266,
  titleWidth: 493.2709655761719,
  titleMaxLines: 4,
  titleBaseFontSize: 72.0604476928711,
  titleMinFontSize: 46,
  subtitleLeft: 55.284423828125,
  subtitleBaseTop: 193.2034454345703,
  subtitleFontSize: 30.654399871826172,
  subtitleGap: 18,
  subtitleLimitGap: 24,
  subtitleMaxWidth: 360,
  tagsLeft: 56,
  tagsTop: 560,
  tagsMaxWidth: 564,
  tagGap: 24,
  tagHeight: 29,
  tagRadius: 15.84,
  tagFontSize: 22.17411994934082,
  tagPaddingX: 14.5,
  dividerLeft: 744,
  dividerTop: 0,
  dividerWidth: 59,
  dividerHeight: 631,
  dividerStrokeWidth: 9,
  panelPoints: "0,0 803,0 744,630 0,630",
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT_DIR = path.join(__dirname, "..", "..");
const PUBLIC_DIR = path.join(PROJECT_ROOT_DIR, "public");
const SERVER_ASSETS_DIR = path.join(PROJECT_ROOT_DIR, "server", "assets");

const TRANSPARENT_PIXEL_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const PROJECT_OG_BACKDROP_BLUR = 10;

const FONT_FILES = Object.freeze({
  200: path.join(SERVER_ASSETS_DIR, "og-fonts", "geist", "Geist-UltraLight.ttf"),
  300: path.join(SERVER_ASSETS_DIR, "og-fonts", "geist", "Geist-Light.ttf"),
  500: path.join(SERVER_ASSETS_DIR, "og-fonts", "geist", "Geist-Medium.ttf"),
  700: path.join(SERVER_ASSETS_DIR, "og-fonts", "geist", "Geist-Bold.ttf"),
});

const fontBufferCache = new Map();
const fontParserCache = new Map();
let projectOgFontsCache = null;

const getFontBufferByWeight = (weight) => {
  const normalizedWeight = Number(weight);
  if (fontBufferCache.has(normalizedWeight)) {
    return fontBufferCache.get(normalizedWeight) || null;
  }
  const filePath = FONT_FILES[normalizedWeight];
  let buffer = null;
  try {
    if (filePath && fs.existsSync(filePath)) {
      buffer = fs.readFileSync(filePath);
    }
  } catch {
    buffer = null;
  }
  fontBufferCache.set(normalizedWeight, buffer);
  return buffer;
};

const getFontParserByWeight = (weight) => {
  const normalizedWeight = Number(weight);
  if (fontParserCache.has(normalizedWeight)) {
    return fontParserCache.get(normalizedWeight) || null;
  }
  const buffer = getFontBufferByWeight(normalizedWeight);
  if (!buffer) {
    fontParserCache.set(normalizedWeight, null);
    return null;
  }
  try {
    const parsed = opentype.parse(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    );
    fontParserCache.set(normalizedWeight, parsed);
    return parsed;
  } catch {
    fontParserCache.set(normalizedWeight, null);
    return null;
  }
};

export const measureTextWidth = ({ text, fontSize, fontWeight }) => {
  const normalizedText = String(text || "");
  if (!normalizedText) {
    return 0;
  }
  const font = getFontParserByWeight(fontWeight);
  if (!font?.getAdvanceWidth) {
    return normalizedText.length * fontSize * 0.56;
  }
  try {
    return font.getAdvanceWidth(normalizedText, fontSize);
  } catch {
    return normalizedText.length * fontSize * 0.56;
  }
};

const guessMimeType = (value) => {
  const lower = String(value || "").toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".webp")) {
    return "image/webp";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (lower.endsWith(".avif")) {
    return "image/avif";
  }
  return "application/octet-stream";
};

const bufferToDataUrl = (buffer, mimeType) =>
  `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;

const parseDataUrlAsset = (value) => {
  const normalized = String(value || "").trim();
  if (!normalized.startsWith("data:")) {
    return null;
  }
  const separatorIndex = normalized.indexOf(",");
  if (separatorIndex <= 5) {
    return null;
  }
  const header = normalized.slice(5, separatorIndex);
  const body = normalized.slice(separatorIndex + 1);
  const mimeType = header.split(";")[0] || "application/octet-stream";
  const isBase64 = /(?:^|;)base64(?:;|$)/i.test(header);

  try {
    return {
      buffer: isBase64
        ? Buffer.from(body, "base64")
        : Buffer.from(decodeURIComponent(body), "utf8"),
      mimeType,
    };
  } catch {
    return null;
  }
};

const loadLocalArtworkAsset = (artworkUrl) => {
  const normalized = String(artworkUrl || "").trim();
  if (!normalized.startsWith("/")) {
    return null;
  }

  const filePath = path.join(PUBLIC_DIR, normalized.replace(/^\/+/, "").replace(/\//g, path.sep));
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return null;
    }
    return {
      buffer: fs.readFileSync(filePath),
      mimeType: guessMimeType(filePath),
    };
  } catch {
    return null;
  }
};

const loadRemoteArtworkAsset = async (artworkUrl) => {
  const normalized = String(artworkUrl || "").trim();
  if (!normalized) {
    return null;
  }
  let url;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const hostname = String(url.hostname || "")
    .trim()
    .toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]" ||
    hostname.startsWith("169.254.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
  ) {
    return null;
  }
  try {
    const response = await fetch(url.toString(), { redirect: "error" });
    if (!response.ok) {
      return null;
    }
    const mimeType = String(response.headers.get("content-type") || guessMimeType(normalized))
      .split(";")[0]
      .trim();
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: mimeType || guessMimeType(normalized),
    };
  } catch {
    return null;
  }
};

const loadProjectOgArtworkAsset = async ({ artworkUrl, artworkDataUrl, origin } = {}) => {
  const inlineAsset = parseDataUrlAsset(artworkDataUrl);
  if (inlineAsset?.buffer) {
    return inlineAsset;
  }

  const normalized = String(artworkUrl || "").trim();
  if (!normalized) {
    return null;
  }

  const embeddedUrlAsset = parseDataUrlAsset(normalized);
  if (embeddedUrlAsset?.buffer) {
    return embeddedUrlAsset;
  }

  const localAsset = loadLocalArtworkAsset(normalized);
  if (localAsset?.buffer) {
    return localAsset;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return loadRemoteArtworkAsset(normalized);
  }

  if (normalized.startsWith("/") && origin) {
    return loadRemoteArtworkAsset(`${String(origin).replace(/\/+$/, "")}${normalized}`);
  }

  return null;
};

export const toRoundedPositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.round(numeric);
};

export const parseProjectOgPolygonPoints = (value) =>
  String(value || "")
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const [x, y] = pair.split(",");
      const parsedX = Number(x);
      const parsedY = Number(y);
      if (!Number.isFinite(parsedX) || !Number.isFinite(parsedY)) {
        return null;
      }
      return {
        x: Math.round(parsedX),
        y: Math.round(parsedY),
      };
    })
    .filter(Boolean);

const buildBackdropMaskPoints = (layout = DEFAULT_PROJECT_OG_LAYOUT) => {
  const points = parseProjectOgPolygonPoints(layout.panelPoints);
  if (points.length > 0) {
    return points.map((point) => `${point.x},${point.y}`).join(" ");
  }

  const backdropWidth = toRoundedPositiveNumber(layout.backdropWidth, 803);
  const backdropHeight = toRoundedPositiveNumber(layout.backdropHeight, OG_PROJECT_HEIGHT);
  const dividerLeft = toRoundedPositiveNumber(layout.dividerLeft, backdropWidth);
  return `0,0 ${backdropWidth},0 ${dividerLeft},${backdropHeight} 0,${backdropHeight}`;
};

const buildBackdropMaskSvg = (layout = DEFAULT_PROJECT_OG_LAYOUT) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_PROJECT_WIDTH}" height="${OG_PROJECT_HEIGHT}" viewBox="0 0 ${OG_PROJECT_WIDTH} ${OG_PROJECT_HEIGHT}"><polygon fill="#ffffff" points="${buildBackdropMaskPoints(layout)}"/></svg>`,
    "utf8",
  );

const buildProcessedBackdropBuffer = async ({
  buffer,
  layout = DEFAULT_PROJECT_OG_LAYOUT,
} = {}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return Buffer.alloc(0);
  }

  const backdropLeft = Math.round(Number(layout.backdropLeft) || 0);
  const backdropTop = Math.round(Number(layout.backdropTop) || 0);
  const backdropWidth = toRoundedPositiveNumber(layout.backdropWidth, 803);
  const backdropHeight = toRoundedPositiveNumber(layout.backdropHeight, OG_PROJECT_HEIGHT);
  const overscan = Math.max(
    toRoundedPositiveNumber(layout.dividerWidth, 0),
    Math.round(PROJECT_OG_BACKDROP_BLUR * 2),
  );
  const maskedBackdrop = await sharp(buffer)
    .resize({
      width: backdropWidth + overscan,
      height: backdropHeight,
      fit: "cover",
      position: "centre",
    })
    .ensureAlpha()
    .blur(PROJECT_OG_BACKDROP_BLUR)
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: OG_PROJECT_WIDTH,
      height: OG_PROJECT_HEIGHT,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0,
      },
    },
  })
    .composite([
      {
        input: maskedBackdrop,
        left: backdropLeft,
        top: backdropTop,
      },
      {
        input: buildBackdropMaskSvg(layout),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
};

export const loadProjectOgStaticAssetDataUrl = (_name) => TRANSPARENT_PIXEL_DATA_URL;

export const loadProjectOgFontBuffers = () => ({
  title: getFontBufferByWeight(PROJECT_OG_TITLE_FONT_WEIGHT),
  eyebrow: getFontBufferByWeight(PROJECT_OG_EYEBROW_FONT_WEIGHT),
  subtitle: getFontBufferByWeight(PROJECT_OG_SUBTITLE_FONT_WEIGHT),
  chip: getFontBufferByWeight(PROJECT_OG_CHIP_FONT_WEIGHT),
});

export const buildProjectOgFonts = () => {
  if (projectOgFontsCache) {
    return projectOgFontsCache;
  }

  const fonts = [
    {
      weight: PROJECT_OG_CHIP_FONT_WEIGHT,
      data: getFontBufferByWeight(PROJECT_OG_CHIP_FONT_WEIGHT),
    },
    {
      weight: PROJECT_OG_EYEBROW_FONT_WEIGHT,
      data: getFontBufferByWeight(PROJECT_OG_EYEBROW_FONT_WEIGHT),
    },
    {
      weight: PROJECT_OG_SUBTITLE_FONT_WEIGHT,
      data: getFontBufferByWeight(PROJECT_OG_SUBTITLE_FONT_WEIGHT),
    },
    {
      weight: PROJECT_OG_TITLE_FONT_WEIGHT,
      data: getFontBufferByWeight(PROJECT_OG_TITLE_FONT_WEIGHT),
    },
  ]
    .filter((entry) => entry.data)
    .map((entry) => ({
      name: "Geist",
      data: entry.data,
      weight: entry.weight,
      style: "normal",
    }));

  projectOgFontsCache = fonts;
  return projectOgFontsCache;
};

export const loadProjectOgArtworkDataUrl = async ({ artworkUrl, origin } = {}) => {
  const normalized = String(artworkUrl || "").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("data:")) {
    return normalized;
  }

  const localAsset = loadLocalArtworkAsset(normalized);
  if (localAsset?.buffer) {
    return bufferToDataUrl(localAsset.buffer, localAsset.mimeType || guessMimeType(artworkUrl));
  }

  if (/^https?:\/\//i.test(normalized)) {
    return "";
  }

  if (normalized.startsWith("/") && origin) {
    const remoteAsset = await loadRemoteArtworkAsset(
      `${String(origin).replace(/\/+$/, "")}${normalized}`,
    );
    if (remoteAsset?.buffer) {
      return bufferToDataUrl(remoteAsset.buffer, remoteAsset.mimeType || guessMimeType(artworkUrl));
    }
  }

  return "";
};

export const loadProjectOgProcessedBackdropDataUrl = async ({
  artworkUrl,
  artworkDataUrl,
  origin,
  layout = DEFAULT_PROJECT_OG_LAYOUT,
} = {}) => {
  const asset = await loadProjectOgArtworkAsset({
    artworkUrl,
    artworkDataUrl,
    origin,
  });
  if (!asset?.buffer) {
    return "";
  }
  try {
    const processedBuffer = await buildProcessedBackdropBuffer({
      buffer: asset.buffer,
      layout,
    });
    if (!Buffer.isBuffer(processedBuffer) || processedBuffer.length === 0) {
      return "";
    }
    return bufferToDataUrl(processedBuffer, "image/png");
  } catch {
    return "";
  }
};
