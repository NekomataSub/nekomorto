import PublicLink from "@/components/PublicLink";
import ClientMountedSuspense from "@/components/ClientMountedSuspense";
import CompactPagination from "@/components/ui/compact-pagination";
import AsyncState from "@/components/ui/async-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicBootstrap } from "@/hooks/use-public-bootstrap";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { CalendarDays, User } from "lucide-react";
import { lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getPublicRoutePreloadHandlers,
  schedulePublicRouteIdlePreload,
} from "@/routes/public-preload";
import DiscordInviteCard from "./DiscordInviteCard";
import LatestEpisodeCard from "./LatestEpisodeCard";
import UploadPicture from "./UploadPicture";
import WorkStatusCard from "./WorkStatusCard";

const TopProjectsSection = lazy(() => import("./TopProjectsSection"));

const HOME_POSTS_PAGE_SIZE = 10;
const TOP_PROJECTS_THUMB_ASPECT_RATIO = "9 / 14";

const TopProjectsSkeleton = () => (
  <Card lift={false} className="bg-card rounded-lg border border-border/60 shadow-none">
    <CardHeader className="px-4 pb-3 pt-4">
      <div className="flex items-center justify-between gap-3">
        <CardTitle className="text-lg font-semibold text-foreground">Projetos Populares</CardTitle>
        <Skeleton className="h-8 w-[108px] rounded" />
      </div>
    </CardHeader>
    <CardContent className="space-y-3 px-4 pb-4 pt-0">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={`top-projects-skeleton-${index}`} className="rounded-2xl bg-background/40 p-4">
          <div className="flex gap-4">
            <Skeleton
              className="h-32 shrink-0 rounded-xl"
              style={{ aspectRatio: TOP_PROJECTS_THUMB_ASPECT_RATIO }}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
            </div>
          </div>
        </div>
      ))}
    </CardContent>
  </Card>
);

const ReleasesSection = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const postsSectionRef = useRef<HTMLDivElement | null>(null);
  const { data: bootstrapData, isLoading, isHydratingFullPayload } = usePublicBootstrap();
  const posts = bootstrapData?.posts || [];
  const mediaVariants = bootstrapData?.mediaVariants || {};
  const showPostsSkeleton = (isLoading && !bootstrapData) || isHydratingFullPayload;
  const totalPages = Math.ceil(posts.length / HOME_POSTS_PAGE_SIZE) || 1;
  const pagedReleases = useMemo(() => {
    const startIndex = (currentPage - 1) * HOME_POSTS_PAGE_SIZE;
    return posts.slice(startIndex, startIndex + HOME_POSTS_PAGE_SIZE);
  }, [currentPage, posts]);
  const showPagination = totalPages > 1;
  const changePage = useCallback(
    (nextPage: number) => {
      const safePage = Math.min(Math.max(nextPage, 1), totalPages);
      if (safePage === currentPage) {
        return;
      }
      setCurrentPage(safePage);
      window.requestAnimationFrame(() => {
        const section = postsSectionRef.current;
        if (!section) {
          return;
        }
        const fixedHeader = document.querySelector("header.fixed.top-0") as HTMLElement | null;
        const headerOffset = fixedHeader?.getBoundingClientRect().height ?? 0;
        const targetTop = section.getBoundingClientRect().top + window.scrollY - headerOffset - 12;
        window.scrollTo({ top: Math.max(targetTop, 0), behavior: "smooth" });
      });
    },
    [currentPage, totalPages],
  );

  useEffect(() => {
    return schedulePublicRouteIdlePreload(
      pagedReleases.slice(0, 4).map((release) => `/postagem/${release.slug}`),
      { delayMs: 500 },
    );
  }, [pagedReleases]);

  return (
    <section
      id="lancamentos"
      className="public-below-fold scroll-mt-32 bg-background px-6 py-16 reveal md:px-12"
      data-reveal
    >
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Em Destaque
        </h2>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div ref={postsSectionRef} className="lg:col-span-2">
            {showPostsSkeleton ? (
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`release-skeleton-${index}`}
                    className="rounded-2xl border border-border/60 bg-card/60 p-5"
                  >
                    <Skeleton className="aspect-3/2 w-full rounded-lg" />
                    <Skeleton className="mt-4 h-4 w-3/4" />
                    <Skeleton className="mt-2 h-3 w-full" />
                    <Skeleton className="mt-2 h-3 w-5/6" />
                  </div>
                ))}
              </div>
            ) : pagedReleases.length === 0 ? (
              <AsyncState
                kind="empty"
                title="Nenhuma postagem publicada ainda"
                description="Quando uma novidade for publicada, ela aparece aqui com capa, resumo e link de leitura."
                className="min-h-64 justify-center"
              />
            ) : (
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
                {pagedReleases.map((release, index) => {
                  const isOrphan =
                    pagedReleases.length % 2 === 1 && index === pagedReleases.length - 1;

                  return (
                    <div
                      key={release.id}
                      className={cn(
                        "reveal h-full",
                        isOrphan && "sm:col-span-2 sm:flex sm:justify-center",
                      )}
                      data-reveal
                      style={{ transitionDelay: `${index * 80}ms` }}
                    >
                      <PublicLink
                        href={`/postagem/${release.slug}`}
                        className={cn(
                          "home-post-card-link group/home-post-card relative flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card hover:border-primary/60 focus-visible:border-primary/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45",
                          isOrphan && "sm:w-[calc(50%-1rem)]",
                        )}
                        {...getPublicRoutePreloadHandlers(`/postagem/${release.slug}`)}
                      >
                        <div className="home-post-media-frame relative aspect-3/2 w-full overflow-hidden bg-secondary">
                          <UploadPicture
                            src={release.coverImageUrl}
                            alt={release.title}
                            preset="cardHome"
                            mediaVariants={mediaVariants}
                            sizes="(min-width: 1024px) 406px, (min-width: 640px) calc((100vw - 8rem) / 2), calc(100vw - 3rem)"
                            className="absolute inset-0 block h-full w-full"
                            imgClassName="home-post-media-transition absolute inset-0 block h-full w-full object-cover object-center"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex flex-1 flex-col">
                          <div className="space-y-2 p-5">
                            <h3 className="interactive-content-transition text-xl font-semibold leading-snug text-foreground group-hover/home-post-card:text-primary group-focus-within/home-post-card:text-primary md:text-2xl">
                              {release.title}
                            </h3>
                            <p className="line-clamp-3 text-sm text-muted-foreground">
                              {release.excerpt || "Sem prévia cadastrada."}
                            </p>
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-3 px-5 pb-5 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1.5">
                              <User className="h-4 w-4 text-primary/70" aria-hidden="true" />
                              {release.author || "Equipe"}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <CalendarDays
                                className="h-4 w-4 text-primary/70"
                                aria-hidden="true"
                              />
                              {formatDate(release.publishedAt)}
                            </span>
                          </div>
                        </div>
                      </PublicLink>
                    </div>
                  );
                })}
              </div>
            )}
            {showPagination ? (
              <CompactPagination
                currentPage={currentPage}
                totalPages={totalPages}
                className="justify-center pt-4"
                contentClassName="gap-1.5"
                linkClassName="home-post-pagination-link text-xs"
                previousClassName="home-post-pagination-link text-xs"
                nextClassName="home-post-pagination-link text-xs"
                onPageChange={changePage}
              />
            ) : null}
          </div>

          <div className="flex h-full flex-col gap-6">
            <LatestEpisodeCard />
            <WorkStatusCard />
            <ClientMountedSuspense fallback={<TopProjectsSkeleton />}>
              <TopProjectsSection />
            </ClientMountedSuspense>
            <DiscordInviteCard />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ReleasesSection;
