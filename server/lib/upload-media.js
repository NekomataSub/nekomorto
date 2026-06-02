import crypto from "crypto";
import fs from "fs";
import path from "path";
import sharp from "sharp";

export const UPLOAD_VARIANT_PRESETS = Object.freeze({
  card: Object.freeze({ width: 1280, height: 853 }),
  cardHomeXs: Object.freeze({ width: 480, height: 320 }),
  cardHomeSm: Object.freeze({ width: 800, height: 533 }),
  cardHome: Object.freeze({ width: 960, height: 640 }),
  cardWide: Object.freeze({ width: 1280, height: 720 }),
  heroXs: Object.freeze({ width: 768, height: 432 }),
  heroSm: Object.freeze({ width: 960, height: 540 }),
  heroMd: Object.freeze({ width: 1280, height: 720 }),
  hero: Object.freeze({ width: 1600, height: 900 }),
  og: Object.freeze({ width: 1200, height: 675 }),
  poster: Object.freeze({ width: 920, height: 1300 }),
  posterThumbSm: Object.freeze({ width: 192, height: 272 }),
  posterThumb: Object.freeze({ width: 320, height: 452 }),
  square: Object.freeze({ width: 512, height: 512 }),
});

export const UPLOAD_VARIANT_PRESET_KEYS = Object.freeze(Object.keys(UPLOAD_VARIANT_PRESETS));
export const PROJECT_UPLOAD_VARIANT_PRESET_KEYS = Object.freeze([
  "cardHomeXs",
  "cardHomeSm",
  "cardHome",
  "cardWide",
  "heroXs",
  "heroSm",
  "heroMd",
  "hero",
  "poster",
  "posterThumbSm",
  "posterThumb",
]);
export const POST_UPLOAD_VARIANT_PRESET_KEYS = Object.freeze([
  "card",
  "cardHomeXs",
  "cardHomeSm",
  "cardHome",
  "heroXs",
  "heroSm",
  "heroMd",
  "hero",
]);
export const USER_UPLOAD_VARIANT_PRESET_KEYS = Object.freeze(["square"]);
const DISABLED_UPLOAD_VARIANT_AREAS = new Set([
  "root",
  "branding",
  "shared",
  "downloads",
  "socials",
  "tmp",
]);
export const DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY = 90;
const UPLOAD_VARIANT_AVIF_QUALITY_MIN = 1;
const UPLOAD_VARIANT_AVIF_QUALITY_MAX = 100;
const UPLOAD_FOCAL_PRESET_KEYS = Object.freeze(["card", "hero"]);
const UPLOAD_FOCAL_PRESET_FALLBACK_ORDER = Object.freeze({
  card: Object.freeze(["card", "og", "thumb"]),
  hero: Object.freeze(["hero"]),
});
const FULL_FOCAL_CROP_RECT = Object.freeze({
  left: 0,
  top: 0,
  width: 1,
  height: 1,
});

const RASTER_UPLOAD_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

const toNumberOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const roundNormalized = (value) => Math.round(value * 1_000_000) / 1_000_000;

const normalizeUploadMime = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (normalized === "image/jpg") {
    return "image/jpeg";
  }
  return normalized;
};

const toArea = (value) => {
  const trimmed = String(value || "")
    .trim()
    .replace(/^\/+/, "");
  if (!trimmed) {
    return "root";
  }
  const [root] = trimmed.split(/[\\/]/);
  return String(root || "root").toLowerCase() || "root";
};

const toPosix = (value) => String(value || "").replace(/\\/g, "/");

const sanitizeVariantVersion = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return Math.floor(parsed);
};

const normalizeVariantPresetKeyList = (value) => {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const next = [];
  list.forEach((item) => {
    const presetKey = String(item || "").trim();
    if (!presetKey || !Object.prototype.hasOwnProperty.call(UPLOAD_VARIANT_PRESETS, presetKey)) {
      return;
    }
    if (seen.has(presetKey)) {
      return;
    }
    seen.add(presetKey);
    next.push(presetKey);
  });
  return next;
};

export const normalizeUploadVariantPresetKeys = (value) => normalizeVariantPresetKeyList(value);

const resolveNormalizedUploadVariantAvifQuality = (value) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY;
  }
  if (!/^\d+$/.test(normalized)) {
    return DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY;
  }
  const parsed = Number(normalized);
  if (
    !Number.isInteger(parsed) ||
    parsed < UPLOAD_VARIANT_AVIF_QUALITY_MIN ||
    parsed > UPLOAD_VARIANT_AVIF_QUALITY_MAX
  ) {
    return DEFAULT_UPLOAD_VARIANT_AVIF_QUALITY;
  }
  return parsed;
};

export const resolveUploadVariantAvifQuality = (_presetKey, { env = process.env } = {}) =>
  resolveNormalizedUploadVariantAvifQuality(env?.UPLOAD_VARIANT_AVIF_QUALITY);

export const mergeUploadVariantPresetKeys = (...values) => {
  const merged = values.flatMap((item) => normalizeVariantPresetKeyList(item));
  return normalizeVariantPresetKeyList(merged);
};

export const resolveUploadVariantPresetKeysForArea = (value) => {
  const area = toArea(value);
  if (area === "projects") {
    return [...PROJECT_UPLOAD_VARIANT_PRESET_KEYS];
  }
  if (area === "posts") {
    return [...POST_UPLOAD_VARIANT_PRESET_KEYS];
  }
  if (area === "users") {
    return [...USER_UPLOAD_VARIANT_PRESET_KEYS];
  }
  if (DISABLED_UPLOAD_VARIANT_AREAS.has(area)) {
    return [];
  }
  return [...UPLOAD_VARIANT_PRESET_KEYS];
};

export const resolveUploadVariantPresetKeysForEntry = (entry) => {
  const area = String(entry?.area || "").trim();
  if (area) {
    return resolveUploadVariantPresetKeysForArea(area);
  }
  return resolveUploadVariantPresetKeysForArea(entry?.folder || "");
};

const normalizeVariantFormats = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const next = {};
  if (source.avif && typeof source.avif === "object") {
    next.avif = source.avif;
  }
  if (source.webp && typeof source.webp === "object") {
    next.webp = source.webp;
  }
  if (source.fallback && typeof source.fallback === "object") {
    next.fallback = source.fallback;
  }
  return next;
};

const normalizeVariantRecord = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const formats = normalizeVariantFormats(source.formats);
  return {
    width: toNumberOrNull(source.width),
    height: toNumberOrNull(source.height),
    formats,
  };
};

const sumVariantSizes = (variants) => {
  let bytes = 0;
  let files = 0;
  const source = variants && typeof variants === "object" ? variants : {};
  Object.values(source).forEach((record) => {
    const normalized = normalizeVariantRecord(record);
    Object.values(normalized.formats).forEach((format) => {
      if (!format || typeof format !== "object") {
        return;
      }
      const size = Number(format.size);
      if (!Number.isFinite(size) || size < 0) {
        return;
      }
      bytes += size;
      files += 1;
    });
  });
  return { bytes, files };
};

const computeFocalCoverRect = ({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  focalPoint,
}) => {
  const safeSourceWidth = Math.max(1, Math.floor(Number(sourceWidth || 1)));
  const safeSourceHeight = Math.max(1, Math.floor(Number(sourceHeight || 1)));
  const safeTargetWidth = Math.max(1, Math.floor(Number(targetWidth || 1)));
  const safeTargetHeight = Math.max(1, Math.floor(Number(targetHeight || 1)));

  const sourceRatio = safeSourceWidth / safeSourceHeight;
  const targetRatio = safeTargetWidth / safeTargetHeight;
  let cropWidth = safeSourceWidth;
  let cropHeight = safeSourceHeight;

  if (sourceRatio > targetRatio) {
    cropWidth = Math.round(safeSourceHeight * targetRatio);
    cropHeight = safeSourceHeight;
  } else if (sourceRatio < targetRatio) {
    cropWidth = safeSourceWidth;
    cropHeight = Math.round(safeSourceWidth / targetRatio);
  }

  cropWidth = clamp(cropWidth, 1, safeSourceWidth);
  cropHeight = clamp(cropHeight, 1, safeSourceHeight);

  const focal = normalizeFocalPoint(focalPoint);
  const centerX = focal.x * safeSourceWidth;
  const centerY = focal.y * safeSourceHeight;
  const maxLeft = safeSourceWidth - cropWidth;
  const maxTop = safeSourceHeight - cropHeight;
  const left = clamp(Math.round(centerX - cropWidth / 2), 0, Math.max(0, maxLeft));
  const top = clamp(Math.round(centerY - cropHeight / 2), 0, Math.max(0, maxTop));

  return {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
  };
};

const toUploadVariantUrl = ({ uploadId, preset, version, extension }) =>
  `/uploads/_variants/${encodeURIComponent(uploadId)}/${preset}-v${version}.${extension}`;

const isPathInsideRoot = (rootPath, targetPath) => {
  const safeRoot = path.resolve(rootPath);
  const safeTarget = path.resolve(targetPath);
  const relative = path.relative(safeRoot, safeTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveUploadVariantDirectory = (uploadsDir, uploadId) => {
  const safeUploadsDir = String(uploadsDir || "").trim();
  const safeUploadId = String(uploadId || "").trim();
  if (!safeUploadsDir || !safeUploadId) {
    return null;
  }
  const variantsRootDir = path.resolve(path.join(safeUploadsDir, "_variants"));
  const variantDir = path.resolve(path.join(variantsRootDir, safeUploadId));
  if (!isPathInsideRoot(variantsRootDir, variantDir)) {
    throw new Error("invalid_variant_path");
  }
  return variantDir;
};

const removeUploadVariantDirectory = (uploadsDir, uploadId) => {
  const variantDir = resolveUploadVariantDirectory(uploadsDir, uploadId);
  if (!variantDir) {
    return null;
  }
  fs.rmSync(variantDir, { recursive: true, force: true });
  return variantDir;
};

const resetVariantDirectory = (uploadsDir, uploadId) => {
  const dir = resolveUploadVariantDirectory(uploadsDir, uploadId);
  if (!dir) {
    return null;
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

const createBaseVariantPipeline = ({ sourcePath, rect, preset }) =>
  sharp(sourcePath, { animated: false }).extract(rect).resize(preset.width, preset.height, {
    fit: "fill",
    withoutEnlargement: true,
  });

const createVariantFilePath = ({ dir, preset, version, extension }) =>
  path.join(dir, `${preset}-v${version}.${extension}`);

export const normalizeVariants = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const next = {};
  UPLOAD_VARIANT_PRESET_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      return;
    }
    next[key] = normalizeVariantRecord(source[key]);
  });
  return next;
};

export const isRasterUploadMime = (mime) => RASTER_UPLOAD_MIMES.has(normalizeUploadMime(mime));

export const normalizeFocalPoint = (value) => {
  const source = value && typeof value === "object" ? value : {};
  const x = Number(source.x);
  const y = Number(source.y);
  return {
    x: Number.isFinite(x) ? clamp(x, 0, 1) : 0.5,
    y: Number.isFinite(y) ? clamp(y, 0, 1) : 0.5,
  };
};

const isFocalPointValue = (value) =>
  Boolean(value && typeof value === "object" && ("x" in value || "y" in value));

const isFocalCropRectValue = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      ("left" in value || "top" in value || "width" in value || "height" in value),
  );

const resolvePresetFocalSource = ({ value, fallback, presetKey }) => {
  if (isFocalPointValue(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of UPLOAD_FOCAL_PRESET_FALLBACK_ORDER[presetKey] || []) {
      if (value[key] && typeof value[key] === "object") {
        return value[key];
      }
    }
  }
  if (isFocalPointValue(fallback)) {
    return fallback;
  }
  if (fallback && typeof fallback === "object") {
    for (const key of UPLOAD_FOCAL_PRESET_FALLBACK_ORDER[presetKey] || []) {
      if (fallback[key] && typeof fallback[key] === "object") {
        return fallback[key];
      }
    }
  }
  return null;
};

const resolvePresetFocalCropSource = ({ value, fallback, presetKey }) => {
  if (isFocalCropRectValue(value)) {
    return value;
  }
  if (value && typeof value === "object" && isFocalCropRectValue(value[presetKey])) {
    return value[presetKey];
  }
  if (isFocalCropRectValue(fallback)) {
    return fallback;
  }
  if (fallback && typeof fallback === "object" && isFocalCropRectValue(fallback[presetKey])) {
    return fallback[presetKey];
  }
  return null;
};

export const normalizeFocalCropRect = (value, fallbackValue) => {
  const source = value && typeof value === "object" ? value : null;
  const fallback =
    fallbackValue && typeof fallbackValue === "object" ? fallbackValue : FULL_FOCAL_CROP_RECT;
  const fallbackLeft = Number(fallback.left);
  const fallbackTop = Number(fallback.top);
  const fallbackWidth = Number(fallback.width);
  const fallbackHeight = Number(fallback.height);
  let width = Number(source?.width);
  let height = Number(source?.height);

  if (!Number.isFinite(width) || width <= 0) {
    width = Number.isFinite(fallbackWidth) && fallbackWidth > 0 ? fallbackWidth : 1;
  }
  if (!Number.isFinite(height) || height <= 0) {
    height = Number.isFinite(fallbackHeight) && fallbackHeight > 0 ? fallbackHeight : 1;
  }

  width = clamp(width, Number.EPSILON, 1);
  height = clamp(height, Number.EPSILON, 1);

  let left = Number(source?.left);
  let top = Number(source?.top);
  if (!Number.isFinite(left)) {
    left = Number.isFinite(fallbackLeft) ? fallbackLeft : 0;
  }
  if (!Number.isFinite(top)) {
    top = Number.isFinite(fallbackTop) ? fallbackTop : 0;
  }

  left = clamp(left, 0, 1);
  top = clamp(top, 0, 1);

  if (left + width > 1) {
    left = Math.max(0, 1 - width);
  }
  if (top + height > 1) {
    top = Math.max(0, 1 - height);
  }

  return {
    left,
    top,
    width,
    height,
  };
};

export const deriveFocalPointFromCropRect = (value) => {
  const rect = normalizeFocalCropRect(value);
  return normalizeFocalPoint({
    x: roundNormalized(rect.left + rect.width / 2),
    y: roundNormalized(rect.top + rect.height / 2),
  });
};

export const deriveDefaultFocalCropRect = ({
  presetKey,
  sourceWidth,
  sourceHeight,
  focalPoint,
}) => {
  const preset = UPLOAD_VARIANT_PRESETS[presetKey];
  const safeSourceWidth = Math.max(1, Math.floor(Number(sourceWidth || 1000)));
  const safeSourceHeight = Math.max(1, Math.floor(Number(sourceHeight || 1000)));
  const rect = computeFocalCoverRect({
    sourceWidth: safeSourceWidth,
    sourceHeight: safeSourceHeight,
    targetWidth: preset.width,
    targetHeight: preset.height,
    focalPoint: normalizeFocalPoint(focalPoint),
  });
  return {
    left: rect.left / safeSourceWidth,
    top: rect.top / safeSourceHeight,
    width: rect.width / safeSourceWidth,
    height: rect.height / safeSourceHeight,
  };
};

export const deriveFocalCropsFromPoints = ({
  value,
  fallbackValue,
  sourceWidth,
  sourceHeight,
} = {}) => {
  const next = {};
  UPLOAD_FOCAL_PRESET_KEYS.forEach((presetKey) => {
    next[presetKey] = deriveDefaultFocalCropRect({
      presetKey,
      sourceWidth,
      sourceHeight,
      focalPoint: resolvePresetFocalSource({ value, fallback: fallbackValue, presetKey }),
    });
  });
  return next;
};

export const normalizeFocalCrops = (
  value,
  fallbackValue,
  { sourceWidth, sourceHeight, fallbackPoints, fallbackPoint } = {},
) => {
  const next = {};
  const fallbackFromPoints = deriveFocalCropsFromPoints({
    value: fallbackPoints,
    fallbackValue: fallbackPoint,
    sourceWidth,
    sourceHeight,
  });
  UPLOAD_FOCAL_PRESET_KEYS.forEach((presetKey) => {
    next[presetKey] = normalizeFocalCropRect(
      resolvePresetFocalCropSource({ value, fallback: fallbackValue, presetKey }),
      fallbackFromPoints[presetKey],
    );
  });
  return next;
};

export const normalizeFocalPoints = (value, fallbackValue) => {
  const next = {};
  UPLOAD_FOCAL_PRESET_KEYS.forEach((presetKey) => {
    const cropSource = resolvePresetFocalCropSource({ value, fallback: fallbackValue, presetKey });
    next[presetKey] = cropSource
      ? deriveFocalPointFromCropRect(cropSource)
      : normalizeFocalPoint(
          resolvePresetFocalSource({ value, fallback: fallbackValue, presetKey }),
        );
  });
  return next;
};

export const deriveFocalPointsFromCrops = (value, fallbackValue) =>
  normalizeFocalPoints(value, fallbackValue);

export const getPrimaryFocalPoint = (value, fallbackValue) =>
  normalizeFocalPoints(value, fallbackValue).card;

const computeFocalCoverRectFromCrop = ({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
  focalCrop,
  fallbackFocalPoint,
}) => {
  const fallbackRect = computeFocalCoverRect({
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    focalPoint: fallbackFocalPoint,
  });
  const safeSourceWidth = Math.max(1, Math.floor(Number(sourceWidth || 1)));
  const safeSourceHeight = Math.max(1, Math.floor(Number(sourceHeight || 1)));
  const safeTargetWidth = Math.max(1, Math.floor(Number(targetWidth || 1)));
  const safeTargetHeight = Math.max(1, Math.floor(Number(targetHeight || 1)));
  const normalizedCrop = normalizeFocalCropRect(focalCrop, {
    left: fallbackRect.left / safeSourceWidth,
    top: fallbackRect.top / safeSourceHeight,
    width: fallbackRect.width / safeSourceWidth,
    height: fallbackRect.height / safeSourceHeight,
  });
  const rawWidth = normalizedCrop.width * safeSourceWidth;
  const rawHeight = normalizedCrop.height * safeSourceHeight;
  if (
    !Number.isFinite(rawWidth) ||
    !Number.isFinite(rawHeight) ||
    rawWidth <= 0 ||
    rawHeight <= 0
  ) {
    return fallbackRect;
  }
  const targetRatio = safeTargetWidth / safeTargetHeight;
  const rawRatioDelta = Math.abs(rawWidth / rawHeight - targetRatio);
  if (rawRatioDelta > 0.03) {
    return fallbackRect;
  }
  const cropWidth = clamp(Math.round(rawWidth), 1, safeSourceWidth);
  const cropHeight = clamp(Math.round(rawHeight), 1, safeSourceHeight);
  const roundedRatioDelta = Math.abs(cropWidth / cropHeight - targetRatio);
  if (roundedRatioDelta > 0.04) {
    return fallbackRect;
  }
  return {
    left: clamp(
      Math.round(normalizedCrop.left * safeSourceWidth),
      0,
      Math.max(0, safeSourceWidth - cropWidth),
    ),
    top: clamp(
      Math.round(normalizedCrop.top * safeSourceHeight),
      0,
      Math.max(0, safeSourceHeight - cropHeight),
    ),
    width: cropWidth,
    height: cropHeight,
  };
};

const deriveNestedCoverRect = ({
  baseRect,
  targetWidth,
  targetHeight,
  positionX = 0.5,
  positionY = 0.5,
}) => {
  const safeBaseWidth = Math.max(1, Math.floor(Number(baseRect?.width || 1)));
  const safeBaseHeight = Math.max(1, Math.floor(Number(baseRect?.height || 1)));
  const safeBaseLeft = Math.max(0, Math.floor(Number(baseRect?.left || 0)));
  const safeBaseTop = Math.max(0, Math.floor(Number(baseRect?.top || 0)));
  const nestedRect = computeFocalCoverRect({
    sourceWidth: safeBaseWidth,
    sourceHeight: safeBaseHeight,
    targetWidth,
    targetHeight,
    focalPoint: normalizeFocalPoint({
      x: positionX,
      y: positionY,
    }),
  });

  return {
    left: safeBaseLeft + nestedRect.left,
    top: safeBaseTop + nestedRect.top,
    width: nestedRect.width,
    height: nestedRect.height,
  };
};

export const deriveUploadArea = (folder) => toArea(folder);

export const computeBufferSha256 = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");

export const findUploadByHash = (uploads, hashSha256) => {
  const target = String(hashSha256 || "")
    .trim()
    .toLowerCase();
  if (!target) {
    return null;
  }
  return (
    (Array.isArray(uploads) ? uploads : []).find(
      (entry) =>
        String(entry?.hashSha256 || "")
          .trim()
          .toLowerCase() === target,
    ) || null
  );
};

export const resolveUploadAbsolutePath = ({ uploadsDir, uploadUrl }) => {
  const normalizedUrl = String(uploadUrl || "").trim();
  if (!normalizedUrl.startsWith("/uploads/")) {
    return null;
  }
  const relative = normalizedUrl.replace(/^\/uploads\//, "");
  const resolved = path.resolve(path.join(uploadsDir, relative));
  const uploadsRoot = path.resolve(uploadsDir);
  if (!isPathInsideRoot(uploadsRoot, resolved)) {
    return null;
  }
  return resolved;
};

export const generateUploadVariants = async ({
  uploadsDir,
  uploadId,
  sourcePath,
  sourceMime,
  focalPoint,
  focalPoints,
  focalCrops,
  variantsVersion = 1,
  variantPresetKeys,
} = {}) => {
  if (!isRasterUploadMime(sourceMime)) {
    return { variants: {}, sourceWidth: null, sourceHeight: null, variantBytes: 0 };
  }
  if (!uploadsDir || !uploadId || !sourcePath) {
    return { variants: {}, sourceWidth: null, sourceHeight: null, variantBytes: 0 };
  }

  const metadata = await sharp(sourcePath, { animated: false }).metadata();
  const sourceWidth = Number(metadata?.width);
  const sourceHeight = Number(metadata?.height);
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) {
    throw new Error("source_image_dimensions_unavailable");
  }
  const safeVersion = sanitizeVariantVersion(variantsVersion);
  const safeFocalPoints = normalizeFocalPoints(focalPoints, focalPoint);
  const safeFocalCrops =
    typeof focalCrops !== "undefined"
      ? normalizeFocalCrops(focalCrops, undefined, {
          sourceWidth,
          sourceHeight,
          fallbackPoints: safeFocalPoints,
        })
      : deriveFocalCropsFromPoints({
          value: safeFocalPoints,
          sourceWidth,
          sourceHeight,
        });
  const effectiveFocalPoints =
    typeof focalCrops !== "undefined"
      ? deriveFocalPointsFromCrops(safeFocalCrops)
      : safeFocalPoints;
  const presetKeys = Array.isArray(variantPresetKeys)
    ? normalizeUploadVariantPresetKeys(variantPresetKeys)
    : [...UPLOAD_VARIANT_PRESET_KEYS];
  if (presetKeys.length === 0) {
    removeUploadVariantDirectory(uploadsDir, uploadId);
    return {
      variants: {},
      sourceWidth,
      sourceHeight,
      variantBytes: 0,
    };
  }
  const variantDir = resetVariantDirectory(uploadsDir, uploadId);
  const cardBaseRect = computeFocalCoverRectFromCrop({
    sourceWidth,
    sourceHeight,
    targetWidth: UPLOAD_VARIANT_PRESETS.card.width,
    targetHeight: UPLOAD_VARIANT_PRESETS.card.height,
    focalCrop: safeFocalCrops.card,
    fallbackFocalPoint: effectiveFocalPoints.card,
  });
  const posterBaseRect = computeFocalCoverRectFromCrop({
    sourceWidth,
    sourceHeight,
    targetWidth: UPLOAD_VARIANT_PRESETS.poster.width,
    targetHeight: UPLOAD_VARIANT_PRESETS.poster.height,
    focalCrop: safeFocalCrops.card,
    fallbackFocalPoint: effectiveFocalPoints.card,
  });
  const heroBaseRect = computeFocalCoverRectFromCrop({
    sourceWidth,
    sourceHeight,
    targetWidth: UPLOAD_VARIANT_PRESETS.hero.width,
    targetHeight: UPLOAD_VARIANT_PRESETS.hero.height,
    focalCrop: safeFocalCrops.hero,
    fallbackFocalPoint: effectiveFocalPoints.hero,
  });
  const variantRects = {
    card: cardBaseRect,
    cardHomeXs: deriveNestedCoverRect({
      baseRect: cardBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.cardHomeXs.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.cardHomeXs.height,
    }),
    cardHomeSm: deriveNestedCoverRect({
      baseRect: cardBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.cardHomeSm.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.cardHomeSm.height,
    }),
    cardHome: deriveNestedCoverRect({
      baseRect: cardBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.cardHome.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.cardHome.height,
    }),
    cardWide: deriveNestedCoverRect({
      baseRect: cardBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.cardWide.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.cardWide.height,
    }),
    heroXs: deriveNestedCoverRect({
      baseRect: heroBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.heroXs.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.heroXs.height,
    }),
    heroSm: deriveNestedCoverRect({
      baseRect: heroBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.heroSm.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.heroSm.height,
    }),
    heroMd: deriveNestedCoverRect({
      baseRect: heroBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.heroMd.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.heroMd.height,
    }),
    hero: heroBaseRect,
    og: deriveNestedCoverRect({
      baseRect: cardBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.og.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.og.height,
    }),
    poster: posterBaseRect,
    posterThumbSm: deriveNestedCoverRect({
      baseRect: posterBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.posterThumbSm.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.posterThumbSm.height,
    }),
    posterThumb: deriveNestedCoverRect({
      baseRect: posterBaseRect,
      targetWidth: UPLOAD_VARIANT_PRESETS.posterThumb.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.posterThumb.height,
    }),
    square: computeFocalCoverRectFromCrop({
      sourceWidth,
      sourceHeight,
      targetWidth: UPLOAD_VARIANT_PRESETS.square.width,
      targetHeight: UPLOAD_VARIANT_PRESETS.square.height,
      focalCrop: safeFocalCrops.card,
      fallbackFocalPoint: effectiveFocalPoints.card,
    }),
  };

  const variants = {};
  let variantBytes = 0;

  for (const presetKey of presetKeys) {
    const preset = UPLOAD_VARIANT_PRESETS[presetKey];
    const rect = variantRects[presetKey];
    const base = createBaseVariantPipeline({ sourcePath, rect, preset });
    const avifQuality = resolveUploadVariantAvifQuality(presetKey);
    const avifPath = createVariantFilePath({
      dir: variantDir,
      preset: presetKey,
      version: safeVersion,
      extension: "avif",
    });
    const avifInfo = await base.clone().avif({ quality: avifQuality }).toFile(avifPath);

    variants[presetKey] = {
      width: preset.width,
      height: preset.height,
      formats: {
        avif: {
          url: toUploadVariantUrl({
            uploadId,
            preset: presetKey,
            version: safeVersion,
            extension: "avif",
          }),
          mime: "image/avif",
          size: Number(avifInfo?.size || 0),
        },
      },
    };

    variantBytes += Number(avifInfo?.size || 0);
  }

  return {
    variants,
    sourceWidth,
    sourceHeight,
    variantBytes,
  };
};

export const attachUploadMediaMetadata = async ({
  uploadsDir,
  entry,
  sourcePath,
  sourceMime,
  hashSha256,
  focalPoint,
  focalPoints,
  focalCrops,
  variantsVersion,
  regenerateVariants = true,
  variantPresetKeys,
} = {}) => {
  const current = entry && typeof entry === "object" ? { ...entry } : {};
  const incomingFocalPoints =
    typeof focalPoints !== "undefined"
      ? normalizeFocalPoints(focalPoints, current?.focalPoints ?? current?.focalPoint)
      : typeof focalPoint !== "undefined"
        ? normalizeFocalPoints(focalPoint)
        : normalizeFocalPoints(current?.focalPoints, current?.focalPoint);
  const normalizedHash = String(hashSha256 || current.hashSha256 || "")
    .trim()
    .toLowerCase();
  const nextVersion = sanitizeVariantVersion(variantsVersion ?? current.variantsVersion ?? 1);
  let nextVariants = normalizeVariants(current.variants);
  const requiredVariantPresetKeys = Array.isArray(variantPresetKeys)
    ? normalizeUploadVariantPresetKeys(variantPresetKeys)
    : resolveUploadVariantPresetKeysForEntry(current);
  let sourceWidth = toNumberOrNull(current.width);
  let sourceHeight = toNumberOrNull(current.height);
  let variantBytes = sumVariantSizes(nextVariants).bytes;

  if (regenerateVariants && requiredVariantPresetKeys.length === 0) {
    if (sourcePath && isRasterUploadMime(sourceMime)) {
      const cleared = await generateUploadVariants({
        uploadsDir,
        uploadId: String(current.id || ""),
        sourcePath,
        sourceMime,
        focalPoints: incomingFocalPoints,
        focalCrops,
        variantsVersion: nextVersion,
        variantPresetKeys: [],
      });
      sourceWidth = toNumberOrNull(cleared.sourceWidth) ?? sourceWidth;
      sourceHeight = toNumberOrNull(cleared.sourceHeight) ?? sourceHeight;
    } else {
      removeUploadVariantDirectory(uploadsDir, String(current.id || ""));
    }
    nextVariants = {};
    variantBytes = 0;
  } else if (regenerateVariants && sourcePath && isRasterUploadMime(sourceMime)) {
    const generated = await generateUploadVariants({
      uploadsDir,
      uploadId: String(current.id || ""),
      sourcePath,
      sourceMime,
      focalPoints: incomingFocalPoints,
      focalCrops,
      variantsVersion: nextVersion,
      variantPresetKeys: requiredVariantPresetKeys,
    });
    nextVariants = normalizeVariants(generated.variants);
    sourceWidth = toNumberOrNull(generated.sourceWidth) ?? sourceWidth;
    sourceHeight = toNumberOrNull(generated.sourceHeight) ?? sourceHeight;
    variantBytes = Number(generated.variantBytes || 0);
  }

  const normalizedFocalCrops =
    typeof focalCrops !== "undefined"
      ? normalizeFocalCrops(focalCrops, current?.focalCrops, {
          sourceWidth,
          sourceHeight,
          fallbackPoints: incomingFocalPoints,
        })
      : typeof focalPoints !== "undefined" || typeof focalPoint !== "undefined"
        ? deriveFocalCropsFromPoints({
            value: incomingFocalPoints,
            sourceWidth,
            sourceHeight,
          })
        : normalizeFocalCrops(current?.focalCrops, undefined, {
            sourceWidth,
            sourceHeight,
            fallbackPoints: current?.focalPoints,
            fallbackPoint: current?.focalPoint,
          });
  const normalizedFocalPoints = deriveFocalPointsFromCrops(normalizedFocalCrops);
  const normalizedFocal = getPrimaryFocalPoint(normalizedFocalPoints);

  return {
    ...current,
    hashSha256: normalizedHash || "",
    focalCrops: normalizedFocalCrops,
    focalPoints: normalizedFocalPoints,
    focalPoint: normalizedFocal,
    variantsVersion: nextVersion,
    variants: nextVariants,
    variantBytes: Number.isFinite(variantBytes) ? variantBytes : 0,
    area: deriveUploadArea(current.area || current.folder || ""),
    width: Number.isFinite(sourceWidth) ? sourceWidth : null,
    height: Number.isFinite(sourceHeight) ? sourceHeight : null,
  };
};

export const buildStorageAreaSummary = (uploads) => {
  const areasMap = new Map();
  const addArea = (areaKey) => {
    if (!areasMap.has(areaKey)) {
      areasMap.set(areaKey, {
        area: areaKey,
        originalBytes: 0,
        variantBytes: 0,
        totalBytes: 0,
        originalFiles: 0,
        variantFiles: 0,
        totalFiles: 0,
      });
    }
    return areasMap.get(areaKey);
  };

  (Array.isArray(uploads) ? uploads : []).forEach((item) => {
    const area = deriveUploadArea(item?.area || item?.folder || "");
    const bucket = addArea(area);
    const originalSize = Number(item?.size);
    if (Number.isFinite(originalSize) && originalSize >= 0) {
      bucket.originalBytes += originalSize;
      bucket.originalFiles += 1;
    }
    const variantSummary = sumVariantSizes(item?.variants);
    if (variantSummary.bytes > 0) {
      bucket.variantBytes += variantSummary.bytes;
      bucket.variantFiles += variantSummary.files;
    }
  });

  const areas = Array.from(areasMap.values())
    .map((item) => ({
      ...item,
      totalBytes: item.originalBytes + item.variantBytes,
      totalFiles: item.originalFiles + item.variantFiles,
    }))
    .sort((left, right) => {
      if (left.totalBytes !== right.totalBytes) {
        return right.totalBytes - left.totalBytes;
      }
      return String(left.area || "").localeCompare(String(right.area || ""), "pt-BR");
    });

  const totals = areas.reduce(
    (acc, item) => ({
      originalBytes: acc.originalBytes + item.originalBytes,
      variantBytes: acc.variantBytes + item.variantBytes,
      totalBytes: acc.totalBytes + item.totalBytes,
      originalFiles: acc.originalFiles + item.originalFiles,
      variantFiles: acc.variantFiles + item.variantFiles,
      totalFiles: acc.totalFiles + item.totalFiles,
    }),
    {
      originalBytes: 0,
      variantBytes: 0,
      totalBytes: 0,
      originalFiles: 0,
      variantFiles: 0,
      totalFiles: 0,
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    totals,
    areas,
  };
};

export const deriveUploadFolderFromUrl = (url) => {
  const normalized = String(url || "").trim();
  if (!normalized.startsWith("/uploads/")) {
    return "";
  }
  const relative = normalized.replace(/^\/uploads\//, "");
  const folder = toPosix(path.dirname(relative)).replace(/^\.$/, "");
  return folder;
};
