import Post from "@/pages/Post";
import PublicScrollToTop from "@/components/PublicScrollToTop";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PublicPostIslandProps {
  initialCurrentUser?: unknown;
  initialPath?: string;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
}

const PublicPostIsland = ({
  initialCurrentUser,
  initialPath = "/",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
}: PublicPostIslandProps) => (
  <PublicHydratedPage
    initialCurrentUser={initialCurrentUser}
    initialPublicBootstrap={initialPublicBootstrap}
    initialPublicRoutePayload={initialPublicRoutePayload}
    initialSettings={initialSettings}
  >
    <PublicScrollToTop initialPath={initialPath} />
    <Post />
  </PublicHydratedPage>
);

export default PublicPostIsland;
