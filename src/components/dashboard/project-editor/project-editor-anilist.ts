import { deriveAniListMediaOrganization } from "@/lib/anilist-media";
import { extractPlainTextFromHtml } from "@/lib/html-text";
import { translateRelation } from "@/lib/project-taxonomy";
import type {
  AniListMedia,
  ProjectForm,
  ProjectRecord,
  ProjectRelation,
  ProjectStaff,
} from "./dashboard-projects-editor-types";
import { normalizeUniqueStringList } from "./project-editor-form";

const formatSeason = (season?: string | null, seasonYear?: number | null) => {
  if (!season && !seasonYear) {
    return "";
  }
  const translated = season
    ? season
        .toLowerCase()
        .replace("winter", "Inverno")
        .replace("spring", "Primavera")
        .replace("summer", "Verão")
        .replace("fall", "Outono")
    : "";
  return `${translated ? `${translated} ` : ""}${seasonYear || ""}`.trim();
};

const formatStatus = (status?: string | null) => {
  switch (status) {
    case "FINISHED":
      return "Finalizado";
    case "RELEASING":
      return "Em andamento";
    case "NOT_YET_RELEASED":
      return "Em andamento";
    case "CANCELLED":
      return "Cancelado";
    case "HIATUS":
      return "Pausado";
    default:
      return "";
  }
};

const formatType = (format?: string | null) => {
  switch (format) {
    case "TV":
      return "Anime";
    case "MOVIE":
      return "Filme";
    case "OVA":
      return "OVA";
    case "ONA":
      return "ONA";
    case "SPECIAL":
      return "Especial";
    case "MANGA":
      return "Mangá";
    case "NOVEL":
      return "Light Novel";
    case "ONE_SHOT":
      return "One-shot";
    case "MUSIC":
      return "Música";
    default:
      return "";
  }
};

const formatCountry = (country?: string | null) => {
  switch (country) {
    case "JP":
      return "Japão";
    case "KR":
      return "Coreia do Sul";
    case "CN":
      return "China";
    case "TW":
      return "Taiwan";
    default:
      return country || "";
  }
};

const stripHtml = (value?: string | null) =>
  extractPlainTextFromHtml(value, { preserveLineBreaks: true });

type BuildProjectFormPatchFromAniListArgs = {
  media: AniListMedia;
  previousForm: ProjectForm;
  projects: ProjectRecord[];
};

export const buildProjectFormPatchFromAniList = ({
  media,
  previousForm,
  projects,
}: BuildProjectFormPatchFromAniListArgs) => {
  const organization = media.organization || deriveAniListMediaOrganization(media);
  const studio = String(organization?.studio || "").trim();
  const animationStudios = normalizeUniqueStringList(organization?.animationStudios || []);
  const producers = normalizeUniqueStringList(organization?.producers || []);
  const tags = (media.tags || [])
    .filter((tag) => !tag.isMediaSpoiler)
    .sort((left, right) => (right.rank || 0) - (left.rank || 0))
    .slice(0, 8)
    .map((tag) => tag.name)
    .filter(Boolean);
  const relationEdges = media.relations?.edges || [];
  const relationNodes = media.relations?.nodes || [];
  const relationIdMap = new Map<number, string>();
  projects.forEach((item) => {
    if (item.anilistId) {
      relationIdMap.set(item.anilistId, item.id);
    }
    relationIdMap.set(Number(item.id), item.id);
  });
  const seenRelationIds = new Set<string>();
  const relations: ProjectRelation[] = relationNodes.reduce<ProjectRelation[]>(
    (acc, node, index) => {
      const projectId = relationIdMap.get(node.id) || "";
      const relationKey = projectId || String(node.id) || node.title?.romaji || "";
      if (relationKey && seenRelationIds.has(relationKey)) {
        return acc;
      }
      if (relationKey) {
        seenRelationIds.add(relationKey);
      }
      acc.push({
        relation: translateRelation(relationEdges[index]?.relationType || ""),
        title: node.title?.romaji || "",
        format: formatType(node.format || ""),
        status: formatStatus(node.status || ""),
        image: node.coverImage?.large || "",
        anilistId: node.id,
        projectId,
      });
      return acc;
    },
    [],
  );

  const staffEdges = media.staff?.edges || [];
  const staffNodes = media.staff?.nodes || [];
  const staffMap = new Map<string, string[]>();
  staffEdges.forEach((edge, index) => {
    const role = edge.role || "Equipe";
    const name = staffNodes[index]?.name?.full || "";
    if (!name) {
      return;
    }
    const list = staffMap.get(role) || [];
    list.push(name);
    staffMap.set(role, list);
  });
  const staff: ProjectStaff[] = Array.from(staffMap.entries()).map(([role, members]) => ({
    role,
    members,
  }));

  const startDate = media.startDate?.year
    ? `${media.startDate.year}-${String(media.startDate.month || 1).padStart(2, "0")}-${String(
        media.startDate.day || 1,
      ).padStart(2, "0")}`
    : "";
  const endDate = media.endDate?.year
    ? `${media.endDate.year}-${String(media.endDate.month || 1).padStart(2, "0")}-${String(
        media.endDate.day || 1,
      ).padStart(2, "0")}`
    : "";

  const trailerUrl =
    media.trailer?.id && media.trailer?.site
      ? media.trailer.site.toLowerCase() === "youtube"
        ? `https://www.youtube.com/watch?v=${media.trailer.id}`
        : media.trailer.site.toLowerCase() === "dailymotion"
          ? `https://www.dailymotion.com/video/${media.trailer.id}`
          : ""
      : "";

  const tagsFromMedia = (media.tags || [])
    .filter((tag) => !tag.isMediaSpoiler)
    .map((tag) => tag.name)
    .filter(Boolean);
  const genresFromMedia = (media.genres || []).filter(Boolean);
  const mergedSynopsis = stripHtml(media.description || "");

  return {
    patch: {
      id: previousForm.id || String(media.id),
      anilistId: media.id,
      title:
        media.title?.romaji || media.title?.english || media.title?.native || previousForm.title,
      titleOriginal: media.title?.native || previousForm.titleOriginal,
      titleEnglish: media.title?.english || previousForm.titleEnglish,
      synopsis: mergedSynopsis || previousForm.synopsis,
      description: mergedSynopsis || previousForm.description,
      type: formatType(media.format || "") || previousForm.type,
      status: formatStatus(media.status || "") || previousForm.status,
      year: media.seasonYear
        ? String(media.seasonYear)
        : media.startDate?.year
          ? String(media.startDate.year)
          : previousForm.year,
      studio: studio || previousForm.studio,
      animationStudios: animationStudios.length ? animationStudios : previousForm.animationStudios,
      episodes: media.episodes ? String(media.episodes) : previousForm.episodes,
      genres: genresFromMedia.length ? genresFromMedia : previousForm.genres,
      tags: tags.length ? tags : previousForm.tags,
      cover: media.coverImage?.extraLarge || media.coverImage?.large || previousForm.cover,
      banner: media.bannerImage || previousForm.banner,
      season: formatSeason(media.season, media.seasonYear) || previousForm.season,
      country: formatCountry(media.countryOfOrigin) || previousForm.country,
      source: media.source || previousForm.source,
      producers: producers.length ? producers : previousForm.producers,
      score:
        typeof media.averageScore === "number" && Number.isFinite(media.averageScore)
          ? media.averageScore
          : (previousForm.score ?? null),
      startDate: startDate || previousForm.startDate,
      endDate: endDate || previousForm.endDate,
      relations: relations.length ? relations : previousForm.relations,
      animeStaff: staff.length ? staff : previousForm.animeStaff,
      trailerUrl: trailerUrl || previousForm.trailerUrl,
    } satisfies Partial<ProjectForm>,
    syncGenres: genresFromMedia,
    syncTags: tagsFromMedia.length ? tagsFromMedia : tags,
  };
};
