import {
  PUBLIC_ROUTE_KIND_NOT_FOUND,
  PUBLIC_ROUTE_KIND_PROJECT_READING,
  resolvePublicRouteKind,
} from "../../shared/public-route-registry.js";
import { useEffect, useMemo, useState } from "react";

export const PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT = "nekomata:public-document-location-change";

export const isPublicAstroClientRoutePath = (value: string) => {
  const pathname = normalizePathname(value);
  const routeKind = resolvePublicRouteKind(pathname);
  return (
    routeKind !== PUBLIC_ROUTE_KIND_NOT_FOUND && routeKind !== PUBLIC_ROUTE_KIND_PROJECT_READING
  );
};

const buildBrowserLocationSnapshot = () => {
  if (typeof window === "undefined") {
    return {
      hash: "",
      href: "/",
      pathname: "/",
      search: "",
    };
  }

  return {
    hash: window.location.hash || "",
    href: `${window.location.pathname || "/"}${window.location.search || ""}${window.location.hash || ""}`,
    pathname: window.location.pathname || "/",
    search: window.location.search || "",
  };
};

const emitPublicDocumentLocationChange = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT));
};

const normalizePathname = (value: string) => {
  const pathname = value.split(/[?#]/, 1)[0] || "/";
  const withoutTrailingSlash = pathname.replace(/\/+$/, "");
  return withoutTrailingSlash || "/";
};

export const canUsePublicAstroClientNavigation = ({
  currentPath,
  targetPath,
}: {
  currentPath: string;
  targetPath: string;
}) =>
  isPublicAstroClientRoutePath(currentPath) && isPublicAstroClientRoutePath(targetPath);

export const navigatePublicDocument = (
  href: string,
  options: { replace?: boolean; state?: unknown } = {},
) => {
  if (typeof window === "undefined") {
    return;
  }

  const targetHref = String(href || "").trim();
  if (!targetHref) {
    return;
  }

  const targetUrl = new URL(targetHref, window.location.origin);
  const currentUrl = new URL(window.location.href);
  const isSameDocumentRoute =
    targetUrl.origin === currentUrl.origin && targetUrl.pathname === currentUrl.pathname;
  const canSoftNavigateBetweenRoutes =
    targetUrl.origin === currentUrl.origin &&
    canUsePublicAstroClientNavigation({
      currentPath: currentUrl.pathname,
      targetPath: targetUrl.pathname,
    });

  if (!isSameDocumentRoute && !canSoftNavigateBetweenRoutes) {
    window.location.assign(targetUrl.toString());
    return;
  }

  const nextHref = `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`;
  const nextState = options.state ?? window.history.state;
  if (options.replace) {
    window.history.replaceState(nextState, "", nextHref);
  } else {
    window.history.pushState(nextState, "", nextHref);
  }
  emitPublicDocumentLocationChange();
};

const buildLocationSnapshotFromPath = (path: string) => {
  try {
    const parsed = new URL(String(path || "/"), "https://nekomata.moe");
    return {
      hash: parsed.hash || "",
      href: `${parsed.pathname || "/"}${parsed.search || ""}${parsed.hash || ""}`,
      pathname: parsed.pathname || "/",
      search: parsed.search || "",
    };
  } catch {
    return {
      hash: "",
      href: "/",
      pathname: "/",
      search: "",
    };
  }
};

export const usePublicDocumentLocation = (initialPath = "/") => {
  const [location, setLocation] = useState(() =>
    typeof window === "undefined"
      ? buildLocationSnapshotFromPath(initialPath)
      : buildBrowserLocationSnapshot(),
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const sync = () => {
      setLocation(buildBrowserLocationSnapshot());
    };

    document.addEventListener("astro:page-load", sync as EventListener);
    window.addEventListener("pageshow", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener(PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT, sync as EventListener);
    return () => {
      document.removeEventListener("astro:page-load", sync as EventListener);
      window.removeEventListener("pageshow", sync);
      window.removeEventListener("popstate", sync);
      window.removeEventListener(PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT, sync as EventListener);
    };
  }, []);

  return useMemo(() => location, [location]);
};
