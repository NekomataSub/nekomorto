import { AppProviders } from "@/components/AppProviders";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { GlobalShortcutsProvider } from "@/hooks/global-shortcuts-provider";
import type { PublicBootstrapPayload, PublicRoutePayload } from "@/types/public-bootstrap";
import type { SiteSettings } from "@/types/site-settings";

interface PublicChromeIslandProps {
  initialCurrentUser?: unknown;
  initialPublicBootstrap: PublicBootstrapPayload | null;
  initialPublicRoutePayload?: PublicRoutePayload | null;
  initialSettings?: SiteSettings | null;
  kind: "footer" | "header";
  location: string;
  navigateToHref?: (href: string) => void;
}

const PublicChromeIsland = ({
  initialCurrentUser,
  initialPublicBootstrap,
  initialPublicRoutePayload,
  initialSettings,
  kind,
  location,
  navigateToHref,
}: PublicChromeIslandProps) => {
  const chrome =
    kind === "header" ? <Header variant="fixed" locationPath={location} /> : <Footer />;
  const shortcutAwareChrome =
    kind === "header" ? (
      <GlobalShortcutsProvider navigateToHref={navigateToHref}>{chrome}</GlobalShortcutsProvider>
    ) : (
      chrome
    );
  const content = (
    <AppProviders
      initialCurrentUser={initialCurrentUser}
      initialPublicBootstrap={initialPublicBootstrap}
      initialPublicRoutePayload={initialPublicRoutePayload}
      initialSettings={initialSettings ?? initialPublicBootstrap?.settings}
      initiallyLoaded={Boolean(initialSettings ?? initialPublicBootstrap?.settings)}
    >
      {shortcutAwareChrome}
    </AppProviders>
  );

  return content;
};

export default PublicChromeIsland;
