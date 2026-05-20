import { isPublicAstroClientRoutePath } from "@/lib/public-document-navigation";
import { forwardRef, type AnchorHTMLAttributes, type ReactNode } from "react";

type PublicLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  preload?: boolean;
  "data-astro-prefetch"?: "false" | "hover" | "tap" | "viewport" | "load";
};

const isPreloadableInternalHref = (href: string) => href.startsWith("/") && !href.startsWith("//");

const PublicLink = forwardRef<HTMLAnchorElement, PublicLinkProps>(
  ({ children, href, preload = true, target, "data-astro-prefetch": astroPrefetch, ...props }, ref) => {
    const safeHref = String(href || "").trim() || "#";
    const resolvedAstroPrefetch =
      astroPrefetch ??
      (preload && isPreloadableInternalHref(safeHref) && isPublicAstroClientRoutePath(safeHref)
        ? "hover"
        : undefined);

    return (
      <a
        ref={ref}
        {...props}
        href={safeHref}
        target={target}
        data-astro-prefetch={resolvedAstroPrefetch}
      >
        {children}
      </a>
    );
  },
);

PublicLink.displayName = "PublicLink";

export default PublicLink;
