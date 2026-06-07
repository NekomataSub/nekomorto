import { describe, expect, it, vi } from "vitest";

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  injectNonceIntoHtmlScripts,
} from "../../server/lib/security-headers.js";

describe("buildContentSecurityPolicy", () => {
  it("inclui nonce e diretivas esperadas", () => {
    const nonce = "nonce-valor-teste";
    const csp = buildContentSecurityPolicy(nonce);

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain(
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://platform.twitter.com https://static.cloudflareinsights.com`,
    );
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("font-src 'self' data:");
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("connect-src 'self' https:");
    expect(csp).toContain(
      "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://platform.twitter.com https://syndication.twitter.com https://*.twitter.com https://x.com",
    );
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp.endsWith(";")).toBe(true);
  });

  it("mantem compatibilidade explicita para scripts inline quando solicitado", () => {
    const csp = buildContentSecurityPolicy("nonce-valor-teste", {
      allowInlineScripts: true,
    });

    expect(csp).toContain(
      "script-src 'self' 'unsafe-inline' https://platform.twitter.com https://static.cloudflareinsights.com",
    );
    expect(csp).not.toContain("'nonce-nonce-valor-teste'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});

describe("injectNonceIntoHtmlScripts", () => {
  it("injeta nonce em script inline e module", () => {
    const html = `<html><head><script>window.a=1;</script></head><body><script type="module" src="/src/main.tsx"></script></body></html>`;
    const result = injectNonceIntoHtmlScripts(html, "abc123");

    expect(result).toContain(`<script nonce="abc123">window.a=1;</script>`);
    expect(result).toContain(`<script type="module" src="/src/main.tsx" nonce="abc123"></script>`);
  });

  it("substitui nonce existente pelo nonce atual da resposta", () => {
    const html = `<script nonce="existente">window.a=1;</script>`;
    const result = injectNonceIntoHtmlScripts(html, "novo");
    expect(result).toBe(`<script nonce="novo">window.a=1;</script>`);
    expect(result).not.toContain(`nonce="existente"`);
  });

  it("substitui nonce existente sem duplicar atributo em scripts externos", () => {
    const html = `<script type="module" src="/assets/index.js" nonce='antigo'></script>`;
    const result = injectNonceIntoHtmlScripts(html, "atual");

    expect(result).toBe(`<script type="module" src="/assets/index.js" nonce="atual"></script>`);
    expect(result.match(/\snonce=/g)).toHaveLength(1);
  });
});

describe("applySecurityHeaders", () => {
  it("define todos os headers de seguranca esperados", () => {
    const setHeader = vi.fn();
    const res = { setHeader };

    applySecurityHeaders(res, "nonce-dinamico");
    const permissionsPolicy = "camera=(), microphone=(), geolocation=(), payment=(), usb=()";

    expect(setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
    expect(setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
    expect(setHeader).toHaveBeenCalledWith("Permissions-Policy", permissionsPolicy);
    expect(permissionsPolicy).not.toContain("interest-cohort");
    expect(permissionsPolicy).not.toContain("compute-pressure");
    expect(setHeader).toHaveBeenCalledWith(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload",
    );
    expect(setHeader).toHaveBeenCalledWith("Cross-Origin-Opener-Policy", "same-origin");
    expect(setHeader).toHaveBeenCalledWith("Cross-Origin-Resource-Policy", "same-origin");
    expect(setHeader).toHaveBeenCalledWith("Origin-Agent-Cluster", "?1");
    expect(setHeader).toHaveBeenCalledWith("X-Permitted-Cross-Domain-Policies", "none");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      expect.stringContaining(`'nonce-nonce-dinamico'`),
    );
  });

  it("define CSP compativel com ClientRouter quando scripts inline sao permitidos", () => {
    const setHeader = vi.fn();
    const res = { setHeader };

    applySecurityHeaders(res, "nonce-dinamico", { allowInlineScripts: true });

    expect(setHeader).toHaveBeenCalledWith(
      "Content-Security-Policy",
      expect.stringContaining(
        "script-src 'self' 'unsafe-inline' https://platform.twitter.com https://static.cloudflareinsights.com",
      ),
    );
    expect(setHeader).not.toHaveBeenCalledWith(
      "Content-Security-Policy",
      expect.stringContaining("'nonce-nonce-dinamico'"),
    );
  });
});
