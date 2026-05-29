import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectAuditNumericValues,
  PUBLIC_SURFACE_CATEGORY_IDS,
  PUBLIC_SURFACE_METRIC_AUDIT_IDS,
} from "./public-surface-performance-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const outputDir = path.join(workspaceRoot, ".lighthouse");
const lighthouseTmpDir = path.join(outputDir, "tmp");
const configPath = path.join(workspaceRoot, "scripts", "lighthouse-projects-mobile.config.cjs");

const defaultPostUrl =
  process.env.LIGHTHOUSE_READER_POST_URL || "http://127.0.0.1:8080/postagem/post-teste";
const defaultChapterUrl =
  process.env.LIGHTHOUSE_READER_CHAPTER_URL ||
  "http://127.0.0.1:8080/projeto/nekomata-eclipse/leitura/1";
const defaultRuns = 3;
const categoryIds = PUBLIC_SURFACE_CATEGORY_IDS;
const reportedMetricAuditIds = PUBLIC_SURFACE_METRIC_AUDIT_IDS;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const commandFor = (baseName) => (process.platform === "win32" ? `${baseName}.cmd` : baseName);

const parseArgs = (argv) => {
  const args = {
    postUrl: defaultPostUrl,
    chapterUrl: defaultChapterUrl,
    runs: defaultRuns,
    strict: false,
    startPreview: false,
  };

  argv.forEach((arg) => {
    if (arg === "--strict") {
      args.strict = true;
      return;
    }
    if (arg === "--start-preview") {
      args.startPreview = true;
      return;
    }
    if (arg.startsWith("--post-url=")) {
      args.postUrl = arg.slice("--post-url=".length).trim() || defaultPostUrl;
      return;
    }
    if (arg.startsWith("--chapter-url=")) {
      args.chapterUrl = arg.slice("--chapter-url=".length).trim() || defaultChapterUrl;
      return;
    }
    if (arg.startsWith("--runs=")) {
      const parsed = Number.parseInt(arg.slice("--runs=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.runs = parsed;
      }
    }
  });

  return args;
};

const runCommand = ({ cmd, commandArgs, cwd, stdio = "inherit", env = {} }) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, commandArgs, {
      cwd,
      stdio,
      env: {
        ...process.env,
        ...env,
      },
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(code);
        return;
      }
      reject(new Error(`${cmd} ${commandArgs.join(" ")} exited with code ${code}`));
    });
  });

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return NaN;
  }
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
};

const waitForUrl = async (url, options = {}) => {
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60_000;
  const previewProcess = options.previewProcess || null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (previewProcess && previewProcess.exitCode !== null) {
      throw new Error(
        `Preview server exited before ${url} was reachable (code=${previewProcess.exitCode})`,
      );
    }
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
      });
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Keep polling while preview server boots.
    }
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const resolveUrlEndpoint = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname || "127.0.0.1",
    port: Number.parseInt(parsed.port, 10) || (parsed.protocol === "https:" ? 443 : 80),
    origin: parsed.origin,
  };
};

const isPortAvailable = ({ host, port }) =>
  new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });

const startPreviewServer = ({ host, port }) => {
  const cmd = commandFor("npm");
  const args = ["run", "preview", "--", `--host=${host}`, `--port=${port}`, "--strictPort"];
  return spawn(cmd, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
};

const terminateProcess = async (child) => {
  if (!child || child.exitCode !== null) {
    return;
  }
  try {
    child.kill();
  } catch {
    // Ignore terminate errors.
  }
  await Promise.race([new Promise((resolve) => child.once("close", resolve)), sleep(5000)]);
  if (child.exitCode === null) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Ignore force kill errors.
    }
  }
};

const runLighthouse = async ({ label, url, runIndex }) => {
  const reportPath = path.join(outputDir, `reader-pages-${label}-run-${runIndex}.json`);
  fs.rmSync(reportPath, { force: true });
  const chromeFlags = "--headless=new --no-sandbox --disable-dev-shm-usage";
  const lighthouseTempEnv = {
    TMPDIR: lighthouseTmpDir,
    TMP: lighthouseTmpDir,
    TEMP: lighthouseTmpDir,
  };
  let commandError = null;
  try {
    await runCommand({
      cmd: commandFor("npx"),
      commandArgs: [
        "lighthouse",
        url,
        `--config-path=${configPath}`,
        "--quiet",
        "--output=json",
        `--output-path=${reportPath}`,
        `--chrome-flags=${chromeFlags}`,
      ],
      cwd: workspaceRoot,
      env: lighthouseTempEnv,
    });
  } catch (error) {
    commandError = error;
  }
  if (!fs.existsSync(reportPath)) {
    throw commandError || new Error(`Lighthouse report missing: ${reportPath}`);
  }
  const reportRaw = fs.readFileSync(reportPath, "utf8");
  if (commandError) {
    console.warn(
      `[lighthouse-reader-pages:${label}] lighthouse exited with non-zero status but produced ${path.basename(
        reportPath,
      )}; continuing with generated report (${commandError.message})`,
    );
  }
  return JSON.parse(reportRaw);
};

const toCategoryScores = (report) =>
  categoryIds.reduce((result, categoryId) => {
    const score = Number(report?.categories?.[categoryId]?.score);
    result[categoryId] = Number.isFinite(score) ? score : NaN;
    return result;
  }, {});

const toMetricValues = (report) => collectAuditNumericValues(report, reportedMetricAuditIds);

const summarizeReports = (reports) => {
  const categoriesByRun = reports.map((report) => toCategoryScores(report));
  const metricsByRun = reports.map((report) => toMetricValues(report));
  const medianCategories = categoryIds.reduce((result, categoryId) => {
    result[categoryId] = median(
      categoriesByRun.map((run) => run[categoryId]).filter((value) => Number.isFinite(value)),
    );
    return result;
  }, {});

  const medianMetrics = reportedMetricAuditIds.reduce((result, auditId) => {
    result[auditId] = median(
      metricsByRun.map((run) => run[auditId]).filter((value) => Number.isFinite(value)),
    );
    return result;
  }, {});

  return {
    categoriesByRun,
    metricsByRun,
    medianCategories,
    medianMetrics,
  };
};

const assertStrictThresholds = (summaryByRoute) => {
  const failures = Object.entries(summaryByRoute).flatMap(([label, summary]) =>
    categoryIds
      .filter((categoryId) => summary.medianCategories[categoryId] < 1)
      .map(
        (categoryId) =>
          `${label}:${categoryId}=${Math.round(summary.medianCategories[categoryId] * 100)}`,
      ),
  );
  if (failures.length > 0) {
    throw new Error(`Lighthouse categories below 100: ${failures.join(", ")}`);
  }
};

const writeSummary = ({ args, summaryByRoute }) => {
  const payload = {
    generatedAt: new Date().toISOString(),
    runs: args.runs,
    strict: args.strict,
    routes: {
      post: {
        url: args.postUrl,
        ...summaryByRoute.post,
      },
      chapter: {
        url: args.chapterUrl,
        ...summaryByRoute.chapter,
      },
    },
    thresholds: {
      categories: categoryIds.reduce((result, categoryId) => {
        result[categoryId] = 1;
        return result;
      }, {}),
      reportedMetrics: reportedMetricAuditIds,
    },
  };
  const summaryPath = path.join(outputDir, "reader-pages-summary.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(payload, null, 2));
  return summaryPath;
};

const logSummary = (label, summary) => {
  console.log(
    `[lighthouse-reader-pages:${label}] median categories: ${categoryIds
      .map(
        (categoryId) => `${categoryId}=${Math.round(summary.medianCategories[categoryId] * 100)}`,
      )
      .join(", ")}`,
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  let previewProcess = null;

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(lighthouseTmpDir, { recursive: true });

    if (args.startPreview) {
      const postEndpoint = resolveUrlEndpoint(args.postUrl);
      const chapterEndpoint = resolveUrlEndpoint(args.chapterUrl);
      if (postEndpoint.origin !== chapterEndpoint.origin) {
        throw new Error(
          "Cannot start a single preview server for different origins. Pass matching URLs or disable --start-preview.",
        );
      }
      const portAvailable = await isPortAvailable(postEndpoint);
      if (!portAvailable) {
        throw new Error(
          `Cannot start preview server on ${postEndpoint.host}:${postEndpoint.port} because the port is already in use`,
        );
      }
      previewProcess = startPreviewServer(postEndpoint);
      await waitForUrl(args.postUrl, { previewProcess });
      await waitForUrl(args.chapterUrl, { previewProcess });
    } else {
      await waitForUrl(args.postUrl);
      await waitForUrl(args.chapterUrl);
    }

    const routes = [
      { label: "post", url: args.postUrl },
      { label: "chapter", url: args.chapterUrl },
    ];
    const summaryByRoute = {};

    for (const route of routes) {
      const reports = [];
      for (let index = 1; index <= args.runs; index += 1) {
        console.log(
          `[lighthouse-reader-pages:${route.label}] running sample ${index}/${args.runs}`,
        );
        const report = await runLighthouse({
          label: route.label,
          url: route.url,
          runIndex: index,
        });
        reports.push(report);
      }
      summaryByRoute[route.label] = summarizeReports(reports);
      logSummary(route.label, summaryByRoute[route.label]);
    }

    const summaryPath = writeSummary({ args, summaryByRoute });
    console.log(`[lighthouse-reader-pages] summary written to ${summaryPath}`);

    if (args.strict) {
      assertStrictThresholds(summaryByRoute);
      console.log("[lighthouse-reader-pages] strict gate passed");
    }
  } finally {
    if (previewProcess) {
      await terminateProcess(previewProcess);
    }
  }
};

main().catch((error) => {
  console.error("[lighthouse-reader-pages] failed:", error?.message || error);
  process.exitCode = 1;
});
