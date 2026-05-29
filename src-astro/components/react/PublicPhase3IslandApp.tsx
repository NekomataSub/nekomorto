import { useEffect } from "react";

import Index from "@/pages/Index";
import Project from "@/pages/Project";
import Projects from "@/pages/Projects";
import { usePublicDocumentLocation } from "@/lib/public-document-navigation";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PublicPhase3IslandAppProps {
  initialCurrentUser?: unknown;
  initialPath?: string;
  initialProjectSlug?: string;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
  staticProjectHeroId?: string;
}

const resolveProjectSlugFromPath = (pathname: string) => {
  const match = String(pathname || "").match(/^\/projeto\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
};

const PublicPhase3IslandApp = ({
  initialCurrentUser,
  initialPath = "/",
  initialProjectSlug = "",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
  staticProjectHeroId = "",
}: PublicPhase3IslandAppProps) => {
  const location = usePublicDocumentLocation(initialPath);
  const pathname = location.pathname || "/";
  const isProjectsRoute = pathname === "/projetos";
  const currentProjectSlug = resolveProjectSlugFromPath(pathname);
  const isProjectRoute = Boolean(currentProjectSlug);
  const shouldUseStaticProjectHero = Boolean(
    staticProjectHeroId && initialProjectSlug && currentProjectSlug === initialProjectSlug,
  );

  useEffect(() => {
    document.documentElement.dataset.clientRouteMeta = "phase3";
    return () => {
      delete document.documentElement.dataset.clientRouteMeta;
    };
  }, []);

  useEffect(() => {
    if (!staticProjectHeroId) {
      return;
    }
    const heroRoot = document.getElementById(staticProjectHeroId);
    if (!heroRoot) {
      return;
    }
    heroRoot.hidden = !shouldUseStaticProjectHero;
    return () => {
      heroRoot.hidden = false;
    };
  }, [shouldUseStaticProjectHero, staticProjectHeroId]);

  return (
    <PublicHydratedPage
      initialCurrentUser={initialCurrentUser}
      initialPublicBootstrap={initialPublicBootstrap}
      initialPublicRoutePayload={initialPublicRoutePayload}
      initialSettings={initialSettings}
    >
      {isProjectRoute ? (
        <Project
          initialPath={`${pathname}${location.search || ""}`}
          renderHero={!shouldUseStaticProjectHero}
          slug={currentProjectSlug}
        />
      ) : isProjectsRoute ? (
        <Projects initialPath={`${pathname}${location.search || ""}`} />
      ) : (
        <Index />
      )}
    </PublicHydratedPage>
  );
};

export default PublicPhase3IslandApp;
