import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { Outlet, useLocation } from "react-router-dom";

const PublicLayout = () => {
  const location = useLocation();
  const hasSurfaceGradient = location.pathname === "/projetos";
  const isReadingRoute = /^\/projeto(?:s)?\/.+\/leitura\/[^/]+/.test(location.pathname);
  const hidesChromeOnRoute = isReadingRoute;

  return (
    <>
      <a className="public-skip-link" href="#public-main-content">
        Pular para o conteúdo
      </a>
      <div
        className={`flex min-h-screen flex-col bg-background text-foreground${
          hasSurfaceGradient ? " bg-gradient-surface" : ""
        }`}
      >
        {hidesChromeOnRoute ? null : <Header variant="fixed" />}
        <main
          id="public-main-content"
          tabIndex={-1}
          className="a11y-focus-target flex-1 page-transition"
        >
          <Outlet />
        </main>
        {hidesChromeOnRoute ? null : <Footer />}
      </div>
    </>
  );
};

export default PublicLayout;
