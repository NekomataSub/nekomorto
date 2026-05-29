import Post from "@/pages/Post";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";
import PublicHydratedPage from "./PublicHydratedPage";

interface PostIslandAppProps {
  initialCurrentUser?: unknown;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
  initialPath?: string;
  slug?: string;
}

const PostIslandApp = ({
  initialCurrentUser,
  initialPath = "/",
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
  slug,
}: PostIslandAppProps) => (
  <PublicHydratedPage
    initialCurrentUser={initialCurrentUser}
    initialPublicBootstrap={initialPublicBootstrap}
    initialPublicRoutePayload={initialPublicRoutePayload}
    initialSettings={initialSettings}
  >
    <Post initialPath={initialPath} slug={slug} />
  </PublicHydratedPage>
);

export default PostIslandApp;
