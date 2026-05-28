import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import PublicProjectCard, {
  PUBLIC_PROJECT_CARD_CLAMP_PROFILES,
  resolvePublicProjectCardClampState,
  resolvePublicProjectCardResponsiveMaxLines,
} from "@/components/project/PublicProjectCard";
import { Combobox } from "@/components/public-form-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicBootstrap } from "@/hooks/use-public-bootstrap";
import { comparePtBr } from "@/lib/search-ranking";

const TOP_PROJECTS_LIMIT = 10;
const TOP_PROJECTS_LAST_7_DAYS = 7;
const TOP_PROJECTS_LAST_30_DAYS = 30;
const TOP_PROJECTS_CARD_HEIGHT_PX = 164;
const TOP_PROJECTS_GAP_PX = 12;
const TOP_PROJECTS_THUMB_ASPECT_RATIO = "9 / 14";
const sidebarClampProfile = PUBLIC_PROJECT_CARD_CLAMP_PROFILES.sidebar;

type TopProjectsMode = "all" | "7d" | "30d";

const topProjectsModeOptions = [
  { value: "all", label: "Sempre" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const DAY_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toSafeNonNegativeInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const buildRecentUtcDayKeys = (days: number, now = new Date()) => {
  const keys: string[] = [];
  const endDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(endDate);
    day.setUTCDate(endDate.getUTCDate() - offset);
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
};

const resolveReferenceDate = (value: string | undefined) => {
  const parsedTime = Date.parse(String(value || ""));
  if (!Number.isFinite(parsedTime)) {
    return new Date();
  }
  return new Date(parsedTime);
};

const sumViewsByDayKeys = (viewsDaily: Record<string, number>, dayKeys: string[]) => {
  if (!viewsDaily || typeof viewsDaily !== "object") {
    return 0;
  }
  let total = 0;
  dayKeys.forEach((dayKey) => {
    total += toSafeNonNegativeInt(viewsDaily[dayKey]);
  });
  return total;
};

const TopProjectsSection = () => {
  const [mode, setMode] = useState<TopProjectsMode>("all");
  const { data: bootstrapData, isLoading } = usePublicBootstrap();
  const projects = bootstrapData?.projects || [];
  const mediaVariants = bootstrapData?.mediaVariants || {};
  const isLoadingProjects = isLoading && !bootstrapData;
  const numberFormatter = useMemo(() => new Intl.NumberFormat("pt-BR"), []);
  const referenceDate = useMemo(
    () => resolveReferenceDate(bootstrapData?.generatedAt),
    [bootstrapData?.generatedAt],
  );
  const listLayoutStyle = {
    "--top-card-h": `${TOP_PROJECTS_CARD_HEIGHT_PX}px`,
    "--top-gap": `${TOP_PROJECTS_GAP_PX}px`,
  } as CSSProperties;

  const topProjects = useMemo(() => {
    const dayKeys7d = buildRecentUtcDayKeys(TOP_PROJECTS_LAST_7_DAYS, referenceDate);
    const dayKeys30d = buildRecentUtcDayKeys(TOP_PROJECTS_LAST_30_DAYS, referenceDate);
    return projects
      .map((project) => {
        const id = String(project?.id || "").trim();
        const title = String(project?.title || "").trim();
        const viewsAll = toSafeNonNegativeInt(project?.views);
        const normalizedViewsDaily =
          project?.viewsDaily && typeof project.viewsDaily === "object"
            ? Object.entries(project.viewsDaily).reduce<Record<string, number>>(
                (result, [rawDay, rawViews]) => {
                  const day = String(rawDay || "").trim();
                  if (!DAY_KEY_REGEX.test(day)) {
                    return result;
                  }
                  result[day] = toSafeNonNegativeInt(rawViews);
                  return result;
                },
                {},
              )
            : {};
        const views7d = sumViewsByDayKeys(normalizedViewsDaily, dayKeys7d);
        const views30d = sumViewsByDayKeys(normalizedViewsDaily, dayKeys30d);
        return {
          project,
          id,
          title,
          viewsAll,
          views7d,
          views30d,
        };
      })
      .filter((item) => item.id && item.title)
      .sort((left, right) => {
        const leftMetric =
          mode === "30d" ? left.views30d : mode === "7d" ? left.views7d : left.viewsAll;
        const rightMetric =
          mode === "30d" ? right.views30d : mode === "7d" ? right.views7d : right.viewsAll;
        if (rightMetric !== leftMetric) {
          return rightMetric - leftMetric;
        }
        if (right.viewsAll !== left.viewsAll) {
          return right.viewsAll - left.viewsAll;
        }
        return comparePtBr(left.title, right.title);
      })
      .slice(0, TOP_PROJECTS_LIMIT);
  }, [mode, projects, referenceDate]);

  const defaultSynopsisClampState = resolvePublicProjectCardClampState({
    profile: sidebarClampProfile,
    lines: resolvePublicProjectCardResponsiveMaxLines({
      profile: sidebarClampProfile,
      columnWidth: 280,
      defaultMaxLines: sidebarClampProfile.defaultMaxLines,
    }),
  });

  return (
    <Card
      id="top-projetos"
      lift={false}
      className="bg-card reveal rounded-lg border border-border/60 shadow-none"
      data-reveal
    >
      <CardHeader className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold text-foreground">
            Projetos Populares
          </CardTitle>
          <Combobox
            value={mode}
            onValueChange={(value) =>
              setMode(value === "30d" ? "30d" : value === "7d" ? "7d" : "all")
            }
            ariaLabel="Ordenar Top 10 por visualizacoes"
            options={topProjectsModeOptions}
            searchable={false}
            variant="compact"
            dataTestId="top-projects-mode-trigger"
            className="h-8 w-[108px] bg-background/70 px-2.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground sm:w-[112px]"
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        {isLoadingProjects ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={`top-projects-skeleton-${index}`}
                className="rounded-2xl bg-background/40 p-4"
              >
                <div className="flex gap-4">
                  <Skeleton
                    className="h-32 shrink-0 rounded-xl"
                    style={{ aspectRatio: TOP_PROJECTS_THUMB_ASPECT_RATIO }}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : topProjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/50 p-4 text-xs text-muted-foreground">
            Ainda sem dados de visualizacao.
          </div>
        ) : (
          <div className="top-projects-viewport">
            <div
              data-testid="top-projects-scroll-region"
              style={listLayoutStyle}
              className="top-projects-scroll-region no-scrollbar"
            >
              <div data-testid="top-projects-list" className="top-projects-list">
                {topProjects.map((entry, index) => {
                  const metricValue =
                    mode === "30d"
                      ? entry.views30d
                      : mode === "7d"
                        ? entry.views7d
                        : entry.viewsAll;
                  return (
                    <PublicProjectCard
                      key={entry.id}
                      variant="sidebar"
                      testIdBase={`top-project-item-${index + 1}`}
                      shellClassName="group/top-project-item rounded-2xl"
                      model={{
                        href: `/projeto/${entry.id}`,
                        title: entry.title,
                        coverSrc: entry.project.cover || "/placeholder.svg",
                        coverAlt: entry.title,
                        mediaVariants,
                        eyebrow: entry.project.type || "Projeto",
                        synopsis:
                          entry.project.synopsis ||
                          entry.project.description ||
                          "Sem sinopse cadastrada.",
                        synopsisKey: entry.id,
                        synopsisLines: defaultSynopsisClampState.synopsisLines,
                        synopsisClampClass: defaultSynopsisClampState.synopsisClampClass,
                        trailingStats: [
                          {
                            key: "rank",
                            label: index + 1,
                            ariaLabel: `Posicao: ${index + 1}`,
                            icon: "hash",
                          },
                          {
                            key: "metric",
                            label: numberFormatter.format(metricValue),
                            ariaLabel: `Visualizacoes: ${numberFormatter.format(metricValue)}`,
                            icon: "eye",
                          },
                        ],
                      }}
                      imageSizes="96px"
                    />
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default TopProjectsSection;
