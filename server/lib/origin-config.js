const DEFAULT_DEV_PRIMARY_ORIGIN = "http://127.0.0.1:5173";

const normalizeString = (value) => String(value || "").trim();
const normalizeOriginCandidate = (value) => {
  const normalizedValue = normalizeString(value);
  if (!normalizedValue) {
    return "";
  }
  try {
    return new URL(normalizedValue).origin;
  } catch {
    return "";
  }
};
const resolveHostOrigin = (req) => {
  const hostHeader = normalizeString(req?.headers?.host || "");
  if (!hostHeader) {
    return "";
  }
  return normalizeOriginCandidate(`${req?.protocol || "http"}://${hostHeader}`);
};
const resolveAllowedOriginCandidate = (candidate, isAllowedOriginFn) => {
  const normalizedCandidate = normalizeOriginCandidate(candidate);
  if (!normalizedCandidate) {
    return "";
  }
  if (typeof isAllowedOriginFn === "function" && !isAllowedOriginFn(normalizedCandidate)) {
    return "";
  }
  return normalizedCandidate;
};

const parseHttpUrl = (value, envName) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`${envName} must use http:// or https://`);
    }
    return parsed;
  } catch {
    throw new Error(`${envName} must be a valid absolute http(s) URL`);
  }
};

const toOrigin = (value, envName) => parseHttpUrl(value, envName).origin;

const normalizeOriginList = (rawValue, envName) => {
  const seen = new Set();
  const origins = [];
  normalizeString(rawValue)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const origin = toOrigin(item, envName);
      if (seen.has(origin)) {
        return;
      }
      seen.add(origin);
      origins.push(origin);
    });
  return origins;
};

const isLocalOrPrivateHost = (hostname) => {
  const normalized = String(hostname || "").toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }
  if (
    /^10\.\d+\.\d+\.\d+$/.test(normalized) ||
    /^192\.168\.\d+\.\d+$/.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(normalized)
  ) {
    return true;
  }
  return false;
};

export const buildOriginConfig = ({
  appOriginEnv = "",
  adminOriginsEnv = "",
  isProduction = false,
  devPrimaryOriginFallback = DEFAULT_DEV_PRIMARY_ORIGIN,
} = {}) => {
  const appOrigins = normalizeOriginList(appOriginEnv, "APP_ORIGIN");
  if (isProduction && appOrigins.length === 0) {
    throw new Error(
      "APP_ORIGIN is required in production and must contain at least one valid origin.",
    );
  }

  const adminOrigins = normalizeOriginList(adminOriginsEnv, "ADMIN_ORIGINS");
  const allowedOrigins = Array.from(new Set([...appOrigins, ...adminOrigins]));

  const primaryAppOrigin =
    appOrigins[0] || toOrigin(devPrimaryOriginFallback || DEFAULT_DEV_PRIMARY_ORIGIN, "APP_ORIGIN");
  const primaryAppHost = (() => {
    try {
      return new URL(primaryAppOrigin).host.toLowerCase();
    } catch {
      return "";
    }
  })();

  return {
    appOrigins,
    adminOrigins,
    allowedOrigins,
    primaryAppOrigin,
    primaryAppHost,
  };
};

export const isAllowedOrigin = ({ origin, allowedOrigins, isProduction }) => {
  if (!origin) {
    return !isProduction;
  }
  let normalizedOrigin = "";
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }
  if ((allowedOrigins || []).includes(normalizedOrigin)) {
    return true;
  }
  if (isProduction) {
    return false;
  }
  try {
    const { hostname } = new URL(normalizedOrigin);
    return isLocalOrPrivateHost(hostname);
  } catch {
    return false;
  }
};

export const resolveRequestOrigin = (req) => {
  const originHeader = normalizeString(req?.headers?.origin || "");
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      return "";
    }
  }
  const refererHeader = normalizeString(req?.headers?.referer || "");
  if (refererHeader) {
    try {
      return new URL(refererHeader).origin;
    } catch {
      return "";
    }
  }
  return resolveHostOrigin(req);
};

export const resolveAuthAppOrigin = ({
  req,
  sessionOrigin,
  primaryAppOrigin,
  isAllowedOriginFn,
}) => {
  const sessionCandidate = resolveAllowedOriginCandidate(sessionOrigin, isAllowedOriginFn);
  if (sessionCandidate) {
    return sessionCandidate;
  }

  const requestCandidate = resolveAllowedOriginCandidate(
    resolveRequestOrigin(req),
    isAllowedOriginFn,
  );
  if (requestCandidate) {
    return requestCandidate;
  }

  return normalizeOriginCandidate(primaryAppOrigin) || String(primaryAppOrigin || "").trim();
};
