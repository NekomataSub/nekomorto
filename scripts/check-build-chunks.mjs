import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const clientDistDir = path.resolve(process.env.CLIENT_DIST_DIR || path.join(workspaceRoot, "dist"));
const distAssetsDir = path.join(clientDistDir, "assets");

if (!fs.existsSync(distAssetsDir)) {
  console.error(`[build-chunk-check] assets nao encontrados em ${distAssetsDir}`);
  process.exit(1);
}

const fail = (message) => {
  console.error(`[build-chunk-check] ${message}`);
  process.exitCode = 1;
};

const assetFiles = fs.readdirSync(distAssetsDir);
const lexicalCoreChunks = assetFiles.filter(
  (fileName) =>
    (fileName.startsWith("lexical-") || fileName.startsWith("lexical~")) &&
    fileName.endsWith(".js") &&
    !fileName.startsWith("lexical-editor-") &&
    !fileName.startsWith("lexical-viewer-"),
);

for (const fileName of lexicalCoreChunks) {
  const source = fs.readFileSync(path.join(distAssetsDir, fileName), "utf8");
  if (/["']\.\/lexical-editor-[^"']+\.js["']/.test(source)) {
    fail(`chunk lexical importa indevidamente lexical-editor. Arquivo: ${fileName}`);
  }
  if (/["']\.\/lexical-viewer-[^"']+\.js["']/.test(source)) {
    fail(`chunk lexical importa indevidamente lexical-viewer. Arquivo: ${fileName}`);
  }
}

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log(`[build-chunk-check] OK (lexical_chunks=${lexicalCoreChunks.length})`);
