import PublicLink from "@/components/PublicLink";
import ThemedSvgLogo from "@/components/ThemedSvgLogo";
import ThemedSvgMaskIcon from "@/components/ThemedSvgMaskIcon";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { resolveBranding } from "@/lib/branding";
import { isIconUrlSource, sanitizeIconSource, sanitizePublicHref } from "@/lib/url-safety";
import { schedulePublicRouteIdlePreload } from "@/routes/public-preload";
import { Camera, Globe, MessageCircle, Play, Users, X } from "lucide-react";
import { useEffect, useMemo } from "react";

type FooterProps = {
  shellClassName?: string;
};

const Footer = ({ shellClassName = "" }: FooterProps) => {
  const { settings } = useSiteSettings();
  const footer = settings.footer;
  const footerColumns = footer.columns || [];
  const socialLinks = footer.socialLinks || [];
  const disclaimer = footer.disclaimer || [];
  const brandName = (settings.site.name || footer.brandName || "Nekomata").trim() || "Nekomata";
  const brandNameUpper = brandName.toUpperCase();
  const branding = resolveBranding(settings);
  const footerWordmarkUrl = branding.footer.wordmarkUrl;
  const footerSymbolUrl = branding.footer.symbolUrl;
  const footerMode = branding.footer.mode;
  const showWordmarkInFooter = branding.footer.showWordmark;
  const isInternalLink = (href: string) => href.startsWith("/") && !href.startsWith("//");
  const iconMap: Record<string, typeof Globe> = {
    instagram: Camera,
    facebook: Users,
    twitter: X,
    x: X,
    youtube: Play,
    discord: MessageCircle,
    "message-circle": MessageCircle,
    globe: Globe,
    site: Globe,
  };
  const idlePreloadPaths = useMemo(
    () =>
      [
        ...footerColumns.flatMap((column) =>
          column.links
            .map((link) => sanitizePublicHref(link.href))
            .filter((href): href is string => Boolean(href && isInternalLink(href))),
        ),
        "/termos-de-uso",
        "/politica-de-privacidade",
      ].filter((path, index, list) => list.indexOf(path) === index),
    [footerColumns],
  );

  useEffect(() => {
    return schedulePublicRouteIdlePreload(idlePreloadPaths, { delayMs: 1200 });
  }, [idlePreloadPaths]);

  return (
    <footer className={`border-t border-border/60 bg-background ${shellClassName}`.trim()}>
      <div className="mx-auto max-w-7xl px-6 pb-14 pt-16 md:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr_1fr_1fr_1.1fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              {showWordmarkInFooter ? (
                <>
                  <img
                    src={footerWordmarkUrl}
                    alt={brandName}
                    className="h-9 md:h-12 w-auto max-w-[220px] md:max-w-[280px] object-contain"
                  />
                  <span className="sr-only">{brandName}</span>
                </>
              ) : footerMode === "text" ? (
                <p className="text-3xl font-black tracking-widest text-gradient-rainbow">
                  {brandNameUpper}
                </p>
              ) : (
                <>
                  {footerSymbolUrl ? (
                    <ThemedSvgLogo
                      url={footerSymbolUrl}
                      label={brandName}
                      className="h-10 w-10 rounded-full object-cover shadow-xs text-primary"
                    />
                  ) : null}
                  <p className="text-3xl font-black tracking-widest text-gradient-rainbow">
                    {brandNameUpper}
                  </p>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {footer.brandDescription}
            </p>
          </div>

          {footerColumns.map((column, columnIndex) => (
            <div key={`${column.title}-${columnIndex}`} className="space-y-4">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {column.title}
              </p>
              <ul className="space-y-2 text-sm">
                {column.links.map((link, linkIndex) => {
                  const safeHref = sanitizePublicHref(link.href);
                  if (!safeHref) {
                    return null;
                  }
                  return (
                    <li key={`${link.label}-${link.href}-${linkIndex}`}>
                      {isInternalLink(safeHref) ? (
                        <PublicLink
                          href={safeHref}
                          className="text-foreground/80 transition-colors hover:text-primary"
                        >
                          {link.label}
                        </PublicLink>
                      ) : (
                        <a
                          href={safeHref}
                          className="text-foreground/80 transition-colors hover:text-primary"
                        >
                          {link.label}
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Siga-nos
            </p>
            <div className="space-y-2">
              {socialLinks.map((link, linkIndex) => {
                const safeHref = sanitizePublicHref(link.href);
                if (!safeHref) {
                  return null;
                }
                const iconValue = sanitizeIconSource(link.icon || "") || "globe";
                const Icon = iconMap[iconValue.toLowerCase()] || Globe;
                const renderCustomIcon = isIconUrlSource(iconValue);
                return (
                  <a
                    key={`${link.label}-${link.href}-${linkIndex}`}
                    href={safeHref}
                    className="group flex items-center gap-3 text-sm text-foreground/80 transition-colors hover:text-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-secondary/70 text-primary/80 transition group-hover:border-primary/60 group-hover:text-primary">
                      {renderCustomIcon ? (
                        <ThemedSvgMaskIcon url={iconValue} label={link.label} className="h-4 w-4" />
                      ) : (
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      )}
                    </span>
                    {link.label}
                  </a>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-6 border-t border-border/60 pt-8 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3 text-sm text-muted-foreground">
            {disclaimer.map((item, index) => (
              <p key={`footer-disclaimer-${index}`}>{item}</p>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-gradient-card p-5 text-sm text-foreground">
            <p className="font-semibold text-primary">{footer.highlightTitle}</p>
            <p className="text-muted-foreground">{footer.highlightDescription}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-6 text-xs text-muted-foreground md:flex-row md:justify-between md:px-12">
          <p>{footer.copyright || ""}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <PublicLink href="/termos-de-uso" className="transition-colors hover:text-foreground">
              Termos de Uso
            </PublicLink>
            <PublicLink
              href="/politica-de-privacidade"
              className="transition-colors hover:text-foreground"
            >
              Política de Privacidade
            </PublicLink>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
