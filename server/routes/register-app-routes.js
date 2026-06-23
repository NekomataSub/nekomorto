import { isReservedPublicPath } from "../../shared/public-paths.js";
import {
  PUBLIC_ROUTE_KIND_NOT_FOUND,
  resolvePublicRouteKind,
} from "../../shared/public-route-registry.js";

const buildNotFoundHtml = (html) => {
  let nextHtml = String(html || "");
  nextHtml = nextHtml.replace(/<title>.*?<\/title>/i, "<title>Página não encontrada</title>");
  const robotsTag = '<meta name="robots" content="noindex, nofollow" />';
  if (/<meta[^>]*name=["']robots["'][^>]*>/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<meta[^>]*name=["']robots["'][^>]*>/i, robotsTag);
  } else {
    nextHtml = nextHtml.replace("</head>", `  ${robotsTag}\n</head>`);
  }
  return nextHtml;
};

const isKnownApplicationPath = (pathname) =>
  resolvePublicRouteKind(pathname) !== PUBLIC_ROUTE_KIND_NOT_FOUND ||
  /^\/dashboard(?:\/.*)?$/.test(String(pathname || ""));

export const registerAppRoutes = ({ app, sendHtml, getIndexHtml } = {}) => {
  app.get("/{*path}", async (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      return res.status(404).json({ error: "not_found" });
    }
    if (isReservedPublicPath(req.path)) {
      return res.status(404).end();
    }
    if (!isKnownApplicationPath(req.path)) {
      return await sendHtml(req, res.status(404), buildNotFoundHtml(getIndexHtml()));
    }
    try {
      return await sendHtml(req, res, getIndexHtml());
    } catch {
      return await sendHtml(req, res, getIndexHtml());
    }
  });
};
