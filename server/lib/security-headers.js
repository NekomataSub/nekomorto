// Some third-party embeds probe blocked experimental features and may log
// browser warnings even when playback continues to work as expected.
const PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

const HSTS_HEADER_VALUE = "max-age=31536000; includeSubDomains; preload";

const escapeHtmlAttribute = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export const buildContentSecurityPolicy = (nonce, options = {}) => {
  const normalizedNonce = String(nonce || "").trim();
  const allowInlineScripts = options?.allowInlineScripts === true;
  const scriptSrc = ["'self'"];
  if (allowInlineScripts) {
    scriptSrc.push("'unsafe-inline'");
  } else if (normalizedNonce) {
    scriptSrc.push(`'nonce-${normalizedNonce}'`, "'strict-dynamic'");
  }
  scriptSrc.push("https://platform.twitter.com", "https://static.cloudflareinsights.com");

  const directives = [
    ["default-src", ["'self'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["object-src", ["'none'"]],
    ["frame-ancestors", ["'none'"]],
    ["script-src", scriptSrc],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["font-src", ["'self'", "data:"]],
    ["img-src", ["'self'", "data:", "blob:", "https:"]],
    ["connect-src", ["'self'", "https:"]],
    [
      "frame-src",
      [
        "'self'",
        "https://www.youtube-nocookie.com",
        "https://www.youtube.com",
        "https://platform.twitter.com",
        "https://syndication.twitter.com",
        "https://*.twitter.com",
        "https://x.com",
      ],
    ],
    ["worker-src", ["'self'", "blob:"]],
  ];

  return `${directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ")};`;
};

export const injectNonceIntoHtmlScripts = (html, nonce) => {
  const input = String(html ?? "");
  const normalizedNonce = String(nonce || "").trim();
  if (!input || !normalizedNonce) {
    return input;
  }
  const escapedNonce = escapeHtmlAttribute(normalizedNonce);
  return input.replace(/<script\b([^>]*)>/gi, (_match, attrs = "") => {
    const attrsWithoutNonce = String(attrs).replace(
      /\snonce\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
      "",
    );
    return `<script${attrsWithoutNonce} nonce="${escapedNonce}">`;
  });
};

export const applySecurityHeaders = (res, nonce, options = {}) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  res.setHeader("Strict-Transport-Security", HSTS_HEADER_VALUE);
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Origin-Agent-Cluster", "?1");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Content-Security-Policy", buildContentSecurityPolicy(nonce, options));
};
