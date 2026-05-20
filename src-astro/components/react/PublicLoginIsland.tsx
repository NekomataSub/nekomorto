import Login from "@/pages/Login";
import PublicHydratedPage from "./PublicHydratedPage";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";

interface PublicLoginIslandProps {
  initialCurrentUser?: unknown;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
}

const PublicLoginIsland = ({
  initialCurrentUser,
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
}: PublicLoginIslandProps) => (
  <PublicHydratedPage
    initialCurrentUser={initialCurrentUser}
    initialPublicBootstrap={initialPublicBootstrap}
    initialPublicRoutePayload={initialPublicRoutePayload}
    initialSettings={initialSettings}
  >
    <Login />
  </PublicHydratedPage>
);

export default PublicLoginIsland;
