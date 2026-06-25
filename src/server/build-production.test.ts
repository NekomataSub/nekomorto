import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { publishBuildArtifacts } from "../../scripts/build-production.mjs";

const tempDirs: string[] = [];

const write = (root: string, relativePath: string, content: string) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};

const createGeneration = (root: string, name: string) => {
  const client = path.join(root, `${name}-client`);
  const astro = path.join(root, `${name}-astro`);
  write(client, `assets/${name}.js`, name);
  write(client, "index.html", `<script src="/assets/${name}.js"></script>`);
  write(client, ".vite/manifest.json", JSON.stringify({ name }));
  write(astro, `client/_astro/${name}.js`, name);
  write(astro, `server/chunks/${name}.mjs`, name);
  write(astro, "server/entry.mjs", `export default "${name}"`);
  return { astro, client };
};

describe("production build publication", () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it("publishes new entrypoints while retaining only the previous asset generation", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nekomorto-build-"));
    tempDirs.push(root);
    const targetClient = path.join(root, "dist");
    const targetAstro = path.join(root, "dist-astro");
    const metadataPath = path.join(root, "generations.json");
    const first = createGeneration(root, "first");

    publishBuildArtifacts({
      stagedClientDir: first.client,
      stagedAstroDir: first.astro,
      clientTargetDir: targetClient,
      astroTargetDir: targetAstro,
      metadataPath,
      clean: true,
    });

    const second = createGeneration(root, "second");
    publishBuildArtifacts({
      stagedClientDir: second.client,
      stagedAstroDir: second.astro,
      clientTargetDir: targetClient,
      astroTargetDir: targetAstro,
      metadataPath,
    });

    expect(fs.existsSync(path.join(targetClient, "assets/first.js"))).toBe(true);
    expect(fs.existsSync(path.join(targetAstro, "client/_astro/first.js"))).toBe(true);
    expect(fs.readFileSync(path.join(targetClient, "index.html"), "utf8")).toContain("second.js");

    const third = createGeneration(root, "third");
    publishBuildArtifacts({
      stagedClientDir: third.client,
      stagedAstroDir: third.astro,
      clientTargetDir: targetClient,
      astroTargetDir: targetAstro,
      metadataPath,
    });

    expect(fs.existsSync(path.join(targetClient, "assets/first.js"))).toBe(false);
    expect(fs.existsSync(path.join(targetAstro, "client/_astro/first.js"))).toBe(false);
    expect(fs.existsSync(path.join(targetClient, "assets/second.js"))).toBe(true);
    expect(fs.existsSync(path.join(targetClient, "assets/third.js"))).toBe(true);
  });
});

