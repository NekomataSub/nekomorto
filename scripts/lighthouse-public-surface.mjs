import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

import {
  aggregatePublicSurfaceSummaries,
  LIGHTHOUSE_DIR,
  PUBLIC_SURFACE_ROUTE_LABELS,
  PUBLIC_SURFACE_SUMMARY_PATH,
  readJsonFile,
  WORKSPACE_ROOT,
  writeJsonFile,
} from "./public-surface-performance-lib.mjs";

const defaultRuns = 3;
const defaultHomeUrl = process.env.LIGHTHOUSE_HOME_URL || "http://127.0.0.1:4173/";
const defaultProjectsUrl = process.env.LIGHTHOUSE_PROJECTS_URL || "http://127.0.0.1:4173/projetos";
const defaultProjectDetailUrl =
  process.env.LIGHTHOUSE_PROJECT_DETAIL_URL || "http://127.0.0.1:4173/projeto/aurora-no-horizonte";
const defaultTeamUrl = process.env.LIGHTHOUSE_TEAM_URL || "http://127.0.0.1:4173/equipe";
const defaultDonationsUrl = process.env.LIGHTHOUSE_DONATIONS_URL || "http://127.0.0.1:4173/doacoes";
const defaultPostUrl =
  process.env.LIGHTHOUSE_READER_POST_URL || "http://127.0.0.1:4173/postagem/post-teste";
const defaultChapterUrl =
  process.env.LIGHTHOUSE_READER_CHAPTER_URL ||
  "http://127.0.0.1:4173/projeto/nekomata-eclipse/leitura/1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = (argv) => {
  const args = {
    runs: defaultRuns,
    startPreview: false,
    homeUrl: defaultHomeUrl,
    projectsMobileUrl: defaultProjectsUrl,
    projectDetailUrl: defaultProjectDetailUrl,
    teamUrl: defaultTeamUrl,
    donationsUrl: defaultDonationsUrl,
    projectsDesktopUrl: defaultProjectsUrl,
    postUrl: defaultPostUrl,
    chapterUrl: defaultChapterUrl,
  };

  for (const arg of argv) {
    if (arg === "--start-preview") {
      args.startPreview = true;
      continue;
    }
    if (arg.startsWith("--runs=")) {
      const parsed = Number.parseInt(arg.slice("--runs=".length), 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.runs = parsed;
      }
      continue;
    }
    if (arg.startsWith("--home-url=")) {
      args.homeUrl = arg.slice("--home-url=".length).trim() || defaultHomeUrl;
      continue;
    }
    if (arg.startsWith("--projects-mobile-url=")) {
      args.projectsMobileUrl =
        arg.slice("--projects-mobile-url=".length).trim() || defaultProjectsUrl;
      continue;
    }
    if (arg.startsWith("--project-detail-url=")) {
      args.projectDetailUrl =
        arg.slice("--project-detail-url=".length).trim() || defaultProjectDetailUrl;
      continue;
    }
    if (arg.startsWith("--team-url=")) {
      args.teamUrl = arg.slice("--team-url=".length).trim() || defaultTeamUrl;
      continue;
    }
    if (arg.startsWith("--donations-url=")) {
      args.donationsUrl = arg.slice("--donations-url=".length).trim() || defaultDonationsUrl;
      continue;
    }
    if (arg.startsWith("--projects-desktop-url=")) {
      args.projectsDesktopUrl =
        arg.slice("--projects-desktop-url=".length).trim() || defaultProjectsUrl;
      continue;
    }
    if (arg.startsWith("--post-url=")) {
      args.postUrl = arg.slice("--post-url=".length).trim() || defaultPostUrl;
      continue;
    }
    if (arg.startsWith("--chapter-url=")) {
      args.chapterUrl = arg.slice("--chapter-url=".length).trim() || defaultChapterUrl;
    }
  }

  return args;
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
    origin: parsed.origin,
    host: parsed.hostname || "127.0.0.1",
    port: Number.parseInt(parsed.port, 10) || (parsed.protocol === "https:" ? 443 : 80),
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

const startPreviewServer = ({ host, port }) =>
  spawn("npm", ["run", "preview", "--", `--host=${host}`, `--port=${port}`, "--strictPort"], {
    cwd: WORKSPACE_ROOT,
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });

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

const runScript = async (scriptName, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(WORKSPACE_ROOT, "scripts", scriptName), ...args],
      {
        cwd: WORKSPACE_ROOT,
        stdio: "inherit",
        env: process.env,
        shell: false,
      },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${scriptName} exited with code ${code}`));
    });
  });

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const endpoints = [
    resolveUrlEndpoint(args.homeUrl),
    resolveUrlEndpoint(args.projectsMobileUrl),
    resolveUrlEndpoint(args.projectDetailUrl),
    resolveUrlEndpoint(args.teamUrl),
    resolveUrlEndpoint(args.donationsUrl),
    resolveUrlEndpoint(args.projectsDesktopUrl),
    resolveUrlEndpoint(args.postUrl),
    resolveUrlEndpoint(args.chapterUrl),
  ];
  let previewProcess = null;

  try {
    fs.mkdirSync(LIGHTHOUSE_DIR, { recursive: true });

    if (args.startPreview) {
      const [firstEndpoint, ...remainingEndpoints] = endpoints;
      const sharesSingleOrigin = remainingEndpoints.every(
        (endpoint) => endpoint.origin === firstEndpoint.origin,
      );
      if (!sharesSingleOrigin) {
        throw new Error(
          "All public-surface routes must share the same origin when using --start-preview.",
        );
      }
      const portAvailable = await isPortAvailable(firstEndpoint);
      if (!portAvailable) {
        throw new Error(
          `Cannot start preview server on ${firstEndpoint.host}:${firstEndpoint.port} because the port is already in use`,
        );
      }
      previewProcess = startPreviewServer(firstEndpoint);
      await waitForUrl(args.homeUrl, { previewProcess });
      await waitForUrl(args.projectsMobileUrl, { previewProcess });
      await waitForUrl(args.projectDetailUrl, { previewProcess });
      await waitForUrl(args.teamUrl, { previewProcess });
      await waitForUrl(args.donationsUrl, { previewProcess });
      await waitForUrl(args.postUrl, { previewProcess });
      await waitForUrl(args.chapterUrl, { previewProcess });
    }

    console.log("[lighthouse-public-surface] running home mobile");
    await runScript("lighthouse-home-mobile.mjs", [`--runs=${args.runs}`, `--url=${args.homeUrl}`]);

    console.log("[lighthouse-public-surface] running projects mobile");
    await runScript("lighthouse-projects.mjs", [
      "--profile=mobile",
      `--runs=${args.runs}`,
      `--url=${args.projectsMobileUrl}`,
    ]);

    console.log("[lighthouse-public-surface] running project detail mobile");
    await runScript("lighthouse-projects.mjs", [
      "--profile=mobile",
      "--artifact-name=project-detail-mobile",
      `--runs=${args.runs}`,
      `--url=${args.projectDetailUrl}`,
    ]);

    console.log("[lighthouse-public-surface] running team mobile");
    await runScript("lighthouse-projects.mjs", [
      "--profile=mobile",
      "--artifact-name=team-mobile",
      `--runs=${args.runs}`,
      `--url=${args.teamUrl}`,
    ]);

    console.log("[lighthouse-public-surface] running donations mobile");
    await runScript("lighthouse-projects.mjs", [
      "--profile=mobile",
      "--artifact-name=donations-mobile",
      `--runs=${args.runs}`,
      `--url=${args.donationsUrl}`,
    ]);

    console.log("[lighthouse-public-surface] running projects desktop");
    await runScript("lighthouse-projects.mjs", [
      "--profile=desktop",
      `--runs=${args.runs}`,
      `--url=${args.projectsDesktopUrl}`,
    ]);

    console.log("[lighthouse-public-surface] running reader pages");
    await runScript("lighthouse-reader-pages.mjs", [
      `--runs=${args.runs}`,
      `--post-url=${args.postUrl}`,
      `--chapter-url=${args.chapterUrl}`,
    ]);

    const homeSummary = readJsonFile(path.join(LIGHTHOUSE_DIR, "home-mobile-summary.json"));
    const projectsMobileSummary = readJsonFile(
      path.join(LIGHTHOUSE_DIR, "projects-mobile-summary.json"),
    );
    const projectDetailSummary = readJsonFile(
      path.join(LIGHTHOUSE_DIR, "project-detail-mobile-summary.json"),
    );
    const teamSummary = readJsonFile(path.join(LIGHTHOUSE_DIR, "team-mobile-summary.json"));
    const donationsSummary = readJsonFile(
      path.join(LIGHTHOUSE_DIR, "donations-mobile-summary.json"),
    );
    const projectsDesktopSummary = readJsonFile(
      path.join(LIGHTHOUSE_DIR, "projects-desktop-summary.json"),
    );
    const readerSummary = readJsonFile(path.join(LIGHTHOUSE_DIR, "reader-pages-summary.json"));

    const publicSurfaceSummary = aggregatePublicSurfaceSummaries({
      generatedAt: new Date().toISOString(),
      runs: args.runs,
      routeEntries: [
        {
          key: "home-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["home-mobile"],
          url: args.homeUrl,
          sourceSummaryPath: ".lighthouse/home-mobile-summary.json",
          medianCategories: homeSummary.medianCategories,
          medianMetrics: homeSummary.medianMetrics,
          categoriesByRun: homeSummary.categoriesByRun,
          metricsByRun: homeSummary.metricsByRun,
        },
        {
          key: "projects-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["projects-mobile"],
          url: args.projectsMobileUrl,
          sourceSummaryPath: ".lighthouse/projects-mobile-summary.json",
          medianCategories: projectsMobileSummary.medianCategories,
          medianMetrics: projectsMobileSummary.medianMetrics,
          categoriesByRun: projectsMobileSummary.categoriesByRun,
          metricsByRun: projectsMobileSummary.metricsByRun,
        },
        {
          key: "project-detail-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["project-detail-mobile"],
          url: args.projectDetailUrl,
          sourceSummaryPath: ".lighthouse/project-detail-mobile-summary.json",
          medianCategories: projectDetailSummary.medianCategories,
          medianMetrics: projectDetailSummary.medianMetrics,
          categoriesByRun: projectDetailSummary.categoriesByRun,
          metricsByRun: projectDetailSummary.metricsByRun,
        },
        {
          key: "team-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["team-mobile"],
          url: args.teamUrl,
          sourceSummaryPath: ".lighthouse/team-mobile-summary.json",
          medianCategories: teamSummary.medianCategories,
          medianMetrics: teamSummary.medianMetrics,
          categoriesByRun: teamSummary.categoriesByRun,
          metricsByRun: teamSummary.metricsByRun,
        },
        {
          key: "donations-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["donations-mobile"],
          url: args.donationsUrl,
          sourceSummaryPath: ".lighthouse/donations-mobile-summary.json",
          medianCategories: donationsSummary.medianCategories,
          medianMetrics: donationsSummary.medianMetrics,
          categoriesByRun: donationsSummary.categoriesByRun,
          metricsByRun: donationsSummary.metricsByRun,
        },
        {
          key: "projects-desktop",
          label: PUBLIC_SURFACE_ROUTE_LABELS["projects-desktop"],
          url: args.projectsDesktopUrl,
          sourceSummaryPath: ".lighthouse/projects-desktop-summary.json",
          medianCategories: projectsDesktopSummary.medianCategories,
          medianMetrics: projectsDesktopSummary.medianMetrics,
          categoriesByRun: projectsDesktopSummary.categoriesByRun,
          metricsByRun: projectsDesktopSummary.metricsByRun,
        },
        {
          key: "reader-post-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["reader-post-mobile"],
          url: args.postUrl,
          sourceSummaryPath: ".lighthouse/reader-pages-summary.json",
          sourceRouteKey: "post",
          medianCategories: readerSummary?.routes?.post?.medianCategories,
          medianMetrics: readerSummary?.routes?.post?.medianMetrics,
          categoriesByRun: readerSummary?.routes?.post?.categoriesByRun,
          metricsByRun: readerSummary?.routes?.post?.metricsByRun,
        },
        {
          key: "reader-chapter-mobile",
          label: PUBLIC_SURFACE_ROUTE_LABELS["reader-chapter-mobile"],
          url: args.chapterUrl,
          sourceSummaryPath: ".lighthouse/reader-pages-summary.json",
          sourceRouteKey: "chapter",
          medianCategories: readerSummary?.routes?.chapter?.medianCategories,
          medianMetrics: readerSummary?.routes?.chapter?.medianMetrics,
          categoriesByRun: readerSummary?.routes?.chapter?.categoriesByRun,
          metricsByRun: readerSummary?.routes?.chapter?.metricsByRun,
        },
      ],
    });

    writeJsonFile(PUBLIC_SURFACE_SUMMARY_PATH, publicSurfaceSummary);
    console.log(
      `[lighthouse-public-surface] summary written to ${path.relative(
        WORKSPACE_ROOT,
        PUBLIC_SURFACE_SUMMARY_PATH,
      )}`,
    );
  } finally {
    if (previewProcess) {
      await terminateProcess(previewProcess);
    }
  }
};

main().catch((error) => {
  console.error("[lighthouse-public-surface] failed:", error?.message || error);
  process.exitCode = 1;
});
