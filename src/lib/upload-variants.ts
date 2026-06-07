export type UploadVariantPresetKey =
  | "card"
  | "cardHomeXs"
  | "cardHomeSm"
  | "cardHome"
  | "cardWide"
  | "heroXs"
  | "heroSm"
  | "heroMd"
  | "hero"
  | "og"
  | "poster"
  | "posterThumbSm"
  | "posterThumb"
  | "square";

export type UploadVariantFormat = {
  url?: string | null;
  mime?: string | null;
  size?: number | null;
};

export type UploadMediaVariantFocalPoint = {
  x?: number | null;
  y?: number | null;
};

export type UploadVariantPreset = {
  width?: number | null;
  height?: number | null;
  formats?: {
    avif?: UploadVariantFormat | null;
    webp?: UploadVariantFormat | null;
    fallback?: UploadVariantFormat | null;
  } | null;
};

export type UploadMediaVariantEntry = {
  variantsVersion?: number | null;
  variants?: Partial<Record<UploadVariantPresetKey, UploadVariantPreset | null>> | null;
  focalPoints?: Partial<Record<"card" | "hero", UploadMediaVariantFocalPoint | null>> | null;
  focalPoint?: UploadMediaVariantFocalPoint | null;
};

export type UploadMediaVariantsMap = Record<string, UploadMediaVariantEntry>;

const FALLBACK_ORIGIN = "https://nekomata.local";
const UPLOAD_VARIANT_PRESET_FALLBACK_ORDER: Record<
  UploadVariantPresetKey,
  readonly UploadVariantPresetKey[]
> = Object.freeze({
  card: Object.freeze(["card"]),
  cardHomeXs: Object.freeze(["cardHomeXs", "cardHomeSm", "cardHome", "card"]),
  cardHomeSm: Object.freeze(["cardHomeSm", "cardHome", "card"]),
  cardHome: Object.freeze(["cardHome", "card"]),
  cardWide: Object.freeze(["cardWide"]),
  heroXs: Object.freeze(["heroXs", "heroSm", "hero"]),
  heroSm: Object.freeze(["heroSm", "hero"]),
  heroMd: Object.freeze(["heroMd", "hero"]),
  hero: Object.freeze(["hero"]),
  og: Object.freeze(["og"]),
  poster: Object.freeze(["poster"]),
  posterThumbSm: Object.freeze(["posterThumbSm", "posterThumb", "poster"]),
  posterThumb: Object.freeze(["posterThumb", "poster"]),
  square: Object.freeze(["square"]),
} satisfies Record<UploadVariantPresetKey, readonly UploadVariantPresetKey[]>);

const UPLOAD_VARIANT_PRESET_WIDTHS: Record<UploadVariantPresetKey, number> = Object.freeze({
  card: 1280,
  cardHomeXs: 480,
  cardHomeSm: 800,
  cardHome: 960,
  cardWide: 1280,
  heroXs: 768,
  heroSm: 960,
  heroMd: 1280,
  hero: 1600,
  og: 1200,
  poster: 920,
  posterThumbSm: 192,
  posterThumb: 320,
  square: 512,
});

const UPLOAD_VARIANT_RESPONSIVE_PRESET_ORDER: Partial<
  Record<UploadVariantPresetKey, readonly UploadVariantPresetKey[]>
> = Object.freeze({
  cardHome: Object.freeze(["cardHomeXs", "cardHomeSm", "cardHome", "card"]),
  hero: Object.freeze(["heroXs", "heroSm", "heroMd", "hero"]),
  posterThumbSm: Object.freeze(["posterThumbSm", "posterThumb"]),
  posterThumb: Object.freeze(["posterThumbSm", "posterThumb", "poster"]),
} satisfies Partial<Record<UploadVariantPresetKey, readonly UploadVariantPresetKey[]>>);

export const normalizeUploadVariantUrlKey = (value: string | null | undefined) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("/uploads/")) {
    return trimmed.split("?")[0].split("#")[0];
  }
  try {
    const base =
      typeof window !== "undefined" && window?.location?.origin
        ? window.location.origin
        : FALLBACK_ORIGIN;
    const parsed = new URL(trimmed, base);
    if (parsed.pathname.startsWith("/uploads/")) {
      return parsed.pathname;
    }
  } catch {
    // Ignore parse errors and fallback to empty key.
  }
  return "";
};

const toFormatUrl = (format: UploadVariantFormat | null | undefined) => {
  if (!format || typeof format !== "object") {
    return "";
  }
  const url = String(format.url || "").trim();
  if (!url) {
    return "";
  }
  return url;
};

const toFinitePresetWidth = (
  presetKey: UploadVariantPresetKey,
  presetRecord: UploadVariantPreset | null | undefined,
) => {
  const width = Number(presetRecord?.width);
  if (Number.isFinite(width) && width > 0) {
    return width;
  }
  return UPLOAD_VARIANT_PRESET_WIDTHS[presetKey];
};

const appendSrcSetCandidate = (map: Map<string, number>, url: string, width: number) => {
  if (!url || !Number.isFinite(width) || width <= 0) {
    return;
  }
  const current = map.get(url);
  if (!current || width > current) {
    map.set(url, width);
  }
};

const formatSrcSetCandidates = (candidates: Map<string, number>) =>
  [...candidates.entries()]
    .sort((left, right) => left[1] - right[1])
    .map(([url, width]) => `${url} ${Math.round(width)}w`)
    .join(", ");

const resolveEntryVariants = ({
  src,
  mediaVariants,
}: {
  src: string | null | undefined;
  mediaVariants?: UploadMediaVariantsMap | null;
}) => {
  const key = normalizeUploadVariantUrlKey(src);
  if (!key || !mediaVariants || typeof mediaVariants !== "object") {
    return null;
  }
  const entry = mediaVariants[key];
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return entry.variants && typeof entry.variants === "object" ? entry.variants : null;
};

const normalizeFocalAxis = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.min(1, Math.max(0, numeric));
};

const normalizeFocalPoint = (
  value: UploadMediaVariantFocalPoint | null | undefined,
): { x: number; y: number } | null => {
  if (!value || typeof value !== "object") {
    return null;
  }
  const x = normalizeFocalAxis(value.x);
  const y = normalizeFocalAxis(value.y);
  if (x === null || y === null) {
    return null;
  }
  return { x, y };
};

export const resolveUploadVariantSources = ({
  src,
  preset,
  mediaVariants,
}: {
  src: string | null | undefined;
  preset: UploadVariantPresetKey;
  mediaVariants?: UploadMediaVariantsMap | null;
}) => {
  const variants = resolveEntryVariants({ src, mediaVariants });
  if (!variants) {
    return { avif: "", webp: "", fallback: "" };
  }
  for (const fallbackPreset of UPLOAD_VARIANT_PRESET_FALLBACK_ORDER[preset]) {
    const presetRecord = variants[fallbackPreset];
    if (!presetRecord || typeof presetRecord !== "object") {
      continue;
    }
    const formats =
      presetRecord.formats && typeof presetRecord.formats === "object"
        ? presetRecord.formats
        : null;
    if (!formats) {
      continue;
    }
    return {
      avif: toFormatUrl(formats.avif),
      webp: toFormatUrl(formats.webp),
      fallback: toFormatUrl(formats.fallback),
    };
  }
  return {
    avif: "",
    webp: "",
    fallback: "",
  };
};

const resolveResponsivePresetOrder = (preset: UploadVariantPresetKey) => {
  const responsiveOrder = UPLOAD_VARIANT_RESPONSIVE_PRESET_ORDER[preset] || [];
  const fallbackOrder = UPLOAD_VARIANT_PRESET_FALLBACK_ORDER[preset] || [];
  return [...new Set([...responsiveOrder, ...fallbackOrder])];
};

export const resolveUploadVariantResponsiveSources = ({
  src,
  preset,
  mediaVariants,
}: {
  src: string | null | undefined;
  preset: UploadVariantPresetKey;
  mediaVariants?: UploadMediaVariantsMap | null;
}) => {
  const variants = resolveEntryVariants({ src, mediaVariants });
  if (!variants) {
    return { avifSrcSet: "", webpSrcSet: "", fallbackSrcSet: "" };
  }

  const avifCandidates = new Map<string, number>();
  const webpCandidates = new Map<string, number>();
  const fallbackCandidates = new Map<string, number>();

  for (const candidatePreset of resolveResponsivePresetOrder(preset)) {
    const presetRecord = variants[candidatePreset];
    if (!presetRecord || typeof presetRecord !== "object") {
      continue;
    }
    const formats =
      presetRecord.formats && typeof presetRecord.formats === "object"
        ? presetRecord.formats
        : null;
    if (!formats) {
      continue;
    }
    const width = toFinitePresetWidth(candidatePreset, presetRecord);
    appendSrcSetCandidate(avifCandidates, toFormatUrl(formats.avif), width);
    appendSrcSetCandidate(webpCandidates, toFormatUrl(formats.webp), width);
    appendSrcSetCandidate(fallbackCandidates, toFormatUrl(formats.fallback), width);
  }

  return {
    avifSrcSet: formatSrcSetCandidates(avifCandidates),
    webpSrcSet: formatSrcSetCandidates(webpCandidates),
    fallbackSrcSet: formatSrcSetCandidates(fallbackCandidates),
  };
};

export const resolveUploadVariantFocalPoint = ({
  src,
  preset,
  mediaVariants,
}: {
  src: string | null | undefined;
  preset: UploadVariantPresetKey;
  mediaVariants?: UploadMediaVariantsMap | null;
}) => {
  const key = normalizeUploadVariantUrlKey(src);
  if (!key || !mediaVariants || typeof mediaVariants !== "object") {
    return null;
  }
  const entry = mediaVariants[key];
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const mappedPreset =
    preset === "hero" || preset === "heroXs" || preset === "heroSm" || preset === "heroMd"
      ? "hero"
      : "card";
  const focalPoints =
    entry.focalPoints && typeof entry.focalPoints === "object" ? entry.focalPoints : null;
  const presetFocal = focalPoints ? normalizeFocalPoint(focalPoints[mappedPreset]) : null;
  if (presetFocal) {
    return presetFocal;
  }
  return normalizeFocalPoint(entry.focalPoint);
};

export const resolveUploadVariantUrl = ({
  src,
  preset,
  mediaVariants,
}: {
  src: string | null | undefined;
  preset: UploadVariantPresetKey;
  mediaVariants?: UploadMediaVariantsMap | null;
}) => {
  const resolved = resolveUploadVariantSources({ src, preset, mediaVariants });
  const sourceUrl = String(src || "").trim();
  return resolved.fallback || resolved.webp || sourceUrl || resolved.avif;
};
