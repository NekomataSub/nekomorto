const normalizeAppOrigin = (value) =>
  String(value || "")
    .trim()
    .replace(/\/+$/, "");
const normalizeAppPath = (value, fallback = "/") => {
  const normalizedValue = String(value || "").trim();
  if (
    !normalizedValue ||
    !normalizedValue.startsWith("/") ||
    normalizedValue.startsWith("//") ||
    normalizedValue.includes("\\") ||
    Array.from(normalizedValue).some((char) => {
      const code = char.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    return fallback;
  }
  return normalizedValue;
};

export const saveSessionState = (req) =>
  new Promise((resolve, reject) => {
    if (!req?.session || typeof req.session.save !== "function") {
      reject(new Error("session_unavailable"));
      return;
    }
    req.session.save((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

export const buildAuthRedirectUrl = ({ appOrigin, path = "/", searchParams = null } = {}) => {
  const normalizedOrigin = normalizeAppOrigin(appOrigin);
  const normalizedPath = normalizeAppPath(path);
  const url = new URL(normalizedPath, `${normalizedOrigin || "http://localhost"}/`);

  if (searchParams && typeof searchParams === "object") {
    Object.entries(searchParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }

  return normalizedOrigin ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
};

export default {
  buildAuthRedirectUrl,
  saveSessionState,
};
