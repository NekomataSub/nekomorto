import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_MAX_HOME_CRITICAL_CSS_BYTES = 212 * 1024;
const MAX_HOME_CRITICAL_CSS_BYTES =
  Number.parseInt(process.env.HOME_CRITICAL_CSS_MAX_BYTES ?? "230000", 10) ||
  DEFAULT_MAX_HOME_CRITICAL_CSS_BYTES;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const distDir = path.join(workspaceRoot, "dist");
const indexHtmlPath = path.join(distDir, "index.html");

const fail = (message) => {
  console.error(`[home-build-check] ${message}`);
  process.exitCode = 1;
};

if (!fs.existsSync(indexHtmlPath)) {
  fail(`index.html não encontrado em ${indexHtmlPath}`);
  process.exit();
}

const html = fs.readFileSync(indexHtmlPath, "utf8");

if (/<script[^>]+src=["'][^"']*bootstrap-init\.js["']/i.test(html)) {
  fail("index.html ainda referencia bootstrap-init.js bloqueante.");
}

if (/<link[^>]+rel=["']modulepreload["'][^>]+href=["'][^"']*mui-[^"']*\.js["']/i.test(html)) {
  fail("index.html contém modulepreload de chunk mui-*.js no entry público.");
}

if (
  /<link[^>]+rel=["']modulepreload["'][^>]+href=["'][^"']*(?:charts|lexical)(?:-|~)[^"']*\.js["']/i.test(
    html,
  )
) {
  fail("index.html contém modulepreload de editor ou gráficos no entry público.");
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const readDistAsset = (relativeAssetPath) => {
  const absoluteAssetPath = path.join(distDir, relativeAssetPath);
  if (!fs.existsSync(absoluteAssetPath)) {
    fail(`arquivo de asset não encontrado: ${absoluteAssetPath}`);
    return "";
  }
  return fs.readFileSync(absoluteAssetPath, "utf8");
};

const assetsDir = path.join(distDir, "assets");
if (!fs.existsSync(assetsDir)) {
  fail(`diretório de assets não encontrado: ${assetsDir}`);
  process.exit();
}

const astroClientAssetsDir = path.join(workspaceRoot, "dist-astro", "client", "_astro");
if (!fs.existsSync(astroClientAssetsDir)) {
  fail(`diretório de assets Astro não encontrado: ${astroClientAssetsDir}`);
  process.exit();
}

const criticalAstroIslandPrefixes = ["PublicChromeIsland.", "PublicHomeIsland."];
const criticalAstroIslandFiles = fs
  .readdirSync(astroClientAssetsDir)
  .filter(
    (fileName) =>
      fileName.endsWith(".js") &&
      criticalAstroIslandPrefixes.some((prefix) => fileName.startsWith(prefix)),
  );

for (const prefix of criticalAstroIslandPrefixes) {
  if (!criticalAstroIslandFiles.some((fileName) => fileName.startsWith(prefix))) {
    fail(`island Astro crítico não encontrado para o prefixo ${prefix}`);
  }
}

for (const fileName of criticalAstroIslandFiles) {
  const source = fs.readFileSync(path.join(astroClientAssetsDir, fileName), "utf8");
  if (/from["']\.\/(?:charts|lexical)[.~_-][^"']+\.js["']/.test(source)) {
    fail(`island Astro crítico importa editor ou gráficos. Arquivo: ${fileName}`);
  }
}

const allAssetFiles = fs.readdirSync(assetsDir);
const allJavaScriptAssets = allAssetFiles.filter((fileName) => fileName.endsWith(".js"));

const findChunkFilesByPrefix = (prefix, excludePrefixes = []) =>
  allJavaScriptAssets.filter((fileName) => {
    if (!fileName.startsWith(`${prefix}-`) && !fileName.startsWith(`${prefix}~`)) {
      return false;
    }
    return !excludePrefixes.some(
      (excludedPrefix) =>
        fileName.startsWith(`${excludedPrefix}-`) || fileName.startsWith(`${excludedPrefix}~`),
    );
  });

const entryScriptMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);

if (!entryScriptMatch) {
  fail("não foi possível identificar o script module de entrada no index.html.");
  process.exit();
}

const entryScriptHref = String(entryScriptMatch[1] || "").split(/[?#]/, 1)[0];
const normalizedEntryScriptPath = entryScriptHref.replace(/^\//, "");
const entryScriptFileName = path.basename(normalizedEntryScriptPath);
const entryScriptSource = readDistAsset(normalizedEntryScriptPath);

if (entryScriptSource) {
  const selfImportPattern = new RegExp(
    `(?:import\\s*\\(\\s*|import\\s*(?:[^"']+?from\\s*)?)["']\\./${escapeRegExp(entryScriptFileName)}["']`,
  );
  if (selfImportPattern.test(entryScriptSource)) {
    fail(`entry ${entryScriptFileName} contem auto-import explicito.`);
  }
}

const assertNoChunkImport = ({
  sourcePrefix,
  sourceExcludePrefixes,
  forbiddenImportPattern,
  errorMessage,
}) => {
  const sourceFiles = findChunkFilesByPrefix(sourcePrefix, sourceExcludePrefixes);
  for (const fileName of sourceFiles) {
    const source = readDistAsset(path.posix.join("assets", fileName));
    if (forbiddenImportPattern.test(source)) {
      fail(`${errorMessage} Arquivo: ${fileName}`);
    }
  }
};

assertNoChunkImport({
  sourcePrefix: "react-core",
  forbiddenImportPattern: new RegExp(`["']\\./${escapeRegExp(entryScriptFileName)}["']`),
  errorMessage: "chunk react-core importa indevidamente o chunk de entrada index.",
});

assertNoChunkImport({
  sourcePrefix: "lexical",
  forbiddenImportPattern: /["']\.\/PlaygroundNodes-[^"']+\.js["']/,
  errorMessage: "chunk lexical importa indevidamente o chunk PlaygroundNodes.",
});

assertNoChunkImport({
  sourcePrefix: "mui",
  sourceExcludePrefixes: ["mui-date-time-fields"],
  forbiddenImportPattern: /["']\.\/mui-date-time-fields-[^"']+\.js["']/,
  errorMessage: "chunk mui importa indevidamente o chunk mui-date-time-fields.",
});

assertNoChunkImport({
  sourcePrefix: "charts",
  forbiddenImportPattern: /["']\.\/DashboardAnalytics-[^"']+\.js["']/,
  errorMessage: "chunk charts importa indevidamente o chunk DashboardAnalytics.",
});

const stylesheetHrefMatches = Array.from(
  html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi),
).map((match) => String(match[1] || "").trim());

const localStylesheetHrefs = stylesheetHrefMatches.filter(
  (href) => href.startsWith("/assets/") || href.startsWith("assets/"),
);

let criticalCssBytes = 0;
for (const href of localStylesheetHrefs) {
  const normalizedHref = href.replace(/^\//, "");
  const absolutePath = path.join(distDir, normalizedHref);
  if (!fs.existsSync(absolutePath)) {
    fail(`arquivo CSS referenciado não encontrado: ${absolutePath}`);
    continue;
  }
  criticalCssBytes += fs.statSync(absolutePath).size;
}

if (criticalCssBytes > MAX_HOME_CRITICAL_CSS_BYTES) {
  fail(
    `CSS critico excedeu limite (${criticalCssBytes} bytes > ${MAX_HOME_CRITICAL_CSS_BYTES} bytes).`,
  );
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log(
  `[home-build-check] OK (css_critico=${criticalCssBytes} bytes, stylesheets=${localStylesheetHrefs.length})`,
);
