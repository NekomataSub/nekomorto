import {
  buildInstitutionalOgImageAlt,
  buildInstitutionalOgRevision,
  buildVersionedInstitutionalOgImagePath,
  resolveInstitutionalOgSupportText,
} from "../../shared/institutional-og-seo.js";
import {
  buildPostOgImageAlt,
  buildPostOgRevision,
  buildVersionedPostOgImagePath,
} from "../../shared/post-og-seo.js";
import { buildVersionedProjectOgImagePath } from "../../server/lib/project-og-delivery.js";
import { buildSchemaOrgPayload } from "../../server/lib/schema-org.js";
import { extractFirstImageFromPostContent } from "../../server/lib/post-cover.js";
import type {
  PublicBootstrapPayload,
  PublicBootstrapPostDetail,
  PublicBootstrapProject,
  PublicRouteProjectDetailPayload,
} from "../../src/types/public-bootstrap";
import type { SiteSettings } from "../../src/types/site-settings";

const DEFAULT_DESCRIPTION =
  "Nekomata e uma fansub e scan feita por fas, com traducoes cuidadosas, carinho pela comunidade e respeito aos autores.";

const stripHtml = (value: string) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const resolveOrigin = (origin: string, fallbackOrigin: string) =>
  String(origin || fallbackOrigin || "https://nekomata.moe").trim() || "https://nekomata.moe";

const resolveCanonicalUrl = (origin: string, pathname: string, search = "") =>
  new URL(`${pathname}${search}`, origin).toString();

const resolvePageImage = (origin: string, image: string) => {
  const value = String(image || "").trim();
  if (!value) {
    return "";
  }
  try {
    return new URL(value, origin).toString();
  } catch {
    return value;
  }
};

export const resolveHomePageMeta = ({
  fallbackOrigin,
  pathname,
  publicBootstrap,
  siteSettings,
}: {
  fallbackOrigin: string;
  pathname: string;
  publicBootstrap: PublicBootstrapPayload | null;
  siteSettings?: SiteSettings;
}) => {
  const origin = resolveOrigin("", fallbackOrigin);
  const canonicalUrl = resolveCanonicalUrl(origin, pathname);
  const shareImage =
    String(publicBootstrap?.pages?.home?.shareImage || "").trim() ||
    String(siteSettings?.site?.defaultShareImage || "").trim();
  return {
    canonicalUrl,
    description: String(siteSettings?.site?.description || "").trim() || DEFAULT_DESCRIPTION,
    image: resolvePageImage(origin, shareImage),
    imageAlt:
      String(publicBootstrap?.pages?.home?.shareImageAlt || "").trim() ||
      String(siteSettings?.site?.defaultShareImageAlt || "").trim(),
    structuredData: buildSchemaOrgPayload({
      canonicalUrl,
      origin,
      pages: publicBootstrap?.pages,
      pathname,
      settings: siteSettings,
    } as any),
    title: "Inicio",
  };
};

export const resolveProjectsPageMeta = ({
  fallbackOrigin,
  pathname,
  publicBootstrap,
  siteSettings,
}: {
  fallbackOrigin: string;
  pathname: string;
  publicBootstrap: PublicBootstrapPayload | null;
  siteSettings?: SiteSettings;
}) => {
  const origin = resolveOrigin("", fallbackOrigin);
  const canonicalUrl = resolveCanonicalUrl(origin, pathname);
  return {
    canonicalUrl,
    description:
      resolveInstitutionalOgSupportText({
        pageKey: "projects",
        pages: publicBootstrap?.pages,
        settings: siteSettings,
      }) || DEFAULT_DESCRIPTION,
    image: resolvePageImage(
      origin,
      buildVersionedInstitutionalOgImagePath({
        pageKey: "projects",
        revision: buildInstitutionalOgRevision({
          pageKey: "projects",
          pages: publicBootstrap?.pages,
          settings: siteSettings,
        } as never),
      }),
    ),
    imageAlt: buildInstitutionalOgImageAlt("projects"),
    structuredData: buildSchemaOrgPayload({
      canonicalUrl,
      origin,
      pages: publicBootstrap?.pages,
      pathname,
      settings: siteSettings,
    } as any),
    title: "Projetos",
  };
};

export const resolveProjectPageMeta = ({
  fallbackOrigin,
  pathname,
  publicBootstrap,
  routePayload,
  siteSettings,
}: {
  fallbackOrigin: string;
  pathname: string;
  publicBootstrap: PublicBootstrapPayload | null;
  routePayload: PublicRouteProjectDetailPayload | null;
  siteSettings?: SiteSettings;
}) => {
  const origin = resolveOrigin("", fallbackOrigin);
  const canonicalUrl = resolveCanonicalUrl(origin, pathname);
  const project = (routePayload?.project || null) as PublicBootstrapProject | null;
  const image = project?.id
    ? buildVersionedProjectOgImagePath({
        projectId: project.id,
        revision: routePayload?.revision || "",
      })
    : project?.banner ||
      project?.heroImageUrl ||
      project?.cover ||
      siteSettings?.site?.defaultShareImage ||
      "";
  return {
    canonicalUrl,
    description:
      stripHtml(project?.synopsis || project?.description || "") ||
      String(siteSettings?.site?.description || "").trim() ||
      DEFAULT_DESCRIPTION,
    image: resolvePageImage(origin, image),
    imageAlt:
      String(project?.bannerAlt || project?.heroImageAlt || project?.coverAlt || "").trim() ||
      `Card de compartilhamento do projeto ${String(project?.title || "Projeto").trim() || "Projeto"}`,
    structuredData: buildSchemaOrgPayload({
      canonicalUrl,
      origin,
      pages: publicBootstrap?.pages,
      pathname,
      project,
      settings: siteSettings,
    } as any),
    title: String(project?.title || "Projeto").trim() || "Projeto",
  };
};

export const resolvePostPageMeta = ({
  fallbackOrigin,
  pathname,
  publicBootstrap,
  siteSettings,
}: {
  fallbackOrigin: string;
  pathname: string;
  publicBootstrap: PublicBootstrapPayload | null;
  siteSettings?: SiteSettings;
}) => {
  const origin = resolveOrigin("", fallbackOrigin);
  const canonicalUrl = resolveCanonicalUrl(origin, pathname);
  const post = publicBootstrap?.currentPostDetail as PublicBootstrapPostDetail | null;
  const firstPostImage = extractFirstImageFromPostContent(post?.content, post?.contentFormat);
  const postRevision = buildPostOgRevision({
    coverImageUrl: post?.coverImageUrl,
    firstPostImageUrl: firstPostImage?.coverImageUrl,
    post,
    settings: siteSettings,
  } as any);
  const image = post?.slug
    ? buildVersionedPostOgImagePath({
        revision: postRevision,
        slug: post.slug,
      })
    : post?.coverImageUrl || siteSettings?.site?.defaultShareImage || "";
  return {
    canonicalUrl,
    description:
      stripHtml(post?.seoDescription || post?.excerpt || post?.content || "") ||
      String(siteSettings?.site?.description || "").trim() ||
      DEFAULT_DESCRIPTION,
    image: resolvePageImage(origin, image),
    imageAlt: buildPostOgImageAlt(post?.title),
    structuredData: buildSchemaOrgPayload({
      canonicalUrl,
      origin,
      pages: publicBootstrap?.pages,
      pathname,
      post,
      settings: siteSettings,
    } as any),
    title: String(post?.seoTitle || post?.title || "Postagem").trim() || "Postagem",
  };
};
