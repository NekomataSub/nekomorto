import fs from "fs";
import path from "path";

const PUBLIC_UPLOAD_URL_FALLBACK_ORIGIN = "https://nekomata.local";
const VARIANT_FORMAT_KEYS = Object.freeze(["avif", "webp", "fallback"]);
const HERO_PRELOAD_RESPONSIVE_PRESET_ORDER = Object.freeze(["heroXs", "heroSm", "heroMd", "hero"]);
const POSTER_PRELOAD_RESPONSIVE_PRESET_ORDER = Object.freeze([
  "posterThumbSm",
  "posterThumb",
  "poster",
]);
const SQUARE_PRELOAD_RESPONSIVE_PRESET_ORDER = Object.freeze(["square"]);
const HERO_PRELOAD_FALLBACK_WIDTHS = Object.freeze({
  heroXs: 768,
  heroSm: 960,
  heroMd: 1280,
  hero: 1600,
});
const POSTER_PRELOAD_FALLBACK_WIDTHS = Object.freeze({
  posterThumbSm: 192,
  posterThumb: 320,
  poster: 920,
});
const SQUARE_PRELOAD_FALLBACK_WIDTHS = Object.freeze({
  square: 512,
});

const fileExists = (value) => {
  try {
    return fs.existsSync(value);
  } catch {
    return false;
  }
};

const toSafeUploadsDir = (uploadsDir = path.join(process.cwd(), "public", "uploads")) =>
  path.resolve(String(uploadsDir || path.join(process.cwd(), "public", "uploads")));

const isPathInsideRoot = (rootPath, targetPath) => {
  const safeRoot = path.resolve(rootPath);
  const safeTarget = path.resolve(targetPath);
  const relative = path.relative(safeRoot, safeTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

export const normalizePublicUploadUrl = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("/uploads/")) {
    return trimmed.split("?")[0].split("#")[0];
  }
  try {
    const parsed = new URL(trimmed, PUBLIC_UPLOAD_URL_FALLBACK_ORIGIN);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
  } catch {
    return "";
  }
  return "";
};

export const shouldExposePublicUploadInMediaVariants = ({
  uploadUrl,
  folder,
  allowPrivateUrls = [],
} = {}) => {
  const normalizedUploadUrl = normalizePublicUploadUrl(uploadUrl);
  if (!normalizedUploadUrl) {
    return false;
  }
  const normalizedFolder = String(folder || "")
    .trim()
    .toLowerCase();
  if (
    normalizedFolder !== "users" &&
    normalizedFolder !== "downloads" &&
    normalizedFolder !== "socials"
  ) {
    return true;
  }
  const allowedPrivateUrlSet = new Set(
    (Array.isArray(allowPrivateUrls) ? allowPrivateUrls : [])
      .map((value) => normalizePublicUploadUrl(value))
      .filter(Boolean),
  );
  return allowedPrivateUrlSet.has(normalizedUploadUrl);
};

export const resolvePublicUploadDiskPath = ({
  uploadsDir = path.join(process.cwd(), "public", "uploads"),
  uploadUrl,
} = {}) => {
  const normalizedUrl = normalizePublicUploadUrl(uploadUrl);
  if (!normalizedUrl) {
    return null;
  }
  const uploadsRoot = toSafeUploadsDir(uploadsDir);
  const relative = normalizedUrl.replace(/^\/uploads\//, "");
  const resolved = path.resolve(path.join(uploadsRoot, relative));
  if (!isPathInsideRoot(uploadsRoot, resolved)) {
    return null;
  }
  return resolved;
};

export const publicAssetExists = ({
  uploadsDir = path.join(process.cwd(), "public", "uploads"),
  assetUrl,
  assetExists,
} = {}) => {
  const normalizedUrl = normalizePublicUploadUrl(assetUrl);
  if (!normalizedUrl) {
    return true;
  }
  if (typeof assetExists === "function") {
    return assetExists(normalizedUrl);
  }
  const diskPath = resolvePublicUploadDiskPath({ uploadsDir, uploadUrl: normalizedUrl });
  if (!diskPath) {
    return false;
  }
  return fileExists(diskPath);
};

export const readPublicVariantAssetUrl = (formats, fallbackUrl = "") => {
  const record = formats && typeof formats === "object" ? formats : {};
  const fallback = String(record?.fallback?.url || "").trim();
  if (fallback) {
    return fallback;
  }
  const webp = String(record?.webp?.url || "").trim();
  if (webp) {
    return webp;
  }
  const source = String(fallbackUrl || "").trim();
  if (source) {
    return source;
  }
  const avif = String(record?.avif?.url || "").trim();
  if (avif) {
    return avif;
  }
  return "";
};

export const sanitizePublicVariantFormats = (
  formats,
  { uploadsDir = path.join(process.cwd(), "public", "uploads"), assetExists } = {},
) => {
  const source = formats && typeof formats === "object" ? formats : null;
  if (!source) {
    return null;
  }
  const sanitized = {};
  VARIANT_FORMAT_KEYS.forEach((formatKey) => {
    const format = source[formatKey];
    if (!format || typeof format !== "object") {
      return;
    }
    const url = String(format.url || "").trim();
    if (!url || !publicAssetExists({ uploadsDir, assetUrl: url, assetExists })) {
      return;
    }
    sanitized[formatKey] = {
      ...format,
      url,
    };
  });
  return Object.keys(sanitized).length > 0 ? sanitized : null;
};

export const sanitizePublicVariantPresetRecord = (
  presetRecord,
  { uploadsDir = path.join(process.cwd(), "public", "uploads"), assetExists } = {},
) => {
  if (!presetRecord || typeof presetRecord !== "object") {
    return null;
  }
  const formats = sanitizePublicVariantFormats(presetRecord.formats, { uploadsDir, assetExists });
  if (!formats) {
    return null;
  }
  const next = {
    formats,
  };
  const width = Number(presetRecord.width);
  if (Number.isFinite(width) && width > 0) {
    next.width = width;
  }
  const height = Number(presetRecord.height);
  if (Number.isFinite(height) && height > 0) {
    next.height = height;
  }
  return next;
};

export const sanitizePublicVariantMap = (
  variants,
  { uploadsDir = path.join(process.cwd(), "public", "uploads"), assetExists } = {},
) => {
  if (!variants || typeof variants !== "object") {
    return null;
  }
  const sanitized = {};
  Object.entries(variants).forEach(([presetKey, presetRecord]) => {
    const nextPreset = sanitizePublicVariantPresetRecord(presetRecord, { uploadsDir, assetExists });
    if (!nextPreset) {
      return;
    }
    sanitized[presetKey] = nextPreset;
  });
  return Object.keys(sanitized).length > 0 ? sanitized : null;
};

export const sanitizePublicMediaVariantEntry = (
  entry,
  { uploadsDir = path.join(process.cwd(), "public", "uploads"), assetExists } = {},
) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const variants = sanitizePublicVariantMap(entry.variants, { uploadsDir, assetExists });
  if (!variants) {
    return null;
  }
  const next = {
    variants,
  };
  const variantsVersion = Number(entry.variantsVersion);
  if (Number.isFinite(variantsVersion) && variantsVersion > 0) {
    next.variantsVersion = Math.floor(variantsVersion);
  }
  if (entry.focalPoints && typeof entry.focalPoints === "object") {
    next.focalPoints = entry.focalPoints;
  }
  if (entry.focalPoint && typeof entry.focalPoint === "object") {
    next.focalPoint = entry.focalPoint;
  }
  return next;
};

export const resolveExistingPublicVariantUrl = ({
  entry,
  preset,
  fallbackUrl,
  uploadsDir = path.join(process.cwd(), "public", "uploads"),
  assetExists,
} = {}) => {
  const variants =
    entry?.variants && typeof entry.variants === "object" ? entry.variants : entry?.variants;
  const presetRecord = sanitizePublicVariantPresetRecord(variants?.[preset], {
    uploadsDir,
    assetExists,
  });
  if (!presetRecord) {
    return String(fallbackUrl || "").trim();
  }
  return readPublicVariantAssetUrl(presetRecord.formats, fallbackUrl);
};

export const toResponsiveHeroPreloadCandidate = (presetRecord, presetKey) => {
  if (!presetRecord || typeof presetRecord !== "object") {
    return null;
  }
  const formats =
    presetRecord.formats && typeof presetRecord.formats === "object" ? presetRecord.formats : null;
  if (!formats) {
    return null;
  }
  const url = String(formats?.avif?.url || "").trim();
  if (!url) {
    return null;
  }
  const rawWidth = Number(presetRecord.width);
  const width =
    Number.isFinite(rawWidth) && rawWidth > 0
      ? Math.round(rawWidth)
      : Number(HERO_PRELOAD_FALLBACK_WIDTHS[presetKey] || 0);
  if (!width) {
    return null;
  }
  return { url, width };
};

const toResponsivePosterPreloadCandidate = (presetRecord, presetKey) => {
  if (!presetRecord || typeof presetRecord !== "object") {
    return null;
  }
  const formats =
    presetRecord.formats && typeof presetRecord.formats === "object" ? presetRecord.formats : null;
  if (!formats) {
    return null;
  }
  const url =
    String(formats?.avif?.url || "").trim() ||
    String(formats?.webp?.url || "").trim() ||
    String(formats?.fallback?.url || "").trim();
  if (!url) {
    return null;
  }
  const rawWidth = Number(presetRecord.width);
  const width =
    Number.isFinite(rawWidth) && rawWidth > 0
      ? Math.round(rawWidth)
      : Number(POSTER_PRELOAD_FALLBACK_WIDTHS[presetKey] || 0);
  if (!width) {
    return null;
  }
  return {
    url,
    width,
    type: String(formats?.avif?.url || "").trim()
      ? "image/avif"
      : String(formats?.webp?.url || "").trim()
        ? "image/webp"
        : undefined,
  };
};

const toResponsiveSquarePreloadCandidate = (presetRecord, presetKey) => {
  if (!presetRecord || typeof presetRecord !== "object") {
    return null;
  }
  const formats =
    presetRecord.formats && typeof presetRecord.formats === "object" ? presetRecord.formats : null;
  if (!formats) {
    return null;
  }
  const url =
    String(formats?.avif?.url || "").trim() ||
    String(formats?.webp?.url || "").trim() ||
    String(formats?.fallback?.url || "").trim();
  if (!url) {
    return null;
  }
  const rawWidth = Number(presetRecord.width);
  const width =
    Number.isFinite(rawWidth) && rawWidth > 0
      ? Math.round(rawWidth)
      : Number(SQUARE_PRELOAD_FALLBACK_WIDTHS[presetKey] || 0);
  if (!width) {
    return null;
  }
  return {
    url,
    width,
    type: String(formats?.avif?.url || "").trim()
      ? "image/avif"
      : String(formats?.webp?.url || "").trim()
        ? "image/webp"
        : undefined,
  };
};

export const resolveHomeHeroPreloadFromSlide = ({
  imageUrl,
  mediaVariants,
  resolveVariantUrl,
} = {}) => {
  const sourceImageUrl = String(imageUrl || "").trim();
  if (!sourceImageUrl) {
    return null;
  }
  const normalizedImageUrl = normalizePublicUploadUrl(sourceImageUrl);
  const heroVariantUrl =
    readPublicVariantAssetUrl(mediaVariants?.[normalizedImageUrl]?.variants?.hero?.formats, "") ||
    (typeof resolveVariantUrl === "function" ? resolveVariantUrl(sourceImageUrl, "hero") : "");
  const fallbackHref = heroVariantUrl || sourceImageUrl;
  if (!normalizedImageUrl) {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
          fetchpriority: "high",
        }
      : null;
  }

  const variants = mediaVariants?.[normalizedImageUrl]?.variants;
  if (!variants || typeof variants !== "object") {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
          fetchpriority: "high",
        }
      : null;
  }

  const candidateByUrl = new Map();
  HERO_PRELOAD_RESPONSIVE_PRESET_ORDER.forEach((presetKey) => {
    const candidate = toResponsiveHeroPreloadCandidate(variants[presetKey], presetKey);
    if (!candidate) {
      return;
    }
    const current = candidateByUrl.get(candidate.url);
    if (!current || candidate.width > current.width) {
      candidateByUrl.set(candidate.url, candidate);
    }
  });

  const responsiveCandidates = [...candidateByUrl.values()].sort(
    (left, right) => left.width - right.width,
  );
  if (responsiveCandidates.length === 0) {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
          fetchpriority: "high",
        }
      : null;
  }

  const imagesrcset = responsiveCandidates
    .map((entry) => `${entry.url} ${entry.width}w`)
    .join(", ");
  const fallbackCandidate = responsiveCandidates[responsiveCandidates.length - 1];
  return {
    href: fallbackHref || fallbackCandidate.url,
    as: "image",
    type: "image/avif",
    imagesrcset,
    imagesizes: "100vw",
    fetchpriority: "high",
  };
};

export const resolvePublicReaderHeroPreload = ({
  imageUrl,
  mediaVariants,
  resolveVariantUrl,
} = {}) =>
  resolveHomeHeroPreloadFromSlide({
    imageUrl,
    mediaVariants,
    resolveVariantUrl,
  });

export const resolvePublicPostCoverPreload = ({
  coverUrl,
  mediaVariants,
  resolveVariantUrl,
} = {}) => {
  const sourceCoverUrl = String(coverUrl || "").trim();
  if (!sourceCoverUrl) {
    return null;
  }
  const normalizedCoverUrl = normalizePublicUploadUrl(sourceCoverUrl);
  const href =
    (normalizedCoverUrl
      ? readPublicVariantAssetUrl(mediaVariants?.[normalizedCoverUrl]?.variants?.card?.formats, "")
      : "") ||
    (typeof resolveVariantUrl === "function" ? resolveVariantUrl(sourceCoverUrl, "card") : "") ||
    sourceCoverUrl;

  if (!href) {
    return null;
  }

  return {
    href,
    as: "image",
    fetchpriority: "high",
  };
};

export const resolveProjectPosterPreload = ({
  coverUrl,
  mediaVariants,
  resolveVariantUrl,
  imagesizes = "(max-width: 767px) 129px, 154px",
} = {}) => {
  const sourceCoverUrl = String(coverUrl || "").trim();
  if (!sourceCoverUrl) {
    return null;
  }
  const normalizedCoverUrl = normalizePublicUploadUrl(sourceCoverUrl);
  const variants = mediaVariants?.[normalizedCoverUrl]?.variants;
  const fallbackHref =
    (normalizedCoverUrl
      ? readPublicVariantAssetUrl(
          mediaVariants?.[normalizedCoverUrl]?.variants?.posterThumb?.formats,
          "",
        )
      : "") ||
    (typeof resolveVariantUrl === "function"
      ? resolveVariantUrl(sourceCoverUrl, "posterThumb")
      : "") ||
    sourceCoverUrl;

  if (!variants || typeof variants !== "object") {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
        }
      : null;
  }

  const candidateByUrl = new Map();
  POSTER_PRELOAD_RESPONSIVE_PRESET_ORDER.forEach((presetKey) => {
    const candidate = toResponsivePosterPreloadCandidate(variants[presetKey], presetKey);
    if (!candidate) {
      return;
    }
    const current = candidateByUrl.get(candidate.url);
    if (!current || candidate.width > current.width) {
      candidateByUrl.set(candidate.url, candidate);
    }
  });

  const responsiveCandidates = [...candidateByUrl.values()].sort(
    (left, right) => left.width - right.width,
  );
  if (responsiveCandidates.length === 0) {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
        }
      : null;
  }

  const srcset = responsiveCandidates.map((entry) => `${entry.url} ${entry.width}w`).join(", ");
  const fallbackCandidate = responsiveCandidates[responsiveCandidates.length - 1];
  return {
    href: fallbackHref || fallbackCandidate.url,
    as: "image",
    type: fallbackCandidate.type,
    imagesrcset: srcset,
    imagesizes: String(imagesizes || "").trim() || "(max-width: 767px) 129px, 154px",
  };
};

export const resolveTeamAvatarPreload = ({
  avatarUrl,
  mediaVariants,
  resolveVariantUrl,
  imagesizes = "(max-width: 639px) 224px, (max-width: 767px) 240px, 256px",
} = {}) => {
  const sourceAvatarUrl = String(avatarUrl || "").trim();
  if (!sourceAvatarUrl) {
    return null;
  }
  const normalizedAvatarUrl = normalizePublicUploadUrl(sourceAvatarUrl);
  const variants = mediaVariants?.[normalizedAvatarUrl]?.variants;
  const fallbackHref =
    (normalizedAvatarUrl
      ? readPublicVariantAssetUrl(
          mediaVariants?.[normalizedAvatarUrl]?.variants?.square?.formats,
          "",
        )
      : "") ||
    (typeof resolveVariantUrl === "function" ? resolveVariantUrl(sourceAvatarUrl, "square") : "") ||
    sourceAvatarUrl;

  if (!variants || typeof variants !== "object") {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
          crossorigin: "anonymous",
          fetchpriority: "high",
        }
      : null;
  }

  const candidateByUrl = new Map();
  SQUARE_PRELOAD_RESPONSIVE_PRESET_ORDER.forEach((presetKey) => {
    const candidate = toResponsiveSquarePreloadCandidate(variants[presetKey], presetKey);
    if (!candidate) {
      return;
    }
    const current = candidateByUrl.get(candidate.url);
    if (!current || candidate.width > current.width) {
      candidateByUrl.set(candidate.url, candidate);
    }
  });

  const responsiveCandidates = [...candidateByUrl.values()].sort(
    (left, right) => left.width - right.width,
  );
  if (responsiveCandidates.length === 0) {
    return fallbackHref
      ? {
          href: fallbackHref,
          as: "image",
          crossorigin: "anonymous",
          fetchpriority: "high",
        }
      : null;
  }

  const srcset = responsiveCandidates.map((entry) => `${entry.url} ${entry.width}w`).join(", ");
  const fallbackCandidate = responsiveCandidates[responsiveCandidates.length - 1];
  return {
    href: fallbackHref || fallbackCandidate.url,
    as: "image",
    type: fallbackCandidate.type,
    imagesrcset: srcset,
    imagesizes:
      String(imagesizes || "").trim() ||
      "(max-width: 639px) 224px, (max-width: 767px) 240px, 256px",
    crossorigin: "anonymous",
    fetchpriority: "high",
  };
};
