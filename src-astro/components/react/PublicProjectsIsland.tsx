import Projects from "@/pages/Projects";
import PublicScrollToTop from "@/components/PublicScrollToTop";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PublicProjectsIslandProps {
  initialCurrentUser?: unknown;
  initialPath?: string;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
}

const PublicProjectsIsland = ({
  initialCurrentUser,
  initialPath = "/projetos",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
}: PublicProjectsIslandProps) => (
  <PublicHydratedPage
    initialCurrentUser={initialCurrentUser}
    initialPublicBootstrap={initialPublicBootstrap}
    initialPublicRoutePayload={initialPublicRoutePayload}
    initialSettings={initialSettings}
  >
    <PublicScrollToTop initialPath={initialPath} />
    <Projects />
  </PublicHydratedPage>
);

export default PublicProjectsIsland;
