import { createSlug } from "../../src/lib/post-content";
import type {
  PublicBootstrapPayload,
  PublicBootstrapProject,
} from "../../src/types/public-bootstrap";
import type { SiteSettings } from "../../src/types/site-settings";
import {
  buildProjectReadingOgImagePath,
  buildProjectReadingOgRevision,
  resolveProjectReadingOgSnapshot,
} from "../../shared/project-reading-og-seo.js";

type ProjectReadingOgSnapshot = {
  chapterNumberResolved?: number | null;
  imageAlt?: string;
  seoDescription?: string;
  seoTitle?: string;
  volumeResolved?: number | null;
};

type ProjectReadingOgArgs = {
  chapterNumber: number;
  genreTranslations?: PublicBootstrapPayload["tagTranslations"]["genres"];
  project: PublicBootstrapProject;
  settings?: SiteSettings | null;
  tagTranslations?: PublicBootstrapPayload["tagTranslations"]["tags"];
  volume?: number;
};

const resolveProjectReadingOgSnapshotTyped = resolveProjectReadingOgSnapshot as unknown as (
  args: ProjectReadingOgArgs,
) => ProjectReadingOgSnapshot | null;

const buildProjectReadingOgRevisionTyped = buildProjectReadingOgRevision as unknown as (
  args: ProjectReadingOgArgs,
) => string;

const normalizeProjectRouteKey = (value: unknown) =>
  String(createSlug(String(value || "").trim()) || "")
    .trim()
    .toLowerCase();

const resolveBootstrapProject = ({
  projectSlug,
  publicBootstrap,
}: {
  projectSlug: string;
  publicBootstrap: PublicBootstrapPayload | null;
}): PublicBootstrapProject | null => {
  const routeKey = normalizeProjectRouteKey(projectSlug);
  if (!routeKey) {
    return null;
  }

  return (
    publicBootstrap?.projects.find((candidate) => {
      const candidateId = String(candidate.id || "").trim();
      const candidateTitle = String(candidate.title || "").trim();
      return (
        normalizeProjectRouteKey(candidateId) === routeKey ||
        normalizeProjectRouteKey(candidateTitle) === routeKey
      );
    }) || null
  );
};

export const resolveProjectReadingPageMeta = ({
  fallbackOrigin,
  pathname,
  projectSlug,
  chapterNumber,
  publicBootstrap,
  siteSettings,
  volume,
}: {
  fallbackOrigin: string;
  pathname: string;
  projectSlug: string;
  chapterNumber: number;
  publicBootstrap: PublicBootstrapPayload | null;
  siteSettings?: SiteSettings | null;
  volume?: number;
}) => {
  const project = resolveBootstrapProject({
    projectSlug,
    publicBootstrap,
  });
  const origin = String(fallbackOrigin || "").trim() || "https://nekomata.moe";
  const canonicalBase = new URL(pathname, origin).toString();

  if (!project || !Number.isFinite(chapterNumber)) {
    return {
      canonicalUrl: volume === undefined ? canonicalBase : `${canonicalBase}?volume=${volume}`,
      description: String(siteSettings?.site?.description || "").trim(),
      image: String(siteSettings?.site?.defaultShareImage || "").trim(),
      imageAlt: String(siteSettings?.site?.defaultShareImageAlt || "").trim(),
      robots: "noindex, nofollow",
      title: "Leitura",
    };
  }

  const snapshot = resolveProjectReadingOgSnapshotTyped({
    chapterNumber,
    genreTranslations: publicBootstrap?.tagTranslations?.genres,
    project,
    settings: siteSettings,
    tagTranslations: publicBootstrap?.tagTranslations?.tags,
    volume,
  });
  const revision = buildProjectReadingOgRevisionTyped({
    chapterNumber,
    genreTranslations: publicBootstrap?.tagTranslations?.genres,
    project,
    settings: siteSettings,
    tagTranslations: publicBootstrap?.tagTranslations?.tags,
    volume,
  });
  const resolvedChapterNumber = Number(snapshot?.chapterNumberResolved ?? chapterNumber);
  const resolvedVolume = Number(snapshot?.volumeResolved);
  const hasResolvedVolume = Number.isFinite(resolvedVolume);
  const canonicalUrl = new URL(
    `/projeto/${encodeURIComponent(String(project.id || "").trim())}/leitura/${encodeURIComponent(String(resolvedChapterNumber))}`,
    origin,
  );
  if (hasResolvedVolume) {
    canonicalUrl.searchParams.set("volume", String(resolvedVolume));
  }

  return {
    canonicalUrl: canonicalUrl.toString(),
    description:
      String(snapshot?.seoDescription || "").trim() ||
      String(siteSettings?.site?.description || "").trim(),
    image:
      snapshot && revision
        ? buildProjectReadingOgImagePath({
            chapterNumber: resolvedChapterNumber,
            projectId: project.id,
            revision,
            volume: hasResolvedVolume ? resolvedVolume : undefined,
          })
        : String(siteSettings?.site?.defaultShareImage || "").trim(),
    imageAlt:
      String(snapshot?.imageAlt || "").trim() ||
      `Card de compartilhamento da leitura de ${String(project.title || "Projeto").trim() || "Projeto"}`,
    robots: "noindex, nofollow",
    title: String(snapshot?.seoTitle || "").trim() || "Leitura",
  };
};
