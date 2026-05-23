import { isReservedPublicPath } from "../../shared/public-paths.js";

export const registerAppRoutes = ({ app, sendHtml, getIndexHtml } = {}) => {
  app.get("/{*path}", async (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth")) {
      return res.status(404).json({ error: "not_found" });
    }
    if (isReservedPublicPath(req.path)) {
      return res.status(404).end();
    }
    try {
      return await sendHtml(req, res, getIndexHtml());
    } catch {
      return await sendHtml(req, res, getIndexHtml());
    }
  });
};
