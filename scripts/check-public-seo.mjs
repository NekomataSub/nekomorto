import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    base: { type: "string", default: "http://127.0.0.1:8080" },
    "skip-images": { type: "boolean", default: false },
  },
});

const baseUrl = new URL(values.base);
const failures = [];
const checkedImages = new Set();
const discoveredInternalUrls = new Set();
const titlesByValue = new Map();

const fail = (url, message) => failures.push(`${url}: ${message}`);
const extractAttribute = (html, tagPattern, attribute) => {
  const match = html.match(tagPattern);
  if (!match) {
    return "";
  }
  return match[0].match(new RegExp(`${attribute}=["']([^"']*)["']`, "i"))?.[1]?.trim() || "";
};
const extractMeta = (html, attribute, value) =>
  extractAttribute(
    html,
    new RegExp(`<meta\\b[^>]*${attribute}=["']${value}["'][^>]*>`, "i"),
    "content",
  );
const extractCanonical = (html) =>
  extractAttribute(html, /<link\b[^>]*rel=["']canonical["'][^>]*>/i, "href");
const extractTitle = (html) => html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || "";

const fetchResponse = async (url, init = {}) => {
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      ...init,
    });
  } catch (error) {
    fail(url, `falha de rede: ${String(error?.message || error)}`);
    return null;
  }
};

const sitemapUrl = new URL("/sitemap.xml", baseUrl);
const sitemapResponse = await fetchResponse(sitemapUrl);
if (!sitemapResponse || sitemapResponse.status !== 200) {
  if (sitemapResponse) {
    fail(sitemapUrl, `sitemap retornou HTTP ${sitemapResponse.status}`);
  }
} else {
  const sitemapXml = await sitemapResponse.text();
  const locations = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) =>
    match[1].trim(),
  );
  if (locations.length === 0) {
    fail(sitemapUrl, "sitemap não contém URLs");
  }

  const seen = new Set();
  let canonicalOrigin = baseUrl.origin;
  try {
    canonicalOrigin = locations.length > 0 ? new URL(locations[0]).origin : baseUrl.origin;
  } catch {
    fail(sitemapUrl, `primeira URL inválida: ${locations[0]}`);
  }
  for (const location of locations) {
    let pageUrl;
    try {
      pageUrl = new URL(location);
    } catch {
      fail(sitemapUrl, `URL inválida: ${location}`);
      continue;
    }
    if (pageUrl.origin !== canonicalOrigin) {
      fail(location, `host diferente do host canônico ${canonicalOrigin}`);
    }
    if (seen.has(location)) {
      fail(location, "URL duplicada no sitemap");
      continue;
    }
    seen.add(location);

    const requestUrl = new URL(`${pageUrl.pathname}${pageUrl.search}`, baseUrl);
    const response = await fetchResponse(requestUrl);
    if (!response) {
      continue;
    }
    if (response.status !== 200) {
      fail(location, `retornou HTTP ${response.status}`);
      continue;
    }
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      fail(location, `Content-Type inesperado: ${contentType || "ausente"}`);
      continue;
    }

    const html = await response.text();
    const title = extractTitle(html);
    const description = extractMeta(html, "name", "description");
    const robots = extractMeta(html, "name", "robots").toLowerCase();
    const canonical = extractCanonical(html);
    const ogTitle = extractMeta(html, "property", "og:title");
    const ogDescription = extractMeta(html, "property", "og:description");
    const ogUrl = extractMeta(html, "property", "og:url");
    const ogImage = extractMeta(html, "property", "og:image");
    const twitterCard = extractMeta(html, "name", "twitter:card");

    if (!title || title.toLowerCase() === "carregando...")
      fail(location, "title ausente ou genérico");
    if (title) {
      const previousLocation = titlesByValue.get(title);
      if (previousLocation && previousLocation !== location) {
        fail(location, `title duplicado com ${previousLocation}`);
      } else {
        titlesByValue.set(title, location);
      }
    }
    if (!description) fail(location, "meta description ausente");
    if (!robots.includes("index") || robots.includes("noindex"))
      fail(location, "robots não permite indexação");
    if (canonical !== location) fail(location, `canonical divergente: ${canonical || "ausente"}`);
    if (!ogTitle || !ogDescription || ogUrl !== location)
      fail(location, "metadados Open Graph incompletos");
    if (!twitterCard) fail(location, "Twitter Card ausente");

    if (!/<h1\b[^>]*>[\s\S]*?<\/h1>/i.test(html)) {
      fail(location, "h1 ausente");
    }

    for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      try {
        const internalUrl = new URL(link[1], location);
        if (internalUrl.origin === canonicalOrigin) {
          internalUrl.hash = "";
          discoveredInternalUrls.add(internalUrl.toString());
        }
      } catch {
        // Ignore malformed or non-navigation hrefs; the page validator reports critical metadata.
      }
    }

    const schemaScripts = [
      ...html.matchAll(
        /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
      ),
    ];
    if (schemaScripts.length === 0) {
      fail(location, "JSON-LD ausente");
    }
    for (const schemaScript of schemaScripts) {
      try {
        const schema = JSON.parse(schemaScript[1]);
        if (schema?.["@type"] === "BreadcrumbList") {
          const items = Array.isArray(schema.itemListElement) ? schema.itemListElement : [];
          if (items.length < 2) {
            fail(location, "BreadcrumbList deve conter pelo menos dois itens");
          }
          if (items.some((item, index) => item?.position !== index + 1 || !item?.name)) {
            fail(location, "BreadcrumbList tem posições ou nomes inválidos");
          }
        }
        if (
          schema?.["@type"] === "WebSite" &&
          schema.potentialAction?.["@type"] === "SearchAction"
        ) {
          fail(location, "WebSite ainda contém o SearchAction descontinuado pelo Google");
        }
      } catch {
        fail(location, "JSON-LD inválido");
      }
    }

    if (!values["skip-images"] && ogImage && !checkedImages.has(ogImage)) {
      checkedImages.add(ogImage);
      let imageUrl;
      try {
        imageUrl = new URL(ogImage);
      } catch {
        fail(location, `og:image não é absoluta: ${ogImage}`);
        continue;
      }
      const imageResponse = await fetchResponse(imageUrl, { method: "HEAD" });
      if (imageResponse && !imageResponse.ok) {
        fail(ogImage, `imagem social retornou HTTP ${imageResponse.status}`);
      } else if (
        imageResponse &&
        !String(imageResponse.headers.get("content-type") || "")
          .toLowerCase()
          .startsWith("image/")
      ) {
        fail(ogImage, "imagem social não retornou Content-Type de imagem");
      }
    }
  }

  for (const location of locations.slice(1)) {
    if (!discoveredInternalUrls.has(location)) {
      fail(location, "URL não foi encontrada em nenhum link interno rastreável");
    }
  }
}

const missingUrl = new URL(`/seo-audit-not-found-${Date.now()}`, baseUrl);
const missingResponse = await fetchResponse(missingUrl);
if (missingResponse) {
  const missingHtml = await missingResponse.text();
  const missingRobots = extractMeta(missingHtml, "name", "robots").toLowerCase();
  if (missingResponse.status !== 404) {
    fail(missingUrl, `rota inexistente retornou HTTP ${missingResponse.status}`);
  }
  if (!missingRobots.includes("noindex")) {
    fail(missingUrl, "rota inexistente não contém noindex");
  }
}

if (failures.length > 0) {
  console.error(`[public-seo-check] FALHOU (${failures.length} problema(s))`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`[public-seo-check] OK (${baseUrl.origin})`);
}
