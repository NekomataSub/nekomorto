import { isPublicAstroClientRoutePath } from "@/lib/public-document-navigation";
import { getPublicRoutePreloadHandlers } from "@/routes/public-preload";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

type PublicLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  preload?: boolean;
  "data-astro-prefetch"?: "false" | "hover" | "tap" | "viewport" | "load";
};

const isPreloadableInternalHref = (href: string) => href.startsWith("/") && !href.startsWith("//");

type PublicRoutePreloadHandlers = ReturnType<typeof getPublicRoutePreloadHandlers>;

const emptyPublicRoutePreloadHandlers: Partial<PublicRoutePreloadHandlers> = {};

const composeEventHandlers =
  <EventType,>(primary?: (event: EventType) => void, secondary?: (event: EventType) => void) =>
  (event: EventType) => {
    primary?.(event);
    secondary?.(event);
  };

const PublicLink = forwardRef<HTMLAnchorElement, PublicLinkProps>(
  (
    {
      children,
      href,
      onFocus,
      onMouseEnter,
      onTouchStart,
      preload = true,
      target,
      "data-astro-prefetch": astroPrefetch,
      ...props
    },
    ref,
  ) => {
    const safeHref = String(href || "").trim() || "#";
    const shouldPreloadInternally =
      preload && isPreloadableInternalHref(safeHref) && isPublicAstroClientRoutePath(safeHref);
    const preloadHandlers: Partial<PublicRoutePreloadHandlers> = shouldPreloadInternally
      ? getPublicRoutePreloadHandlers(safeHref)
      : emptyPublicRoutePreloadHandlers;
    const resolvedAstroPrefetch = astroPrefetch ?? (preload ? undefined : "false");

    return (
      <a
        ref={ref}
        {...props}
        href={safeHref}
        target={target}
        data-astro-prefetch={resolvedAstroPrefetch}
        onFocus={composeEventHandlers(onFocus, preloadHandlers.onFocus)}
        onMouseEnter={composeEventHandlers(onMouseEnter, preloadHandlers.onMouseEnter)}
        onTouchStart={composeEventHandlers(onTouchStart, preloadHandlers.onTouchStart)}
      >
        {children}
      </a>
    );
  },
);

PublicLink.displayName = "PublicLink";

export default PublicLink;
