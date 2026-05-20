import Index from "@/pages/Index";
import PublicScrollToTop from "@/components/PublicScrollToTop";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PublicHomeIslandProps {
  initialCurrentUser?: unknown;
  initialPath?: string;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
}

const PublicHomeIsland = ({
  initialCurrentUser,
  initialPath = "/",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
}: PublicHomeIslandProps) => (
  <PublicHydratedPage
    initialCurrentUser={initialCurrentUser}
    initialPublicBootstrap={initialPublicBootstrap}
    initialPublicRoutePayload={initialPublicRoutePayload}
    initialSettings={initialSettings}
  >
    <PublicScrollToTop initialPath={initialPath} />
    <Index />
  </PublicHydratedPage>
);

export default PublicHomeIsland;
