import Project from "@/pages/Project";
import PublicScrollToTop from "@/components/PublicScrollToTop";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PublicProjectDetailIslandProps {
  initialCurrentUser?: unknown;
  initialPath?: string;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
  slug?: string;
}

const PublicProjectDetailIsland = ({
  initialCurrentUser,
  initialPath = "/",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
  slug = "",
}: PublicProjectDetailIslandProps) => (
  <PublicHydratedPage
    initialCurrentUser={initialCurrentUser}
    initialPublicBootstrap={initialPublicBootstrap}
    initialPublicRoutePayload={initialPublicRoutePayload}
    initialSettings={initialSettings}
  >
    <PublicScrollToTop initialPath={initialPath} />
    <Project initialPath={initialPath} renderHero={false} slug={slug} />
  </PublicHydratedPage>
);

export default PublicProjectDetailIsland;
