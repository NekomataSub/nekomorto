import { AppProviders } from "@/components/AppProviders";
import ScrollToTop from "@/components/ScrollToTop";
import { RoutedGlobalShortcutsProvider } from "@/hooks/global-shortcuts-provider";
import { useReveal } from "@/hooks/use-reveal";
import { initRouteMotion } from "@/lib/route-motion";
import DashboardRoutes from "@/routes/DashboardRoutes";
import type { SiteSettings } from "@/types/site-settings";
import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

const FullReloadFallback = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const target = `${location.pathname}${location.search}${location.hash}`;
    window.location.assign(target);
  }, [location.hash, location.pathname, location.search]);

  return null;
};

const DashboardHostRoutes = () => (
  <Routes>
    <Route path="/dashboard/*" element={<DashboardRoutes />} />
    <Route path="*" element={<FullReloadFallback />} />
  </Routes>
);

const DashboardRouterShell = () => {
  useReveal();

  useEffect(() => {
    return initRouteMotion();
  }, []);

  return (
    <>
      <ScrollToTop />
      <DashboardHostRoutes />
    </>
  );
};

interface DashboardIslandAppProps {
  initialCurrentUser?: unknown;
  initialSettings?: SiteSettings | null;
}

const DashboardIslandApp = ({ initialCurrentUser, initialSettings }: DashboardIslandAppProps) => (
  <AppProviders
    initialCurrentUser={initialCurrentUser}
    initialSettings={initialSettings ?? undefined}
    initiallyLoaded={Boolean(initialSettings)}
  >
    <BrowserRouter>
      <RoutedGlobalShortcutsProvider>
        <DashboardRouterShell />
      </RoutedGlobalShortcutsProvider>
    </BrowserRouter>
  </AppProviders>
);

export default DashboardIslandApp;
