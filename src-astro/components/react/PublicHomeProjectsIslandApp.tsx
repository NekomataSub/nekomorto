import Index from "@/pages/Index";
import Projects from "@/pages/Projects";
import { usePublicDocumentLocation } from "@/lib/public-document-navigation";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PublicHomeProjectsIslandAppProps {
  initialCurrentUser?: unknown;
  initialPath?: string;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
}

const PublicHomeProjectsIslandApp = ({
  initialCurrentUser,
  initialPath = "/",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
}: PublicHomeProjectsIslandAppProps) => {
  const location = usePublicDocumentLocation(initialPath);

  return (
    <PublicHydratedPage
      initialCurrentUser={initialCurrentUser}
      initialPublicBootstrap={initialPublicBootstrap}
      initialPublicRoutePayload={initialPublicRoutePayload}
      initialSettings={initialSettings}
    >
      {location.pathname === "/projetos" ? (
        <Projects initialPath={`${location.pathname}${location.search || ""}`} />
      ) : (
        <Index />
      )}
    </PublicHydratedPage>
  );
};

export default PublicHomeProjectsIslandApp;
