import { Eye, Hash } from "lucide-react";
import { memo, type CSSProperties, type MouseEvent, type Ref } from "react";

import PublicLink from "@/components/PublicLink";
import { usePublicRoutePreload } from "@/routes/use-public-route-preload";

import PublicInteractiveCardShell from "@/components/PublicInteractiveCardShell";
import UploadPicture from "@/components/UploadPicture";
import { publicStrongSurfaceHoverClassName } from "@/components/public-page-tokens";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PillButton } from "@/components/ui/pill-button";
import { PROJECT_COVER_ASPECT_RATIO } from "@/lib/project-card-layout";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import { cn } from "@/lib/utils";
import "@/styles/projects-public.css";

export type PublicProjectCardVariant = "catalog" | "search" | "sidebar" | "related" | "embed";
type PublicProjectCardClampFamily = "projects" | "safe" | "search";
type PublicProjectCardShellPreset = "default" | "compact" | "none";
type PublicProjectCardStatIcon = "eye" | "hash";
export type PublicProjectCardClampProfileKey = Exclude<PublicProjectCardVariant, "related">;

type PublicProjectCardClampWidthCap = {
  maxWidth: number;
  maxLines: number;
};

export type PublicProjectCardClampProfile = {
  variant: PublicProjectCardClampProfileKey;
  family: PublicProjectCardClampFamily;
  defaultMaxLines: number;
  fallbackLines: number;
  widthCaps: readonly PublicProjectCardClampWidthCap[];
};

export type PublicProjectCardBadge = {
  key: string;
  label: string;
  variant: "outline" | "secondary";
  href?: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
  testId?: string;
  onClickHref?: (href: string, event: MouseEvent<HTMLButtonElement>) => void;
};

export type PublicProjectCardMetaPill = {
  key: string;
  label: string;
  className?: string;
  title?: string;
  testId?: string;
};

export type PublicProjectCardTrailingStat = {
  key: string;
  label: string | number;
  ariaLabel: string;
  icon: PublicProjectCardStatIcon;
  testId?: string;
};

export type PublicProjectCardModel = {
  href: string;
  title: string;
  coverSrc?: string | null;
  coverAlt?: string;
  mediaVariants?: UploadMediaVariantsMap;
  eyebrow?: string;
  synopsis?: string;
  synopsisKey?: string;
  synopsisClampClass?: string;
  synopsisLines?: number;
  primaryBadges?: readonly PublicProjectCardBadge[];
  metaPills?: readonly PublicProjectCardMetaPill[];
  secondaryBadges?: readonly PublicProjectCardBadge[];
  supportingText?: string;
  trailingStats?: readonly PublicProjectCardTrailingStat[];
};

type PublicProjectCardProps = {
  variant: PublicProjectCardVariant;
  model: PublicProjectCardModel;
  imageSizes?: string;
  imageLoading?: "eager" | "lazy";
  imageFetchPriority?: "high" | "low" | "auto";
  coverStyle?: CSSProperties;
  shellClassName?: string;
  linkClassName?: string;
  bodyClassName?: string;
  rowRef?: Ref<HTMLDivElement>;
  testIdBase?: string;
  shellPreset?: PublicProjectCardShellPreset;
};

export const PUBLIC_PROJECT_CARD_CLAMP_PROFILES: Record<
  PublicProjectCardClampProfileKey,
  PublicProjectCardClampProfile
> = {
  catalog: {
    variant: "catalog",
    family: "projects",
    defaultMaxLines: 4,
    fallbackLines: 3,
    widthCaps: [
      { maxWidth: 300, maxLines: 2 },
      { maxWidth: 420, maxLines: 3 },
    ],
  },
  search: {
    variant: "search",
    family: "search",
    defaultMaxLines: 3,
    fallbackLines: 3,
    widthCaps: [],
  },
  sidebar: {
    variant: "sidebar",
    family: "safe",
    defaultMaxLines: 3,
    fallbackLines: 2,
    widthCaps: [
      { maxWidth: 220, maxLines: 1 },
      { maxWidth: 320, maxLines: 2 },
    ],
  },
  embed: {
    variant: "embed",
    family: "safe",
    defaultMaxLines: 4,
    fallbackLines: 2,
    widthCaps: [
      { maxWidth: 320, maxLines: 1 },
      { maxWidth: 480, maxLines: 2 },
    ],
  },
};

export const resolvePublicProjectCardResponsiveMaxLines = ({
  profile,
  columnWidth,
  defaultMaxLines = profile.defaultMaxLines,
}: {
  profile: PublicProjectCardClampProfile;
  columnWidth: number;
  defaultMaxLines?: number;
}) => {
  const matchingCap = profile.widthCaps.find(({ maxWidth }) => columnWidth <= maxWidth);
  const cappedMaxLines = matchingCap?.maxLines ?? profile.defaultMaxLines;
  return normalizePublicProjectCardClampLines({
    lines: Math.min(defaultMaxLines, cappedMaxLines),
    fallbackLines: profile.defaultMaxLines,
    maxLines: profile.defaultMaxLines,
  });
};

export const normalizePublicProjectCardClampLines = ({
  lines,
  fallbackLines = 2,
  maxLines = 4,
}: {
  lines?: number;
  fallbackLines?: number;
  maxLines?: number;
}) => {
  const resolvedLines = typeof lines === "number" ? lines : fallbackLines;
  return Math.max(0, Math.min(resolvedLines, maxLines));
};

export const resolvePublicProjectCardClampState = ({
  profile,
  lines,
}: {
  profile: PublicProjectCardClampProfile;
  lines?: number;
}) => {
  const synopsisLines = normalizePublicProjectCardClampLines({
    lines,
    fallbackLines: profile.fallbackLines,
    maxLines: profile.defaultMaxLines,
  });

  return {
    synopsisLines,
    synopsisClampClass: getPublicProjectCardClampClass({
      lines: synopsisLines,
      family: profile.family,
      fallbackLines: profile.fallbackLines,
      maxLines: profile.defaultMaxLines,
    }),
  };
};

export const getPublicProjectCardClampClass = ({
  lines,
  family = "safe",
  fallbackLines = 2,
  maxLines = 4,
}: {
  lines?: number;
  family?: PublicProjectCardClampFamily;
  fallbackLines?: number;
  maxLines?: number;
}) => {
  const normalizedLines = normalizePublicProjectCardClampLines({
    lines,
    fallbackLines,
    maxLines,
  });

  if (family === "projects") {
    return `projects-public-synopsis-clamp-${normalizedLines}`;
  }

  if (family === "search") {
    return `projects-public-search-synopsis-clamp-${normalizedLines}`;
  }

  if (normalizedLines <= 0) {
    return "hidden";
  }
  return `clamp-safe-${normalizedLines}`;
};

const DEFAULT_COVER_SRC = "/placeholder.svg";

const renderStatIcon = (icon: PublicProjectCardStatIcon) => {
  if (icon === "hash") {
    return <Hash className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden="true" />;
  }
  return <Eye className="h-3.5 w-3.5 text-muted-foreground/80" aria-hidden="true" />;
};

const PublicProjectCard = ({
  variant,
  model,
  imageSizes,
  imageLoading = "lazy",
  imageFetchPriority,
  coverStyle,
  shellClassName,
  linkClassName,
  bodyClassName,
  rowRef,
  testIdBase,
  shellPreset = "none",
}: PublicProjectCardProps) => {
  const coverAlt = model.coverAlt || model.title || "Projeto";
  const coverSrc = model.coverSrc || DEFAULT_COVER_SRC;
  const synopsisKey = model.synopsisKey || model.href;
  const primaryBadges = Array.isArray(model.primaryBadges) ? model.primaryBadges : [];
  const metaPills = Array.isArray(model.metaPills) ? model.metaPills : [];
  const secondaryBadges = Array.isArray(model.secondaryBadges) ? model.secondaryBadges : [];
  const trailingStats = Array.isArray(model.trailingStats) ? model.trailingStats : [];
  const { preloadHandlers, viewportRef } = usePublicRoutePreload(model.href, {
    enableIdle: true,
    enableViewport: true,
  });

  const renderPrimaryBadge = (badge: PublicProjectCardBadge) => {
    if (badge.href && badge.onClickHref) {
      return (
        <PillButton
          key={badge.key}
          tone={badge.variant === "secondary" ? "secondary" : "outline"}
          className={cn(
            "h-6 min-h-6 min-w-6 shrink-0 items-center rounded-full px-2.5 py-0 font-sans text-[10px] font-semibold uppercase leading-none",
            badge.className,
          )}
          title={badge.title || badge.label}
          aria-label={badge.ariaLabel || badge.label}
          data-testid={badge.testId}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            badge.onClickHref?.(badge.href!, event);
          }}
        >
          {badge.label}
        </PillButton>
      );
    }

    return (
      <Badge
        key={badge.key}
        variant={badge.variant}
        className={cn(
          "inline-flex h-6 shrink-0 items-center justify-center whitespace-nowrap px-2.5 py-0 font-sans text-[10px] font-semibold uppercase leading-none",
          badge.className,
        )}
        title={badge.title || badge.label}
        data-testid={badge.testId}
      >
        {badge.label}
      </Badge>
    );
  };

  const renderMetaPill = (pill: PublicProjectCardMetaPill) => (
    <span
      key={pill.key}
      className={cn("shrink-0 rounded-full bg-background/50 px-3 py-1", pill.className)}
      title={pill.title || pill.label}
      data-testid={pill.testId}
    >
      {pill.label}
    </span>
  );

  const renderSecondaryBadge = (badge: PublicProjectCardBadge) => (
    <Badge
      key={badge.key}
      variant={badge.variant}
      className={cn("shrink-0 whitespace-nowrap text-[9px] uppercase", badge.className)}
      title={badge.title || badge.label}
      data-testid={badge.testId}
    >
      {badge.label}
    </Badge>
  );

  const renderTrailingStat = (stat: PublicProjectCardTrailingStat) => (
    <span
      key={stat.key}
      data-testid={stat.testId}
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      aria-label={stat.ariaLabel}
    >
      {renderStatIcon(stat.icon)}
      {stat.label}
    </span>
  );

  if (variant === "catalog") {
    return (
      <PublicInteractiveCardShell
        shadowPreset={shellPreset}
        className={cn("rounded-2xl", shellClassName)}
      >
        <PublicLink
          ref={viewportRef}
          href={model.href}
          {...preloadHandlers}
          className={cn(
            "projects-public-card group relative flex h-50 w-full items-stretch overflow-hidden rounded-2xl border border-border/60 bg-gradient-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45 md:h-60",
            publicStrongSurfaceHoverClassName,
            linkClassName,
          )}
        >
          <div
            className="h-full shrink-0 overflow-hidden bg-secondary"
            style={{
              aspectRatio: PROJECT_COVER_ASPECT_RATIO,
              ...coverStyle,
            }}
          >
            <UploadPicture
              src={coverSrc}
              alt={coverAlt}
              preset="posterThumb"
              mediaVariants={model.mediaVariants || {}}
              className="block h-full w-full"
              imgClassName="projects-public-card__media h-full w-full object-cover object-center"
              sizes={imageSizes}
              loading={imageLoading}
              fetchPriority={imageFetchPriority}
            />
          </div>
          <div
            data-synopsis-role="column"
            data-synopsis-key={synopsisKey}
            className={cn(
              "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-5",
              bodyClassName,
            )}
          >
            <div data-synopsis-role="title" className="shrink-0">
              {model.eyebrow ? (
                <p className="interactive-content-transition text-xs uppercase tracking-[0.2em] text-primary/80 group-hover:text-primary group-focus-within:text-primary">
                  {model.eyebrow}
                </p>
              ) : null}
              <h2 className="interactive-content-transition line-clamp-2 text-xl font-semibold leading-snug text-foreground group-hover:text-primary group-focus-within:text-primary md:text-2xl">
                {model.title}
              </h2>
            </div>

            {model.synopsis ? (
              <p
                data-synopsis-role="synopsis"
                data-synopsis-lines={model.synopsisLines}
                className={cn(
                  "interactive-content-transition mt-2 overflow-hidden text-sm leading-snug text-muted-foreground break-normal hyphens-none group-hover:text-foreground/80 group-focus-within:text-foreground/80",
                  "projects-public-synopsis",
                  model.synopsisClampClass,
                )}
              >
                {model.synopsis}
              </p>
            ) : null}

            {primaryBadges.length > 0 || metaPills.length > 0 ? (
              <div
                data-synopsis-role="badges"
                className="mt-auto flex shrink-0 flex-col gap-2 pt-3"
              >
                {primaryBadges.length > 0 ? (
                  <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
                    {primaryBadges.map(renderPrimaryBadge)}
                  </div>
                ) : null}

                {metaPills.length > 0 ? (
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {metaPills.map(renderMetaPill)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </PublicLink>
      </PublicInteractiveCardShell>
    );
  }

  if (variant === "search") {
    return (
      <PublicInteractiveCardShell
        lift={false}
        shadowPreset={shellPreset}
        className={cn("rounded-xl", shellClassName)}
      >
        <PublicLink
          ref={viewportRef}
          href={model.href}
          {...preloadHandlers}
          className={cn(
            "group flex h-36 items-stretch overflow-hidden rounded-xl border border-border/60 bg-card/60 transition hover:border-primary/60 hover:bg-card/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45",
            linkClassName,
          )}
        >
          <div
            className="h-full shrink-0 overflow-hidden bg-secondary"
            style={{
              aspectRatio: PROJECT_COVER_ASPECT_RATIO,
              ...coverStyle,
            }}
          >
            <UploadPicture
              src={coverSrc}
              alt={coverAlt}
              preset="posterThumb"
              mediaVariants={model.mediaVariants || {}}
              className="block h-full w-full"
              imgClassName="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              sizes={imageSizes}
              loading={imageLoading}
              fetchPriority={imageFetchPriority}
            />
          </div>
          <div
            data-synopsis-role="column"
            data-synopsis-key={synopsisKey}
            className={cn(
              "min-h-0 min-w-0 flex flex-1 self-stretch flex-col overflow-hidden p-4",
              bodyClassName,
            )}
          >
            <p
              data-synopsis-role="title"
              className="line-clamp-1 shrink-0 text-sm font-semibold text-foreground group-hover:text-primary"
            >
              {model.title}
            </p>
            {model.synopsis ? (
              <p
                data-synopsis-role="synopsis"
                data-synopsis-lines={model.synopsisLines}
                className={cn(
                  "mt-1 min-h-0 shrink-0 overflow-hidden text-xs leading-snug text-muted-foreground",
                  model.synopsisClampClass,
                )}
              >
                {model.synopsis}
              </p>
            ) : null}
            {secondaryBadges.length > 0 ? (
              <div
                data-synopsis-role="badges"
                className="mt-auto flex min-w-0 shrink-0 flex-nowrap gap-1.5 overflow-hidden pb-1 pt-2"
              >
                {secondaryBadges.map(renderSecondaryBadge)}
              </div>
            ) : null}
          </div>
        </PublicLink>
      </PublicInteractiveCardShell>
    );
  }

  if (variant === "sidebar") {
    return (
      <PublicInteractiveCardShell
        shadowPreset={shellPreset}
        className={cn("rounded-2xl", shellClassName)}
      >
        <PublicLink
          data-testid={testIdBase}
          ref={viewportRef}
          href={model.href}
          {...preloadHandlers}
          className={cn(
            "top-projects-link group relative z-10 rounded-2xl focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45",
            publicStrongSurfaceHoverClassName,
            linkClassName,
          )}
        >
          <div
            className="h-full shrink-0 overflow-hidden bg-secondary/60"
            style={{
              aspectRatio: PROJECT_COVER_ASPECT_RATIO,
              width: "calc(var(--top-card-h) * 9 / 14)",
              ...coverStyle,
            }}
          >
            <UploadPicture
              src={coverSrc}
              alt={coverAlt}
              preset="posterThumb"
              mediaVariants={model.mediaVariants || {}}
              sizes={imageSizes}
              className="block h-full w-full"
              imgClassName="home-card-media-transition h-full w-full object-cover object-center"
              loading={imageLoading}
              fetchPriority={imageFetchPriority}
            />
          </div>
          <div
            data-synopsis-role="column"
            data-synopsis-key={synopsisKey}
            className={cn(
              "top-projects-link-body flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
              bodyClassName,
            )}
          >
            <div data-synopsis-role="title" className="space-y-1.5">
              {model.eyebrow || trailingStats.length > 0 ? (
                <div
                  data-testid={testIdBase ? `${testIdBase}-meta-row` : undefined}
                  className="flex min-w-0 items-center justify-between gap-2"
                >
                  {model.eyebrow ? (
                    <span
                      data-testid={testIdBase ? `${testIdBase}-type` : undefined}
                      className="min-w-0 truncate text-[10px] uppercase tracking-[0.16em] text-primary/80"
                    >
                      {model.eyebrow}
                    </span>
                  ) : (
                    <span />
                  )}
                  {trailingStats.length > 0 ? (
                    <div className="ml-auto inline-flex shrink-0 items-center gap-3 whitespace-nowrap">
                      {trailingStats.map((stat) =>
                        renderTrailingStat({
                          ...stat,
                          testId:
                            testIdBase && (stat.key === "rank" || stat.key === "metric")
                              ? `${testIdBase}-${stat.key}`
                              : stat.testId,
                        }),
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <h3 className="clamp-safe-2 interactive-content-transition text-base font-semibold leading-snug text-foreground group-hover:text-primary group-focus-within:text-primary">
                {model.title}
              </h3>
            </div>
            {model.synopsis ? (
              <p
                data-synopsis-role="synopsis"
                data-synopsis-lines={model.synopsisLines}
                className={cn(
                  "mt-2 text-xs leading-relaxed text-muted-foreground",
                  model.synopsisClampClass,
                )}
              >
                {model.synopsis}
              </p>
            ) : null}
          </div>
        </PublicLink>
      </PublicInteractiveCardShell>
    );
  }

  if (variant === "related") {
    return (
      <PublicInteractiveCardShell
        shadowPreset={shellPreset}
        className={cn("rounded-xl", shellClassName)}
      >
        <PublicLink
          ref={viewportRef}
          href={model.href}
          {...preloadHandlers}
          className={cn(
            "related-project-link group flex overflow-hidden rounded-xl border border-border/50 bg-background/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45 hover:border-primary/60 hover:bg-background/80",
            linkClassName,
          )}
        >
          <div
            className="w-18 shrink-0 overflow-hidden bg-secondary sm:w-20"
            style={{
              aspectRatio: PROJECT_COVER_ASPECT_RATIO,
              ...coverStyle,
            }}
          >
            <UploadPicture
              src={coverSrc}
              alt={coverAlt}
              preset="posterThumb"
              mediaVariants={model.mediaVariants || {}}
              className="block h-full w-full"
              imgClassName="home-card-media-transition h-full w-full object-cover object-center"
              sizes={imageSizes}
              loading={imageLoading}
              fetchPriority={imageFetchPriority}
            />
          </div>
          <div
            data-synopsis-role="column"
            data-synopsis-key={synopsisKey}
            className={cn("min-w-0 space-y-2 p-4.5", bodyClassName)}
          >
            {model.eyebrow ? (
              <p
                data-synopsis-role="title"
                className="text-xs font-semibold uppercase tracking-widest text-primary/80"
              >
                {model.eyebrow}
              </p>
            ) : null}
            <p className="interactive-content-transition text-sm font-semibold text-foreground group-hover:text-primary group-focus-visible:text-primary">
              {model.title}
            </p>
            {model.supportingText ? (
              <p data-synopsis-role="synopsis" className="text-xs text-muted-foreground">
                {model.supportingText}
              </p>
            ) : null}
          </div>
        </PublicLink>
      </PublicInteractiveCardShell>
    );
  }

  return (
    <PublicInteractiveCardShell
      shadowPreset={shellPreset}
      className={cn("rounded-2xl", shellClassName)}
    >
      <PublicLink
        ref={viewportRef}
        href={model.href}
        {...preloadHandlers}
        className={cn(
          "project-embed-card group block overflow-hidden rounded-2xl border border-border/60 bg-card focus-visible:border-primary/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45 hover:border-primary/60 hover:bg-card/90",
          linkClassName,
        )}
      >
        <Card className="overflow-hidden bg-transparent shadow-none">
          <CardContent className="p-0">
            <div
              ref={rowRef}
              data-testid={testIdBase ? `${testIdBase}-row` : undefined}
              className="group flex items-stretch"
              style={{ height: "192px" }}
            >
              <div
                className="h-full shrink-0 self-start overflow-hidden bg-secondary/60"
                style={{
                  aspectRatio: PROJECT_COVER_ASPECT_RATIO,
                  width: "calc(192px * 9 / 14)",
                  ...coverStyle,
                }}
              >
                <UploadPicture
                  src={coverSrc}
                  alt={coverAlt}
                  preset="posterThumb"
                  mediaVariants={model.mediaVariants || {}}
                  className="block h-full w-full"
                  sizes={imageSizes}
                  imgClassName="project-embed-card__media h-full w-full object-cover object-center"
                  loading={imageLoading}
                  fetchPriority={imageFetchPriority}
                />
              </div>
              <div
                data-synopsis-role="column"
                data-synopsis-key={synopsisKey}
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 self-stretch flex-col overflow-hidden p-4",
                  bodyClassName,
                )}
              >
                <div data-synopsis-role="title" className="space-y-1">
                  {model.eyebrow ? (
                    <p className="text-[10px] uppercase tracking-[0.2em] text-primary/80">
                      {model.eyebrow}
                    </p>
                  ) : null}
                  <span className="clamp-safe-2 interactive-content-transition text-lg font-semibold text-foreground group-hover:text-primary group-focus-visible:text-primary">
                    {model.title}
                  </span>
                </div>
                {model.synopsis ? (
                  <p
                    data-synopsis-role="synopsis"
                    data-synopsis-lines={model.synopsisLines}
                    className={cn(
                      "mt-2 min-h-0 text-sm text-muted-foreground break-normal wrap-normal [word-break:normal]",
                      model.synopsisClampClass,
                    )}
                  >
                    {model.synopsis}
                  </p>
                ) : null}
                {primaryBadges.length > 0 || secondaryBadges.length > 0 ? (
                  <div data-synopsis-role="badges" className="mt-auto space-y-2 pt-2">
                    {primaryBadges.length > 0 ? (
                      <div
                        data-testid={testIdBase ? `${testIdBase}-primary-badges` : undefined}
                        className="flex flex-nowrap items-center gap-2 overflow-hidden text-xs sm:flex-wrap"
                      >
                        {primaryBadges.map((badge) =>
                          renderSecondaryBadge({
                            ...badge,
                            testId:
                              badge.testId ??
                              (testIdBase ? `${testIdBase}-${badge.key}-badge` : undefined),
                          }),
                        )}
                      </div>
                    ) : null}
                    {secondaryBadges.length > 0 ? (
                      <div
                        data-testid={testIdBase ? `${testIdBase}-tags` : undefined}
                        className="hidden flex-wrap gap-1.5 sm:flex"
                      >
                        {secondaryBadges.map(renderSecondaryBadge)}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </PublicLink>
    </PublicInteractiveCardShell>
  );
};

export default memo(PublicProjectCard);
