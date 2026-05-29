import { CalendarDays, Clock, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import CommentsSection from "@/components/CommentsSection";
import PublicLink from "@/components/PublicLink";
import PublicPostLegacyContent from "@/components/PublicPostLegacyContent";
import ProjectEmbedCard from "@/components/ProjectEmbedCard";
import PublicUserProfileCard from "@/components/PublicUserProfileCard";
import UploadPicture from "@/components/UploadPicture";
import LexicalViewer from "@/components/lexical/LexicalViewer";
import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDeferredVisibility } from "@/hooks/use-deferred-visibility";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useResolvedPublicBootstrap } from "@/hooks/public-bootstrap-provider";
import { usePublicCurrentUser } from "@/hooks/use-public-current-user";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { getApiBase } from "@/lib/api-base";
import { apiFetch, apiFetchBestEffort } from "@/lib/api-client";
import { normalizeAssetUrl } from "@/lib/asset-url";
import { formatDateTime } from "@/lib/date";
import { usePublicDocumentLocation } from "@/lib/public-document-navigation";
import { estimateReadTime } from "@/lib/post-content";
import { extractFirstImageFromPostContent } from "@/lib/post-cover";
import { peekPreloadedPublicPostDetail } from "@/lib/public-post-preload";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import type {
  PublicBootstrapPayload,
  PublicBootstrapPost,
  PublicBootstrapPostDetail,
} from "@/types/public-bootstrap";
import type { PublicTeamLinkType, PublicTeamMember } from "@/types/public-team";
import {
  buildPostOgImageAlt,
  buildPostOgRevision,
  buildVersionedPostOgImagePath,
} from "../../shared/post-og-seo.js";

const LexicalViewerFallback = () => (
  <div className="min-h-80 w-full rounded-xl border border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
    Carregando conteúdo...
  </div>
);

type PostRecord = {
  id: string;
  title: string;
  slug: string;
  coverImageUrl?: string | null;
  coverAlt?: string | null;
  seoImageUrl?: string | null;
  excerpt: string;
  content: string;
  contentFormat?: "lexical" | "html" | "markdown";
  author: string;
  publishedAt: string;
  views: number;
  commentsCount: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  projectId?: string | null;
};

const normalizeAuthorKey = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();
const normalizePostSlug = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const toBootstrapPostRecord = (post: PublicBootstrapPost | null): PostRecord | null => {
  if (!post) {
    return null;
  }
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    coverImageUrl: post.coverImageUrl || null,
    coverAlt: post.coverAlt || null,
    seoImageUrl: null,
    excerpt: post.excerpt,
    content: "",
    author: post.author,
    publishedAt: post.publishedAt,
    views: 0,
    commentsCount: 0,
    seoTitle: null,
    seoDescription: null,
    projectId: post.projectId || null,
  };
};

const resolveBootstrapPost = (
  bootstrapData: PublicBootstrapPayload | null,
  slug: string | undefined,
) => {
  const slugKey = normalizePostSlug(slug);
  if (!slugKey) {
    return null;
  }
  return (
    bootstrapData?.posts.find((candidate) => normalizePostSlug(candidate.slug) === slugKey) || null
  );
};

const toBootstrapPostDetailRecord = (post: PublicBootstrapPostDetail | null): PostRecord | null => {
  if (!post) {
    return null;
  }
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    coverImageUrl: post.coverImageUrl || null,
    coverAlt: post.coverAlt || null,
    seoImageUrl: null,
    excerpt: post.excerpt,
    content: post.content,
    contentFormat: post.contentFormat,
    author: post.author,
    publishedAt: post.publishedAt,
    views: post.views,
    commentsCount: post.commentsCount,
    seoTitle: post.seoTitle || null,
    seoDescription: post.seoDescription || null,
    projectId: post.projectId || null,
  };
};

const resolveBootstrapPostDetail = (
  bootstrapData: PublicBootstrapPayload | null,
  slug: string | undefined,
) => {
  const slugKey = normalizePostSlug(slug);
  if (!slugKey) {
    return null;
  }
  const currentPostDetail = bootstrapData?.currentPostDetail || null;
  if (normalizePostSlug(currentPostDetail?.slug) !== slugKey) {
    return null;
  }
  return currentPostDetail;
};

const resolveBootstrapAuthorCard = (
  bootstrapData: PublicBootstrapPayload | null,
  authorName: string | undefined,
): {
  member: PublicTeamMember;
  linkTypes: PublicTeamLinkType[];
  mediaVariants: UploadMediaVariantsMap;
} | null => {
  const authorKey = normalizeAuthorKey(authorName);
  if (!authorKey) {
    return null;
  }
  const matches = (bootstrapData?.teamMembers || []).filter(
    (candidate) => normalizeAuthorKey(candidate.name) === authorKey,
  );
  if (matches.length !== 1) {
    return null;
  }
  return {
    member: matches[0],
    linkTypes: bootstrapData?.teamLinkTypes || [],
    mediaVariants: bootstrapData?.mediaVariants || {},
  };
};

const mergeMediaVariants = (base: UploadMediaVariantsMap, nextValue: unknown) => ({
  ...base,
  ...(nextValue && typeof nextValue === "object" ? (nextValue as UploadMediaVariantsMap) : {}),
});

const resolvePostSlugFromPath = (pathname: string) => {
  const match = String(pathname || "").match(/^\/postagem\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

const Post = ({ initialPath = "/", slug: slugProp }: { initialPath?: string; slug?: string }) => {
  const location = usePublicDocumentLocation(initialPath);
  const params = useParams();
  const slug = slugProp || resolvePostSlugFromPath(location.pathname) || params.slug;
  const apiBase = getApiBase();
  const resolvedBootstrap = useResolvedPublicBootstrap();
  const [bootstrapData] = useState<PublicBootstrapPayload | null>(() => resolvedBootstrap);
  const { currentUser } = usePublicCurrentUser();
  const bootstrapPost = useMemo(
    () => resolveBootstrapPost(bootstrapData, slug),
    [bootstrapData, slug],
  );
  const bootstrapPostDetail = useMemo(
    () => resolveBootstrapPostDetail(bootstrapData, slug),
    [bootstrapData, slug],
  );
  const bootstrapPostRecord = useMemo(
    () => toBootstrapPostDetailRecord(bootstrapPostDetail) || toBootstrapPostRecord(bootstrapPost),
    [bootstrapPost, bootstrapPostDetail],
  );
  const preloadedPostRecord = useMemo(
    () => toBootstrapPostDetailRecord(peekPreloadedPublicPostDetail(slug)),
    [slug],
  );
  const [post, setPost] = useState<PostRecord | null>(bootstrapPostRecord || preloadedPostRecord);
  const [hasLoaded, setHasLoaded] = useState(Boolean(bootstrapPostRecord || preloadedPostRecord));
  const [loadError, setLoadError] = useState(false);
  const [mediaVariants, setMediaVariants] = useState<UploadMediaVariantsMap>(
    () => bootstrapData?.mediaVariants || {},
  );
  const trackedViewsRef = useRef<Set<string>>(new Set());
  const { settings } = useSiteSettings();
  const { isVisible: areDeferredSectionsVisible, sentinelRef: deferredSectionsSentinelRef } =
    useDeferredVisibility({
      initialVisible: location.hash.startsWith("#comment-"),
      rootMargin: "400px 0px",
    });

  useEffect(() => {
    setPost(bootstrapPostRecord || preloadedPostRecord);
    setHasLoaded(Boolean(bootstrapPostRecord || preloadedPostRecord));
    setLoadError(false);
    setMediaVariants(bootstrapData?.mediaVariants || {});
  }, [bootstrapData?.mediaVariants, bootstrapPostRecord, preloadedPostRecord]);

  const shouldHydratePostFromApi = Boolean(slug);
  const shouldRenderLexicalContent = !post?.contentFormat || post.contentFormat === "lexical";
  const shouldRenderLegacyContent =
    post?.contentFormat === "html" || post?.contentFormat === "markdown";

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!slug) {
        if (isActive) {
          setPost(null);
          setHasLoaded(true);
        }
        return;
      }
      if (!shouldHydratePostFromApi) {
        if (isActive) {
          setHasLoaded(Boolean(bootstrapPostRecord));
        }
        return;
      }

      try {
        const response = await apiFetch(apiBase, `/api/public/posts/${slug}`);
        if (!response.ok) {
          if (isActive) {
            if (!bootstrapPostRecord && !preloadedPostRecord) {
              setPost(null);
            }
            setLoadError(true);
          }
          return;
        }
        const data = await response.json();
        if (!isActive) {
          return;
        }
        setPost((current) => ({
          ...(current ||
            bootstrapPostRecord || {
              id: "",
              title: "",
              slug: String(slug || ""),
              excerpt: "",
              content: "",
              author: "",
              publishedAt: "",
              views: 0,
              commentsCount: 0,
            }),
          ...(data?.post || {}),
        }));
        setMediaVariants((current) =>
          mergeMediaVariants(bootstrapData?.mediaVariants || current, data?.mediaVariants),
        );
        setLoadError(false);
      } catch {
        if (isActive) {
          if (!bootstrapPostRecord && !preloadedPostRecord) {
            setPost(null);
          }
          setLoadError(true);
        }
      } finally {
        if (isActive) {
          setHasLoaded(true);
        }
      }
    };

    void load();
    return () => {
      isActive = false;
    };
  }, [
    apiBase,
    bootstrapData?.mediaVariants,
    bootstrapPostRecord,
    preloadedPostRecord,
    shouldHydratePostFromApi,
    slug,
  ]);

  useEffect(() => {
    if (!post?.slug) {
      return;
    }
    if (trackedViewsRef.current.has(post.slug)) {
      return;
    }
    trackedViewsRef.current.add(post.slug);
    void apiFetchBestEffort(apiBase, `/api/public/posts/${post.slug}/view`, {
      method: "POST",
    });
  }, [apiBase, post?.slug]);

  const authorCard = useMemo(
    () => resolveBootstrapAuthorCard(bootstrapData, post?.author),
    [bootstrapData, post?.author],
  );
  const postOgRevision = useMemo(() => {
    if (!post?.slug) {
      return "";
    }
    return buildPostOgRevision({
      post,
      settings,
      coverImageUrl: post.coverImageUrl,
      firstPostImageUrl: extractFirstImageFromPostContent(post.content, post.contentFormat)
        ?.coverImageUrl,
    });
  }, [post, settings]);

  const shareImage = useMemo(
    () =>
      post?.slug
        ? normalizeAssetUrl(
            buildVersionedPostOgImagePath({
              slug: post.slug,
              revision: postOgRevision,
            }),
          )
        : normalizeAssetUrl(settings.site.defaultShareImage),
    [post?.slug, postOgRevision, settings.site.defaultShareImage],
  );

  const postOgImageAlt = useMemo(
    () => (post?.title ? buildPostOgImageAlt(post.title) : ""),
    [post?.title],
  );

  usePageMeta({
    title: post?.seoTitle || post?.title || "Postagem",
    description: post?.seoDescription || post?.excerpt || "",
    image: shareImage,
    imageAlt: postOgImageAlt || settings.site.defaultShareImageAlt || undefined,
    mediaVariants,
    type: "article",
  });

  const formattedDate = useMemo(() => {
    if (!post?.publishedAt) {
      return "";
    }
    return formatDateTime(post.publishedAt);
  }, [post?.publishedAt]);

  const readTime = useMemo(() => {
    if (!post) {
      return "";
    }
    return estimateReadTime(post.content || post.excerpt || "");
  }, [post]);

  const canEditPost = useMemo(() => {
    const permissions = Array.isArray(currentUser?.permissions) ? currentUser.permissions : [];
    return permissions.includes("*") || permissions.includes("posts");
  }, [currentUser]);

  const heroCoverSrc = post?.coverImageUrl || post?.seoImageUrl || "/placeholder.svg";
  const heroCoverAlt = post?.coverAlt || `Capa do post: ${post?.title || ""}`;
  const shouldShowNotFound = !post && hasLoaded;
  const shouldShowLoadingState = !post && !hasLoaded;

  return (
    <div className="min-h-screen bg-background">
      <main className="pb-20">
        {shouldShowLoadingState ? (
          <div
            className={`${publicPageLayoutTokens.sectionBase} max-w-6xl rounded-2xl border border-border/60 bg-card/60 py-10 pt-20 text-sm text-muted-foreground`}
          >
            Carregando postagem...
          </div>
        ) : shouldShowNotFound ? (
          <div
            className={`${publicPageLayoutTokens.sectionBase} max-w-6xl rounded-2xl border border-dashed border-border/60 bg-card/60 py-10 pt-20 text-sm text-muted-foreground`}
          >
            Postagem não encontrada.
          </div>
        ) : post ? (
          <>
            <section data-testid="post-reader-hero" className="relative overflow-hidden">
              <UploadPicture
                src={heroCoverSrc}
                alt=""
                preset="hero"
                mediaVariants={mediaVariants}
                className="absolute inset-0 h-full w-full"
                imgClassName="h-full w-full object-cover object-top md:object-[center_18%]"
                loading="eager"
                decoding="async"
              />
              <div className="absolute inset-0 bg-background/28 backdrop-blur-[1.5px]" />
              <div className="absolute inset-0 bg-linear-to-r from-background/84 via-background/34 to-background/78" />
              <div className="absolute inset-0 bg-linear-to-t from-background via-background/70 to-transparent" />

              <div
                className={`${publicPageLayoutTokens.sectionBase} relative max-w-6xl pb-10 pt-24 md:pb-32 md:pt-20 lg:pb-36 lg:pt-24`}
              >
                <div data-testid="post-reader-hero-layout" className="grid items-start gap-8">
                  <div
                    data-testid="post-reader-hero-info"
                    className="flex flex-col items-center gap-4 text-center md:items-start md:text-left"
                  >
                    <h1 className="text-3xl font-bold text-foreground md:text-4xl lg:text-5xl">
                      {post.title}
                    </h1>
                    <div className="flex w-full flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground md:justify-start">
                      <span className="inline-flex items-center gap-2">
                        <User className="h-4 w-4 text-primary/70" aria-hidden="true" />
                        {post.author || "Autor"}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-primary/70" aria-hidden="true" />
                        {formattedDate}
                      </span>
                      {readTime ? (
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4 text-primary/70" aria-hidden="true" />
                          {readTime}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex w-full flex-wrap justify-center gap-2 md:justify-start">
                      <Badge variant="outline" className="text-xs uppercase tracking-wide">
                        Postagem
                      </Badge>
                      {canEditPost ? (
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-[10px] uppercase"
                        >
                          <PublicLink href={`/dashboard/posts?edit=${encodeURIComponent(post.id)}`}>
                            Editar postagem
                          </PublicLink>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section
              data-testid="post-reader-cover-bridge"
              className={`${publicPageLayoutTokens.sectionBase} relative z-20 -mt-24 hidden max-w-6xl md:block md:-mt-28`}
            >
              <div data-testid="post-reader-cover-shell" className="w-full">
                <div
                  data-testid="post-reader-cover-frame"
                  className="relative aspect-3/2 overflow-hidden rounded-2xl border border-border/80 bg-card/40"
                >
                  <UploadPicture
                    src={heroCoverSrc}
                    alt={heroCoverAlt}
                    preset="card"
                    mediaVariants={mediaVariants}
                    className="absolute inset-0 block h-full w-full"
                    imgClassName="absolute inset-0 block h-full w-full object-cover object-top"
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                </div>
              </div>
            </section>

            <section
              className={`${publicPageLayoutTokens.sectionBase} relative z-10 max-w-6xl pb-12 pt-4 md:pt-10`}
            >
              <section data-testid="post-reader-layout">
                <article data-testid="post-reader-main" className="min-w-0 space-y-8">
                  <div className="relative">
                    <Card className="border-border/60 bg-card/85 shadow-post-card">
                      <CardContent className="min-w-0 space-y-7 p-6 text-sm leading-relaxed text-muted-foreground md:p-8">
                        {post.content && shouldRenderLexicalContent ? (
                          <LexicalViewer
                            value={post.content}
                            ariaLabel={`Conteúdo da postagem ${post.title}`}
                            className="post-content reader-content min-w-0 w-full text-muted-foreground"
                            pollTarget={post.slug ? { type: "post", slug: post.slug } : undefined}
                          />
                        ) : post.content && shouldRenderLegacyContent ? (
                          <PublicPostLegacyContent
                            content={post.content}
                            format={post.contentFormat === "html" ? "html" : "markdown"}
                            ariaLabel={`Conteúdo da postagem ${post.title}`}
                            className="post-content reader-content min-w-0 w-full text-muted-foreground"
                            fallback={<LexicalViewerFallback />}
                          />
                        ) : post.content ? (
                          <LexicalViewerFallback />
                        ) : !hasLoaded ? (
                          <LexicalViewerFallback />
                        ) : loadError ? (
                          <div className="rounded-xl border border-dashed border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
                            O conteúdo completo da postagem não pôde ser carregado agora.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-border/60 bg-background/60 p-6 text-sm text-muted-foreground">
                            Conteúdo ainda não disponível.
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div
                      ref={deferredSectionsSentinelRef}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-px"
                    />
                  </div>

                  {areDeferredSectionsVisible && post.projectId ? (
                    <ProjectEmbedCard projectId={post.projectId} />
                  ) : null}

                  {areDeferredSectionsVisible && authorCard ? (
                    <section aria-labelledby="post-author-heading">
                      <h2 id="post-author-heading" className="sr-only">
                        Sobre o autor
                      </h2>
                      <PublicUserProfileCard
                        testId="post-author-card"
                        member={authorCard.member}
                        linkTypes={authorCard.linkTypes}
                        mediaVariants={authorCard.mediaVariants}
                      />
                    </section>
                  ) : null}

                  {areDeferredSectionsVisible ? (
                    <CommentsSection targetType="post" targetId={post.slug} />
                  ) : null}
                </article>
              </section>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default Post;
