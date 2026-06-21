import { ImageResponse } from "@vercel/og";
import React from "react";
import sharp from "sharp";
import {
  buildInstitutionalOgImageAlt,
  INSTITUTIONAL_OG_SCENE_VERSION,
  isInstitutionalOgPageKey,
  resolveInstitutionalOgBackgroundImage,
  resolveInstitutionalOgPageTitle,
  resolveInstitutionalOgSupportText,
} from "../../shared/institutional-og-seo.js";
import { mixHexColors, normalizeHex } from "./og-color.js";
import { finalizeVariantUrl, normalizeText } from "./og-shared.js";
import {
  buildProjectOgFonts,
  loadProjectOgArtworkDataUrl,
  OG_PROJECT_HEIGHT,
  OG_PROJECT_WIDTH,
  resolveProjectOgPalette,
} from "./project-og.js";

const { createElement } = React;

const BRAND_FONT_SIZE = 30.65;
const TITLE_FONT_SIZE = 72.0604476928711;
const SUPPORT_FONT_SIZE = 30.654399871826172;
const SUPPORT_LINE_HEIGHT = 1.2;
const BACKGROUND_BLUR = 15;
const INSTITUTIONAL_OVERLAY_FALLBACK_START = "#00162d";
const INSTITUTIONAL_OVERLAY_FALLBACK_END = "#000407";

const DEFAULT_LAYOUT = Object.freeze({
  brandLeft: 55.57,
  brandTop: 55,
  titleLeft: 56,
  titleTop: 95,
  titleWidth: 640,
  supportLeft: 57,
  supportTop: 193,
  supportWidth: 706,
  overlayLeft: -15.42,
  overlayTop: -376.98,
  overlayWidth: 1175.22,
  overlayHeight: 1362.93,
  backgroundLeft: -30,
  backgroundTop: -32,
  backgroundWidth: 1243,
  backgroundHeight: 715,
});

const buildInstitutionalOverlayGradient = (palette = {}) => {
  const start = normalizeHex(palette?.accentDarkStart) || INSTITUTIONAL_OVERLAY_FALLBACK_START;
  const end = normalizeHex(palette?.accentDarkEnd) || INSTITUTIONAL_OVERLAY_FALLBACK_END;
  const stops = [
    { offset: "0%", color: start },
    { offset: "12%", color: mixHexColors(start, end, 0.12, INSTITUTIONAL_OVERLAY_FALLBACK_END) },
    { offset: "28%", color: mixHexColors(start, end, 0.28, INSTITUTIONAL_OVERLAY_FALLBACK_END) },
    { offset: "46%", color: mixHexColors(start, end, 0.46, INSTITUTIONAL_OVERLAY_FALLBACK_END) },
    { offset: "66%", color: mixHexColors(start, end, 0.66, INSTITUTIONAL_OVERLAY_FALLBACK_END) },
    { offset: "84%", color: mixHexColors(start, end, 0.84, INSTITUTIONAL_OVERLAY_FALLBACK_END) },
    { offset: "100%", color: end },
  ];

  return `linear-gradient(180deg, ${stops.map((stop) => `${stop.color} ${stop.offset}`).join(", ")})`;
};

const decodeDataUrlBuffer = (value) => {
  const normalized = normalizeText(value);
  const separatorIndex = normalized.indexOf(",");
  if (!normalized.startsWith("data:") || separatorIndex < 0) {
    return Buffer.alloc(0);
  }
  return Buffer.from(normalized.slice(separatorIndex + 1), "base64");
};

const toDataUrl = (buffer, mimeType = "image/png") =>
  `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;

const resolveInstitutionalBackgroundSelection = ({
  pageKey,
  pages,
  settings,
  origin,
  resolveVariantUrl,
} = {}) => {
  const normalizedPageKey = normalizeText(pageKey);
  const pageConfig = pages && typeof pages === "object" ? pages[normalizedPageKey] : null;
  const pageShareImage = normalizeText(pageConfig?.shareImage);
  const defaultShareImage = normalizeText(settings?.site?.defaultShareImage);
  const backgroundUrl = resolveInstitutionalOgBackgroundImage({
    pageKey: normalizedPageKey,
    pages,
    settings,
  });

  return {
    source: pageShareImage
      ? "page-share-image"
      : defaultShareImage
        ? "site-default-share-image"
        : "none",
    url: finalizeVariantUrl({
      url: backgroundUrl,
      preset: "hero",
      resolveVariantUrl,
      origin,
    }),
  };
};

export const buildInstitutionalOgCardModel = ({
  pageKey,
  pages,
  settings,
  origin,
  resolveVariantUrl,
} = {}) => {
  const normalizedPageKey = normalizeText(pageKey);
  if (!isInstitutionalOgPageKey(normalizedPageKey)) {
    return null;
  }

  const title = resolveInstitutionalOgPageTitle(normalizedPageKey) || "P\u00e1gina";
  const backgroundSelection = resolveInstitutionalBackgroundSelection({
    pageKey: normalizedPageKey,
    pages,
    settings,
    origin,
    resolveVariantUrl,
  });

  return {
    width: OG_PROJECT_WIDTH,
    height: OG_PROJECT_HEIGHT,
    pageKey: normalizedPageKey,
    title,
    subtitle: resolveInstitutionalOgSupportText({
      pageKey: normalizedPageKey,
      pages,
      settings,
    }),
    siteName: normalizeText(settings?.site?.name) || "Nekomata",
    imageAlt: buildInstitutionalOgImageAlt(normalizedPageKey),
    sceneVersion: INSTITUTIONAL_OG_SCENE_VERSION,
    backgroundUrl: backgroundSelection.url,
    backgroundSource: backgroundSelection.source,
    palette: resolveProjectOgPalette(settings?.theme?.accent),
    layout: { ...DEFAULT_LAYOUT },
  };
};

export const loadInstitutionalOgBackgroundDataUrl = async ({ backgroundUrl, origin } = {}) => {
  const normalizedBackgroundUrl = normalizeText(backgroundUrl);
  const rawDataUrl = await loadProjectOgArtworkDataUrl({
    artworkUrl: normalizedBackgroundUrl,
    origin,
  });
  let inputBuffer = decodeDataUrlBuffer(rawDataUrl);
  if (inputBuffer.length === 0 && /^https?:\/\//i.test(normalizedBackgroundUrl)) {
    try {
      const url = new URL(normalizedBackgroundUrl);
      if (url.protocol === "https:" || url.protocol === "http:") {
        const isLocalOrPrivateHost = (hostname) => {
          const normalized = String(hostname || "")
            .toLowerCase()
            .trim();
          if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost"))
            return true;
          if (
            normalized.startsWith("127.") ||
            normalized.startsWith("10.") ||
            normalized.startsWith("192.168.") ||
            normalized.startsWith("169.254.") ||
            normalized.startsWith("0.0.0.0")
          )
            return true;
          if (
            normalized === "::1" ||
            normalized === "[::1]" ||
            normalized === "0:0:0:0:0:0:0:1" ||
            normalized === "[0:0:0:0:0:0:0:1]"
          )
            return true;
          return false;
        };
        if (isLocalOrPrivateHost(url.hostname)) {
          return "";
        }
        const response = await fetch(url.toString(), { redirect: "error" });
        if (response.ok) {
          inputBuffer = Buffer.from(await response.arrayBuffer());
        }
      }
    } catch {
      inputBuffer = Buffer.alloc(0);
    }
  }
  if (inputBuffer.length === 0) {
    return "";
  }

  const outputBuffer = await sharp(inputBuffer)
    .resize(OG_PROJECT_WIDTH, OG_PROJECT_HEIGHT, {
      fit: "cover",
      position: "center",
    })
    .blur(BACKGROUND_BLUR)
    .png()
    .toBuffer();

  return toDataUrl(outputBuffer);
};

export const buildInstitutionalOgScene = (model = {}) => {
  const backgroundSrc =
    normalizeText(model.backgroundDataUrl) || normalizeText(model.backgroundUrl);
  const supportText = normalizeText(model.subtitle);

  return createElement(
    "div",
    {
      style: {
        position: "relative",
        width: model.width || OG_PROJECT_WIDTH,
        height: model.height || OG_PROJECT_HEIGHT,
        overflow: "hidden",
        backgroundColor: model.palette?.bgBase || "#02050b",
        display: "flex",
      },
    },
    backgroundSrc
      ? createElement("img", {
          src: backgroundSrc,
          alt: "",
          "data-og-part": "background",
          width: model.width || OG_PROJECT_WIDTH,
          height: model.height || OG_PROJECT_HEIGHT,
          style: {
            position: "absolute",
            left: model.layout.backgroundLeft,
            top: model.layout.backgroundTop,
            width: model.layout.backgroundWidth,
            height: model.layout.backgroundHeight,
            objectFit: "cover",
          },
        })
      : null,
    createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background: "linear-gradient(90deg, rgba(2, 5, 11, 0.28) 0%, rgba(2, 5, 11, 0.18) 100%)",
      },
    }),
    createElement("div", {
      "data-og-part": "overlay",
      style: {
        position: "absolute",
        left: model.layout.overlayLeft,
        top: model.layout.overlayTop,
        width: model.layout.overlayWidth,
        height: model.layout.overlayHeight,
        transform: "rotate(-95deg)",
        background: buildInstitutionalOverlayGradient(model.palette),
        opacity: 0.85,
      },
    }),
    createElement("div", {
      style: {
        position: "absolute",
        inset: 0,
        background:
          "radial-gradient(circle at 28% 20%, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 32%)",
      },
    }),
    createElement(
      "div",
      {
        style: {
          position: "absolute",
          left: model.layout.brandLeft,
          top: model.layout.brandTop,
          color: model.palette.accentPrimary,
          fontFamily: "Geist",
          fontSize: BRAND_FONT_SIZE,
          fontWeight: 400,
          lineHeight: 1.2,
          display: "flex",
          whiteSpace: "pre-wrap",
        },
      },
      model.siteName,
    ),
    createElement(
      "div",
      {
        style: {
          position: "absolute",
          left: model.layout.titleLeft,
          top: model.layout.titleTop,
          width: model.layout.titleWidth,
          color: "#ffffff",
          fontFamily: "Geist",
          fontSize: TITLE_FONT_SIZE,
          fontWeight: 700,
          lineHeight: 1.2,
          display: "flex",
          whiteSpace: "pre-wrap",
        },
      },
      model.title,
    ),
    supportText
      ? createElement(
          "div",
          {
            style: {
              position: "absolute",
              left: model.layout.supportLeft,
              top: model.layout.supportTop,
              width: model.layout.supportWidth,
              color: "rgba(141, 141, 141, 1)",
              fontFamily: "Geist",
              fontSize: SUPPORT_FONT_SIZE,
              fontWeight: 300,
              lineHeight: SUPPORT_LINE_HEIGHT,
              display: "flex",
              whiteSpace: "pre-wrap",
            },
          },
          supportText,
        )
      : null,
  );
};

export const buildInstitutionalOgImageResponse = (model) =>
  new ImageResponse(buildInstitutionalOgScene(model), {
    width: model?.width || OG_PROJECT_WIDTH,
    height: model?.height || OG_PROJECT_HEIGHT,
    fonts: buildProjectOgFonts(),
  });
