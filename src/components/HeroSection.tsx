import heroImageAvif from "@/assets/hero-illya.avif";
import heroImageJpg from "@/assets/hero-illya.jpg";
import heroImageWebp from "@/assets/hero-illya.webp";
import PublicLink from "@/components/PublicLink";
import UploadPicture from "@/components/UploadPicture";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { usePublicBootstrap } from "@/hooks/use-public-bootstrap";
import { scheduleOnBrowserIdle } from "@/lib/browser-idle";
import { HOME_HERO_READY_EVENT, PUBLIC_HOME_HERO_VIEWPORT_CLASS } from "@/lib/home-hero";
import type { UploadMediaVariantsMap } from "@/lib/upload-variants";
import type {
  PublicBootstrapHomeHeroSlide,
  PublicBootstrapProject,
  PublicBootstrapUpdate,
} from "@/types/public-bootstrap";
import { ChevronLeft, ChevronRight, Globe, Play } from "lucide-react";
import * as React from "react";

import { usePublicRoutePreload } from "@/routes/use-public-route-preload";
import "./HeroSection.css";
type HeroSlide = PublicBootstrapHomeHeroSlide & {
  optimizedImageSet?: {
    avif: string;
    webp: string;
    jpg: string;
  };
};

const heroSlidesSeed: HeroSlide[] = [
  {
    id: "prisma-illya",
    title: "Fate/Kaleid Liner Prisma Illya",
    description:
      "Illya (Illyasviel von Einzbern) é uma típica estudante do Instituto Homurabara que tem uma quedinha por seu cunhado. Certa noite, uma varinha de condão chamada Cajado Rubi cai do céu em sua banheira e a faz assinar um contrato...",
    updatedAt: "2024-01-28T12:00:00Z",
    image: heroImageJpg,
    projectId: "aurora-no-horizonte",
    trailerUrl: "",
    format: "Anime",
    status: "Em andamento",
    heroLogoUrl: "",
    heroLogoAlt: "",
    optimizedImageSet: {
      avif: heroImageAvif,
      webp: heroImageWebp,
      jpg: heroImageJpg,
    },
  },
  {
    id: "spy-family",
    title: "Spy x Family",
    description:
      "Loid precisa montar uma família falsa para cumprir a missão mais delicada de sua carreira. Entre uma espiã e uma telepata, tudo pode dar errado e ficar ainda mais divertido.",
    updatedAt: "2024-01-25T12:00:00Z",
    image: heroImageJpg,
    projectId: "rainbow-pulse",
    trailerUrl: "",
    format: "Anime",
    status: "Em andamento",
    heroLogoUrl: "",
    heroLogoAlt: "",
    optimizedImageSet: {
      avif: heroImageAvif,
      webp: heroImageWebp,
      jpg: heroImageJpg,
    },
  },
  {
    id: "jujutsu-kaisen",
    title: "Jujutsu Kaisen",
    description:
      "Yuji Itadori se envolve com maldições perigosas e encontra novos aliados na Escola Jujutsu. Cada episódio é uma luta intensa, cheia de energia e emoção.",
    updatedAt: "2024-01-22T12:00:00Z",
    image: heroImageJpg,
    projectId: "iris-black",
    trailerUrl: "",
    format: "Anime",
    status: "Em andamento",
    heroLogoUrl: "",
    heroLogoAlt: "",
    optimizedImageSet: {
      avif: heroImageAvif,
      webp: heroImageWebp,
      jpg: heroImageJpg,
    },
  },
  {
    id: "frieren",
    title: "Frieren",
    description:
      "Após a derrota do Rei Demônio, Frieren parte em uma jornada que combina nostalgia e descobertas sobre a vida humana. Um roteiro sensível e contemplativo a cada episódio.",
    updatedAt: "2024-01-20T12:00:00Z",
    image: heroImageJpg,
    projectId: "jardim-das-marés",
    trailerUrl: "",
    format: "Anime",
    status: "Em andamento",
    heroLogoUrl: "",
    heroLogoAlt: "",
    optimizedImageSet: {
      avif: heroImageAvif,
      webp: heroImageWebp,
      jpg: heroImageJpg,
    },
  },
  {
    id: "oshi-no-ko",
    title: "Oshi no Ko",
    description:
      "Nos bastidores do entretenimento, a história mistura idol, fama e mistérios. Cada episódio revela mais sobre o brilho e as sombras do estrelato.",
    updatedAt: "2024-01-18T12:00:00Z",
    image: heroImageJpg,
    projectId: "nova-primavera",
    trailerUrl: "",
    format: "Anime",
    status: "Em andamento",
    heroLogoUrl: "",
    heroLogoAlt: "",
    optimizedImageSet: {
      avif: heroImageAvif,
      webp: heroImageWebp,
      jpg: heroImageJpg,
    },
  },
];

const sortLaunchUpdates = (updates: PublicBootstrapUpdate[]) =>
  [...updates]
    .filter((update) => {
      const kind = String(update.kind || "").toLowerCase();
      return kind === "lançamento" || kind === "lancamento";
    })
    .map((update) => ({
      update,
      timestamp: new Date(update.updatedAt || 0).getTime(),
    }))
    .sort((a, b) => b.timestamp - a.timestamp)
    .map(({ update }) => update);

const buildHeroSlides = (
  projects: PublicBootstrapProject[],
  updates: PublicBootstrapUpdate[],
): HeroSlide[] => {
  const launchUpdates = sortLaunchUpdates(updates);
  const latestLaunchByProject = new Map<string, string>();
  launchUpdates.forEach((update) => {
    const projectId = String(update.projectId || "");
    if (!projectId || latestLaunchByProject.has(projectId)) {
      return;
    }
    latestLaunchByProject.set(projectId, update.updatedAt || "");
  });

  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const resultIds = new Set<string>();
  const slides: HeroSlide[] = [];
  const maxSlides = 5;
  const epoch = "1970-01-01T00:00:00.000Z";
  const createSlide = (project: PublicBootstrapProject, updatedAt?: string) => {
    if (resultIds.has(project.id)) {
      return null;
    }
    const image = project.heroImageUrl || project.banner || project.cover || "";
    if (!image) {
      return null;
    }
    return {
      id: project.id,
      title: project.title,
      description: project.synopsis || project.description || "",
      updatedAt: updatedAt || epoch,
      image,
      projectId: project.id,
      trailerUrl: project.trailerUrl || "",
      format: project.type || "",
      status: project.status || "",
      heroLogoUrl: project.heroLogoUrl || "",
      heroLogoAlt: project.heroLogoAlt || "",
    } satisfies HeroSlide;
  };

  const orderedProjects = projects
    .map((project, index) => {
      const updatedAt = latestLaunchByProject.get(project.id) || "";
      const time = updatedAt ? new Date(updatedAt).getTime() : 0;
      return { project, index, updatedAt, time };
    })
    .sort((a, b) => {
      if (b.time !== a.time) {
        return b.time - a.time;
      }
      return a.index - b.index;
    });

  orderedProjects.forEach((item) => {
    const slide = createSlide(item.project, item.updatedAt);
    if (!slide) {
      return;
    }
    if (slides.length < maxSlides) {
      slides.push(slide);
      resultIds.add(slide.id);
      return;
    }
    if (!item.project.forceHero) {
      return;
    }
    slides.push(slide);
    resultIds.add(slide.id);
    const removeIndexFromEnd = [...slides]
      .reverse()
      .findIndex((candidate) => !projectsById.get(candidate.id)?.forceHero);
    if (removeIndexFromEnd === -1) {
      const removed = slides.shift();
      if (removed) {
        resultIds.delete(removed.id);
      }
      return;
    }
    const removeIndex = slides.length - 1 - removeIndexFromEnd;
    const [removed] = slides.splice(removeIndex, 1);
    if (removed) {
      resultIds.delete(removed.id);
    }
  });

  if (slides.length > 0) {
    return slides;
  }
  return projects.length === 0 ? heroSlidesSeed : [];
};

const heroEntryDelayMs = {
  badge: 80,
  brand: 150,
  title: 220,
  synopsis: 320,
  actions: 420,
} as const;

const heroEntryDelayStyles = {
  badge: { animationDelay: `${heroEntryDelayMs.badge}ms` },
  brand: { animationDelay: `${heroEntryDelayMs.brand}ms` },
  title: { animationDelay: `${heroEntryDelayMs.title}ms` },
  synopsis: { animationDelay: `${heroEntryDelayMs.synopsis}ms` },
  actions: { animationDelay: `${heroEntryDelayMs.actions}ms` },
} as const satisfies Record<keyof typeof heroEntryDelayMs, React.CSSProperties>;

const composeHeroEntryClassName = (baseClassName: string, shouldAnimateEntry: boolean) =>
  shouldAnimateEntry ? `${baseClassName} animate-slide-up opacity-0` : baseClassName;

const resolveHeroEntryStyle = (
  key: keyof typeof heroEntryDelayStyles,
  shouldAnimateEntry: boolean,
) => (shouldAnimateEntry ? heroEntryDelayStyles[key] : undefined);

const heroDockButtonClassName = "hero-home__dock-button";

const transparentPixel = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

const usePrefersReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleChange();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  return prefersReducedMotion;
};

const formatDockCounter = (value: number) => String(value).padStart(2, "0");

const resolveHeroBrandFallback = (slide: HeroSlide) => {
  const parts = [slide.format, slide.status].filter(Boolean);
  if (parts.length > 0) {
    return parts.join(" • ");
  }
  return "Projeto em destaque";
};

const heroLogoWrapStyle = {
  maxWidth: "30rem",
} as const satisfies React.CSSProperties;

const heroLogoImageStyle = {
  filter: "drop-shadow(0 20px 44px rgba(0,0,0,0.42))",
} as const satisfies React.CSSProperties;

type HeroCarouselDockProps = {
  activeIndex: number;
  slideCount: number;
  onPreviousSlide: () => void;
  onNextSlide: () => void;
  onSelectSlide: (index: number) => void;
  className?: string;
  testIdSuffix: "mobile" | "desktop";
};

const HeroCarouselDock = ({
  activeIndex,
  slideCount,
  onPreviousSlide,
  onNextSlide,
  onSelectSlide,
  className,
  testIdSuffix,
}: HeroCarouselDockProps) => (
  <div
    data-testid={`hero-carousel-dock-${testIdSuffix}`}
    className={`hero-home__dock pointer-events-auto ${className || ""}`.trim()}
    role="group"
    aria-label="Navegação do carrossel da home"
  >
    <button
      type="button"
      aria-label="Slide anterior"
      className={heroDockButtonClassName}
      onClick={onPreviousSlide}
    >
      <ChevronLeft className="h-4 w-4" />
    </button>
    <div className="hero-home__indicators">
      {Array.from({ length: slideCount }, (_item, dotIndex) => {
        const isCurrent = dotIndex === activeIndex;
        return (
          <button
            key={`hero-dot-${testIdSuffix}-${dotIndex + 1}`}
            type="button"
            data-testid={`hero-carousel-indicator-${testIdSuffix}-${dotIndex}`}
            aria-label={`Ir para slide ${dotIndex + 1} de ${slideCount}`}
            aria-pressed={isCurrent}
            className={
              isCurrent
                ? "hero-home__indicator hero-home__indicator--current"
                : "hero-home__indicator"
            }
            onClick={() => onSelectSlide(dotIndex)}
          />
        );
      })}
    </div>
    <span
      data-testid={`hero-carousel-counter-${testIdSuffix}`}
      aria-live="polite"
      className="hero-home__counter"
    >
      {formatDockCounter(activeIndex + 1)}/{formatDockCounter(slideCount)}
    </span>
    <button
      type="button"
      aria-label="Próximo slide"
      className={heroDockButtonClassName}
      onClick={onNextSlide}
    >
      <ChevronRight className="h-4 w-4" />
    </button>
  </div>
);

type HeroSlideFrameProps = {
  slide: HeroSlide;
  index: number;
  activeIndex: number;
  latestSlideId: string;
  loadedSlideIds: Set<string>;
  mediaVariants: UploadMediaVariantsMap;
  heroViewportClass: string;
  clampSynopsis: (text: string, limit?: number) => string;
  shouldAnimateEntry?: boolean;
  isReadyCandidate?: boolean;
  priorityImageRef?: React.Ref<HTMLImageElement>;
  onPriorityImageLoad?: React.ReactEventHandler<HTMLImageElement>;
  onPriorityImageError?: React.ReactEventHandler<HTMLImageElement>;
  slideCount: number;
  onPreviousSlide: () => void;
  onNextSlide: () => void;
  onSelectSlide: (index: number) => void;
};

const HeroSlideFrame = ({
  slide,
  index,
  activeIndex,
  latestSlideId,
  loadedSlideIds,
  mediaVariants,
  heroViewportClass,
  clampSynopsis,
  shouldAnimateEntry = true,
  isReadyCandidate = false,
  priorityImageRef,
  onPriorityImageLoad,
  onPriorityImageError,
  slideCount,
  onPreviousSlide,
  onNextSlide,
  onSelectSlide,
}: HeroSlideFrameProps) => {
  const isPrioritySlide = index === 0 || index === activeIndex;
  const shouldLoadImage = loadedSlideIds.has(slide.id) || isPrioritySlide;
  const projectHref = `/projeto/${slide.projectId}`;
  const { preloadHandlers, viewportRef } = usePublicRoutePreload(projectHref, {
    enableIdle: true,
    enableViewport: true,
    idleDelayMs: 250,
    rootMargin: "480px 0px",
  });
  const loading = isPrioritySlide ? "eager" : "lazy";
  const imagePriorityProps = {
    fetchPriority: isPrioritySlide ? "high" : "auto",
  } as const;
  const readyImageRef = isReadyCandidate ? priorityImageRef : undefined;
  const readyImageProps = isReadyCandidate
    ? {
        onLoad: onPriorityImageLoad,
        onError: onPriorityImageError,
      }
    : {};
  const hasBrandLogo = Boolean(slide.heroLogoUrl);

  return (
    <div className={`relative flex items-end overflow-hidden ${heroViewportClass}`}>
      <div className="absolute inset-0">
        {slide.optimizedImageSet ? (
          <picture>
            <source
              type="image/avif"
              srcSet={shouldLoadImage ? slide.optimizedImageSet.avif : undefined}
            />
            <source
              type="image/webp"
              srcSet={shouldLoadImage ? slide.optimizedImageSet.webp : undefined}
            />
            <img
              ref={readyImageRef}
              src={shouldLoadImage ? slide.optimizedImageSet.jpg : transparentPixel}
              alt=""
              aria-hidden="true"
              className="h-full w-full object-cover object-center"
              loading={loading}
              decoding="async"
              {...readyImageProps}
              {...imagePriorityProps}
            />
          </picture>
        ) : (
          <UploadPicture
            src={shouldLoadImage ? slide.image : transparentPixel}
            alt=""
            preset="hero"
            mediaVariants={shouldLoadImage ? mediaVariants : undefined}
            applyFocalObjectPosition
            className="h-full w-full"
            imgClassName="h-full w-full object-cover object-center"
            imgRef={readyImageRef}
            aria-hidden="true"
            loading={loading}
            decoding="async"
            {...readyImageProps}
            {...imagePriorityProps}
          />
        )}
      </div>

      <div className="hero-home__visual-overlay hero-home__visual-overlay--highlight" />
      <div className="hero-home__visual-overlay hero-home__visual-overlay--directional" />
      <div className="hero-home__visual-overlay hero-home__visual-overlay--bottom" />
      <div data-testid="hero-navbar-overlay" className="hero-home__navbar-overlay" />

      <div className="hero-home__content">
        <div className="hero-home__grid">
          <div className="hero-home__copy">
            {hasBrandLogo ? (
              <div className="hero-home__brand-slot hero-home__brand-slot--top">
                <div
                  className={composeHeroEntryClassName("hero-home__brand", shouldAnimateEntry)}
                  style={{
                    ...heroLogoWrapStyle,
                    ...resolveHeroEntryStyle("brand", shouldAnimateEntry),
                  }}
                >
                  <UploadPicture
                    src={slide.heroLogoUrl}
                    alt={slide.heroLogoAlt || `Marca oficial de ${slide.title}`}
                    preset="cardHomeXs"
                    mediaVariants={mediaVariants}
                    sizes="(max-width: 768px) min(72vw, 22rem), 387px"
                    className="hero-home__brand-picture"
                    imgClassName="hero-home__brand-image"
                    style={heroLogoImageStyle}
                    loading={isPrioritySlide ? "eager" : "lazy"}
                    decoding="async"
                    fetchPriority={isPrioritySlide ? "high" : "auto"}
                  />
                </div>
              </div>
            ) : null}

            <div data-testid={`hero-slide-meta-${slide.id}`} className="hero-home__meta">
              {slide.id === latestSlideId ? (
                <span
                  data-testid={`hero-slide-latest-${slide.id}`}
                  className={composeHeroEntryClassName("hero-home__meta-pill", shouldAnimateEntry)}
                  style={resolveHeroEntryStyle("badge", shouldAnimateEntry)}
                >
                  Último lançamento
                </span>
              ) : null}
              {slide.format || slide.status ? (
                <span
                  data-testid={`hero-slide-type-status-${slide.id}`}
                  className={composeHeroEntryClassName("hero-home__meta-text", shouldAnimateEntry)}
                  style={resolveHeroEntryStyle("badge", shouldAnimateEntry)}
                >
                  {resolveHeroBrandFallback(slide)}
                </span>
              ) : null}
            </div>

            <h1
              className={composeHeroEntryClassName("hero-home__title", shouldAnimateEntry)}
              style={resolveHeroEntryStyle("title", shouldAnimateEntry)}
              title={slide.title}
            >
              {slide.title}
            </h1>

            <p
              className={composeHeroEntryClassName("hero-home__synopsis", shouldAnimateEntry)}
              style={resolveHeroEntryStyle("synopsis", shouldAnimateEntry)}
            >
              {clampSynopsis(slide.description, 148)}
            </p>

            <div
              className={composeHeroEntryClassName("hero-home__action-group", shouldAnimateEntry)}
              style={resolveHeroEntryStyle("actions", shouldAnimateEntry)}
            >
              <Button asChild className="gap-2">
                <PublicLink
                  ref={viewportRef}
                  href={projectHref}
                  aria-label={`Acessar página de ${slide.title}`}
                  {...preloadHandlers}
                >
                  <Globe className="h-4 w-4" />
                  Acessar página
                </PublicLink>
              </Button>
              {slide.trailerUrl ? (
                <Button asChild variant="outline" className="gap-2">
                  <a
                    href={slide.trailerUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Assistir trailer de ${slide.title}`}
                  >
                    <Play className="h-4 w-4" />
                    Assistir trailer
                  </a>
                </Button>
              ) : null}
            </div>
            {slideCount > 1 && activeIndex === index ? (
              <HeroCarouselDock
                activeIndex={activeIndex}
                slideCount={slideCount}
                onPreviousSlide={onPreviousSlide}
                onNextSlide={onNextSlide}
                onSelectSlide={onSelectSlide}
                className="hero-home__dock-mobile"
                testIdSuffix="mobile"
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const HeroSection = () => {
  const [api, setApi] = React.useState<CarouselApi | null>(null);
  const autoplayRef = React.useRef<number | null>(null);
  const resumeTimeoutRef = React.useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isCarouselAutoplayReady, setIsCarouselAutoplayReady] = React.useState(false);
  const [loadedSlideIds, setLoadedSlideIds] = React.useState<Set<string>>(() => new Set());
  const [isHeroMounted, setIsHeroMounted] = React.useState(false);
  const primaryHeroImageRef = React.useRef<HTMLImageElement | null>(null);
  const heroReadyDispatchedRef = React.useRef(false);
  const heroReadyFrameRef = React.useRef<number | null>(null);
  const initialHomeShellSnapshotRef = React.useRef(
    typeof document !== "undefined" &&
      typeof window !== "undefined" &&
      window.location.pathname === "/" &&
      document.getElementById("home-hero-shell") !== null,
  );
  const { data: bootstrapData, isFetched } = usePublicBootstrap();
  const prefersReducedMotion = usePrefersReducedMotion();
  const mediaVariants = bootstrapData?.mediaVariants || {};

  const visibleSlides = React.useMemo(() => {
    if (!bootstrapData && !isFetched) {
      return [];
    }
    if (
      Array.isArray(bootstrapData?.homeHero?.slides) &&
      bootstrapData.homeHero.slides.length > 0
    ) {
      return bootstrapData.homeHero.slides as HeroSlide[];
    }
    const projects = Array.isArray(bootstrapData?.projects)
      ? (bootstrapData.projects as PublicBootstrapProject[])
      : [];
    const updates = Array.isArray(bootstrapData?.updates)
      ? (bootstrapData.updates as PublicBootstrapUpdate[])
      : [];
    return buildHeroSlides(projects, updates);
  }, [bootstrapData, isFetched]);

  const latestSlideId = React.useMemo(() => {
    if (bootstrapData?.homeHero?.latestSlideId) {
      return bootstrapData.homeHero.latestSlideId;
    }
    if (!visibleSlides.length) {
      return "";
    }
    return visibleSlides.reduce((latest, current) => {
      if (!latest) {
        return current;
      }
      return new Date(current.updatedAt).getTime() > new Date(latest.updatedAt).getTime()
        ? current
        : latest;
    }, visibleSlides[0])?.id;
  }, [bootstrapData?.homeHero?.latestSlideId, visibleSlides]);

  React.useEffect(() => {
    if (visibleSlides.length <= 1 || prefersReducedMotion) {
      setIsCarouselAutoplayReady(false);
      return;
    }
    const cancelIdle = scheduleOnBrowserIdle(() => {
      setIsCarouselAutoplayReady(true);
    });
    return cancelIdle;
  }, [prefersReducedMotion, visibleSlides.length]);

  React.useEffect(() => {
    if (!api || visibleSlides.length <= 1) {
      setActiveIndex(0);
      return;
    }
    const syncSelectedIndex = () => {
      setActiveIndex(api.selectedScrollSnap());
    };
    syncSelectedIndex();
    api.on("select", syncSelectedIndex);
    api.on("reInit", syncSelectedIndex);
    return () => {
      api.off("select", syncSelectedIndex);
      api.off("reInit", syncSelectedIndex);
    };
  }, [api, visibleSlides.length]);

  React.useEffect(() => {
    if (!visibleSlides.length) {
      setLoadedSlideIds(new Set());
      return;
    }
    const activeSlide = visibleSlides[activeIndex] || visibleSlides[0];
    if (!activeSlide) {
      return;
    }
    setLoadedSlideIds((previous) => {
      if (previous.has(activeSlide.id)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(activeSlide.id);
      return next;
    });
  }, [activeIndex, visibleSlides]);

  const clearHeroReadyFrame = React.useCallback(() => {
    if (heroReadyFrameRef.current === null || typeof window === "undefined") {
      return;
    }
    window.cancelAnimationFrame(heroReadyFrameRef.current);
    heroReadyFrameRef.current = null;
  }, []);

  const dispatchHeroReady = React.useCallback(() => {
    if (heroReadyDispatchedRef.current || typeof window === "undefined") {
      return;
    }
    heroReadyDispatchedRef.current = true;
    clearHeroReadyFrame();
    heroReadyFrameRef.current = window.requestAnimationFrame(() => {
      heroReadyFrameRef.current = window.requestAnimationFrame(() => {
        heroReadyFrameRef.current = null;
        window.dispatchEvent(new Event(HOME_HERO_READY_EVENT));
      });
    });
  }, [clearHeroReadyFrame]);

  const handlePrimaryHeroImageRef = React.useCallback((node: HTMLImageElement | null) => {
    primaryHeroImageRef.current = node;
  }, []);

  const handlePrimaryHeroImageReady = React.useCallback(() => {
    dispatchHeroReady();
  }, [dispatchHeroReady]);

  React.useEffect(
    () => () => {
      clearHeroReadyFrame();
    },
    [clearHeroReadyFrame],
  );

  React.useEffect(() => {
    const image = primaryHeroImageRef.current;
    if (!visibleSlides[0]?.id || heroReadyDispatchedRef.current || !image) {
      return;
    }
    if (image.complete && image.naturalWidth > 0) {
      dispatchHeroReady();
    }
  }, [dispatchHeroReady, visibleSlides]);

  const stopAutoplay = React.useCallback(() => {
    if (autoplayRef.current !== null) {
      window.clearInterval(autoplayRef.current);
      autoplayRef.current = null;
    }
  }, []);

  const startAutoplay = React.useCallback(() => {
    if (!api || prefersReducedMotion) {
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }
    stopAutoplay();
    autoplayRef.current = window.setInterval(() => {
      api.scrollNext();
    }, 6000);
  }, [api, prefersReducedMotion, stopAutoplay]);

  const scheduleAutoplayResume = React.useCallback(() => {
    stopAutoplay();
    if (resumeTimeoutRef.current !== null) {
      window.clearTimeout(resumeTimeoutRef.current);
    }
    if (prefersReducedMotion) {
      return;
    }
    resumeTimeoutRef.current = window.setTimeout(() => {
      startAutoplay();
    }, 3000);
  }, [prefersReducedMotion, startAutoplay, stopAutoplay]);

  React.useEffect(() => {
    if (!api || !isCarouselAutoplayReady || visibleSlides.length <= 1 || prefersReducedMotion) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAutoplay();
        if (resumeTimeoutRef.current !== null) {
          window.clearTimeout(resumeTimeoutRef.current);
          resumeTimeoutRef.current = null;
        }
        return;
      }
      startAutoplay();
    };

    startAutoplay();
    api.on("pointerDown", scheduleAutoplayResume);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      api.off("pointerDown", scheduleAutoplayResume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopAutoplay();
      if (resumeTimeoutRef.current !== null) {
        window.clearTimeout(resumeTimeoutRef.current);
        resumeTimeoutRef.current = null;
      }
    };
  }, [
    api,
    isCarouselAutoplayReady,
    prefersReducedMotion,
    scheduleAutoplayResume,
    startAutoplay,
    stopAutoplay,
    visibleSlides.length,
  ]);

  const clampSynopsis = React.useCallback((text: string, limit = 136) => {
    const cleaned = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length <= limit) {
      return cleaned;
    }
    const nextSpace = cleaned.indexOf(" ", limit);
    const upperBound = limit + 12;
    if (nextSpace > -1 && nextSpace <= upperBound) {
      return `${cleaned.slice(0, nextSpace)}...`;
    }
    const slice = cleaned.slice(0, limit);
    const lastSpace = slice.lastIndexOf(" ");
    const trimmed = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
    return `${trimmed}...`;
  }, []);

  const handlePreviousSlide = React.useCallback(() => {
    if (!api) {
      return;
    }
    api.scrollPrev();
    scheduleAutoplayResume();
  }, [api, scheduleAutoplayResume]);

  const handleNextSlide = React.useCallback(() => {
    if (!api) {
      return;
    }
    api.scrollNext();
    scheduleAutoplayResume();
  }, [api, scheduleAutoplayResume]);

  const handleSelectSlide = React.useCallback(
    (index: number) => {
      if (!api || typeof api.scrollTo !== "function") {
        return;
      }
      api.scrollTo(index);
      scheduleAutoplayResume();
    },
    [api, scheduleAutoplayResume],
  );

  const heroViewportClass = PUBLIC_HOME_HERO_VIEWPORT_CLASS;
  const shouldRenderCarousel = visibleSlides.length > 1;
  const slideCount = visibleSlides.length;
  const hasInitialHomeShellSnapshot = initialHomeShellSnapshotRef.current;

  React.useEffect(() => {
    setIsHeroMounted(true);
  }, []);

  const heroSectionStyle: React.CSSProperties = hasInitialHomeShellSnapshot
    ? {}
    : {
        opacity: isHeroMounted ? 1 : 0,
        transition: isHeroMounted ? "opacity 220ms ease-out" : undefined,
      };

  return (
    <section
      className={`relative w-full overflow-hidden ${heroViewportClass}`}
      style={heroSectionStyle}
    >
      {shouldRenderCarousel ? (
        <Carousel opts={{ loop: true }} setApi={setApi} className={`relative ${heroViewportClass}`}>
          <CarouselContent className="ml-0">
            {visibleSlides.map((slide, index) => (
              <CarouselItem key={slide.id} className="pl-0">
                <HeroSlideFrame
                  slide={slide}
                  index={index}
                  activeIndex={activeIndex}
                  latestSlideId={latestSlideId}
                  loadedSlideIds={loadedSlideIds}
                  mediaVariants={mediaVariants}
                  heroViewportClass={heroViewportClass}
                  clampSynopsis={clampSynopsis}
                  shouldAnimateEntry={
                    !(hasInitialHomeShellSnapshot && index === 0) && !prefersReducedMotion
                  }
                  isReadyCandidate={index === 0}
                  priorityImageRef={handlePrimaryHeroImageRef}
                  onPriorityImageLoad={handlePrimaryHeroImageReady}
                  onPriorityImageError={handlePrimaryHeroImageReady}
                  slideCount={visibleSlides.length}
                  onPreviousSlide={handlePreviousSlide}
                  onNextSlide={handleNextSlide}
                  onSelectSlide={handleSelectSlide}
                />
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 hidden px-5 md:px-10 lg:block lg:px-14">
            <div className="flex justify-end">
              <HeroCarouselDock
                activeIndex={activeIndex}
                slideCount={slideCount}
                onPreviousSlide={handlePreviousSlide}
                onNextSlide={handleNextSlide}
                onSelectSlide={handleSelectSlide}
                className="hero-home__dock-desktop"
                testIdSuffix="desktop"
              />
            </div>
          </div>
        </Carousel>
      ) : visibleSlides[0] ? (
        <HeroSlideFrame
          slide={visibleSlides[0]}
          index={0}
          activeIndex={0}
          latestSlideId={latestSlideId}
          loadedSlideIds={loadedSlideIds}
          mediaVariants={mediaVariants}
          heroViewportClass={heroViewportClass}
          clampSynopsis={clampSynopsis}
          shouldAnimateEntry={!hasInitialHomeShellSnapshot && !prefersReducedMotion}
          isReadyCandidate
          priorityImageRef={handlePrimaryHeroImageRef}
          onPriorityImageLoad={handlePrimaryHeroImageReady}
          onPriorityImageError={handlePrimaryHeroImageReady}
          slideCount={1}
          onPreviousSlide={handlePreviousSlide}
          onNextSlide={handleNextSlide}
          onSelectSlide={handleSelectSlide}
        />
      ) : null}
    </section>
  );
};

export default HeroSection;
