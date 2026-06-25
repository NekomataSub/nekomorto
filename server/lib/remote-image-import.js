import crypto from "crypto";
import dns from "dns/promises";
import fs from "fs";
import net from "net";
import path from "path";
import {
  getUploadExtFromMime,
  getUploadMimeFromExtension,
  isSupportedUploadImageMime,
  MAX_SVG_SIZE_BYTES,
  MAX_UPLOAD_SIZE_BYTES,
  normalizeUploadMime,
  SUPPORTED_UPLOAD_EXTENSIONS,
  sanitizeSvg,
  sanitizeUploadBaseName,
  sanitizeUploadFolder,
  validateUploadImageBuffer,
} from "./upload-runtime-helpers.js";

const DEFAULT_UPLOAD_FILE_BASE = "imagem";
const MAX_REDIRECTS = 5;
const PRIVATE_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

const isPrivateIpv4 = (value) => {
  const normalized = String(value || "").trim();
  if (!net.isIP(normalized) || net.isIP(normalized) !== 4) {
    return false;
  }
  const octets = normalized.split(".").map((chunk) => Number(chunk));
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b] = octets;
  if (a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
};

const isPrivateIpv6 = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/%.+$/, "");
  if (!net.isIP(normalized) || net.isIP(normalized) !== 6) {
    return false;
  }
  if (normalized === "::1" || normalized === "0:0:0:0:0:0:0:1") {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }
  return false;
};

const isPrivateHost = (host) => {
  let normalized = String(host || "")
    .trim()
    .toLowerCase();

  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }

  if (!normalized) {
    return true;
  }
  if (PRIVATE_HOSTNAMES.has(normalized) || normalized.endsWith(".localhost")) {
    return true;
  }
  if (net.isIP(normalized)) {
    return isPrivateIpv4(normalized) || isPrivateIpv6(normalized);
  }
  return false;
};

const isPathInsideRoot = (rootPath, targetPath) => {
  const safeRoot = path.resolve(rootPath);
  const safeTarget = path.resolve(targetPath);
  const relative = path.relative(safeRoot, safeTarget);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
};

const resolveHostAddresses = async (host) => {
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    return Array.isArray(records)
      ? records.map((record) => String(record?.address || "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
};

const validateRemoteTarget = async (target) => {
  if (!target || !(target instanceof URL)) {
    return toFailureResult("invalid_url", "Invalid URL.");
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return toFailureResult("invalid_url", "Only HTTP/HTTPS URLs are allowed.");
  }
  if (target.username || target.password) {
    return toFailureResult("invalid_url_credentials", "URL credentials are not allowed.");
  }
  const host = String(target.hostname || "")
    .trim()
    .toLowerCase();
  if (isPrivateHost(host)) {
    return toFailureResult("host_not_allowed", "Remote host is not allowed.");
  }
  const resolvedAddresses = await resolveHostAddresses(host);
  if (resolvedAddresses.some((address) => isPrivateHost(address))) {
    return toFailureResult("host_not_allowed", "Remote host is not allowed.");
  }
  return { ok: true };
};

const createImportError = (code, message, extra = {}) => ({
  code: String(code || "import_failed"),
  message: String(message || "Remote image import failed."),
  ...extra,
});

const toFailureResult = (code, message, extra = {}) => ({
  ok: false,
  error: createImportError(code, message, extra),
});

const toSuccessResult = (entry) => ({
  ok: true,
  entry,
});

const fetchWithSafeRedirects = async ({ fetchImpl, initialUrl, timeoutMs }) => {
  let current = initialUrl;
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    let parsedCurrent;
    try {
      parsedCurrent = new URL(current);
    } catch {
      return toFailureResult("redirect_not_allowed", "Invalid redirect target.");
    }

    const targetValidation = await validateRemoteTarget(parsedCurrent);
    if (!targetValidation.ok) {
      return targetValidation;
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(
      () => controller.abort(),
      Math.max(1, Number(timeoutMs) || 20_000),
    );
    let response;
    try {
      response = await fetchImpl(parsedCurrent.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        return toFailureResult("fetch_failed", "Request timed out.", { reason: "timeout" });
      }
      return toFailureResult("fetch_failed", "Failed to fetch remote image.");
    } finally {
      clearTimeout(timeoutHandle);
    }

    const status = Number(response?.status || 0);
    if (status >= 300 && status < 400) {
      const location = String(response.headers?.get?.("location") || "").trim();
      if (!location) {
        return toFailureResult("redirect_not_allowed", "Redirect location is invalid.");
      }
      if (redirectCount >= MAX_REDIRECTS) {
        return toFailureResult("redirect_not_allowed", "Too many redirects.");
      }
      try {
        current = new URL(location, parsedCurrent).toString();
      } catch {
        return toFailureResult("redirect_not_allowed", "Redirect location is invalid.");
      }
      continue;
    }

    return { ok: true, response };
  }

  return toFailureResult("redirect_not_allowed", "Too many redirects.");
};

const resolveUrlBaseName = (parsedRemote) => {
  const rawBaseName = path.basename(parsedRemote.pathname || "") || "upload";
  try {
    return decodeURIComponent(rawBaseName);
  } catch {
    return rawBaseName;
  }
};

const resolveOnExistingPolicy = (deterministic, onExisting) => {
  if (!deterministic) {
    return "overwrite";
  }
  const normalized = String(onExisting || "reuse")
    .trim()
    .toLowerCase();
  return normalized === "overwrite" ? "overwrite" : "reuse";
};

const buildUploadUrl = (folder, fileName) => `/uploads/${folder ? `${folder}/` : ""}${fileName}`;

const collectDeterministicCandidateNames = (safeBase) =>
  SUPPORTED_UPLOAD_EXTENSIONS.map((ext) => `${safeBase}.${ext}`);

const buildEntryFromDiskFile = ({ filePath, fileName, folder, createdAt }) => {
  const stat = fs.statSync(filePath);
  const size = Number(stat.size || 0);
  if (!size) {
    return toFailureResult("empty_upload", "Remote image is empty.");
  }
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return toFailureResult("file_too_large", "Remote image is too large.");
  }

  const buffer = fs.readFileSync(filePath);
  const extFromFile = path.extname(fileName).replace(".", "").toLowerCase();
  const fallbackMime = getUploadMimeFromExtension(extFromFile);
  const validation = validateUploadImageBuffer(buffer, fallbackMime);
  if (!validation.valid) {
    return toFailureResult(
      validation.error,
      `Remote image validation failed: ${validation.error}.`,
    );
  }
  const mime = validation.mime;
  if (mime === "image/svg+xml" && buffer.length > MAX_SVG_SIZE_BYTES) {
    return toFailureResult("svg_too_large", "SVG image is too large.");
  }

  return toSuccessResult({
    url: buildUploadUrl(folder, fileName),
    fileName,
    folder: folder || "",
    storageProvider: "local",
    size,
    mime,
    width: validation.dimensions?.width || null,
    height: validation.dimensions?.height || null,
    createdAt: String(createdAt || stat.mtime.toISOString()),
  });
};

const maybeReuseExistingDeterministicFile = ({ targetDir, safeBase, folder, onExistingPolicy }) => {
  if (onExistingPolicy !== "reuse") {
    return null;
  }
  const candidates = collectDeterministicCandidateNames(safeBase);
  for (const candidate of candidates) {
    const candidatePath = path.join(targetDir, candidate);
    if (!fs.existsSync(candidatePath)) {
      continue;
    }
    const existingResult = buildEntryFromDiskFile({
      filePath: candidatePath,
      fileName: candidate,
      folder,
    });
    if (existingResult.ok) {
      return existingResult;
    }
  }
  return null;
};

const removeAlternativeDeterministicFiles = ({ targetDir, safeBase, keepFileName }) => {
  const candidates = collectDeterministicCandidateNames(safeBase);
  candidates.forEach((candidate) => {
    if (candidate === keepFileName) {
      return;
    }
    const candidatePath = path.join(targetDir, candidate);
    if (!fs.existsSync(candidatePath)) {
      return;
    }
    try {
      fs.unlinkSync(candidatePath);
    } catch {
      // keep stale alternatives when deletion fails
    }
  });
};

export const importRemoteImageFile = async ({
  remoteUrl,
  folder = "",
  uploadsDir = path.join(process.cwd(), "public", "uploads"),
  timeoutMs = 20_000,
  fileBaseOverride = "",
  deterministic = false,
  onExisting = "reuse",
  fetchImpl = globalThis.fetch,
  throwOnError = false,
} = {}) => {
  try {
    const rawUrl = String(remoteUrl || "").trim();
    if (!rawUrl) {
      return toFailureResult("url_required", "URL is required.");
    }

    let parsedRemote;
    try {
      parsedRemote = new URL(rawUrl);
    } catch {
      return toFailureResult("invalid_url", "Invalid URL.");
    }
    const targetValidation = await validateRemoteTarget(parsedRemote);
    if (!targetValidation.ok) {
      return targetValidation;
    }

    if (typeof fetchImpl !== "function") {
      return toFailureResult("fetch_unavailable", "Fetch implementation is not available.");
    }

    const uploadsRoot = path.resolve(String(uploadsDir || ""));
    const safeFolder = sanitizeUploadFolder(folder);
    const targetDir = safeFolder ? path.join(uploadsRoot, safeFolder) : uploadsRoot;
    const resolvedTarget = path.resolve(targetDir);
    if (!isPathInsideRoot(uploadsRoot, resolvedTarget)) {
      return toFailureResult("invalid_folder", "Invalid target folder.");
    }
    fs.mkdirSync(resolvedTarget, { recursive: true });

    const deterministicMode = Boolean(deterministic);
    const onExistingPolicy = resolveOnExistingPolicy(deterministicMode, onExisting);
    const parsedName = resolveUrlBaseName(parsedRemote);
    const preferredBase = deterministicMode
      ? String(fileBaseOverride || parsedName || "upload")
      : parsedName;
    const safeBase = sanitizeUploadBaseName(preferredBase) || DEFAULT_UPLOAD_FILE_BASE;

    if (deterministicMode) {
      const reusedResult = maybeReuseExistingDeterministicFile({
        targetDir: resolvedTarget,
        safeBase,
        folder: safeFolder,
        onExistingPolicy,
      });
      if (reusedResult) {
        return reusedResult;
      }
    }

    const fetchResult = await fetchWithSafeRedirects({
      fetchImpl,
      initialUrl: parsedRemote.toString(),
      timeoutMs,
    });
    if (!fetchResult.ok) {
      return fetchResult;
    }
    const response = fetchResult.response;

    if (!response?.ok) {
      return toFailureResult("fetch_failed", "Remote server responded with error.", {
        status: Number(response?.status || 0),
      });
    }

    let finalRemote = parsedRemote;
    try {
      if (response.url) {
        finalRemote = new URL(response.url);
      }
    } catch {
      finalRemote = parsedRemote;
    }

    const contentTypeHeader = String(response.headers?.get?.("content-type") || "");
    const headerMime = normalizeUploadMime(contentTypeHeader.split(";")[0].trim().toLowerCase());
    const extFromUrl = path
      .extname(finalRemote.pathname || "")
      .replace(".", "")
      .toLowerCase();
    let mime = isSupportedUploadImageMime(headerMime)
      ? headerMime
      : getUploadMimeFromExtension(extFromUrl);

    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      return toFailureResult("empty_upload", "Remote image is empty.");
    }
    if (buffer.length > MAX_UPLOAD_SIZE_BYTES) {
      return toFailureResult("file_too_large", "Remote image is too large.");
    }

    const validation = validateUploadImageBuffer(buffer, mime);
    if (!validation.valid) {
      return toFailureResult(
        validation.error,
        `Remote image validation failed: ${validation.error}.`,
      );
    }
    mime = validation.mime;
    if (mime === "image/svg+xml" && buffer.length > MAX_SVG_SIZE_BYTES) {
      return toFailureResult("svg_too_large", "SVG image is too large.");
    }

    const ext = getUploadExtFromMime(mime);
    const fileName = deterministicMode ? `${safeBase}.${ext}` : `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(resolvedTarget, fileName);

    if (deterministicMode && onExistingPolicy === "reuse" && fs.existsSync(filePath)) {
      return buildEntryFromDiskFile({
        filePath,
        fileName,
        folder: safeFolder,
      });
    }

    if (mime === "image/svg+xml") {
      const sanitized = sanitizeSvg(buffer.toString("utf-8"));
      fs.writeFileSync(filePath, sanitized);
    } else {
      fs.writeFileSync(filePath, buffer);
    }

    if (deterministicMode) {
      removeAlternativeDeterministicFiles({
        targetDir: resolvedTarget,
        safeBase,
        keepFileName: fileName,
      });
    }

    const createdAt = new Date().toISOString();
    return buildEntryFromDiskFile({
      filePath,
      fileName,
      folder: safeFolder,
      createdAt,
    });
  } catch (error) {
    if (throwOnError) {
      throw error;
    }
    return toFailureResult("import_failed", "Unexpected error while importing remote image.");
  }
};
