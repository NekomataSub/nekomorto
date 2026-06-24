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
## $(date +%Y-%m-%d) - [SSRF] IPv6 Bracket Bypass in URL Hostname Validation
**Vulnerability:** The `isPrivateHost` and `isPrivateIpv6` checks bypassed private IP validation when an IPv6 URL is constructed (e.g., `http://[::1]`) because `new URL()` retains the brackets. Consequently, `net.isIP("[::1]")` evaluated to 0 (false), allowing SSRF.
**Learning:** `new URL(url).hostname` retains the brackets around IPv6 addresses (as per standard). Node's `net.isIP()` function expects the raw IPv6 address without brackets, thus evaluating to 0.
**Prevention:** To prevent SSRF bypasses via bracketed IPv6 URLs, always strip leading and trailing brackets from the hostname before evaluating against `net.isIP()` or local domain denylists.
