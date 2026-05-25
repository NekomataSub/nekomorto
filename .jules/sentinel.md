## 2026-04-20 - [XSS] Unsanitized KaTeX rendering in ViewerEquationNode

**Vulnerability:** KaTeX string output was rendered using `dangerouslySetInnerHTML` directly without sanitization, which poses an XSS risk.
**Learning:** Even well-known libraries like KaTeX do not inherently guarantee safety against crafted mathml/html content injection when directly injected.
**Prevention:** Sanitize the KaTeX HTML output using `DOMPurify.sanitize` with `{ USE_PROFILES: { html: true, mathMl: true } }` prior to using `dangerouslySetInnerHTML`.
## 2025-04-20 - [SSRF in OG Image Delivery]
**Vulnerability:** Server-Side Request Forgery (SSRF) when proxying external artwork and background assets (`server/lib/project-og-assets.js` and `server/lib/institutional-og.js`) using `fetch()`.
**Learning:** Functions designed to proxy external imagery were directly passing user-supplied strings or configurable external URLs to `fetch()` without strictly parsing via the `URL` constructor or blocking redirects. This could allow an attacker to make the server fetch `file://` (if node-fetch supports it, though built-in fetch might fail, but it's risky) or internal IP address endpoints (`http://169.254.169.254/...`).
**Prevention:** Always parse external proxy targets with the `URL` constructor, enforce `https:` or `http:` protocol, and configure the fetch client to block redirects (e.g., `redirect: 'error'`) to prevent attackers from bypassing initial checks via redirecting to internal hosts.
## 2025-04-20 - [XSS] Unsanitized HTML string injection in Lexical Playground DOM sinks

**Vulnerability:** Raw HTML strings were assigned to `innerHTML` sinks without sanitization within `src/lexical-playground/nodes/ImageNode.tsx` and `src/lexical-playground/hooks/useReport.ts`.
**Learning:** Even within an encapsulated rich-text editor setup or helper hooks, directly passing HTML strings to `innerHTML` exposes an XSS risk if those strings can be populated with user content.
**Prevention:** Always sanitize strings with `DOMPurify.sanitize` (using strict profiles like `{ USE_PROFILES: { html: true } }` where appropriate) before rendering them via `innerHTML` or `dangerouslySetInnerHTML`.
## 2026-04-20 - [Host Header Injection] Bypassing Express trust proxy
**Vulnerability:** The application manually parsed `x-forwarded-host` headers to determine the request hostname. This bypasses Express's built-in `trust proxy` mechanism and allows attackers to spoof the host header.
**Learning:** When an application is behind a reverse proxy and configured with `app.set("trust proxy", 1)`, Express securely resolves the correct client IP and hostname. Manually reading `req.headers["x-forwarded-host"]` ignores this security and trusts potentially malicious input.
**Prevention:** Rely entirely on framework-level properties like `req.hostname` to resolve hostnames, which securely factors in proxy configuration, rather than reading raw forwarded headers.
