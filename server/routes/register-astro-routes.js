export const ASTRO_PUBLIC_ROUTE_PATHS = Object.freeze([
  "/",
  "/projetos",
  "/projeto/:id",
  "/projeto/:id/leitura/:chapter",
  "/postagem/:slug",
  "/sobre",
  "/faq",
  "/equipe",
  "/doacoes",
  "/recrutamento",
  "/termos-de-uso",
  "/politica-de-privacidade",
  "/login",
]);

export const ASTRO_DASHBOARD_ROUTE_PATHS = Object.freeze(["/dashboard", "/dashboard/{*path}"]);

export const ASTRO_CLIENT_ROUTER_PUBLIC_ROUTE_PATHS = Object.freeze([
  "/",
  "/projetos",
  "/projeto/:id",
  "/postagem/:slug",
  "/sobre",
  "/faq",
  "/equipe",
  "/doacoes",
  "/recrutamento",
  "/termos-de-uso",
  "/politica-de-privacidade",
  "/login",
]);

const normalizePathname = (value) => {
  const pathname = String(value || "").trim();
  if (!pathname) {
    return "";
  }
  const stripped = pathname.replace(/\/+$/, "");
  return stripped || "/";
};

export const isAstroPublicRoute = (pathname) => {
  const normalized = normalizePathname(pathname);
  return (
    ASTRO_PUBLIC_ROUTE_PATHS.includes(normalized) ||
    /^\/dashboard(?:\/.*)?$/.test(normalized) ||
    /^\/projeto\/[^/]+\/leitura\/[^/]+$/.test(normalized) ||
    /^\/projeto\/[^/]+$/.test(normalized) ||
    /^\/postagem\/[^/]+$/.test(normalized)
  );
};

export const isAstroClientRouterPublicRoute = (pathname) => {
  const normalized = normalizePathname(pathname);
  return (
    ASTRO_CLIENT_ROUTER_PUBLIC_ROUTE_PATHS.includes(normalized) ||
    /^\/projeto\/[^/]+$/.test(normalized) ||
    /^\/postagem\/[^/]+$/.test(normalized)
  );
};

export const registerAstroRoutes = ({ app, handleAstroPublicRequest } = {}) => {
  const handleAstroRoute = async (req, res, next) => {
    if (typeof handleAstroPublicRequest !== "function") {
      return next();
    }
    try {
      return await handleAstroPublicRequest(req, res, next);
    } catch (error) {
      return next(error);
    }
  };

  app.get(ASTRO_PUBLIC_ROUTE_PATHS, handleAstroRoute);
  app.get(ASTRO_DASHBOARD_ROUTE_PATHS, handleAstroRoute);
};

export default registerAstroRoutes;
