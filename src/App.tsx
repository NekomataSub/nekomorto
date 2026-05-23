import AppLoadingFallback from "@/components/AppLoadingFallback";
import { AppProviders } from "@/components/AppProviders";
import ScrollToTop from "@/components/ScrollToTop";
import { RoutedGlobalShortcutsProvider } from "@/hooks/global-shortcuts-provider";
import { useReveal } from "@/hooks/use-reveal";
import { scheduleOnBrowserLoadIdle } from "@/lib/browser-idle";
import { initRouteMotion } from "@/lib/route-motion";
import type { SiteSettings } from "@/types/site-settings";
import type { ComponentType } from "react";
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";

const DeferredSonner = lazy(() =>
  import("@/components/ui/sonner").then((module) => ({ default: module.Toaster })),
);
const loadDashboardRoutes = () => import("./routes/DashboardRoutes");
const PublicRoutes = lazy(() => import("./routes/PublicRoutes"));
const PUBLIC_HOME_SCROLLBAR_GUTTER_CLASS = "public-home-scrollbar-gutter-stable";

const RouteLoadingFallback = () => <AppLoadingFallback label="Carregando..." />;
export { default as ScrollToTop } from "@/components/ScrollToTop";

const DashboardRoutesLoader = () => {
  const [DashboardRoutesComponent, setDashboardRoutesComponent] = useState<ComponentType | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void loadDashboardRoutes().then((module) => {
      if (!active) {
        return;
      }
      setDashboardRoutesComponent(() => module.default);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!DashboardRoutesComponent) {
    return <RouteLoadingFallback />;
  }

  return <DashboardRoutesComponent />;
};

const RouterShell = () => {
  const location = useLocation();
  useReveal();
  const isHomeRoute = location.pathname === "/";

  useLayoutEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const targets = [document.documentElement, document.body];

    targets.forEach((target) => {
      if (!target) {
        return;
      }
      target.classList.toggle(PUBLIC_HOME_SCROLLBAR_GUTTER_CLASS, isHomeRoute);
    });

    return () => {
      targets.forEach((target) => {
        if (!target) {
          return;
        }
        target.classList.remove(PUBLIC_HOME_SCROLLBAR_GUTTER_CLASS);
      });
    };
  }, [isHomeRoute]);

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes location={location}>
        <Route path="/dashboard/*" element={<DashboardRoutesLoader />} />
        <Route path="*" element={<PublicRoutes />} />
      </Routes>
    </Suspense>
  );
};

const DeferredToaster = () => {
  const [shouldRenderToaster, setShouldRenderToaster] = useState(false);

  useEffect(() => {
    const cancelIdle = scheduleOnBrowserLoadIdle(
      () => {
        setShouldRenderToaster(true);
      },
      { delayMs: 4000 },
    );
    return cancelIdle;
  }, []);

  if (!shouldRenderToaster) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <DeferredSonner />
    </Suspense>
  );
};

const App = ({
  initialSettings,
  initiallyLoaded,
}: {
  initialSettings?: SiteSettings;
  initiallyLoaded?: boolean;
}) => {
  useEffect(() => {
    return initRouteMotion();
  }, []);

  return (
    <AppProviders initialSettings={initialSettings} initiallyLoaded={initiallyLoaded}>
      <DeferredToaster />
      <BrowserRouter>
        <RoutedGlobalShortcutsProvider>
          <ScrollToTop />
          <RouterShell />
        </RoutedGlobalShortcutsProvider>
      </BrowserRouter>
    </AppProviders>
  );
};

export default App;
