import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const workspaceRoot = path.resolve(path.dirname(__filename), "..");
const stageRoot = path.join(workspaceRoot, ".build-stage");
const lockDir = path.join(workspaceRoot, ".build-production.lock");
const generationsPath = path.join(workspaceRoot, ".build-generations.json");

export const listRelativeFiles = (rootDir) => {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const result = [];
  const visit = (relativeDir) => {
    const absoluteDir = path.join(rootDir, relativeDir);
    fs.readdirSync(absoluteDir, { withFileTypes: true }).forEach((entry) => {
      const relativePath = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        visit(relativePath);
      } else if (entry.isFile()) {
        result.push(relativePath);
      }
    });
  };
  visit("");
  return result.sort();
};

const copyFile = (sourceRoot, targetRoot, relativePath) => {
  const source = path.join(sourceRoot, relativePath);
  const target = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
};

const removeEmptyDirectories = (rootDir) => {
  if (!fs.existsSync(rootDir)) {
    return;
  }
  const visit = (directory) => {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      if (entry.isDirectory()) {
        visit(path.join(directory, entry.name));
      }
    });
    if (directory !== rootDir && fs.readdirSync(directory).length === 0) {
      fs.rmdirSync(directory);
    }
  };
  visit(rootDir);
};

const publishDirectory = ({ sourceRoot, targetRoot, previousFiles, deferredFiles }) => {
  const nextFiles = listRelativeFiles(sourceRoot);
  const deferred = new Set(deferredFiles);
  const regularFiles = nextFiles.filter((file) => !deferred.has(file));
  const finalFiles = nextFiles.filter((file) => deferred.has(file));

  fs.mkdirSync(targetRoot, { recursive: true });
  regularFiles.forEach((file) => copyFile(sourceRoot, targetRoot, file));
  finalFiles.forEach((file) => copyFile(sourceRoot, targetRoot, file));

  const keepFiles = new Set([...previousFiles, ...nextFiles]);
  listRelativeFiles(targetRoot).forEach((file) => {
    if (!keepFiles.has(file)) {
      fs.rmSync(path.join(targetRoot, file), { force: true });
    }
  });
  removeEmptyDirectories(targetRoot);
  return nextFiles;
};

const readGenerations = (metadataPath) => {
  try {
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch {
    return null;
  }
};

const writeGenerations = (metadataPath, payload) => {
  const temporaryPath = `${metadataPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.renameSync(temporaryPath, metadataPath);
};

export const publishBuildArtifacts = ({
  stagedClientDir,
  stagedAstroDir,
  clientTargetDir,
  astroTargetDir,
  metadataPath = generationsPath,
  clean = false,
}) => {
  const generations = clean ? null : readGenerations(metadataPath);
  const previousClientFiles = clean
    ? []
    : Array.isArray(generations?.current?.client)
      ? generations.current.client
      : listRelativeFiles(clientTargetDir);
  const previousAstroFiles = clean
    ? []
    : Array.isArray(generations?.current?.astro)
      ? generations.current.astro
      : listRelativeFiles(astroTargetDir);

  if (clean) {
    fs.rmSync(clientTargetDir, { recursive: true, force: true });
    fs.rmSync(astroTargetDir, { recursive: true, force: true });
  }

  const nextClientFiles = publishDirectory({
    sourceRoot: stagedClientDir,
    targetRoot: clientTargetDir,
    previousFiles: previousClientFiles,
    deferredFiles: ["index.html", path.join(".vite", "manifest.json")],
  });
  const nextAstroFiles = publishDirectory({
    sourceRoot: stagedAstroDir,
    targetRoot: astroTargetDir,
    previousFiles: previousAstroFiles,
    deferredFiles: [path.join("server", "entry.mjs")],
  });

  writeGenerations(metadataPath, {
    generatedAt: new Date().toISOString(),
    current: {
      client: nextClientFiles,
      astro: nextAstroFiles,
    },
    previous: {
      client: previousClientFiles,
      astro: previousAstroFiles,
    },
  });
};

const runCommand = (command, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed (${signal || code})`));
    });
  });

const main = async () => {
  const audit = process.argv.includes("--audit");
  const clean = process.argv.includes("--clean") || process.env.BUILD_PUBLISH_CLEAN === "true";
  fs.mkdirSync(stageRoot, { recursive: true });
  try {
    fs.mkdirSync(lockDir);
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`another production build holds ${lockDir}`);
    }
    throw error;
  }

  const stageDir = fs.mkdtempSync(path.join(stageRoot, "build-"));
  const stagedClientDir = path.join(stageDir, "dist");
  const stagedAstroDir = path.join(stageDir, "dist-astro");
  const env = {
    ...process.env,
    ASTRO_OUT_DIR: stagedAstroDir,
    ASTRO_DIST_DIR: stagedAstroDir,
    CLIENT_DIST_DIR: stagedClientDir,
    VITE_OUT_DIR: stagedClientDir,
    VITE_BUILD_SOURCEMAP: audit ? "true" : process.env.VITE_BUILD_SOURCEMAP || "false",
  };

  try {
    await runCommand(
      process.execPath,
      [path.join(workspaceRoot, "node_modules/astro/bin/astro.mjs"), "build"],
      env,
    );
    await runCommand(process.execPath, [path.join(workspaceRoot, "node_modules/vite/bin/vite.js"), "build"], env);
    await runCommand(process.execPath, [path.join(workspaceRoot, "scripts/check-build-chunks.mjs")], env);
    await runCommand(process.execPath, [path.join(workspaceRoot, "scripts/check-home-build.mjs")], env);
    publishBuildArtifacts({
      stagedClientDir,
      stagedAstroDir,
      clientTargetDir: path.join(workspaceRoot, "dist"),
      astroTargetDir: path.join(workspaceRoot, "dist-astro"),
      clean,
    });
    console.log(`[build-production] published (${audit ? "audit" : "standard"}, clean=${clean})`);
  } finally {
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[build-production] ${String(error?.stack || error)}`);
    process.exitCode = 1;
  });
}
