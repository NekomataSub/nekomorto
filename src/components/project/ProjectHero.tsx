import type { ReactNode } from "react";

import PublicLink from "@/components/PublicLink";
import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import { buttonVariants } from "@/components/ui/button-variants";
import { PillButton } from "@/components/ui/pill-button";
import UploadPicture from "@/components/UploadPicture";
import { PROJECT_COVER_ASPECT_RATIO } from "@/lib/project-card-layout";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import { cn } from "@/lib/utils";
import type { PublicBootstrapProject } from "@/types/public-bootstrap";

type ProjectHeroTagItem = {
  href: string;
  key: string;
  label: string;
};

type ProjectHeroActionItem = {
  href: string;
  key: string;
  label: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
  external?: boolean;
};

const projectHeroTagPillClassName =
  "h-6 min-h-6 min-w-6 gap-0 rounded-full px-2 py-0 text-[10px] uppercase leading-none";

interface ProjectHeroProps {
  children?: ReactNode;
  actionItems?: ProjectHeroActionItem[];
  mediaVariants?: UploadMediaVariantsMap;
  project: PublicBootstrapProject;
  tagItems?: ProjectHeroTagItem[];
  tagSkeletonCount?: number;
}

const ProjectHero = ({
  children = null,
  actionItems = [],
  mediaVariants,
  project,
  tagItems = [],
  tagSkeletonCount = 0,
}: ProjectHeroProps) => {
  const heroBannerSrc =
    project.banner || project.heroImageUrl || project.cover || "/placeholder.svg";
  const heroCoverSrc = project.cover || project.banner || "/placeholder.svg";
  const heroBannerAlt = `Banner do projeto ${project.title}`;
  const hasTagItems = tagItems.length > 0;
  const shouldRenderTagSkeletons = !hasTagItems && tagSkeletonCount > 0;

  return (
    <section data-testid="project-hero" className="relative overflow-hidden">
      <UploadPicture
        src={heroBannerSrc}
        alt={heroBannerAlt}
        preset="hero"
        mediaVariants={mediaVariants}
        applyFocalObjectPosition
        className="absolute inset-0 h-full w-full"
        imgClassName="h-full w-full object-cover object-center"
        loading="eager"
        decoding="async"
        fetchPriority="high"
        sizes="100vw"
      />
      <div className="absolute inset-0 bg-background/20 backdrop-blur-[1.5px]" />
      <div className="absolute inset-0 bg-linear-to-r from-background/76 via-background/48 to-background/74 md:from-background/66 md:via-background/44 md:to-background/80" />
      <div className="absolute inset-0 bg-linear-to-t from-background via-background/70 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent via-background/80 to-background" />

      <div
        className={`${publicPageLayoutTokens.sectionBase} relative max-w-6xl pb-14 pt-24 md:pb-16 lg:pt-28 lg:pb-20`}
      >
        <div
          data-testid="project-hero-layout"
          className="grid items-start gap-10 lg:gap-12 reveal reveal-visible md:items-stretch md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]"
          data-reveal
        >
          <div
            data-testid="project-hero-cover-shell"
            className="order-1 mx-auto w-64 self-start md:mx-0 md:w-[320px] lg:w-[340px]"
          >
            <div
              data-testid="project-hero-cover-frame"
              className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/90 shadow-project-cover-card animate-slide-up"
              style={{ aspectRatio: PROJECT_COVER_ASPECT_RATIO }}
            >
              <UploadPicture
                src={heroCoverSrc}
                alt={project.title || "Capa do projeto"}
                preset="posterThumb"
                mediaVariants={mediaVariants}
                className="block h-full w-full"
                imgClassName="block h-full w-full object-cover object-center"
                loading="eager"
                decoding="async"
                fetchPriority="high"
                sizes="(max-width: 767px) 256px, (max-width: 1023px) 320px, 340px"
              />
            </div>
          </div>
          <div
            data-testid="project-hero-info-panel"
            className="order-2 flex w-full flex-1 flex-col items-center gap-4 px-2 py-3 text-center md:h-full md:items-start md:px-0 md:py-2 md:text-left"
          >
            <div className="flex w-full flex-wrap items-center justify-center gap-3 text-center text-xs uppercase tracking-[0.2em] text-primary/80 animate-fade-in md:w-auto md:justify-start md:text-left">
              <span>{project.type}</span>
              <span className="text-muted-foreground" aria-hidden="true">
                &middot;
              </span>
              <span>{project.status}</span>
            </div>
            <h1 className="text-center text-3xl font-semibold text-foreground md:text-left md:text-4xl lg:text-5xl animate-slide-up">
              {project.title}
            </h1>
            <p
              className="max-w-2xl whitespace-pre-wrap text-center text-sm text-muted-foreground md:text-left md:text-base animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              {project.synopsis}
            </p>
            {hasTagItems ? (
              <div
                className="flex w-full flex-wrap justify-center gap-2 animate-slide-up md:justify-start"
                style={{ animationDelay: "0.3s" }}
              >
                {tagItems.map((tag) => (
                  <PillButton
                    key={tag.key}
                    asChild
                    tone="secondary"
                    className={projectHeroTagPillClassName}
                  >
                    <PublicLink href={tag.href}>{tag.label}</PublicLink>
                  </PillButton>
                ))}
              </div>
            ) : null}
            {shouldRenderTagSkeletons ? (
              <div
                className="flex w-full flex-wrap justify-center gap-2 animate-slide-up md:justify-start"
                style={{ animationDelay: "0.3s" }}
              >
                {Array.from({ length: tagSkeletonCount }).map((_, index) => (
                  <div
                    key={index}
                    className="h-6 w-16 animate-pulse rounded-full bg-muted"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : null}
            {actionItems.length > 0 ? (
              <div
                data-testid="project-hero-actions-row"
                className="flex w-full flex-wrap justify-center gap-3 animate-slide-up md:mt-auto md:justify-start"
                style={{ animationDelay: "0.4s" }}
              >
                {actionItems.map((action) => {
                  const className = cn(
                    buttonVariants({
                      variant: action.variant || "default",
                      className: action.className,
                    }),
                  );

                  return action.external || action.href.startsWith("#") ? (
                    <a
                      key={action.key}
                      href={action.href}
                      target={action.external ? "_blank" : undefined}
                      rel={action.external ? "noreferrer" : undefined}
                      className={className}
                    >
                      {action.label}
                    </a>
                  ) : (
                    <PublicLink key={action.key} href={action.href} className={className}>
                      {action.label}
                    </PublicLink>
                  );
                })}
              </div>
            ) : children ? (
              <div
                data-testid="project-hero-actions-row"
                className="flex w-full flex-wrap justify-center gap-3 animate-slide-up md:mt-auto md:justify-start"
                style={{ animationDelay: "0.4s" }}
              >
                {children}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProjectHero;
