import PublicPageHero from "@/components/PublicPageHero";
import {
  publicInteractiveStackedSurfaceClassName,
  publicPageLayoutTokens,
} from "@/components/public-page-tokens";
import { Card, CardContent } from "@/components/ui/card";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useResolvedPublicBootstrap } from "@/hooks/public-bootstrap-provider";
import { resolveAboutIcon } from "@/lib/institutional-page-icons";
import { Flame, Sparkles } from "lucide-react";
import { useMemo } from "react";
import {
  buildInstitutionalOgImageAlt,
  buildInstitutionalOgRevision,
  buildVersionedInstitutionalOgImagePath,
  resolveInstitutionalOgSupportText,
} from "../../shared/institutional-og-seo.js";
import { normalizeAboutPublicPage } from "../../shared/public-page-content.js";

const About = () => {
  const bootstrap = useResolvedPublicBootstrap();
  const pageMediaVariants = bootstrap?.mediaVariants || {};
  const about = useMemo(() => normalizeAboutPublicPage(bootstrap?.pages.about), [bootstrap]);
  usePageMeta({
    title: "Sobre",
    description: resolveInstitutionalOgSupportText({
      pageKey: "about",
      pages: bootstrap?.pages,
      settings: bootstrap?.settings,
    }),
    image: buildVersionedInstitutionalOgImagePath({
      pageKey: "about",
      revision: buildInstitutionalOgRevision({
        pageKey: "about",
        pages: bootstrap?.pages,
        settings: bootstrap?.settings,
      }),
    }),
    imageAlt: buildInstitutionalOgImageAlt("about"),
    mediaVariants: pageMediaVariants,
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main>
        <PublicPageHero
          badge={about.heroBadge}
          title={about.heroTitle}
          subtitle={about.heroSubtitle}
          badges={about.heroBadges}
        />

        {about.highlights.length > 0 ||
        about.manifestoTitle ||
        about.manifestoParagraphs.length > 0 ? (
          <section
            className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-16 pt-10 reveal`}
            data-reveal
          >
            <div
              className={`grid gap-6 ${
                about.highlights.length > 0 &&
                (about.manifestoTitle || about.manifestoParagraphs.length > 0)
                  ? "lg:grid-cols-[0.9fr_1.1fr]"
                  : "lg:grid-cols-1"
              }`}
            >
              {about.highlights.length > 0 ? (
                <div className="space-y-4">
                  {about.highlights.map((item) => {
                    const HighlightIcon = resolveAboutIcon(item.icon, Sparkles);
                    return (
                      <div
                        key={item.label}
                        className={`${publicInteractiveStackedSurfaceClassName} group rounded-2xl border border-border/60 bg-background/60 p-5 hover:border-primary/60 hover:bg-background/80`}
                      >
                        <div
                          className={`${publicPageLayoutTokens.sectionLabelBase} ${publicPageLayoutTokens.sectionLabelXs}`}
                        >
                          <HighlightIcon className={publicPageLayoutTokens.sectionLabelIcon} />
                          {item.label}
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                          {item.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {about.manifestoTitle || about.manifestoParagraphs.length > 0 ? (
                <Card
                  className={`${publicInteractiveStackedSurfaceClassName} group bg-card/80 hover:border-primary/60 hover:bg-card/90`}
                >
                  <CardContent className="space-y-5 p-6 md:p-8">
                    {about.manifestoTitle ? (
                      <div
                        className={`${publicPageLayoutTokens.sectionLabelBase} ${publicPageLayoutTokens.sectionLabelSm}`}
                      >
                        {(() => {
                          const ManifestoIcon = resolveAboutIcon(about.manifestoIcon, Flame);
                          return (
                            <ManifestoIcon className={publicPageLayoutTokens.sectionLabelIcon} />
                          );
                        })()}
                        {about.manifestoTitle}
                      </div>
                    ) : null}
                    {about.manifestoParagraphs.map((paragraph) => (
                      <p
                        key={paragraph}
                        className="whitespace-pre-wrap text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80 md:text-base"
                      >
                        {paragraph}
                      </p>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </section>
        ) : null}

        {about.pillars.length > 0 ? (
          <section
            className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-16 pt-2 reveal`}
            data-reveal
          >
            <div className="grid gap-6 md:grid-cols-3">
              {about.pillars.map((pillar) => {
                const Icon = resolveAboutIcon(pillar.icon, Sparkles);
                return (
                  <Card
                    key={pillar.title}
                    className={`${publicInteractiveStackedSurfaceClassName} group bg-card/80 hover:border-primary/60 hover:bg-card/90`}
                  >
                    <CardContent className="space-y-3 p-6">
                      <div
                        className={`${publicPageLayoutTokens.sectionLabelBase} ${publicPageLayoutTokens.sectionLabelSm}`}
                      >
                        <Icon className={publicPageLayoutTokens.sectionLabelIcon} />
                        {pillar.title}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                        {pillar.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ) : null}

        {about.values.length > 0 ? (
          <section
            className={`${publicPageLayoutTokens.sectionBase} max-w-6xl pb-24 pt-4 reveal`}
            data-reveal
          >
            <div className="grid gap-6 md:grid-cols-2">
              {about.values.map((value) => {
                const Icon = resolveAboutIcon(value.icon, Sparkles);
                return (
                  <Card
                    key={value.title}
                    className={`${publicInteractiveStackedSurfaceClassName} group bg-card/80 hover:border-primary/60 hover:bg-card/90`}
                  >
                    <CardContent className="space-y-3 p-6">
                      <div
                        className={`${publicPageLayoutTokens.sectionLabelBase} ${publicPageLayoutTokens.sectionLabelSm}`}
                      >
                        <Icon className={publicPageLayoutTokens.sectionLabelIcon} />
                        {value.title}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
                        {value.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};

export default About;
