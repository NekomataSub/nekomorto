import { Clock, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useMemo } from "react";

import PublicLink from "@/components/PublicLink";
import PublicInteractiveCardShell from "@/components/PublicInteractiveCardShell";
import UploadPicture from "@/components/UploadPicture";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicBootstrap } from "@/hooks/use-public-bootstrap";
import { formatDate } from "@/lib/date";
import { PROJECT_COVER_ASPECT_RATIO } from "@/lib/project-card-layout";
import {
  getPublicRoutePreloadHandlers,
  schedulePublicRouteIdlePreload,
} from "@/routes/public-preload";
import { cn } from "@/lib/utils";

const PT_DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const RECENT_UPDATES_CARD_HEIGHT_PX = 164;
const RECENT_UPDATES_THUMB_WIDTH = "calc(var(--card-h) * 9 / 14)";
const recentUpdateBasePillClassName = () =>
  cn(
    buttonVariants({ variant: "ghost", size: "pill" }),
    "pointer-events-none h-6 min-h-6 min-w-6 shrink-0 gap-0 rounded-full px-2 py-0 text-[10px] leading-none hover:border-current hover:bg-inherit hover:text-inherit focus-visible:border-current focus-visible:bg-inherit focus-visible:text-inherit",
  );
const recentUpdateNeutralPillClassName = "border-border/70 bg-background text-foreground/70";
const recentUpdateTypePillClassName = {
  launch: "border-primary/50 bg-primary/10 text-primary",
  adjustment: "border-amber-500/50 bg-amber-500/10 text-amber-400",
  fallback: "border-border/60 bg-background text-muted-foreground",
} as const;

const normalizeLookupKey = (value: string) =>
  String(value || "")
    .normalize("NFD")
    .replace(PT_DIACRITICS_REGEX, "")
    .trim()
    .toLowerCase();

const applyReplacementWithCase = (input: string, replacement: string) => {
  const source = String(input || "");
  if (!source) {
    return replacement;
  }
  if (source === source.toUpperCase()) {
    return replacement.toUpperCase();
  }
  const first = source.charAt(0);
  const rest = source.slice(1);
  if (first === first.toUpperCase() && rest === rest.toLowerCase()) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`;
  }
  return replacement;
};

const LEGACY_REASON_WORD_REPLACEMENTS: Array<{ from: string; to: string }> = [
  { from: "lancamento", to: "lançamento" },
  { from: "capitulo", to: "capítulo" },
  { from: "episodio", to: "episódio" },
  { from: "disponivel", to: "disponível" },
  { from: "conteudo", to: "conteúdo" },
  { from: "atualizacoes", to: "atualizações" },
  { from: "atualizacao", to: "atualização" },
];

const normalizeReasonForDisplay = (value: string) =>
  LEGACY_REASON_WORD_REPLACEMENTS.reduce(
    (result, item) => {
      const regex = new RegExp(`\\b${item.from}\\b`, "gi");
      return result.replace(regex, (match) => applyReplacementWithCase(match, item.to));
    },
    String(value || ""),
  );

const LatestEpisodeCard = () => {
  const { data: bootstrapData, isLoading } = usePublicBootstrap();
  const recentUpdates = useMemo(() => bootstrapData?.updates || [], [bootstrapData?.updates]);
  const mediaVariants = bootstrapData?.mediaVariants || {};
  const isLoadingUpdates = isLoading && !bootstrapData;
  const projectTypes = useMemo(() => {
    const map: Record<string, string> = {};
    (bootstrapData?.projects || []).forEach((project) => {
      if (project?.id) {
        map[String(project.id)] = String(project.type || "");
      }
    });
    return map;
  }, [bootstrapData?.projects]);
  const sortedRecentUpdates = useMemo(
    () =>
      [...recentUpdates]
        .map((update) => ({
          update,
          timestamp: new Date(update.updatedAt || 0).getTime(),
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 4)
        .map(({ update }) => update),
    [recentUpdates],
  );

  useEffect(() => {
    return schedulePublicRouteIdlePreload(
      sortedRecentUpdates.map((update) => `/projeto/${update.projectId}`),
      { delayMs: 650 },
    );
  }, [sortedRecentUpdates]);

  return (
    <Card
      lift={false}
      className="bg-card reveal overflow-hidden rounded-lg border border-border/60 shadow-none"
      data-reveal
    >
      <CardHeader className="px-4 pb-3 pt-4">
        <CardTitle className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          Atualizações Recentes
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Novos links ou ajustes em episódios/capítulos publicados.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4 pt-0">
        {isLoadingUpdates ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`update-skeleton-${index}`}
                style={
                  {
                    "--card-h": `${RECENT_UPDATES_CARD_HEIGHT_PX}px`,
                    height: `${RECENT_UPDATES_CARD_HEIGHT_PX}px`,
                  } as CSSProperties
                }
                className="flex overflow-hidden rounded-2xl bg-background/40"
              >
                <Skeleton
                  className="h-full shrink-0"
                  style={{
                    aspectRatio: PROJECT_COVER_ASPECT_RATIO,
                    width: RECENT_UPDATES_THUMB_WIDTH,
                  }}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : recentUpdates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-background/50 p-4 text-xs text-muted-foreground">
            Nenhuma atualização recente cadastrada.
          </div>
        ) : (
          <div className="space-y-3">
            {sortedRecentUpdates.map((update) => {
              const typeLabel = (projectTypes[update.projectId] || "").toLowerCase();
              const hasChapterHint =
                /cap/i.test(update.unit || "") || /cap/i.test(update.reason || "");
              const isChapterBased =
                typeLabel.includes("mang") ||
                typeLabel.includes("webtoon") ||
                typeLabel.includes("light") ||
                typeLabel.includes("novel") ||
                hasChapterHint;
              const rawUnitLabel = String(update.unit || "").trim();
              const unitLookup = normalizeLookupKey(rawUnitLabel);
              const unitLabel = rawUnitLabel
                ? unitLookup === "capitulo"
                  ? "Capítulo"
                  : unitLookup === "episodio"
                    ? "Episódio"
                    : rawUnitLabel
                : isChapterBased
                  ? "Capítulo"
                  : "Episódio";
              const isExtraUnit = unitLabel.toLowerCase() === "extra";
              const unitShort = isExtraUnit ? "Extra" : /cap/i.test(unitLabel) ? "Cap" : "Ep";
              const normalizedReason = normalizeReasonForDisplay(String(update.reason || ""));
              const reason = normalizedReason
                ? normalizedReason.charAt(0).toUpperCase() + normalizedReason.slice(1)
                : "";
              const normalizedKind = normalizeLookupKey(String(update.kind || ""));
              const kindLabel = normalizedKind.startsWith("lan")
                ? "Lançamento"
                : normalizedKind.includes("ajuste") || normalizedKind.includes("atualiza")
                  ? "Ajuste"
                  : update.kind;

              return (
                <PublicInteractiveCardShell
                  key={update.id}
                  shadowPreset="none"
                  style={
                    {
                      "--card-h": `${RECENT_UPDATES_CARD_HEIGHT_PX}px`,
                    } as CSSProperties
                  }
                  className="group/recent-update rounded-2xl"
                >
                  <PublicLink
                    href={`/projeto/${update.projectId}`}
                    className="recent-updates-item relative z-10 rounded-2xl transition-[border-color,background-color,color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-primary/60 focus-visible:border-primary/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary/45"
                    {...getPublicRoutePreloadHandlers(`/projeto/${update.projectId}`)}
                  >
                    <div
                      className="h-full shrink-0 overflow-hidden bg-secondary/60"
                      style={{
                        aspectRatio: PROJECT_COVER_ASPECT_RATIO,
                        width: RECENT_UPDATES_THUMB_WIDTH,
                      }}
                    >
                      <UploadPicture
                        src={update.image || "/placeholder.svg"}
                        alt={update.projectTitle}
                        preset="posterThumbSm"
                        mediaVariants={mediaVariants}
                        sizes="105px"
                        className="block h-full w-full"
                        imgClassName="home-card-media-transition h-full w-full object-cover object-center"
                      />
                    </div>
                    <div className="recent-updates-item-body flex h-full min-w-0 flex-1 flex-col gap-3">
                      <div className="no-scrollbar flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto md:flex-wrap md:overflow-visible">
                        <span
                          className={cn(
                            recentUpdateBasePillClassName(),
                            recentUpdateNeutralPillClassName,
                            "hidden md:inline-flex",
                          )}
                        >
                          {isExtraUnit ? "Extra" : `${unitShort} ${update.episodeNumber}`}
                        </span>
                        {update.volume ? (
                          <span
                            className={cn(
                              recentUpdateBasePillClassName(),
                              recentUpdateNeutralPillClassName,
                              "hidden md:inline-flex",
                            )}
                          >
                            Vol. {update.volume}
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            recentUpdateBasePillClassName(),
                            kindLabel === "Lançamento"
                              ? recentUpdateTypePillClassName.launch
                              : kindLabel === "Ajuste"
                                ? recentUpdateTypePillClassName.adjustment
                                : recentUpdateTypePillClassName.fallback,
                          )}
                        >
                          {kindLabel}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <h4 className="clamp-safe-2 interactive-content-transition text-sm font-semibold text-foreground group-hover/recent-update:text-primary group-focus-within/recent-update:text-primary">
                          {update.projectTitle}
                        </h4>
                        <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground md:line-clamp-2">
                          {reason}
                        </p>
                      </div>
                      <span className="mt-auto inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3 text-primary/70" aria-hidden="true" />
                        {formatDate(update.updatedAt.split("T")[0])}
                      </span>
                    </div>
                  </PublicLink>
                </PublicInteractiveCardShell>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LatestEpisodeCard;
