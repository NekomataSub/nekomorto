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
## 2025-02-27 - [SSRF] SSRF bypass due to incorrect IPv6 localhost validation
**Vulnerability:** The previous SSRF validation logic used a strict string comparison `normalized === "::1"` to block IPv6 localhost addresses.
**Learning:** Node.js URL parsing retains brackets around IPv6 addresses in the `hostname` property (e.g., `http://[::1]` parses to a hostname of `[::1]`). A strict string comparison against `::1` fails to catch the bracketed form, allowing bypass.
**Prevention:** When validating IP addresses for SSRF prevention, especially IPv6, always account for the possibility of bracketed notation in the input string, e.g., checking for both `::1` and `[::1]`.
