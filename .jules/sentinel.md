## 2025-02-28 - Host Header Injection in PWA Bootstrap Policy
**Vulnerability:** The application was manually parsing the `X-Forwarded-Host` header to determine the request hostname for the PWA bootstrap policy.
**Learning:** Manually parsing `X-Forwarded-Host` bypasses framework-level protections (like Express's `trust proxy` setting) and allows attackers to spoof the header if the application is not behind a trusted reverse proxy that strips or rewrites it.
**Prevention:** Rely on `req.hostname` which respects `trust proxy` settings, or fallback to the standard `Host` header.
