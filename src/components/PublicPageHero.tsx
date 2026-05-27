import { publicPageLayoutTokens } from "@/components/public-page-tokens";
import { Badge } from "@/components/ui/badge";
import type { CSSProperties, ReactNode } from "react";

const heroRootClassName =
  "relative overflow-hidden bg-background [background-image:var(--gradient-public-hero)] bg-no-repeat";
const heroInnerClassName = "relative";
const heroCopyClassName = "max-w-3xl";

type PublicPageHeroProps = {
  badge?: string;
  title: string;
  subtitle?: string;
  badges?: string[];
  children?: ReactNode;
};

const subtitleAnimationDelay = {
  animationDelay: "0.2s",
} as CSSProperties;

const badgesAnimationDelay = {
  animationDelay: "0.4s",
} as CSSProperties;

const PublicPageHero = ({ badge, title, subtitle, badges = [], children }: PublicPageHeroProps) => {
  const badgeLabel = String(badge || "").trim();
  const badgeItems = badges.map((item) => String(item || "").trim()).filter(Boolean);

  return (
    <section className={heroRootClassName}>
      <div
        className={`${publicPageLayoutTokens.sectionBase} ${heroInnerClassName} max-w-6xl pb-8 pt-20 md:pb-10 md:pt-28`}
      >
        <div className={`${heroCopyClassName} reveal space-y-4`} data-reveal>
          {badgeLabel ? (
            <Badge
              variant="secondary"
              className="text-xs uppercase tracking-widest animate-fade-in"
            >
              {badgeLabel}
            </Badge>
          ) : null}
          <h1 className="max-w-4xl text-3xl font-semibold leading-tight text-foreground [text-wrap:balance] md:text-5xl animate-slide-up">
            {title}
          </h1>
          {subtitle ? (
            <p
              className="max-w-2xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground [text-wrap:pretty] md:text-base md:leading-7 animate-slide-up"
              style={subtitleAnimationDelay}
            >
              {subtitle}
            </p>
          ) : null}
          {badgeItems.length > 0 ? (
            <div className="flex flex-wrap gap-3 animate-slide-up" style={badgesAnimationDelay}>
              {badgeItems.map((item) => (
                <Badge key={item} variant="secondary" className="text-xs uppercase tracking-widest">
                  {item}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
};

export default PublicPageHero;
