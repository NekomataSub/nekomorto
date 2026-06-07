import { resolveProjectPosterPreload } from "./public-media-variants.js";

export const PROJECTS_LIST_IMAGE_SIZES = "(max-width: 767px) 129px, 154px";
export const PROJECTS_PRELOAD_LIMIT = 6;
export const DESKTOP_PROJECTS_PRELOAD_MEDIA = "(min-width: 768px)";

export const sortProjectsForPublicList = (projects) =>
  [...(Array.isArray(projects) ? projects : [])].sort((left, right) =>
    String(left?.title || "").localeCompare(String(right?.title || ""), "pt-BR"),
  );

export const resolvePublicProjectsListPreloads = ({
  projects,
  mediaVariants,
  resolveVariantUrl,
  imagesizes = PROJECTS_LIST_IMAGE_SIZES,
  limit = PROJECTS_PRELOAD_LIMIT,
} = {}) =>
  sortProjectsForPublicList(projects)
    .slice(0, Math.max(0, Number(limit) || PROJECTS_PRELOAD_LIMIT))
    .map((project, index) => {
      const preload = resolveProjectPosterPreload({
        coverUrl: project?.cover || "",
        mediaVariants,
        resolveVariantUrl,
        imagesizes,
      });
      if (!preload) {
        return null;
      }
      const sourceCover = String(project?.cover || "").trim();
      if (sourceCover && String(preload.href || "").trim() === sourceCover) {
        return null;
      }
      if (index === 0) {
        return { ...preload, fetchpriority: "high" };
      }
      return {
        ...preload,
        fetchpriority: "high",
        media: DESKTOP_PROJECTS_PRELOAD_MEDIA,
      };
    })
    .filter(Boolean);
