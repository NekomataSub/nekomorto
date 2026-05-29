import { collectBootstrapPublicMediaUrls } from "./lib/public-bootstrap-media.mjs";

const args = process.argv.slice(2);

const getArgValue = (name) => {
  const item = args.find((entry) => entry.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : "";
};

const baseUrl = (getArgValue("--base") || "http://localhost:8080").replace(/\/+$/, "");
const timeoutMs = Number.parseInt(getArgValue("--timeout-ms") || "10000", 10);
const expectProdHtml = /^(?:1|true|yes)$/i.test(getArgValue("--expect-prod-html") || "false");
const checkPublicMedia = /^(?:1|true|yes)$/i.test(getArgValue("--check-public-media") || "false");
const publicMediaSampleSize = Number.parseInt(
  getArgValue("--public-media-sample-size") || "12",
  10,
);

if (!baseUrl) {
  console.error("--base is required");
  process.exit(1);
}

const withTimeout = async (resource, options = {}) => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, {
      ...options,
      signal: controller.signal,
      headers: {
        accept: "application/json, application/xml, application/rss+xml, text/xml;q=0.9, */*;q=0.8",
        "x-forwarded-for": "203.0.113.10",
        ...(options.headers || {}),
      },
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const loadJsonEndpoint = async (path) => {
  const response = await withTimeout(`${baseUrl}${path}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`${path} expected JSON content-type, got "${contentType}"`);
  }
  const payload = await response.json();
  return {
    response,
    payload,
    contentType,
  };
};

const assertJsonEndpoint = async (path, assertPayload) => {
  const { response, payload, contentType } = await loadJsonEndpoint(path);
  assertPayload(payload);
  return { path, status: response.status, contentType };
};

const assertPublicHealthChecksAreSanitized = (path, payload) => {
  const leakingCheck = Array.isArray(payload?.checks)
    ? payload.checks.find((check) => Object.hasOwn(check || {}, "meta"))
    : null;
  if (leakingCheck) {
    throw new Error(`${path} public checks must not include meta`);
  }
};

const assertXmlEndpoint = async (path, { expectedContentTypePart, expectedBodySnippet }) => {
  const response = await withTimeout(`${baseUrl}${path}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes(expectedContentTypePart)) {
    throw new Error(
      `${path} expected content-type containing "${expectedContentTypePart}", got "${contentType}"`,
    );
  }
  const body = await response.text();
  if (!body.includes(expectedBodySnippet)) {
    throw new Error(`${path} response body does not include "${expectedBodySnippet}"`);
  }
  return { path, status: response.status, contentType };
};

const assertManifestEndpoint = async (path) => {
  const response = await withTimeout(`${baseUrl}${path}`);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("json") && !contentType.includes("manifest")) {
    throw new Error(`${path} expected manifest/json content-type, got "${contentType}"`);
  }
  const body = await response.text();
  if (/^\s*<!doctype html>/i.test(body)) {
    throw new Error(`${path} returned HTML instead of manifest JSON`);
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`${path} response is not valid JSON`);
  }
  if (String(payload?.id || "").trim() !== "/") {
    throw new Error(`${path} must include id='/'`);
  }
  if (!Array.isArray(payload?.icons) || payload.icons.length === 0) {
    throw new Error(`${path} must include icons array`);
  }
  if (!Array.isArray(payload?.screenshots) || payload.screenshots.length === 0) {
    throw new Error(`${path} must include screenshots array`);
  }
  return { path, status: response.status, contentType };
};

const assertRootHtmlEndpoint = async ({ path, expectProdHtml }) => {
  const response = await withTimeout(`${baseUrl}${path}`, {
    headers: {
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/html")) {
    throw new Error(`${path} expected HTML content-type, got "${contentType}"`);
  }
  const body = await response.text();
  if (!/<html[\s>]/i.test(body)) {
    throw new Error(`${path} did not return an HTML document`);
  }
  const containsViteClient = body.includes("/@vite/client");
  const containsLegacyPwaModule =
    body.includes("/@vite-plugin-pwa/") || body.includes("vite-plugin-pwa");
  const containsSrcMainTsx = body.includes("/src/main.tsx") || body.includes('"/src/main.tsx"');
  if (expectProdHtml && containsViteClient) {
    throw new Error(`${path} returned Vite dev HTML with /@vite/client on a prod-like target`);
  }
  if (expectProdHtml && containsLegacyPwaModule) {
    throw new Error(`${path} returned legacy vite-plugin-pwa HTML on a prod-like target`);
  }
  if (expectProdHtml && containsSrcMainTsx) {
    throw new Error(`${path} returned Vite dev HTML with /src/main.tsx on a prod-like target`);
  }
  return {
    path,
    status: response.status,
    contentType,
    containsViteClient,
    containsLegacyPwaModule,
    containsSrcMainTsx,
  };
};

const assertNoPublicModuleEndpoint = async (path) => {
  const response = await withTimeout(`${baseUrl}${path}`, {
    headers: {
      accept: "text/javascript,application/javascript,*/*;q=0.8",
    },
  });
  if (response.status === 404) {
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const body = await response.text();
    if (contentType.includes("text/html")) {
      throw new Error(`${path} must not return HTML content-type on a prod-like target 404`);
    }
    if (/^\s*<!doctype html>/i.test(body)) {
      throw new Error(`${path} returned HTML instead of a non-HTML 404 on a prod-like target`);
    }
    return {
      path,
      status: response.status,
      contentType,
    };
  }
  const body = await response.text();
  throw new Error(
    `${path} expected 404 on a prod-like target, got ${response.status}: ${body.slice(0, 200)}`,
  );
};

const assertMissingAssetEndpoint = async (path) => {
  const response = await withTimeout(`${baseUrl}${path}`);
  if (response.status !== 404) {
    const body = await response.text();
    throw new Error(`${path} expected 404, got ${response.status}: ${body}`);
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error(`${path} must not return HTML content-type on 404, got "${contentType}"`);
  }
  const body = await response.text();
  if (/^\s*<!doctype html>/i.test(body)) {
    throw new Error(`${path} returned HTML instead of a non-HTML 404`);
  }
  return { path, status: response.status, contentType };
};

const assertPublicBootstrapMedia = async () => {
  const { response, payload, contentType } = await loadJsonEndpoint("/api/public/bootstrap");
  const mediaUrls = collectBootstrapPublicMediaUrls(payload, {
    limit: publicMediaSampleSize,
  });
  const mediaChecks = [];

  for (const item of mediaUrls) {
    const mediaResponse = await withTimeout(`${baseUrl}${item.url}`, {
      method: "HEAD",
      headers: {
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
    });
    if (!mediaResponse.ok) {
      throw new Error(`${item.url} returned ${mediaResponse.status} during public media smoke`);
    }
    const mediaContentType = String(mediaResponse.headers.get("content-type") || "").toLowerCase();
    if (mediaContentType.includes("text/html")) {
      throw new Error(`${item.url} returned HTML content-type during public media smoke`);
    }
    mediaChecks.push({
      path: item.url,
      status: mediaResponse.status,
      contentType: mediaContentType,
      source: item.label,
    });
  }

  return {
    bootstrapCheck: {
      path: "/api/public/bootstrap",
      status: response.status,
      contentType,
      publicMediaChecked: mediaChecks.length,
    },
    mediaChecks,
  };
};

const main = async () => {
  const checks = [];

  checks.push(
    await assertJsonEndpoint("/api/health/live", (payload) => {
      if (payload?.ok !== true) {
        throw new Error("/api/health/live payload.ok must be true");
      }
      if (payload?.status !== "ok") {
        throw new Error(`/api/health/live status expected "ok", got "${payload?.status}"`);
      }
      if (!Object.hasOwn(payload || {}, "build")) {
        throw new Error("/api/health/live must include build metadata");
      }
    }),
  );

  checks.push(
    await assertJsonEndpoint("/api/health/ready", (payload) => {
      const status = payload?.status;
      if (!["ok", "degraded", "fail"].includes(status)) {
        throw new Error(`/api/health/ready status invalid: "${status}"`);
      }
      if (!Array.isArray(payload?.checks)) {
        throw new Error("/api/health/ready checks must be an array");
      }
      if (!Object.hasOwn(payload || {}, "build")) {
        throw new Error("/api/health/ready must include build metadata");
      }
      assertPublicHealthChecksAreSanitized("/api/health/ready", payload);
    }),
  );

  checks.push(
    await assertJsonEndpoint("/api/health", (payload) => {
      if (!Object.hasOwn(payload || {}, "dataSource")) {
        throw new Error("/api/health must include dataSource");
      }
      if (!Object.hasOwn(payload || {}, "maintenanceMode")) {
        throw new Error("/api/health must include maintenanceMode");
      }
      if (!Array.isArray(payload?.checks)) {
        throw new Error("/api/health must include checks array");
      }
      if (!Object.hasOwn(payload || {}, "build")) {
        throw new Error("/api/health must include build metadata");
      }
      if (!Object.hasOwn(payload?.build || {}, "apiVersion")) {
        throw new Error("/api/health build metadata must include apiVersion");
      }
      assertPublicHealthChecksAreSanitized("/api/health", payload);
    }),
  );

  checks.push(
    await assertJsonEndpoint("/api/contracts/v1.json", (payload) => {
      if (payload?.version !== "v1") {
        throw new Error(`/api/contracts/v1.json version expected "v1", got "${payload?.version}"`);
      }
      if (payload?.capabilities?.project_epub_import !== true) {
        throw new Error("/api/contracts/v1.json must advertise project_epub_import=true");
      }
      if (payload?.capabilities?.project_epub_export !== true) {
        throw new Error("/api/contracts/v1.json must advertise project_epub_export=true");
      }
      if (!Object.hasOwn(payload || {}, "build")) {
        throw new Error("/api/contracts/v1.json must include build metadata");
      }
    }),
  );

  checks.push(
    await assertXmlEndpoint("/sitemap.xml", {
      expectedContentTypePart: "xml",
      expectedBodySnippet: "<urlset",
    }),
  );
  checks.push(
    await assertXmlEndpoint("/api/public/sitemap.xml", {
      expectedContentTypePart: "xml",
      expectedBodySnippet: "<urlset",
    }),
  );

  checks.push(
    await assertXmlEndpoint("/rss/posts.xml", {
      expectedContentTypePart: "xml",
      expectedBodySnippet: "<rss",
    }),
  );
  checks.push(
    await assertXmlEndpoint("/rss/lancamentos.xml", {
      expectedContentTypePart: "xml",
      expectedBodySnippet: "<rss",
    }),
  );
  checks.push(
    await assertXmlEndpoint("/api/public/rss.xml?feed=posts", {
      expectedContentTypePart: "xml",
      expectedBodySnippet: "<rss",
    }),
  );
  checks.push(
    await assertXmlEndpoint("/api/public/rss.xml?feed=lancamentos", {
      expectedContentTypePart: "xml",
      expectedBodySnippet: "<rss",
    }),
  );

  const rootHtmlCheck = await assertRootHtmlEndpoint({
    path: "/",
    expectProdHtml,
  });
  checks.push(rootHtmlCheck);

  checks.push(await assertManifestEndpoint("/manifest.webmanifest"));

  checks.push(await assertMissingAssetEndpoint("/assets/__missing__.js"));

  if (checkPublicMedia) {
    const publicMediaCheck = await assertPublicBootstrapMedia();
    checks.push(publicMediaCheck.bootstrapCheck);
    checks.push(...publicMediaCheck.mediaChecks);
  }

  if (expectProdHtml) {
    checks.push(await assertNoPublicModuleEndpoint("/@vite/client"));
    checks.push(await assertNoPublicModuleEndpoint("/src/main.tsx"));
  }

  console.log(
    JSON.stringify(
      {
        baseUrl,
        checks,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
