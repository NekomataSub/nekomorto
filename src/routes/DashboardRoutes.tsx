import { DashboardShellRoot } from "@/components/DashboardShell";
import AsyncState from "@/components/ui/async-state";
import { DashboardPreferencesProvider } from "@/hooks/dashboard-preferences-provider";
import { DashboardSessionProvider } from "@/hooks/dashboard-session-provider";
import "@/styles/project-editor.css";
import type { ReactNode } from "react";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

const RequireAuth = lazy(() => import("@/components/RequireAuth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const DashboardUsers = lazy(() => import("@/pages/DashboardUsers"));
const DashboardPosts = lazy(() => import("@/pages/DashboardPosts"));
const DashboardProjectsEditor = lazy(() => import("@/pages/DashboardProjectsEditor"));
const DashboardProjectChapterEditor = lazy(() => import("@/pages/DashboardProjectChapterEditor"));
const DashboardProjectEpisodeEditor = lazy(() => import("@/pages/DashboardProjectEpisodeEditor"));
const DashboardComments = lazy(() => import("@/pages/DashboardComments"));
const DashboardUploads = lazy(() => import("@/pages/DashboardUploads"));
const DashboardAuditLog = lazy(() => import("@/pages/DashboardAuditLog"));
const DashboardAnalytics = lazy(() => import("@/pages/DashboardAnalytics"));
const DashboardPages = lazy(() => import("@/pages/DashboardPages"));
const DashboardSettings = lazy(() => import("@/pages/DashboardSettings"));
const DashboardRedirects = lazy(() => import("@/pages/DashboardRedirects"));
const DashboardWebhooks = lazy(() => import("@/pages/DashboardWebhooks"));
const DashboardSecurity = lazy(() => import("@/pages/DashboardSecurity"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const PageTransition = ({ children }: { children: ReactNode }) => (
  <div className="page-transition">{children}</div>
);

const DashboardRouteContentFallback = () => (
  <PageTransition>
    <main className="mx-auto flex min-h-[45vh] w-full max-w-7xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
      <AsyncState
        kind="loading"
        title="Carregando seção"
        description="Preparando o painel solicitado."
        className="w-full max-w-2xl"
      />
    </main>
  </PageTransition>
);

const withPageTransition = (page: ReactNode) => <PageTransition>{page}</PageTransition>;

const DashboardProtectedRoutes = () => (
  <RequireAuth>
    <DashboardShellRoot>
      <Suspense fallback={<DashboardRouteContentFallback />}>
        <Routes>
          <Route index element={withPageTransition(<Dashboard />)} />
          <Route path="usuarios" element={withPageTransition(<DashboardUsers />)} />
          <Route path="posts" element={withPageTransition(<DashboardPosts />)} />
          <Route path="projetos" element={withPageTransition(<DashboardProjectsEditor />)} />
          <Route
            path="projetos/:projectId/episodios"
            element={withPageTransition(<DashboardProjectEpisodeEditor />)}
          />
          <Route
            path="projetos/:projectId/episodios/:episodeNumber"
            element={withPageTransition(<DashboardProjectEpisodeEditor />)}
          />
          <Route
            path="projetos/:projectId/capitulos"
            element={withPageTransition(<DashboardProjectChapterEditor />)}
          />
          <Route
            path="projetos/:projectId/capitulos/:chapterNumber"
            element={withPageTransition(<DashboardProjectChapterEditor />)}
          />
          <Route path="comentarios" element={withPageTransition(<DashboardComments />)} />
          <Route path="uploads" element={withPageTransition(<DashboardUploads />)} />
          <Route path="analytics" element={withPageTransition(<DashboardAnalytics />)} />
          <Route path="audit-log" element={withPageTransition(<DashboardAuditLog />)} />
          <Route path="paginas" element={withPageTransition(<DashboardPages />)} />
          <Route path="configuracoes" element={withPageTransition(<DashboardSettings />)} />
          <Route path="redirecionamentos" element={withPageTransition(<DashboardRedirects />)} />
          <Route path="webhooks" element={withPageTransition(<DashboardWebhooks />)} />
          <Route path="seguranca" element={withPageTransition(<DashboardSecurity />)} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </DashboardShellRoot>
  </RequireAuth>
);

const DashboardRoutes = () => (
  <DashboardSessionProvider>
    <DashboardPreferencesProvider>
      <DashboardProtectedRoutes />
    </DashboardPreferencesProvider>
  </DashboardSessionProvider>
);

export default DashboardRoutes;
