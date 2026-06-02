import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Eye,
  Menu,
  PencilLine,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  memo,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import ProjectReadingInfoBar from "@/components/project-reader/ProjectReadingInfoBar";
import {
  buildReaderDisplayPages,
  buildReaderPageItems,
  buildReaderSlots,
  findSlotIndexForPage,
  formatVisiblePageLabel,
  getReaderVisualState,
  interpolateContinuousPageRatio,
  isPaginatedReaderLayout,
  pickMostVisiblePage,
  type ReaderRenderablePage,
  resolvePaginatedPointerAction,
} from "@/components/project-reader/project-reader-state";
import {
  type ProjectReaderPreferencesState,
  useProjectReaderPreferences,
} from "@/components/project-reader/use-project-reader-preferences";
import { Combobox } from "@/components/public-form-controls";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

type ReaderPage = {
  position: number;
  imageUrl: string;
  spreadPairId?: string;
  width?: number;
  height?: number;
};

type ReaderChapterOption = {
  value: string;
  label: string;
  href: string;
};

type ReaderProgressStyle = "default" | "hidden";
type ReaderProgressPosition = "bottom" | "left" | "right";
type ContinuousProgressDirection = "forward" | "backward";
type ContinuousAnimationAxis = "horizontal" | "vertical";
type ReaderPageStepDirection = "previous" | "next";
type ReaderPageNavigationSource = "keyboard" | "keyboard-hold" | "ui";
type ReaderKeyEvent = {
  key: string;
  repeat?: boolean;
  preventDefault: () => void;
  stopPropagation: () => void;
  target: EventTarget | null;
};
type VisibleStageChromeMetrics = {
  width: number;
  height: number;
  isVisible: boolean;
};
type HorizontalScrollSyncTarget = "viewport" | "rail";
type ContinuousImageReadyStatus = "ready" | "failed";
type ContinuousReaderAnimation = {
  axis: ContinuousAnimationAxis;
  duration: number;
  from: number;
  source: ReaderPageNavigationSource;
  startTime: number | null;
  targetIndex: number;
  to: number;
};

type PublicProjectReaderBaseProps = {
  projectTitle: string;
  projectType: string;
  chapterTitle: string;
  chapterLabel: string;
  synopsis?: string;
  volume?: number;
  pages: ReaderPage[];
  baseConfig: Record<string, unknown>;
  currentUserId?: string | null;
  editHref?: string;
  editActionLabel?: string;
  chapterOptions: ReaderChapterOption[];
  currentChapterValue: string;
  onNavigateChapter: (href: string) => void;
  backHref: string;
};

type PublicProjectReaderProps = PublicProjectReaderBaseProps & {
  preferences?: ProjectReaderPreferencesState;
};

const PAGE_WRAPPER_BASE_CLASS = "relative flex min-w-0 justify-center";
const SIDEBAR_SECTION_CLASS_NAME =
  "rounded-[1.75rem] border border-border/55 bg-card/35 p-3.5 shadow-reader-panel";
const SIDEBAR_FIELD_CLASS_NAME = "space-y-2";
const SIDEBAR_LABEL_CLASS_NAME =
  "text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70";
const SIDEBAR_SECTION_HEADER_CLASS_NAME = "flex items-center gap-2.5";
const SIDEBAR_SECTION_ICON_CLASS_NAME = "h-[0.95rem] w-[0.95rem] shrink-0 text-primary/80";
const SIDEBAR_SELECT_TRIGGER_CLASS_NAME = "h-10 border-border/55 bg-background/70";
const PROGRESS_EDGE_OFFSET_PX = 12;
const HIDDEN_PROGRESS_ZONE_SIZE_PX = 48;

const readerLayoutOptions = [
  { value: "single", label: "Página única" },
  { value: "double", label: "Página dupla" },
  { value: "scroll-vertical", label: "Rolagem vertical" },
  { value: "scroll-horizontal", label: "Rolagem horizontal" },
];

const readerImageFitOptions = [
  { value: "both", label: "Largura e altura" },
  { value: "none", label: "Sem ajuste" },
  { value: "width", label: "Ajustar à largura" },
  { value: "height", label: "Ajustar à altura" },
];

const readerDirectionOptions = [
  { value: "rtl", label: "Direita para esquerda" },
  { value: "ltr", label: "Esquerda para direita" },
];

const readerBackgroundOptions = [
  { value: "theme", label: "Tema do site" },
  { value: "black", label: "Preto" },
  { value: "white", label: "Branco" },
];

const readerSiteHeaderVariantOptions = [
  { value: "fixed", label: "Fixa" },
  { value: "static", label: "Estática" },
];

const readerProgressStyleOptions = [
  { value: "default", label: "Padrão" },
  { value: "hidden", label: "Oculto" },
];

const readerProgressPositionOptions = [
  { value: "bottom", label: "Inferior" },
  { value: "left", label: "Esquerda" },
  { value: "right", label: "Direita" },
];
const HIDDEN_PROGRESS_HIDE_DELAY_MS = 180;
const PROGRESS_OVERLAY_TRANSITION_MS = 180;
const PROGRESS_TOUCH_FEEDBACK_MS = 900;
const PROGRESS_BOTTOM_OVERLAY_HEIGHT_PX = 80;
const PROGRESS_VERTICAL_OVERLAY_WIDTH_PX = 88;
const PROGRESS_CHIP_MIN_WIDTH_PX = 40;
const PROGRESS_CHIP_MIN_HEIGHT_PX = 28;
const CONTINUOUS_PROGRESS_FORWARD_VIEWPORT_ANCHOR_RATIO = 0.7;
const CONTINUOUS_PROGRESS_BACKWARD_VIEWPORT_ANCHOR_RATIO = 0.3;
const CONTINUOUS_PAGE_STEP_DURATION_MS = 180;
const CONTINUOUS_READY_LAYOUT_RETRY_MAX_FRAMES = 8;
const HORIZONTAL_PAGE_URL_SYNC_SETTLE_MS = 220;
const KEYBOARD_PAGE_HOLD_START_DELAY_MS = 250;
const KEYBOARD_PAGE_HOLD_REPEAT_MS = 120;
const MENU_TRIGGER_INITIAL_VISIBLE_MS = 15000;
const MENU_TRIGGER_HOTSPOT_SIZE_PX = 72;
const MENU_PANEL_BOTTOM_INSET_PX = 16;
const MENU_SCROLL_FIT_EPSILON_PX = 2;
const MENU_OVERLAY_TRANSITION_MS = 220;
const MENU_TRIGGER_ENTER_TRANSITION_MS = 300;
const MENU_TRIGGER_EXIT_TRANSITION_MS = 320;
const MENU_TRIGGER_HOST_TOP_OFFSET_PX = 12;
const READER_MENU_HINT_STORAGE_KEY = "public.reader.menuHintSeen";

const hasSeenReaderMenuHint = () => {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return window.localStorage.getItem(READER_MENU_HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markReaderMenuHintSeen = () => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(READER_MENU_HINT_STORAGE_KEY, "1");
  } catch {
    // Ignore localStorage failures.
  }
};

const getVisibleViewportMetrics = () => {
  if (typeof window === "undefined") {
    return {
      width: 1024,
      height: 768,
      offsetTop: 0,
    };
  }

  const viewport = window.visualViewport;
  return {
    width: Math.round(viewport?.width ?? window.innerWidth),
    height: Math.round(viewport?.height ?? window.innerHeight),
    offsetTop: Math.round(viewport?.offsetTop ?? 0),
  };
};

const getWindowWidth = () => getVisibleViewportMetrics().width;
const getVisibleViewportHeight = () => getVisibleViewportMetrics().height;
const supportsFineHoverPointer = () => {
  if (typeof window === "undefined") {
    return true;
  }
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }
  return getWindowWidth() >= 768;
};
const getWindowScrollY = () =>
  typeof window === "undefined"
    ? 0
    : Math.max(
        window.scrollY || 0,
        window.pageYOffset || 0,
        document.documentElement?.scrollTop || 0,
      );

const parseRequestedReaderPageIndex = (search: string) => {
  const params = new URLSearchParams(search);
  const rawValue = Number(params.get("page"));
  if (!Number.isFinite(rawValue) || rawValue < 1) {
    return null;
  }
  return Math.max(Math.floor(rawValue) - 1, 0);
};

const getCenteredViewportScrollTop = ({
  targetRect,
  viewportHeight,
  viewportOffsetTop,
}: {
  targetRect: DOMRect;
  viewportHeight: number;
  viewportOffsetTop: number;
}) => {
  const visibleHeight = Math.min(Math.max(Math.round(targetRect.height), 0), viewportHeight);
  const centeredOffset = Math.max(Math.round((viewportHeight - visibleHeight) / 2), 0);
  return Math.max(
    Math.round(getWindowScrollY() + targetRect.top - viewportOffsetTop - centeredOffset),
    0,
  );
};

const getCenteredHorizontalScrollLeft = ({
  container,
  targetNode,
  targetRect,
}: {
  container: HTMLDivElement;
  targetNode?: HTMLDivElement | null;
  targetRect?: DOMRect;
}) => {
  const fallbackRect = targetRect ?? targetNode?.getBoundingClientRect();
  const targetWidth =
    targetNode && targetNode.offsetWidth > 0
      ? targetNode.offsetWidth
      : Math.max(fallbackRect?.width ?? 0, 0);
  const targetStart =
    targetNode && targetNode.offsetWidth > 0
      ? targetNode.offsetLeft
      : (() => {
          if (!fallbackRect) {
            return container.scrollLeft;
          }
          const containerRect = container.getBoundingClientRect();
          return fallbackRect.left - containerRect.left + container.scrollLeft;
        })();
  const centeredOffset = Math.max((container.clientWidth - targetWidth) / 2, 0);
  const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
  return Math.min(Math.max(Math.round(targetStart - centeredOffset), 0), maxScrollLeft);
};

const getHorizontalViewportMeasurement = ({
  container,
  targetRect,
  direction,
}: {
  container: HTMLDivElement;
  targetRect: DOMRect;
  direction: "rtl" | "ltr";
}) => {
  const containerRect = container.getBoundingClientRect();
  const start = targetRect.left - containerRect.left;
  const end = targetRect.right - containerRect.left;

  if (direction === "rtl") {
    return {
      start: container.clientWidth - end,
      end: container.clientWidth - start,
    };
  }

  return { start, end };
};

const getLogicalHorizontalScrollLeft = ({
  container,
  direction,
}: {
  container: HTMLDivElement;
  direction: "rtl" | "ltr";
}) => {
  const maxScrollLeft = Math.max(container.scrollWidth - container.clientWidth, 0);
  if (direction === "rtl") {
    return Math.max(maxScrollLeft - container.scrollLeft, 0);
  }
  return Math.max(container.scrollLeft, 0);
};

const getTopAlignedVerticalScrollTop = ({
  container,
  targetNode,
  targetRect,
}: {
  container: HTMLDivElement;
  targetNode?: HTMLDivElement | null;
  targetRect?: DOMRect;
}) => {
  const fallbackRect = targetRect ?? targetNode?.getBoundingClientRect();
  const targetStart =
    targetNode && targetNode.offsetHeight > 0
      ? targetNode.offsetTop
      : (() => {
          if (!fallbackRect) {
            return container.scrollTop;
          }
          const containerRect = container.getBoundingClientRect();
          return fallbackRect.top - containerRect.top + container.scrollTop;
        })();
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
  return Math.min(Math.max(Math.round(targetStart), 0), maxScrollTop);
};

const getVerticalViewportMeasurement = ({
  container,
  targetRect,
}: {
  container: HTMLDivElement;
  targetRect: DOMRect;
}) => {
  const containerRect = container.getBoundingClientRect();
  return {
    start: targetRect.top - containerRect.top,
    end: targetRect.bottom - containerRect.top,
  };
};

const getLogicalVerticalScrollTop = ({ container }: { container: HTMLDivElement }) =>
  Math.max(container.scrollTop, 0);

const getStageToneClassName = (background: string) => {
  if (background === "black") {
    return "bg-black text-white";
  }
  if (background === "white") {
    return "bg-white text-slate-900";
  }
  return "bg-background text-foreground";
};

const getPurchaseToneClassName = (background: string) => {
  if (background === "black") {
    return "border-white/10 bg-black/80";
  }
  if (background === "white") {
    return "border-slate-200 bg-white";
  }
  return "border-border/60 bg-card/40";
};

const getImageClassName = (imageFit: string) => {
  if (imageFit === "height") {
    return "block h-full w-auto max-h-full max-w-none object-contain";
  }
  if (imageFit === "none") {
    return "block h-auto w-auto max-h-none max-w-none object-contain";
  }
  if (imageFit === "width") {
    return "block h-auto w-full max-h-none max-w-full object-contain";
  }
  return "block h-auto w-auto max-h-full max-w-full object-contain";
};

const getPageWrapperClassName = (imageFit: string) => {
  if (imageFit === "none") {
    return "w-auto max-w-none shrink-0 items-start";
  }
  if (imageFit === "width") {
    return "w-full min-w-0 items-start";
  }
  return "w-full items-center";
};

const getPageSurfaceClassName = (imageFit: string) => {
  if (imageFit === "none") {
    return "inline-flex h-auto w-auto max-w-none shrink-0 items-start justify-center";
  }
  if (imageFit === "width") {
    return "flex h-auto w-full max-w-full items-start justify-center";
  }
  return "flex w-full items-center justify-center";
};

const getRenderablePageIntrinsicDimensions = (
  page: Pick<ReaderPage, "width" | "height"> | Pick<ReaderRenderablePage, "width" | "height">,
) => {
  const width = typeof page.width === "number" && page.width > 0 ? Math.round(page.width) : null;
  const height =
    typeof page.height === "number" && page.height > 0 ? Math.round(page.height) : null;
  if (width === null || height === null) {
    return null;
  }
  return {
    width,
    height,
  };
};

const getRenderablePageAspectRatio = (
  page: Pick<ReaderPage, "width" | "height"> | Pick<ReaderRenderablePage, "width" | "height">,
) => {
  const intrinsicDimensions = getRenderablePageIntrinsicDimensions(page);
  if (!intrinsicDimensions) {
    return undefined;
  }
  return `${intrinsicDimensions.width} / ${intrinsicDimensions.height}`;
};

const usesViewportBoundedHeight = (imageFit: string) =>
  imageFit === "both" || imageFit === "height";

const resolveEffectiveImageFit = ({
  imageFit,
  layout,
  viewportMode,
}: {
  imageFit: string;
  layout: string;
  viewportMode: "viewport" | "natural";
}) =>
  imageFit === "width" &&
  layout !== "double" &&
  (viewportMode === "natural" || layout === "scroll-horizontal")
    ? "none"
    : imageFit;

const isPannableNoLimitImageFit = (imageFit: string) => imageFit === "none";
const isMobilePannableHeightImageFit = (imageFit: string) => imageFit === "height";
const isWidthImageFit = (imageFit: string) => imageFit === "width";

const getSafeAreaInset = (edge: "top" | "right" | "bottom" | "left") =>
  `calc(env(safe-area-inset-${edge}, 0px) + ${PROGRESS_EDGE_OFFSET_PX}px)`;

const getProgressOverlayContainerStyle = (position: ReaderProgressPosition): CSSProperties => {
  if (position === "bottom") {
    return {
      left: getSafeAreaInset("left"),
      right: getSafeAreaInset("right"),
      bottom: getSafeAreaInset("bottom"),
      height: "5rem",
    };
  }

  return position === "left"
    ? {
        left: getSafeAreaInset("left"),
        top: getSafeAreaInset("top"),
        bottom: getSafeAreaInset("bottom"),
        width: "5.5rem",
      }
    : {
        right: getSafeAreaInset("right"),
        top: getSafeAreaInset("top"),
        bottom: getSafeAreaInset("bottom"),
        width: "5.5rem",
      };
};

const clampProgressRatio = (value: number) => Math.min(Math.max(value, 0), 1);
const getProgressAxisRatio = ({
  ratio,
  position,
  direction,
}: {
  ratio: number;
  position: ReaderProgressPosition;
  direction: "rtl" | "ltr";
}) => {
  const clampedRatio = clampProgressRatio(ratio);
  if (position === "bottom" && direction === "rtl") {
    return 1 - clampedRatio;
  }
  return clampedRatio;
};
const easeContinuousPageStep = (value: number) => {
  const clampedValue = clampProgressRatio(value);
  return clampedValue < 0.5
    ? 4 * clampedValue * clampedValue * clampedValue
    : 1 - Math.pow(-2 * clampedValue + 2, 3) / 2;
};
const getPaginatedPointerRatio = ({
  clientX,
  rect,
}: {
  clientX: number;
  rect: Pick<DOMRect, "left" | "width">;
}) => {
  if (rect.width <= 0) {
    return 0.5;
  }

  return clampProgressRatio((clientX - rect.left) / rect.width);
};

const getRootFontSizePx = () => {
  if (typeof window === "undefined") {
    return 16;
  }
  const computedSize = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(computedSize) && computedSize > 0 ? computedSize : 16;
};

const getVisibleStageViewportMetrics = ({
  stageRect,
  fallbackHeight,
}: {
  stageRect?: Pick<DOMRect, "top" | "bottom" | "width" | "height"> | null;
  fallbackHeight: number;
}): VisibleStageChromeMetrics => {
  const viewportMetrics = getVisibleViewportMetrics();
  const fallbackWidth = Math.max(Math.round(viewportMetrics.width), 1);
  if (!stageRect || (stageRect.width <= 0 && stageRect.height <= 0)) {
    return {
      width: fallbackWidth,
      height: Math.max(Math.round(fallbackHeight), 1),
      isVisible: true,
    };
  }

  const viewportTop = viewportMetrics.offsetTop;
  const viewportBottom = viewportTop + viewportMetrics.height;
  const visibleTop = Math.max(stageRect.top, viewportTop);
  const visibleBottom = Math.min(stageRect.bottom, viewportBottom);
  const nextVisibleHeight = Math.max(Math.round(visibleBottom - visibleTop), 0);

  return {
    width: Math.max(Math.round(stageRect.width), 0) || fallbackWidth,
    height: nextVisibleHeight,
    isVisible: nextVisibleHeight > 0,
  };
};

const getSafeCenteredProgressOffsetPx = ({
  ratio,
  edgeInsetPx,
  containerLength,
}: {
  ratio: number;
  edgeInsetPx: number;
  containerLength: number;
}) => {
  const clampedRatio = clampProgressRatio(ratio);
  return Math.min(
    Math.max(containerLength * clampedRatio, edgeInsetPx),
    Math.max(containerLength - edgeInsetPx, edgeInsetPx),
  );
};

const getContinuousProgressAnchorOffsetPx = ({
  viewportSize,
  direction,
}: {
  viewportSize: number;
  direction: ContinuousProgressDirection | null;
}) => {
  if (direction === "forward") {
    return viewportSize * CONTINUOUS_PROGRESS_FORWARD_VIEWPORT_ANCHOR_RATIO;
  }
  if (direction === "backward") {
    return viewportSize * CONTINUOUS_PROGRESS_BACKWARD_VIEWPORT_ANCHOR_RATIO;
  }
  return viewportSize / 2;
};

const getHiddenProgressZoneStyle = (position: ReaderProgressPosition): CSSProperties => {
  if (position === "bottom") {
    return {
      left: 0,
      right: 0,
      bottom: 0,
      height: `${HIDDEN_PROGRESS_ZONE_SIZE_PX}px`,
    };
  }

  return position === "left"
    ? {
        left: 0,
        top: 0,
        bottom: 0,
        width: `${HIDDEN_PROGRESS_ZONE_SIZE_PX}px`,
      }
    : {
        right: 0,
        top: 0,
        bottom: 0,
        width: `${HIDDEN_PROGRESS_ZONE_SIZE_PX}px`,
      };
};

const getProgressOverlayMotionClassName = ({
  position,
  isVisible,
}: {
  position: ReaderProgressPosition;
  isVisible: boolean;
}) => {
  if (position === "bottom") {
    return isVisible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0";
  }
  if (position === "left") {
    return isVisible ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0";
  }
  return isVisible ? "translate-x-0 opacity-100" : "translate-x-2 opacity-0";
};

const getFallbackProgressTrackRect = ({
  position,
  containerRect,
}: {
  position: ReaderProgressPosition;
  containerRect?: Pick<DOMRect, "left" | "right" | "top" | "bottom" | "width" | "height"> | null;
}) => {
  const viewportMetrics = getVisibleViewportMetrics();
  const viewportWidth = Math.max(viewportMetrics.width, PROGRESS_EDGE_OFFSET_PX * 2 + 1);
  const viewportHeight = Math.max(viewportMetrics.height, PROGRESS_EDGE_OFFSET_PX * 2 + 1);
  const fallbackContainerRect =
    containerRect && containerRect.width > 0 && containerRect.height > 0
      ? containerRect
      : {
          left: 0,
          right: viewportWidth,
          top: viewportMetrics.offsetTop,
          bottom: viewportMetrics.offsetTop + viewportHeight,
          width: viewportWidth,
          height: viewportHeight,
        };

  if (position === "bottom") {
    return {
      left: fallbackContainerRect.left + PROGRESS_EDGE_OFFSET_PX,
      right: fallbackContainerRect.right - PROGRESS_EDGE_OFFSET_PX,
      top: fallbackContainerRect.bottom - PROGRESS_BOTTOM_OVERLAY_HEIGHT_PX,
      bottom: fallbackContainerRect.bottom,
      width: Math.max(fallbackContainerRect.width - PROGRESS_EDGE_OFFSET_PX * 2, 1),
      height: PROGRESS_BOTTOM_OVERLAY_HEIGHT_PX,
    };
  }

  if (position === "left") {
    return {
      left: fallbackContainerRect.left + PROGRESS_EDGE_OFFSET_PX,
      right:
        fallbackContainerRect.left + PROGRESS_EDGE_OFFSET_PX + PROGRESS_VERTICAL_OVERLAY_WIDTH_PX,
      top: fallbackContainerRect.top + PROGRESS_EDGE_OFFSET_PX,
      bottom: fallbackContainerRect.bottom - PROGRESS_EDGE_OFFSET_PX,
      width: PROGRESS_VERTICAL_OVERLAY_WIDTH_PX,
      height: Math.max(fallbackContainerRect.height - PROGRESS_EDGE_OFFSET_PX * 2, 1),
    };
  }

  return {
    left:
      fallbackContainerRect.right - PROGRESS_EDGE_OFFSET_PX - PROGRESS_VERTICAL_OVERLAY_WIDTH_PX,
    right: fallbackContainerRect.right - PROGRESS_EDGE_OFFSET_PX,
    top: fallbackContainerRect.top + PROGRESS_EDGE_OFFSET_PX,
    bottom: fallbackContainerRect.bottom - PROGRESS_EDGE_OFFSET_PX,
    width: PROGRESS_VERTICAL_OVERLAY_WIDTH_PX,
    height: Math.max(fallbackContainerRect.height - PROGRESS_EDGE_OFFSET_PX * 2, 1),
  };
};

const isPointWithinRect = ({
  x,
  y,
  rect,
}: {
  x: number;
  y: number;
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">;
}) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const getHorizontalAlignmentClassName = (alignment: "center" | "start" | "end") => {
  if (alignment === "start") {
    return "justify-start";
  }
  if (alignment === "end") {
    return "justify-end";
  }
  return "justify-center";
};

const getDoublePageInnerAlignment = ({
  direction,
  pagePosition,
}: {
  direction: "rtl" | "ltr";
  pagePosition: number;
}) => {
  if (direction === "rtl") {
    return pagePosition === 0 ? "start" : "end";
  }
  return pagePosition === 0 ? "end" : "start";
};

const getContinuousHorizontalPageClassName = (imageFit: string) => {
  if (imageFit === "none") {
    return getPageWrapperClassName(imageFit);
  }
  return "w-auto max-w-none shrink-0 items-center";
};

const getContinuousHorizontalSurfaceClassName = (imageFit: string) => {
  if (imageFit === "none") {
    return getPageSurfaceClassName(imageFit);
  }
  return "inline-flex h-full w-auto max-w-none shrink-0 items-center justify-center";
};

const getPaginatedSlotClassName = ({
  layout,
  imageFit,
  direction,
  pagePosition,
  centerSinglePage = false,
}: {
  layout: string;
  imageFit: string;
  direction: "rtl" | "ltr";
  pagePosition: number;
  centerSinglePage?: boolean;
}) => {
  const doubleAlignmentClassName = getHorizontalAlignmentClassName(
    centerSinglePage
      ? "center"
      : getDoublePageInnerAlignment({
          direction,
          pagePosition,
        }),
  );

  if (layout === "double") {
    return cn(
      imageFit === "none"
        ? "flex shrink-0 flex-none items-start"
        : "flex min-w-0 flex-1 items-center",
      doubleAlignmentClassName,
    );
  }

  return imageFit === "none"
    ? "flex w-auto max-w-none shrink-0 flex-none items-start justify-center"
    : "flex w-full items-center justify-center";
};

const clampIndex = (value: number, max: number) => {
  if (max <= 0) {
    return 0;
  }
  return Math.min(Math.max(value, 0), max - 1);
};

type ReaderPageImageLoading = "eager" | "lazy";
type ReaderPageImageFetchPriority = "auto" | "high" | "low";

type ReaderPageNodeProps = {
  accessiblePageCount: number;
  backHref: string;
  className?: string;
  imageFetchPriority?: ReaderPageImageFetchPriority;
  imageFit: string;
  imageLoading?: ReaderPageImageLoading;
  page: ReaderRenderablePage;
  pageIndex: number;
  purchasePrice?: string;
  purchaseToneClassName: string;
  purchaseUrl?: string;
  setPageRef: (pageIndex: number, node: HTMLDivElement | null) => void;
  surfaceClassName?: string;
  totalPages: number;
  viewportBoundedSurfaceStyle?: CSSProperties;
};

const ReaderPageNode = memo(
  ({
    accessiblePageCount,
    backHref,
    className,
    imageFetchPriority,
    imageFit,
    imageLoading,
    page,
    pageIndex,
    purchasePrice,
    purchaseToneClassName,
    purchaseUrl,
    setPageRef,
    surfaceClassName,
    totalPages,
    viewportBoundedSurfaceStyle,
  }: ReaderPageNodeProps) => {
    if (page.type === "purchase" || page.isPurchasePage) {
      return (
        <div
          ref={(node) => {
            setPageRef(pageIndex, node);
          }}
          data-testid={`reader-page-${pageIndex}`}
          className={cn(PAGE_WRAPPER_BASE_CLASS, "w-full items-center", className)}
        >
          <div
            data-testid={`reader-page-surface-${pageIndex}`}
            className={cn(
              "mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border px-6 py-10 text-center shadow-lg",
              purchaseToneClassName,
              surfaceClassName,
            )}
            style={viewportBoundedSurfaceStyle}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-primary/80">
              Prévia limitada
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">A prévia termina aqui</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Este capítulo tem {totalPages} páginas no total e libera {accessiblePageCount} na
              prévia.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {purchaseUrl ? (
                <Button asChild className="rounded-full px-5">
                  <a href={purchaseUrl} target="_blank" rel="noreferrer">
                    {purchasePrice ? `Comprar ${purchasePrice}` : "Comprar e continuar"}
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="rounded-full px-5">
                <Link to={backHref}>Voltar ao projeto</Link>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    const intrinsicDimensions = getRenderablePageIntrinsicDimensions(page);

    return (
      <div
        ref={(node) => {
          setPageRef(pageIndex, node);
        }}
        data-testid={`reader-page-${pageIndex}`}
        className={cn(PAGE_WRAPPER_BASE_CLASS, getPageWrapperClassName(imageFit), className)}
      >
        <div
          data-testid={`reader-page-surface-${pageIndex}`}
          className={cn(getPageSurfaceClassName(imageFit), surfaceClassName)}
          style={viewportBoundedSurfaceStyle}
        >
          <img
            src={page.imageUrl || ""}
            alt={`Página ${pageIndex + 1}`}
            loading={imageLoading ?? (pageIndex < 2 ? "eager" : "lazy")}
            decoding="async"
            fetchPriority={imageFetchPriority}
            width={intrinsicDimensions?.width}
            height={intrinsicDimensions?.height}
            className={getImageClassName(imageFit)}
            draggable={false}
          />
        </div>
      </div>
    );
  },
);
ReaderPageNode.displayName = "ReaderPageNode";

const PublicProjectReaderContent = ({
  projectTitle,
  projectType,
  chapterTitle,
  chapterLabel,
  synopsis = "",
  volume,
  pages,
  editHref,
  editActionLabel,
  chapterOptions,
  currentChapterValue,
  onNavigateChapter,
  backHref,
  preferences,
}: PublicProjectReaderBaseProps & {
  preferences: ProjectReaderPreferencesState;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoaded, resolvedConfig, updateConfig } = preferences;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuTriggerVisible, setIsMenuTriggerVisible] = useState(true);
  const [isMenuTriggerMounted, setIsMenuTriggerMounted] = useState(true);
  const [isMenuTriggerAnimatingVisible, setIsMenuTriggerAnimatingVisible] = useState(true);
  const [isMenuOverlayMounted, setIsMenuOverlayMounted] = useState(false);
  const [isMenuOverlayVisible, setIsMenuOverlayVisible] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(getWindowWidth);
  const [readerViewportHeight, setReaderViewportHeight] = useState<number | null>(null);
  const [stageViewportHeight, setStageViewportHeight] = useState<number | null>(null);
  const [, setInfoBarMeasuredHeight] = useState(0);
  const [visibleStageChromeMetrics, setVisibleStageChromeMetrics] =
    useState<VisibleStageChromeMetrics>(() => ({
      width: getWindowWidth(),
      height: getVisibleViewportHeight(),
      isVisible: true,
    }));
  const [isHiddenProgressRevealed, setIsHiddenProgressRevealed] = useState(false);
  const [isProgressInteracting, setIsProgressInteracting] = useState(false);
  const [isProgressOverlayMounted, setIsProgressOverlayMounted] = useState(false);
  const [isProgressOverlayVisible, setIsProgressOverlayVisible] = useState(false);
  const [progressLabelSize, setProgressLabelSize] = useState({
    width: PROGRESS_CHIP_MIN_WIDTH_PX,
    height: PROGRESS_CHIP_MIN_HEIGHT_PX,
  });
  const [horizontalScrollMetrics, setHorizontalScrollMetrics] = useState({
    clientWidth: 0,
    scrollWidth: 0,
    scrollbarHeight: 0,
  });
  const horizontalScrollRef = useRef<HTMLDivElement | null>(null);
  const verticalScrollRef = useRef<HTMLDivElement | null>(null);
  const verticalScrollStripRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRailHostRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollRailRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollStripRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const infoBarRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const menuViewportRef = useRef<HTMLDivElement | null>(null);
  const menuViewportInnerRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLElement | null>(null);
  const menuHeaderRef = useRef<HTMLDivElement | null>(null);
  const menuScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const menuContentRef = useRef<HTMLDivElement | null>(null);
  const menuStickyTopOffsetPxRef = useRef(MENU_TRIGGER_HOST_TOP_OFFSET_PX);
  const progressOverlayRef = useRef<HTMLDivElement | null>(null);
  const progressIndicatorRef = useRef<HTMLDivElement | null>(null);
  const progressViewportRef = useRef<HTMLDivElement | null>(null);
  const progressTrackRef = useRef<HTMLDivElement | null>(null);
  const progressLabelRef = useRef<HTMLDivElement | null>(null);
  const visibleStageChromeMetricsRef = useRef<VisibleStageChromeMetrics>({
    width: getWindowWidth(),
    height: getVisibleViewportHeight(),
    isVisible: true,
  });
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const stageChromeMeasurementFrameRef = useRef<number | null>(null);
  const hideHiddenProgressTimeoutRef = useRef<number | null>(null);
  const menuTriggerHideTimeoutRef = useRef<number | null>(null);
  const menuTriggerUnmountTimeoutRef = useRef<number | null>(null);
  const menuOverlayUnmountTimeoutRef = useRef<number | null>(null);
  const progressInteractionTimeoutRef = useRef<number | null>(null);
  const progressOverlayUnmountTimeoutRef = useRef<number | null>(null);
  const activeProgressPointerIdRef = useRef<number | null>(null);
  const isProgressPointerDraggingRef = useRef(false);
  const isMenuRegionHoveredRef = useRef(false);
  const lastScrubbedProgressPageRef = useRef<number | null>(null);
  const initialReaderPositionFrameRef = useRef<number | null>(null);
  const lastAppliedInitialPageKeyRef = useRef<string | null>(null);
  const lastInitialReaderPositionKeyRef = useRef<string | null>(null);
  const lastSyncedPageUrlKeyRef = useRef<string | null>(null);
  const lastContinuousVerticalScrollYRef = useRef<number | null>(null);
  const lastContinuousHorizontalScrollLeftRef = useRef<number | null>(null);
  const lastContinuousProgressDirectionRef = useRef<ContinuousProgressDirection | null>(null);
  const pendingHorizontalPageUrlSyncRef = useRef<number | null>(null);
  const horizontalPageUrlSyncTimeoutRef = useRef<number | null>(null);
  const pendingVerticalPageUrlSyncRef = useRef<number | null>(null);
  const verticalPageUrlSyncTimeoutRef = useRef<number | null>(null);
  const horizontalScrollSyncResetFrameRef = useRef<number | null>(null);
  const pendingHorizontalScrollSyncRef = useRef<{
    target: HorizontalScrollSyncTarget;
    scrollLeft: number;
  } | null>(null);
  const forceImmediateVerticalPageUrlSyncRef = useRef(false);
  const activeKeyboardHoldDirectionRef = useRef<ReaderPageStepDirection | null>(null);
  const keyboardHoldStartTimeoutRef = useRef<number | null>(null);
  const keyboardHoldRepeatIntervalRef = useRef<number | null>(null);
  const readerMenuHintTimeoutRef = useRef<number | null>(null);
  const lastKeyboardNavigationDirectionRef = useRef<ReaderPageStepDirection | null>(null);
  const forceImmediateHorizontalPageUrlSyncRef = useRef(false);
  const hasShownReaderMenuHintRef = useRef(false);
  const readerMenuPanelId = useId();
  const readerMenuTitleId = useId();
  const isStageInViewport = visibleStageChromeMetrics.isVisible;

  const { originalPages, renderablePages, accessiblePageCount, hasPurchaseGate } = useMemo(
    () =>
      buildReaderDisplayPages({
        pages,
        previewLimit:
          typeof resolvedConfig.previewLimit === "number" ? resolvedConfig.previewLimit : null,
      }),
    [pages, resolvedConfig.previewLimit],
  );
  const layout = String(resolvedConfig.layout || "single");
  const direction = resolvedConfig.direction === "ltr" ? "ltr" : "rtl";
  const paginated = isPaginatedReaderLayout(layout);
  const isDesktopMenu = viewportWidth >= 768;
  const supportsHoverMenuActivation = supportsFineHoverPointer();
  const isCinemaMode = resolvedConfig.chromeMode === "cinema";
  const viewportMode: "viewport" | "natural" =
    resolvedConfig.viewportMode === "natural" ? "natural" : "viewport";
  const siteHeaderVariant = resolvedConfig.siteHeaderVariant === "static" ? "static" : "fixed";
  const slots = useMemo(
    () =>
      buildReaderSlots({
        pages: renderablePages,
        layout,
        firstPageSingle: resolvedConfig.firstPageSingle !== false,
      }),
    [layout, renderablePages, resolvedConfig.firstPageSingle],
  );
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [handoffSlotIndex, setHandoffSlotIndex] = useState<number | null>(null);
  const [pendingSlotIndex, setPendingSlotIndex] = useState<number | null>(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [continuousRequestedPageIndex, setContinuousRequestedPageIndex] = useState<number | null>(
    null,
  );
  const [continuousWaitingForReadyPageIndex, setContinuousWaitingForReadyPageIndex] = useState<
    number | null
  >(null);
  const [continuousAnimatingPageIndex, setContinuousAnimatingPageIndex] = useState<number | null>(
    null,
  );
  const [paginatedReadyVersion, setPaginatedReadyVersion] = useState(0);
  const [continuousProgressVisualRatio, setContinuousProgressVisualRatio] = useState(0);
  const activeSlotIndexRef = useRef(activeSlotIndex);
  const handoffSlotIndexRef = useRef<number | null>(handoffSlotIndex);
  const pendingSlotIndexRef = useRef<number | null>(pendingSlotIndex);
  const activePageIndexRef = useRef(activePageIndex);
  const wasPaginatedRef = useRef(paginated);
  const continuousRequestedPageIndexRef = useRef<number | null>(continuousRequestedPageIndex);
  const continuousWaitingForReadyPageIndexRef = useRef<number | null>(
    continuousWaitingForReadyPageIndex,
  );
  const continuousAnimatingPageIndexRef = useRef<number | null>(continuousAnimatingPageIndex);
  const continuousNavigationSourceRef = useRef<ReaderPageNavigationSource>("ui");
  const continuousAnimationRef = useRef<ContinuousReaderAnimation | null>(null);
  const continuousAnimationFrameRef = useRef<number | null>(null);
  const continuousReadyImageStatusRef = useRef(new Map<string, ContinuousImageReadyStatus>());
  const continuousReadyImagePromisesRef = useRef(
    new Map<string, Promise<ContinuousImageReadyStatus>>(),
  );
  const continuousReadyRetryFrameRef = useRef<number | null>(null);
  const continuousReadyWaitTokenRef = useRef(0);
  const paginatedReadyImageUrlsRef = useRef(new Set<string>());
  const paginatedReadyImagePromisesRef = useRef(new Map<string, Promise<void>>());
  const paginatedSlotHandoffFrameRef = useRef<number | null>(null);
  const paginatedSlotCommitFrameRef = useRef<number | null>(null);

  const visualState = getReaderVisualState({
    imageFit: String(resolvedConfig.imageFit || "both"),
    background: String(resolvedConfig.background || "theme"),
    progressStyle: String(resolvedConfig.progressStyle || "default"),
    progressPosition: String(resolvedConfig.progressPosition || "bottom"),
  });
  const progressPosition: ReaderProgressPosition =
    visualState.progressPosition === "left" || visualState.progressPosition === "right"
      ? visualState.progressPosition
      : "bottom";

  const effectiveImageFit = resolveEffectiveImageFit({
    imageFit: visualState.imageFit,
    layout,
    viewportMode,
  });
  const shouldEnableInlineImagePan =
    isPannableNoLimitImageFit(visualState.imageFit) ||
    (viewportWidth < 768 && isMobilePannableHeightImageFit(visualState.imageFit));
  const shouldEnablePaginatedVerticalPan =
    isPannableNoLimitImageFit(visualState.imageFit) ||
    (viewportMode === "viewport" && isWidthImageFit(visualState.imageFit));
  const shouldPanPaginatedImage = paginated && shouldEnableInlineImagePan;
  const shouldPanPaginatedVertically = paginated && shouldEnablePaginatedVerticalPan;
  const shouldTopAlignPaginatedImage =
    shouldPanPaginatedVertically && isPannableNoLimitImageFit(visualState.imageFit);
  const shouldSafeCenterPaginatedImage =
    shouldPanPaginatedVertically && isWidthImageFit(visualState.imageFit);
  const shouldContainPaginatedOverscroll = shouldPanPaginatedImage && viewportWidth < 768;
  const shouldPanVerticalImage = layout === "scroll-vertical" && shouldEnableInlineImagePan;
  const initialChapterPageSeedRef = useRef({
    chapterValue: currentChapterValue,
    search: location.search,
  });
  if (initialChapterPageSeedRef.current.chapterValue !== currentChapterValue) {
    initialChapterPageSeedRef.current = {
      chapterValue: currentChapterValue,
      search: location.search,
    };
  }
  const requestedPageIndex = useMemo(
    () => parseRequestedReaderPageIndex(initialChapterPageSeedRef.current.search),
    [currentChapterValue],
  );
  const stageToneClassName = getStageToneClassName(visualState.background);
  const purchaseToneClassName = getPurchaseToneClassName(visualState.background);
  const sidebarToneClassName =
    "border-border/55 bg-background/92 text-foreground supports-backdrop-filter:bg-background/84 supports-backdrop-filter:backdrop-blur-xl";
  const resolvedInitialPageIndex = useMemo(() => {
    const requestedOrDefault = requestedPageIndex ?? 0;
    const clampedPageIndex = clampIndex(requestedOrDefault, Math.max(originalPages.length, 1));
    if (!hasPurchaseGate || clampedPageIndex < accessiblePageCount) {
      return clampedPageIndex;
    }
    return Math.max(renderablePages.length - 1, 0);
  }, [
    accessiblePageCount,
    hasPurchaseGate,
    originalPages.length,
    renderablePages.length,
    requestedPageIndex,
  ]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(getWindowWidth());
    const viewport = window.visualViewport;
    window.addEventListener("resize", handleResize, { passive: true });
    viewport?.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      viewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    pageRefs.current = [];
  }, [renderablePages.length]);

  useEffect(() => {
    activeSlotIndexRef.current = activeSlotIndex;
  }, [activeSlotIndex]);

  useEffect(() => {
    handoffSlotIndexRef.current = handoffSlotIndex;
  }, [handoffSlotIndex]);

  useEffect(() => {
    pendingSlotIndexRef.current = pendingSlotIndex;
  }, [pendingSlotIndex]);

  useEffect(() => {
    activePageIndexRef.current = activePageIndex;
  }, [activePageIndex]);

  useEffect(() => {
    continuousRequestedPageIndexRef.current = continuousRequestedPageIndex;
  }, [continuousRequestedPageIndex]);

  useEffect(() => {
    continuousWaitingForReadyPageIndexRef.current = continuousWaitingForReadyPageIndex;
  }, [continuousWaitingForReadyPageIndex]);

  useEffect(() => {
    continuousAnimatingPageIndexRef.current = continuousAnimatingPageIndex;
  }, [continuousAnimatingPageIndex]);

  const setReaderActiveSlotIndex = useCallback((nextSlotIndex: number) => {
    activeSlotIndexRef.current = nextSlotIndex;
    setActiveSlotIndex((current) => (current === nextSlotIndex ? current : nextSlotIndex));
  }, []);

  const setReaderActivePageIndex = useCallback((nextPageIndex: number) => {
    activePageIndexRef.current = nextPageIndex;
    setActivePageIndex((current) => (current === nextPageIndex ? current : nextPageIndex));
  }, []);

  const setReaderContinuousRequestedPageIndex = useCallback(
    (nextRequestedPageIndex: number | null) => {
      continuousRequestedPageIndexRef.current = nextRequestedPageIndex;
      setContinuousRequestedPageIndex((current) =>
        current === nextRequestedPageIndex ? current : nextRequestedPageIndex,
      );
    },
    [],
  );

  const setReaderContinuousWaitingForReadyPageIndex = useCallback(
    (nextWaitingPageIndex: number | null) => {
      continuousWaitingForReadyPageIndexRef.current = nextWaitingPageIndex;
      setContinuousWaitingForReadyPageIndex((current) =>
        current === nextWaitingPageIndex ? current : nextWaitingPageIndex,
      );
    },
    [],
  );

  const setReaderContinuousAnimatingPageIndex = useCallback(
    (nextAnimatingPageIndex: number | null) => {
      continuousAnimatingPageIndexRef.current = nextAnimatingPageIndex;
      setContinuousAnimatingPageIndex((current) =>
        current === nextAnimatingPageIndex ? current : nextAnimatingPageIndex,
      );
    },
    [],
  );

  const setReaderHandoffSlotIndex = useCallback((nextHandoffSlotIndex: number | null) => {
    handoffSlotIndexRef.current = nextHandoffSlotIndex;
    setHandoffSlotIndex((current) =>
      current === nextHandoffSlotIndex ? current : nextHandoffSlotIndex,
    );
  }, []);

  const setReaderPendingSlotIndex = useCallback((nextPendingSlotIndex: number | null) => {
    pendingSlotIndexRef.current = nextPendingSlotIndex;
    setPendingSlotIndex((current) =>
      current === nextPendingSlotIndex ? current : nextPendingSlotIndex,
    );
  }, []);

  const getVisibleSlotPageIndex = useCallback(
    (slotIndex: number) => {
      const slot = slots[slotIndex] || slots[0];
      return (slot?.pages || []).find((pageIndex) => pageIndex < accessiblePageCount) ?? 0;
    },
    [accessiblePageCount, slots],
  );

  const clearInitialReaderPositionFrame = useCallback(() => {
    if (initialReaderPositionFrameRef.current !== null) {
      window.cancelAnimationFrame(initialReaderPositionFrameRef.current);
      initialReaderPositionFrameRef.current = null;
    }
  }, []);

  const clearPaginatedSlotHandoffFrame = useCallback(() => {
    if (paginatedSlotHandoffFrameRef.current !== null) {
      window.cancelAnimationFrame(paginatedSlotHandoffFrameRef.current);
      paginatedSlotHandoffFrameRef.current = null;
    }
  }, []);

  const clearPaginatedSlotCommitFrame = useCallback(() => {
    if (paginatedSlotCommitFrameRef.current !== null) {
      window.cancelAnimationFrame(paginatedSlotCommitFrameRef.current);
      paginatedSlotCommitFrameRef.current = null;
    }
  }, []);

  const clearPaginatedSlotPromotionFrame = useCallback(() => {
    clearPaginatedSlotHandoffFrame();
    clearPaginatedSlotCommitFrame();
  }, [clearPaginatedSlotCommitFrame, clearPaginatedSlotHandoffFrame]);

  const clearHorizontalScrollSyncResetFrame = useCallback(() => {
    if (horizontalScrollSyncResetFrameRef.current !== null) {
      window.cancelAnimationFrame(horizontalScrollSyncResetFrameRef.current);
      horizontalScrollSyncResetFrameRef.current = null;
    }
  }, []);

  const clearContinuousAnimationFrame = useCallback(() => {
    if (continuousAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(continuousAnimationFrameRef.current);
      continuousAnimationFrameRef.current = null;
    }
  }, []);

  const clearContinuousReadyRetryFrame = useCallback(() => {
    if (continuousReadyRetryFrameRef.current !== null) {
      window.cancelAnimationFrame(continuousReadyRetryFrameRef.current);
      continuousReadyRetryFrameRef.current = null;
    }
  }, []);

  const clearContinuousProgrammaticNavigation = useCallback(
    ({ clearRequested = true }: { clearRequested?: boolean } = {}) => {
      continuousReadyWaitTokenRef.current += 1;
      clearContinuousAnimationFrame();
      clearContinuousReadyRetryFrame();
      continuousAnimationRef.current = null;
      setReaderContinuousWaitingForReadyPageIndex(null);
      setReaderContinuousAnimatingPageIndex(null);
      if (clearRequested) {
        setReaderContinuousRequestedPageIndex(null);
      }
    },
    [
      clearContinuousAnimationFrame,
      clearContinuousReadyRetryFrame,
      setReaderContinuousAnimatingPageIndex,
      setReaderContinuousRequestedPageIndex,
      setReaderContinuousWaitingForReadyPageIndex,
    ],
  );

  const clearPendingHorizontalScrollSync = useCallback(() => {
    pendingHorizontalScrollSyncRef.current = null;
    clearHorizontalScrollSyncResetFrame();
  }, [clearHorizontalScrollSyncResetFrame]);

  const clearHorizontalPageUrlSyncTimeout = useCallback(() => {
    if (horizontalPageUrlSyncTimeoutRef.current !== null) {
      window.clearTimeout(horizontalPageUrlSyncTimeoutRef.current);
      horizontalPageUrlSyncTimeoutRef.current = null;
    }
  }, []);

  const clearVerticalPageUrlSyncTimeout = useCallback(() => {
    if (verticalPageUrlSyncTimeoutRef.current !== null) {
      window.clearTimeout(verticalPageUrlSyncTimeoutRef.current);
      verticalPageUrlSyncTimeoutRef.current = null;
    }
  }, []);

  const clearKeyboardHoldStartTimeout = useCallback(() => {
    if (keyboardHoldStartTimeoutRef.current !== null) {
      window.clearTimeout(keyboardHoldStartTimeoutRef.current);
      keyboardHoldStartTimeoutRef.current = null;
    }
  }, []);

  const clearKeyboardHoldRepeatInterval = useCallback(() => {
    if (keyboardHoldRepeatIntervalRef.current !== null) {
      window.clearInterval(keyboardHoldRepeatIntervalRef.current);
      keyboardHoldRepeatIntervalRef.current = null;
    }
  }, []);

  const clearReaderMenuHintTimer = useCallback(() => {
    if (readerMenuHintTimeoutRef.current !== null) {
      window.clearTimeout(readerMenuHintTimeoutRef.current);
      readerMenuHintTimeoutRef.current = null;
    }
  }, []);

  const clearKeyboardPageHold = useCallback(
    (direction?: ReaderPageStepDirection | null) => {
      if (!direction || activeKeyboardHoldDirectionRef.current === direction) {
        activeKeyboardHoldDirectionRef.current = null;
      }
      clearKeyboardHoldStartTimeout();
      clearKeyboardHoldRepeatInterval();
    },
    [clearKeyboardHoldRepeatInterval, clearKeyboardHoldStartTimeout],
  );

  const clearHiddenProgressHideTimer = useCallback(() => {
    if (hideHiddenProgressTimeoutRef.current !== null) {
      window.clearTimeout(hideHiddenProgressTimeoutRef.current);
      hideHiddenProgressTimeoutRef.current = null;
    }
  }, []);

  const clearMenuTriggerHideTimer = useCallback(() => {
    if (menuTriggerHideTimeoutRef.current !== null) {
      window.clearTimeout(menuTriggerHideTimeoutRef.current);
      menuTriggerHideTimeoutRef.current = null;
    }
  }, []);

  const clearMenuTriggerUnmountTimer = useCallback(() => {
    if (menuTriggerUnmountTimeoutRef.current !== null) {
      window.clearTimeout(menuTriggerUnmountTimeoutRef.current);
      menuTriggerUnmountTimeoutRef.current = null;
    }
  }, []);

  const clearMenuOverlayUnmountTimer = useCallback(() => {
    if (menuOverlayUnmountTimeoutRef.current !== null) {
      window.clearTimeout(menuOverlayUnmountTimeoutRef.current);
      menuOverlayUnmountTimeoutRef.current = null;
    }
  }, []);

  const clearProgressInteractionTimer = useCallback(() => {
    if (progressInteractionTimeoutRef.current !== null) {
      window.clearTimeout(progressInteractionTimeoutRef.current);
      progressInteractionTimeoutRef.current = null;
    }
  }, []);

  const clearProgressOverlayUnmountTimer = useCallback(() => {
    if (progressOverlayUnmountTimeoutRef.current !== null) {
      window.clearTimeout(progressOverlayUnmountTimeoutRef.current);
      progressOverlayUnmountTimeoutRef.current = null;
    }
  }, []);

  const revealHiddenProgress = useCallback(() => {
    clearHiddenProgressHideTimer();
    clearProgressInteractionTimer();
    setIsHiddenProgressRevealed(true);
    setIsProgressInteracting(true);
  }, [clearHiddenProgressHideTimer, clearProgressInteractionTimer]);

  const revealMenuTrigger = useCallback(() => {
    clearMenuTriggerHideTimer();
    setIsMenuTriggerVisible(true);
  }, [clearMenuTriggerHideTimer]);

  const scheduleHiddenProgressHide = useCallback(() => {
    clearHiddenProgressHideTimer();
    hideHiddenProgressTimeoutRef.current = window.setTimeout(() => {
      setIsHiddenProgressRevealed(false);
      setIsProgressInteracting(false);
      hideHiddenProgressTimeoutRef.current = null;
    }, HIDDEN_PROGRESS_HIDE_DELAY_MS);
  }, [clearHiddenProgressHideTimer]);

  const scheduleMenuTriggerHide = useCallback(
    (delayMs = HIDDEN_PROGRESS_HIDE_DELAY_MS) => {
      clearMenuTriggerHideTimer();
      menuTriggerHideTimeoutRef.current = window.setTimeout(() => {
        setIsMenuTriggerVisible(false);
        menuTriggerHideTimeoutRef.current = null;
      }, delayMs);
    },
    [clearMenuTriggerHideTimer],
  );

  const scheduleProgressInteractionReset = useCallback(
    (delayMs = PROGRESS_TOUCH_FEEDBACK_MS) => {
      clearProgressInteractionTimer();
      progressInteractionTimeoutRef.current = window.setTimeout(() => {
        setIsProgressInteracting(false);
        progressInteractionTimeoutRef.current = null;
      }, delayMs);
    },
    [clearProgressInteractionTimer],
  );

  const handleProgressPointerEnter = useCallback(() => {
    clearHiddenProgressHideTimer();
    clearProgressInteractionTimer();
    setIsProgressInteracting(true);
  }, [clearHiddenProgressHideTimer, clearProgressInteractionTimer]);

  const handleProgressPointerLeave = useCallback(() => {
    if (isProgressPointerDraggingRef.current) {
      return;
    }

    if (visualState.progressStyle === "hidden") {
      scheduleHiddenProgressHide();
      return;
    }

    clearProgressInteractionTimer();
    setIsProgressInteracting(false);
  }, [clearProgressInteractionTimer, scheduleHiddenProgressHide, visualState.progressStyle]);

  useEffect(
    () => () => {
      if (stageChromeMeasurementFrameRef.current !== null) {
        window.cancelAnimationFrame(stageChromeMeasurementFrameRef.current);
        stageChromeMeasurementFrameRef.current = null;
      }
      clearHiddenProgressHideTimer();
      clearHorizontalPageUrlSyncTimeout();
      clearVerticalPageUrlSyncTimeout();
      clearPendingHorizontalScrollSync();
      clearInitialReaderPositionFrame();
      clearMenuOverlayUnmountTimer();
      clearMenuTriggerUnmountTimer();
      clearMenuTriggerHideTimer();
      clearProgressOverlayUnmountTimer();
      clearProgressInteractionTimer();
      clearReaderMenuHintTimer();
    },
    [
      clearHiddenProgressHideTimer,
      clearHorizontalPageUrlSyncTimeout,
      clearVerticalPageUrlSyncTimeout,
      clearPendingHorizontalScrollSync,
      clearInitialReaderPositionFrame,
      clearMenuTriggerUnmountTimer,
      clearMenuOverlayUnmountTimer,
      clearMenuTriggerHideTimer,
      clearProgressInteractionTimer,
      clearProgressOverlayUnmountTimer,
      clearReaderMenuHintTimer,
      stageChromeMeasurementFrameRef,
    ],
  );

  useEffect(() => {
    clearReaderMenuHintTimer();

    if (!isLoaded || hasShownReaderMenuHintRef.current) {
      return;
    }

    if (hasSeenReaderMenuHint()) {
      hasShownReaderMenuHintRef.current = true;
      return;
    }

    readerMenuHintTimeoutRef.current = window.setTimeout(() => {
      if (hasShownReaderMenuHintRef.current) {
        readerMenuHintTimeoutRef.current = null;
        return;
      }

      hasShownReaderMenuHintRef.current = true;
      markReaderMenuHintSeen();
      toast({
        title: "O menu está disponível no canto do leitor.",
        intent: "info",
      });
      readerMenuHintTimeoutRef.current = null;
    }, 0);

    return clearReaderMenuHintTimer;
  }, [clearReaderMenuHintTimer, isLoaded]);

  useEffect(() => {
    setIsMenuOpen(false);
    revealMenuTrigger();
    scheduleMenuTriggerHide(MENU_TRIGGER_INITIAL_VISIBLE_MS);
  }, [currentChapterValue, revealMenuTrigger, scheduleMenuTriggerHide]);

  const shouldDisplayMenuTrigger = !isMenuOpen && isMenuTriggerVisible;

  useEffect(() => {
    clearMenuTriggerUnmountTimer();

    if (shouldDisplayMenuTrigger) {
      setIsMenuTriggerMounted(true);
      const frame = window.requestAnimationFrame(() => {
        setIsMenuTriggerAnimatingVisible(true);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setIsMenuTriggerAnimatingVisible(false);
    if (!isMenuTriggerMounted) {
      return;
    }

    menuTriggerUnmountTimeoutRef.current = window.setTimeout(() => {
      setIsMenuTriggerMounted(false);
      menuTriggerUnmountTimeoutRef.current = null;
    }, MENU_TRIGGER_EXIT_TRANSITION_MS);
  }, [clearMenuTriggerUnmountTimer, isMenuTriggerMounted, shouldDisplayMenuTrigger]);

  useEffect(() => {
    clearMenuOverlayUnmountTimer();

    if (isMenuOpen) {
      setIsMenuOverlayMounted(true);
      return;
    }

    setIsMenuOverlayVisible(false);
    if (!isMenuOverlayMounted) {
      return;
    }

    menuOverlayUnmountTimeoutRef.current = window.setTimeout(() => {
      setIsMenuOverlayMounted(false);
      menuOverlayUnmountTimeoutRef.current = null;
    }, MENU_OVERLAY_TRANSITION_MS);
  }, [clearMenuOverlayUnmountTimer, isMenuOpen, isMenuOverlayMounted]);

  useEffect(() => {
    if (!isMenuOpen || !isMenuOverlayMounted) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setIsMenuOverlayVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isMenuOpen, isMenuOverlayMounted]);

  useEffect(() => {
    if (isStageInViewport) {
      return;
    }

    setIsMenuOpen(false);
  }, [isStageInViewport]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    clearHiddenProgressHideTimer();
    clearProgressInteractionTimer();
    setIsHiddenProgressRevealed(false);
    setIsProgressInteracting(false);
  }, [clearHiddenProgressHideTimer, clearProgressInteractionTimer, isMenuOpen]);

  function applyMenuGeometry(
    metrics: VisibleStageChromeMetrics = visibleStageChromeMetricsRef.current,
    menuStickyTopOffsetPx: number = menuStickyTopOffsetPxRef.current,
  ) {
    menuStickyTopOffsetPxRef.current = menuStickyTopOffsetPx;

    if (menuViewportRef.current) {
      menuViewportRef.current.style.height = `${Math.max(metrics.height, 0)}px`;
    }
    if (menuViewportInnerRef.current) {
      menuViewportInnerRef.current.style.paddingTop = `${menuStickyTopOffsetPx}px`;
    }

    const panelNode = menuPanelRef.current;
    if (!panelNode) {
      return;
    }

    const availableMenuHeight = Math.max(
      metrics.height - menuStickyTopOffsetPx - MENU_PANEL_BOTTOM_INSET_PX,
      0,
    );
    const headerHeight = Math.max(
      Math.ceil(menuHeaderRef.current?.getBoundingClientRect().height || 0),
      0,
    );
    const measuredContentNaturalHeight = Math.max(
      Math.ceil(menuContentRef.current?.scrollHeight || 0),
      Math.ceil(menuContentRef.current?.getBoundingClientRect().height || 0),
      Math.max(Math.ceil(panelNode.scrollHeight || 0) - headerHeight, 0),
      0,
    );
    const contentNaturalHeight =
      measuredContentNaturalHeight > 0 ? measuredContentNaturalHeight : availableMenuHeight;
    const targetPanelHeight = Math.min(
      Math.max(headerHeight + contentNaturalHeight, headerHeight),
      availableMenuHeight,
    );
    let nextPanelHeight = targetPanelHeight;
    let nextScrollAreaHeight = Math.max(nextPanelHeight - headerHeight, 0);

    panelNode.style.maxHeight = `${availableMenuHeight}px`;
    panelNode.style.height = `${nextPanelHeight}px`;

    const scrollAreaNode = menuScrollAreaRef.current;
    if (scrollAreaNode) {
      scrollAreaNode.style.maxHeight = `${nextScrollAreaHeight}px`;
      scrollAreaNode.style.height = `${nextScrollAreaHeight}px`;
      scrollAreaNode.style.overflowY = "auto";

      const residualOverflow = Math.max(
        scrollAreaNode.scrollHeight - scrollAreaNode.clientHeight,
        0,
      );
      const availablePanelSlack = Math.max(availableMenuHeight - nextPanelHeight, 0);

      if (residualOverflow > 0 && availablePanelSlack > 0) {
        const fitDelta = Math.min(residualOverflow, availablePanelSlack);
        nextPanelHeight += fitDelta;
        nextScrollAreaHeight = Math.max(nextPanelHeight - headerHeight, 0);

        panelNode.style.height = `${nextPanelHeight}px`;
        scrollAreaNode.style.maxHeight = `${nextScrollAreaHeight}px`;
        scrollAreaNode.style.height = `${nextScrollAreaHeight}px`;
      }

      const finalResidualOverflow = Math.max(
        scrollAreaNode.scrollHeight - scrollAreaNode.clientHeight,
        0,
      );

      if (finalResidualOverflow <= MENU_SCROLL_FIT_EPSILON_PX) {
        scrollAreaNode.style.overflowY = "hidden";
      }
    }
  }

  useLayoutEffect(() => {
    const measureStageChromeNow = () => {
      const shell = shellRef.current;
      const infoBar = infoBarRef.current;
      const node = stageRef.current;
      if (!shell || !node) {
        return;
      }

      const stageRect = node.getBoundingClientRect();
      const infoBarRect = infoBar?.getBoundingClientRect();
      const viewportMetrics = getVisibleViewportMetrics();
      const nextVisibleViewportHeight = Math.max(Math.round(viewportMetrics.height), 320);
      const nextInfoBarMeasuredHeight = Math.round(infoBarRect?.height || 0);
      const infoBarHeight = isCinemaMode ? 0 : nextInfoBarMeasuredHeight;
      const gapHeight =
        isCinemaMode || !infoBarRect
          ? 0
          : Math.max(Math.round(stageRect.top - infoBarRect.bottom), 0);
      const nextStageHeight = Math.max(nextVisibleViewportHeight, 240);
      const nextReaderHeight = isCinemaMode
        ? nextStageHeight
        : nextStageHeight + infoBarHeight + gapHeight;
      const nextVisibleStageChromeMetrics = getVisibleStageViewportMetrics({
        stageRect,
        fallbackHeight: nextStageHeight,
      });
      const nextMenuStickyTopOffsetPx = Math.max(
        (isCinemaMode ? nextInfoBarMeasuredHeight : 0) + MENU_TRIGGER_HOST_TOP_OFFSET_PX,
        MENU_TRIGGER_HOST_TOP_OFFSET_PX,
      );

      visibleStageChromeMetricsRef.current = nextVisibleStageChromeMetrics;
      applyProgressGeometry(nextVisibleStageChromeMetrics);
      applyMenuGeometry(nextVisibleStageChromeMetrics, nextMenuStickyTopOffsetPx);

      setInfoBarMeasuredHeight((current) =>
        current === nextInfoBarMeasuredHeight ? current : nextInfoBarMeasuredHeight,
      );
      setReaderViewportHeight((current) =>
        current === nextReaderHeight ? current : nextReaderHeight,
      );
      setStageViewportHeight((current) =>
        current === nextStageHeight ? current : nextStageHeight,
      );
      setVisibleStageChromeMetrics((current) =>
        current.width === nextVisibleStageChromeMetrics.width &&
        current.height === nextVisibleStageChromeMetrics.height &&
        current.isVisible === nextVisibleStageChromeMetrics.isVisible
          ? current
          : nextVisibleStageChromeMetrics,
      );
    };

    const scheduleStageChromeMeasurement = () => {
      if (stageChromeMeasurementFrameRef.current !== null) {
        return;
      }

      stageChromeMeasurementFrameRef.current = window.requestAnimationFrame(() => {
        stageChromeMeasurementFrameRef.current = null;
        measureStageChromeNow();
      });
    };

    const handleStageChromeViewportChange = () => {
      if (stageChromeMeasurementFrameRef.current !== null) {
        window.cancelAnimationFrame(stageChromeMeasurementFrameRef.current);
        stageChromeMeasurementFrameRef.current = null;
      }
      measureStageChromeNow();
    };

    handleStageChromeViewportChange();

    const viewport = window.visualViewport;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => scheduleStageChromeMeasurement())
        : null;
    if (shellRef.current) {
      resizeObserver?.observe(shellRef.current);
    }
    if (infoBarRef.current) {
      resizeObserver?.observe(infoBarRef.current);
    }
    if (stageRef.current) {
      resizeObserver?.observe(stageRef.current);
    }

    window.addEventListener("scroll", handleStageChromeViewportChange, {
      passive: true,
    });
    window.addEventListener("resize", handleStageChromeViewportChange, {
      passive: true,
    });
    viewport?.addEventListener("resize", handleStageChromeViewportChange);
    viewport?.addEventListener("scroll", handleStageChromeViewportChange);

    return () => {
      if (stageChromeMeasurementFrameRef.current !== null) {
        window.cancelAnimationFrame(stageChromeMeasurementFrameRef.current);
        stageChromeMeasurementFrameRef.current = null;
      }
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", handleStageChromeViewportChange);
      window.removeEventListener("resize", handleStageChromeViewportChange);
      viewport?.removeEventListener("resize", handleStageChromeViewportChange);
      viewport?.removeEventListener("scroll", handleStageChromeViewportChange);
    };
  }, [
    applyProgressGeometry,
    chapterTitle,
    isCinemaMode,
    isMenuOverlayMounted,
    layout,
    paginated,
    projectTitle,
    synopsis,
    visualState.imageFit,
  ]);

  useLayoutEffect(() => {
    applyProgressGeometry();
  }, [applyProgressGeometry]);

  useLayoutEffect(() => {
    if (!isMenuOverlayMounted) {
      return;
    }

    applyMenuGeometry();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      applyMenuGeometry();
    });

    if (menuHeaderRef.current) {
      observer.observe(menuHeaderRef.current);
    }
    if (menuContentRef.current) {
      observer.observe(menuContentRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [applyMenuGeometry, isMenuOverlayMounted]);

  const markPendingHorizontalScrollSync = useCallback(
    (target: HorizontalScrollSyncTarget, scrollLeft: number) => {
      pendingHorizontalScrollSyncRef.current = {
        target,
        scrollLeft,
      };
      clearHorizontalScrollSyncResetFrame();
      horizontalScrollSyncResetFrameRef.current = window.requestAnimationFrame(() => {
        const pendingSync = pendingHorizontalScrollSyncRef.current;
        if (pendingSync?.target === target && Math.abs(pendingSync.scrollLeft - scrollLeft) <= 1) {
          pendingHorizontalScrollSyncRef.current = null;
        }
        horizontalScrollSyncResetFrameRef.current = null;
      });
    },
    [clearHorizontalScrollSyncResetFrame],
  );

  const consumePendingHorizontalScrollSync = useCallback(
    (target: HorizontalScrollSyncTarget, scrollLeft: number) => {
      const pendingSync = pendingHorizontalScrollSyncRef.current;
      if (!pendingSync || pendingSync.target !== target) {
        return false;
      }
      if (Math.abs(pendingSync.scrollLeft - scrollLeft) > 1) {
        return false;
      }
      clearPendingHorizontalScrollSync();
      return true;
    },
    [clearPendingHorizontalScrollSync],
  );

  const syncHorizontalScrollMetrics = useCallback(() => {
    if (layout !== "scroll-horizontal") {
      clearPendingHorizontalScrollSync();
      setHorizontalScrollMetrics((current) =>
        current.clientWidth === 0 && current.scrollWidth === 0 && current.scrollbarHeight === 0
          ? current
          : { clientWidth: 0, scrollWidth: 0, scrollbarHeight: 0 },
      );
      return;
    }

    const viewport = horizontalScrollRef.current;
    const strip = horizontalScrollStripRef.current;
    const rail = horizontalScrollRailRef.current;
    const nextClientWidth = Math.max(viewport?.clientWidth || 0, 0);
    const nextScrollWidth = Math.max(
      strip?.scrollWidth || 0,
      viewport?.scrollWidth || 0,
      nextClientWidth,
    );
    const measuredScrollbarHeight = Math.max(
      (viewport?.offsetHeight || 0) - (viewport?.clientHeight || 0),
      0,
    );

    setHorizontalScrollMetrics((current) =>
      // Keep the largest measured hidden gutter for the active horizontal session so the
      // strip height does not bounce while browsers toggle the native scrollbar footprint.
      (() => {
        const nextScrollbarHeight =
          nextClientWidth === 0 && nextScrollWidth === 0
            ? 0
            : measuredScrollbarHeight > 0
              ? Math.max(measuredScrollbarHeight, current.scrollbarHeight)
              : current.scrollbarHeight;

        return current.clientWidth === nextClientWidth &&
          current.scrollWidth === nextScrollWidth &&
          current.scrollbarHeight === nextScrollbarHeight
          ? current
          : {
              clientWidth: nextClientWidth,
              scrollWidth: nextScrollWidth,
              scrollbarHeight: nextScrollbarHeight,
            };
      })(),
    );

    if (viewport && rail && Math.abs(rail.scrollLeft - viewport.scrollLeft) > 1) {
      markPendingHorizontalScrollSync("rail", viewport.scrollLeft);
      rail.scrollLeft = viewport.scrollLeft;
    }
  }, [clearPendingHorizontalScrollSync, layout, markPendingHorizontalScrollSync]);

  const syncHorizontalScrollPosition = useCallback(
    (source: "viewport" | "rail") => {
      const viewport = horizontalScrollRef.current;
      const rail = horizontalScrollRailRef.current;
      if (!viewport || !rail) {
        return;
      }

      const sourceNode = source === "viewport" ? viewport : rail;
      const targetNode = source === "viewport" ? rail : viewport;
      const nextScrollLeft = sourceNode.scrollLeft;
      if (Math.abs(targetNode.scrollLeft - nextScrollLeft) <= 1) {
        return;
      }

      markPendingHorizontalScrollSync(source === "viewport" ? "rail" : "viewport", nextScrollLeft);
      targetNode.scrollLeft = nextScrollLeft;
    },
    [markPendingHorizontalScrollSync],
  );

  useEffect(() => {
    syncHorizontalScrollMetrics();
    const viewport = horizontalScrollRef.current;
    const strip = horizontalScrollStripRef.current;
    const rail = horizontalScrollRailRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => syncHorizontalScrollMetrics())
        : null;

    if (viewport) {
      resizeObserver?.observe(viewport);
    }
    if (strip) {
      resizeObserver?.observe(strip);
    }
    if (rail) {
      resizeObserver?.observe(rail);
    }

    window.addEventListener("resize", syncHorizontalScrollMetrics, {
      passive: true,
    });
    window.visualViewport?.addEventListener("resize", syncHorizontalScrollMetrics);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncHorizontalScrollMetrics);
      window.visualViewport?.removeEventListener("resize", syncHorizontalScrollMetrics);
    };
  }, [layout, renderablePages.length, syncHorizontalScrollMetrics]);

  useEffect(() => {
    const wasPaginated = wasPaginatedRef.current;
    wasPaginatedRef.current = paginated;

    if (paginated) {
      clearContinuousProgrammaticNavigation();
      clearPaginatedSlotPromotionFrame();
      setReaderHandoffSlotIndex(null);
      setReaderPendingSlotIndex(null);
      setReaderActiveSlotIndex(clampIndex(activeSlotIndexRef.current, slots.length));
      return;
    }

    const clampedPageCount = Math.max(originalPages.length, 1);
    if (wasPaginated) {
      setReaderContinuousAnimatingPageIndex(null);
      setReaderContinuousRequestedPageIndex(null);
    } else {
      if (
        continuousAnimatingPageIndexRef.current !== null &&
        continuousAnimatingPageIndexRef.current >= clampedPageCount
      ) {
        setReaderContinuousAnimatingPageIndex(null);
      }
      if (
        continuousRequestedPageIndexRef.current !== null &&
        continuousRequestedPageIndexRef.current >= clampedPageCount
      ) {
        setReaderContinuousRequestedPageIndex(null);
      }
    }
    setReaderActivePageIndex(clampIndex(activePageIndexRef.current, clampedPageCount));
  }, [
    clearContinuousProgrammaticNavigation,
    clearPaginatedSlotPromotionFrame,
    originalPages.length,
    paginated,
    setReaderActivePageIndex,
    setReaderContinuousAnimatingPageIndex,
    setReaderContinuousRequestedPageIndex,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
    setReaderActiveSlotIndex,
    slots.length,
  ]);

  const currentInitialReaderPositionKey = useMemo(
    () => `${currentChapterValue}:${layout}:${resolvedInitialPageIndex}`,
    [currentChapterValue, layout, resolvedInitialPageIndex],
  );

  useEffect(() => {
    if (lastAppliedInitialPageKeyRef.current === currentInitialReaderPositionKey) {
      return;
    }

    if (paginated) {
      const nextSlotIndex = findSlotIndexForPage(slots, resolvedInitialPageIndex);
      clearContinuousProgrammaticNavigation();
      clearPaginatedSlotPromotionFrame();
      setReaderHandoffSlotIndex(null);
      setReaderPendingSlotIndex(null);
      setReaderActiveSlotIndex(nextSlotIndex);
      setReaderActivePageIndex(getVisibleSlotPageIndex(nextSlotIndex));
    } else {
      clearContinuousProgrammaticNavigation();
      setReaderActivePageIndex(resolvedInitialPageIndex);
    }

    lastAppliedInitialPageKeyRef.current = currentInitialReaderPositionKey;
  }, [
    clearContinuousProgrammaticNavigation,
    clearPaginatedSlotPromotionFrame,
    currentInitialReaderPositionKey,
    getVisibleSlotPageIndex,
    paginated,
    resolvedInitialPageIndex,
    setReaderActivePageIndex,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
    setReaderActiveSlotIndex,
    slots,
  ]);

  const commitRouterPageUrlSync = useCallback(
    (pageIndex: number, syncKey: string) => {
      const params = new URLSearchParams(location.search);
      const nextPageValue = String(clampIndex(pageIndex, Math.max(originalPages.length, 1)) + 1);
      if (params.get("page") === nextPageValue) {
        lastSyncedPageUrlKeyRef.current = syncKey;
        return;
      }

      params.set("page", nextPageValue);
      const nextSearch = params.toString();
      const nextLocationState =
        typeof location.state === "object" && location.state !== null
          ? {
              ...(location.state as Record<string, unknown>),
              preserveScroll: true,
            }
          : { preserveScroll: true };
      navigate(
        {
          pathname: location.pathname,
          search: nextSearch ? `?${nextSearch}` : "",
          hash: location.hash,
        },
        { replace: true, state: nextLocationState },
      );
      lastSyncedPageUrlKeyRef.current = syncKey;
    },
    [
      location.hash,
      location.pathname,
      location.search,
      location.state,
      navigate,
      originalPages.length,
    ],
  );

  const commitHorizontalPageUrlSync = useCallback(
    (pageIndex: number, syncKey: string) => {
      const params = new URLSearchParams(window.location.search);
      const nextPageValue = String(clampIndex(pageIndex, Math.max(originalPages.length, 1)) + 1);
      if (params.get("page") === nextPageValue) {
        lastSyncedPageUrlKeyRef.current = syncKey;
        return;
      }

      params.set("page", nextPageValue);
      const nextSearch = params.toString();
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", nextUrl);
      lastSyncedPageUrlKeyRef.current = syncKey;
    },
    [originalPages.length],
  );

  useEffect(() => {
    const syncKey = `${currentChapterValue}:${layout}:${resolvedInitialPageIndex}`;
    const nextPageIndex = clampIndex(activePageIndex, Math.max(originalPages.length, 1));
    if (lastSyncedPageUrlKeyRef.current !== syncKey && nextPageIndex !== resolvedInitialPageIndex) {
      return;
    }

    if (layout === "scroll-horizontal" && forceImmediateHorizontalPageUrlSyncRef.current) {
      forceImmediateHorizontalPageUrlSyncRef.current = false;
      pendingHorizontalPageUrlSyncRef.current = null;
      clearHorizontalPageUrlSyncTimeout();
      commitHorizontalPageUrlSync(nextPageIndex, syncKey);
      return;
    }

    if (layout === "scroll-vertical" && forceImmediateVerticalPageUrlSyncRef.current) {
      forceImmediateVerticalPageUrlSyncRef.current = false;
      pendingVerticalPageUrlSyncRef.current = null;
      clearVerticalPageUrlSyncTimeout();
      commitRouterPageUrlSync(nextPageIndex, syncKey);
      return;
    }

    if (
      (layout !== "scroll-horizontal" && layout !== "scroll-vertical") ||
      lastSyncedPageUrlKeyRef.current !== syncKey
    ) {
      pendingHorizontalPageUrlSyncRef.current = null;
      pendingVerticalPageUrlSyncRef.current = null;
      clearHorizontalPageUrlSyncTimeout();
      clearVerticalPageUrlSyncTimeout();
      if (layout === "scroll-horizontal") {
        commitHorizontalPageUrlSync(nextPageIndex, syncKey);
      } else if (layout === "scroll-vertical") {
        commitRouterPageUrlSync(nextPageIndex, syncKey);
      } else {
        commitRouterPageUrlSync(nextPageIndex, syncKey);
      }
      return;
    }

    if (layout === "scroll-horizontal") {
      pendingHorizontalPageUrlSyncRef.current = nextPageIndex;
      clearHorizontalPageUrlSyncTimeout();
      horizontalPageUrlSyncTimeoutRef.current = window.setTimeout(() => {
        const pendingPageIndex = pendingHorizontalPageUrlSyncRef.current;
        if (pendingPageIndex === null) {
          return;
        }
        commitHorizontalPageUrlSync(pendingPageIndex, syncKey);
        pendingHorizontalPageUrlSyncRef.current = null;
        horizontalPageUrlSyncTimeoutRef.current = null;
      }, HORIZONTAL_PAGE_URL_SYNC_SETTLE_MS);

      return () => {
        clearHorizontalPageUrlSyncTimeout();
      };
    }

    pendingVerticalPageUrlSyncRef.current = nextPageIndex;
    clearVerticalPageUrlSyncTimeout();
    verticalPageUrlSyncTimeoutRef.current = window.setTimeout(() => {
      const pendingPageIndex = pendingVerticalPageUrlSyncRef.current;
      if (pendingPageIndex === null) {
        return;
      }
      commitRouterPageUrlSync(pendingPageIndex, syncKey);
      pendingVerticalPageUrlSyncRef.current = null;
      verticalPageUrlSyncTimeoutRef.current = null;
    }, HORIZONTAL_PAGE_URL_SYNC_SETTLE_MS);

    return () => {
      clearVerticalPageUrlSyncTimeout();
    };
  }, [
    activePageIndex,
    clearHorizontalPageUrlSyncTimeout,
    clearVerticalPageUrlSyncTimeout,
    commitHorizontalPageUrlSync,
    commitRouterPageUrlSync,
    currentChapterValue,
    layout,
    originalPages.length,
    resolvedInitialPageIndex,
  ]);

  useEffect(() => {
    if (!paginated) {
      clearPaginatedSlotPromotionFrame();
      setReaderHandoffSlotIndex(null);
      setReaderPendingSlotIndex(null);
      return;
    }
    setReaderActivePageIndex(getVisibleSlotPageIndex(activeSlotIndex));
  }, [
    activeSlotIndex,
    clearPaginatedSlotPromotionFrame,
    getVisibleSlotPageIndex,
    paginated,
    setReaderActivePageIndex,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
  ]);

  const getContinuousPageImageUrl = useCallback(
    (pageIndex: number) => {
      const page = renderablePages[pageIndex];
      if (!page || page.type === "purchase" || page.isPurchasePage) {
        return null;
      }

      const imageUrl = String(page.imageUrl || "");
      return imageUrl || null;
    },
    [renderablePages],
  );

  const markContinuousImageReadyStatus = useCallback(
    (imageUrl: string, status: ContinuousImageReadyStatus) => {
      if (!imageUrl || continuousReadyImageStatusRef.current.get(imageUrl) === status) {
        return;
      }

      continuousReadyImageStatusRef.current.set(imageUrl, status);
    },
    [],
  );

  const ensureContinuousImageReady = useCallback(
    (imageUrl: string) => {
      if (!imageUrl) {
        return Promise.resolve<ContinuousImageReadyStatus>("ready");
      }

      const existingStatus = continuousReadyImageStatusRef.current.get(imageUrl);
      if (existingStatus) {
        return Promise.resolve(existingStatus);
      }

      const existingPromise = continuousReadyImagePromisesRef.current.get(imageUrl);
      if (existingPromise) {
        return existingPromise;
      }

      const nextPromise = new Promise<ContinuousImageReadyStatus>((resolve) => {
        if (typeof Image === "undefined") {
          markContinuousImageReadyStatus(imageUrl, "ready");
          resolve("ready");
          return;
        }

        const image = new Image();
        let settled = false;
        const finish = (status: ContinuousImageReadyStatus) => {
          if (settled) {
            return;
          }
          settled = true;
          image.onload = null;
          image.onerror = null;
          markContinuousImageReadyStatus(imageUrl, status);
          resolve(status);
        };

        image.onload = () => finish("ready");
        image.onerror = () => finish("failed");
        image.src = imageUrl;

        if (image.complete) {
          finish("ready");
          return;
        }

        if (typeof image.decode === "function") {
          image
            .decode()
            .then(() => finish("ready"))
            .catch(() => finish("failed"));
        }
      });

      continuousReadyImagePromisesRef.current.set(imageUrl, nextPromise);
      nextPromise.finally(() => {
        if (continuousReadyImagePromisesRef.current.get(imageUrl) === nextPromise) {
          continuousReadyImagePromisesRef.current.delete(imageUrl);
        }
      });
      return nextPromise;
    },
    [markContinuousImageReadyStatus],
  );

  const markPaginatedImageReady = useCallback((imageUrl: string) => {
    if (!imageUrl || paginatedReadyImageUrlsRef.current.has(imageUrl)) {
      return;
    }

    paginatedReadyImageUrlsRef.current.add(imageUrl);
    setPaginatedReadyVersion((current) => current + 1);
  }, []);

  const ensurePaginatedImageReady = useCallback(
    (imageUrl: string) => {
      if (!imageUrl || paginatedReadyImageUrlsRef.current.has(imageUrl)) {
        return Promise.resolve();
      }

      const existingPromise = paginatedReadyImagePromisesRef.current.get(imageUrl);
      if (existingPromise) {
        return existingPromise;
      }

      const nextPromise = new Promise<void>((resolve) => {
        if (typeof Image === "undefined") {
          markPaginatedImageReady(imageUrl);
          resolve();
          return;
        }

        const image = new Image();
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          image.onload = null;
          image.onerror = null;
          markPaginatedImageReady(imageUrl);
          resolve();
        };

        image.onload = finish;
        image.onerror = finish;
        image.src = imageUrl;

        if (image.complete) {
          finish();
          return;
        }

        if (typeof image.decode === "function") {
          image.decode().then(finish).catch(finish);
        }
      });

      paginatedReadyImagePromisesRef.current.set(imageUrl, nextPromise);
      nextPromise.finally(() => {
        if (paginatedReadyImagePromisesRef.current.get(imageUrl) === nextPromise) {
          paginatedReadyImagePromisesRef.current.delete(imageUrl);
        }
      });
      return nextPromise;
    },
    [markPaginatedImageReady],
  );

  const getPaginatedSlotImageUrls = useCallback(
    (slotIndex: number) => {
      const slot = slots[slotIndex];
      if (!slot) {
        return [];
      }

      return (slot.pages || [])
        .map((pageIndex) => {
          const page = renderablePages[pageIndex];
          if (!page || page.type === "purchase" || page.isPurchasePage) {
            return null;
          }
          return String(page.imageUrl || "");
        })
        .filter((imageUrl): imageUrl is string => Boolean(imageUrl));
    },
    [renderablePages, slots],
  );

  const isPaginatedSlotReady = useCallback(
    (slotIndex: number) =>
      getPaginatedSlotImageUrls(slotIndex).every((imageUrl) =>
        paginatedReadyImageUrlsRef.current.has(imageUrl),
      ),
    [getPaginatedSlotImageUrls],
  );

  const requestPaginatedSlotNavigation = useCallback(
    (nextSlotIndex: number) => {
      const currentSlotCount = slots.length;
      const clampedSlotIndex = clampIndex(nextSlotIndex, currentSlotCount);
      const currentActiveSlotIndex = activeSlotIndexRef.current;
      const currentTargetSlotIndex =
        pendingSlotIndexRef.current ?? handoffSlotIndexRef.current ?? currentActiveSlotIndex;

      if (clampedSlotIndex === currentTargetSlotIndex) {
        return false;
      }

      if (clampedSlotIndex === currentActiveSlotIndex) {
        const hadPaginatedHandoff =
          pendingSlotIndexRef.current !== null || handoffSlotIndexRef.current !== null;
        if (hadPaginatedHandoff) {
          clearPaginatedSlotPromotionFrame();
        }
        setReaderHandoffSlotIndex(null);
        setReaderPendingSlotIndex(null);
        return hadPaginatedHandoff;
      }

      setReaderPendingSlotIndex(clampedSlotIndex);
      return true;
    },
    [
      clearPaginatedSlotPromotionFrame,
      setReaderHandoffSlotIndex,
      setReaderPendingSlotIndex,
      slots.length,
    ],
  );

  useEffect(() => {
    const currentImageUrls = new Set(
      renderablePages
        .map((page) => {
          if (page.type === "purchase" || page.isPurchasePage) {
            return null;
          }
          return String(page.imageUrl || "");
        })
        .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
    );

    continuousReadyImageStatusRef.current.forEach((_status, imageUrl) => {
      if (!currentImageUrls.has(imageUrl)) {
        continuousReadyImageStatusRef.current.delete(imageUrl);
      }
    });
    continuousReadyImagePromisesRef.current.forEach((_promise, imageUrl) => {
      if (!currentImageUrls.has(imageUrl)) {
        continuousReadyImagePromisesRef.current.delete(imageUrl);
      }
    });
  }, [renderablePages]);

  useEffect(() => {
    if (!paginated) {
      return;
    }

    const currentImageUrls = new Set(
      renderablePages
        .map((page) => {
          if (page.type === "purchase" || page.isPurchasePage) {
            return null;
          }
          return String(page.imageUrl || "");
        })
        .filter((imageUrl): imageUrl is string => Boolean(imageUrl)),
    );

    let didPrune = false;
    paginatedReadyImageUrlsRef.current.forEach((imageUrl) => {
      if (!currentImageUrls.has(imageUrl)) {
        paginatedReadyImageUrlsRef.current.delete(imageUrl);
        didPrune = true;
      }
    });
    paginatedReadyImagePromisesRef.current.forEach((_promise, imageUrl) => {
      if (!currentImageUrls.has(imageUrl)) {
        paginatedReadyImagePromisesRef.current.delete(imageUrl);
      }
    });
    if (didPrune) {
      setPaginatedReadyVersion((current) => current + 1);
    }
  }, [paginated, renderablePages]);

  useEffect(() => {
    if (!paginated || pendingSlotIndex === null) {
      return;
    }

    const clampedPendingSlotIndex = clampIndex(pendingSlotIndex, slots.length);
    if (clampedPendingSlotIndex === activeSlotIndexRef.current) {
      clearPaginatedSlotPromotionFrame();
      setReaderHandoffSlotIndex(null);
      setReaderPendingSlotIndex(null);
      return;
    }
    if (clampedPendingSlotIndex !== pendingSlotIndex) {
      setReaderPendingSlotIndex(clampedPendingSlotIndex);
    }
  }, [
    activeSlotIndex,
    clearPaginatedSlotPromotionFrame,
    paginated,
    pendingSlotIndex,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
    slots.length,
  ]);

  const updateContinuousActivePage = useCallback(() => {
    if (paginated || originalPages.length === 0) {
      return;
    }

    if (
      continuousAnimatingPageIndexRef.current !== null ||
      continuousRequestedPageIndexRef.current !== null ||
      continuousWaitingForReadyPageIndexRef.current !== null
    ) {
      return;
    }

    if (layout === "scroll-horizontal") {
      const container = horizontalScrollRef.current;
      if (!container) {
        return;
      }
      const visibilityLeadThresholdPx = Math.min(Math.max(container.clientWidth * 0.08, 32), 72);
      const nextIndex = pickMostVisiblePage({
        measurements: originalPages
          .map((_, index) => {
            const node = pageRefs.current[index];
            if (!node) {
              return null;
            }
            return {
              index,
              ...getHorizontalViewportMeasurement({
                container,
                targetRect: node.getBoundingClientRect(),
                direction,
              }),
            };
          })
          .filter(Boolean) as Array<{
          index: number;
          start: number;
          end: number;
        }>,
        viewportSize: container.clientWidth,
        currentIndex: activePageIndex,
        visibilityLeadThresholdPx,
      });
      setReaderActivePageIndex(nextIndex);
      return;
    }

    const container = verticalScrollRef.current;
    if (!container) {
      return;
    }
    const visibilityLeadThresholdPx = Math.min(Math.max(container.clientHeight * 0.08, 32), 72);
    const nextIndex = pickMostVisiblePage({
      measurements: originalPages
        .map((_, index) => {
          const node = pageRefs.current[index];
          if (!node) {
            return null;
          }
          return {
            index,
            ...getVerticalViewportMeasurement({
              container,
              targetRect: node.getBoundingClientRect(),
            }),
          };
        })
        .filter(Boolean) as Array<{
        index: number;
        start: number;
        end: number;
      }>,
      viewportSize: container.clientHeight,
      currentIndex: activePageIndex,
      visibilityLeadThresholdPx,
    });
    setReaderActivePageIndex(nextIndex);
  }, [
    activePageIndex,
    continuousAnimatingPageIndex,
    direction,
    layout,
    originalPages,
    paginated,
    setReaderActivePageIndex,
  ]);

  useEffect(() => {
    lastContinuousVerticalScrollYRef.current = verticalScrollRef.current
      ? getLogicalVerticalScrollTop({
          container: verticalScrollRef.current,
        })
      : 0;
    lastContinuousHorizontalScrollLeftRef.current = horizontalScrollRef.current
      ? getLogicalHorizontalScrollLeft({
          container: horizontalScrollRef.current,
          direction,
        })
      : 0;
    lastContinuousProgressDirectionRef.current = null;
  }, [direction, layout, paginated, progressPosition]);

  const updateContinuousProgressVisualRatio = useCallback(() => {
    if (
      paginated ||
      originalPages.length <= 1 ||
      progressPosition === "bottom" ||
      originalPages.length === 0
    ) {
      setContinuousProgressVisualRatio((current) => (current === 0 ? current : 0));
      return;
    }

    if (layout === "scroll-horizontal") {
      const container = horizontalScrollRef.current;
      if (!container || container.clientWidth <= 0) {
        return;
      }

      const currentScrollLeft = getLogicalHorizontalScrollLeft({
        container,
        direction,
      });
      const previousScrollLeft = lastContinuousHorizontalScrollLeftRef.current;
      const nextDirection =
        typeof previousScrollLeft !== "number"
          ? lastContinuousProgressDirectionRef.current
          : currentScrollLeft > previousScrollLeft
            ? "forward"
            : currentScrollLeft < previousScrollLeft
              ? "backward"
              : lastContinuousProgressDirectionRef.current;
      lastContinuousHorizontalScrollLeftRef.current = currentScrollLeft;
      lastContinuousProgressDirectionRef.current = nextDirection;

      const nextRatio = interpolateContinuousPageRatio({
        measurements: originalPages
          .map((_, index) => {
            const node = pageRefs.current[index];
            if (!node) {
              return null;
            }
            return {
              index,
              ...getHorizontalViewportMeasurement({
                container,
                targetRect: node.getBoundingClientRect(),
                direction,
              }),
            };
          })
          .filter(Boolean) as Array<{
          index: number;
          start: number;
          end: number;
        }>,
        viewportSize: container.clientWidth,
        viewportAnchorOffsetPx: getContinuousProgressAnchorOffsetPx({
          viewportSize: container.clientWidth,
          direction: nextDirection,
        }),
      });
      setContinuousProgressVisualRatio((current) =>
        Math.abs(current - nextRatio) < 0.0005 ? current : nextRatio,
      );
      return;
    }

    const container = verticalScrollRef.current;
    if (!container || container.clientHeight <= 0) {
      return;
    }

    const currentScrollY = getLogicalVerticalScrollTop({
      container,
    });
    const previousScrollY = lastContinuousVerticalScrollYRef.current;
    const nextDirection =
      typeof previousScrollY !== "number"
        ? lastContinuousProgressDirectionRef.current
        : currentScrollY > previousScrollY
          ? "forward"
          : currentScrollY < previousScrollY
            ? "backward"
            : lastContinuousProgressDirectionRef.current;
    lastContinuousVerticalScrollYRef.current = currentScrollY;
    lastContinuousProgressDirectionRef.current = nextDirection;

    const nextRatio = interpolateContinuousPageRatio({
      measurements: originalPages
        .map((_, index) => {
          const node = pageRefs.current[index];
          if (!node) {
            return null;
          }
          return {
            index,
            ...getVerticalViewportMeasurement({
              container,
              targetRect: node.getBoundingClientRect(),
            }),
          };
        })
        .filter(Boolean) as Array<{
        index: number;
        start: number;
        end: number;
      }>,
      viewportSize: container.clientHeight,
      viewportAnchorOffsetPx: getContinuousProgressAnchorOffsetPx({
        viewportSize: container.clientHeight,
        direction: nextDirection,
      }),
    });
    setContinuousProgressVisualRatio((current) =>
      Math.abs(current - nextRatio) < 0.0005 ? current : nextRatio,
    );
  }, [direction, layout, originalPages, paginated, progressPosition]);

  const getContinuousNavigationAnchorPageIndex = useCallback(
    () =>
      continuousRequestedPageIndexRef.current ??
      continuousAnimatingPageIndexRef.current ??
      activePageIndexRef.current,
    [],
  );

  const requestContinuousPageNavigation = useCallback(
    ({ source, targetIndex }: { source: ReaderPageNavigationSource; targetIndex: number }) => {
      if (paginated) {
        return false;
      }

      const clampedTargetIndex = clampIndex(targetIndex, Math.max(originalPages.length, 1));
      const currentTargetIndex = getContinuousNavigationAnchorPageIndex();
      if (clampedTargetIndex === currentTargetIndex) {
        return false;
      }

      continuousNavigationSourceRef.current = source;
      setReaderContinuousRequestedPageIndex(clampedTargetIndex);
      return true;
    },
    [
      getContinuousNavigationAnchorPageIndex,
      originalPages.length,
      paginated,
      setReaderContinuousRequestedPageIndex,
    ],
  );

  const queueContinuousHoldNavigation = useCallback(
    (stepDirection: ReaderPageStepDirection) => {
      const anchorPageIndex = activePageIndexRef.current;
      const nextPageIndex = clampIndex(
        anchorPageIndex + (stepDirection === "next" ? 1 : -1),
        Math.max(originalPages.length, 1),
      );
      if (nextPageIndex === anchorPageIndex) {
        return false;
      }

      continuousNavigationSourceRef.current = "keyboard-hold";
      setReaderContinuousRequestedPageIndex(nextPageIndex);
      return true;
    },
    [originalPages.length, setReaderContinuousRequestedPageIndex],
  );

  const applyContinuousProgrammaticScrollPosition = useCallback(
    (animationAxis: ContinuousAnimationAxis, nextPosition: number) => {
      const normalizedPosition = Math.max(Math.round(nextPosition), 0);

      if (animationAxis === "horizontal") {
        const container = horizontalScrollRef.current;
        if (!container) {
          return;
        }

        container.scrollLeft = normalizedPosition;
        const rail = horizontalScrollRailRef.current;
        if (rail && Math.abs(rail.scrollLeft - normalizedPosition) > 1) {
          rail.scrollLeft = normalizedPosition;
        }
        return;
      }

      const container = verticalScrollRef.current;
      if (!container) {
        return;
      }

      container.scrollTop = normalizedPosition;
    },
    [],
  );

  const resolveContinuousReaderAnimation = useCallback(
    (
      targetIndex: number,
      source: ReaderPageNavigationSource,
      options?: {
        from?: number;
        resolvedVerticalTargetScrollTop?: number;
      },
    ) => {
      if (layout === "scroll-horizontal") {
        const container = horizontalScrollRef.current;
        const targetNode = pageRefs.current[targetIndex];
        if (!container || !targetNode) {
          return null;
        }

        const targetRect = targetNode.getBoundingClientRect();
        if (container.clientWidth <= 0 || targetRect.width <= 0) {
          return null;
        }

        return {
          axis: "horizontal" as const,
          duration: CONTINUOUS_PAGE_STEP_DURATION_MS,
          from: options?.from ?? container.scrollLeft,
          source,
          startTime: null,
          targetIndex,
          to: getCenteredHorizontalScrollLeft({
            container,
            targetNode,
            targetRect,
          }),
        };
      }

      const container = verticalScrollRef.current;
      const targetNode = pageRefs.current[targetIndex];
      if (!container || !targetNode) {
        return null;
      }

      const targetRect = targetNode.getBoundingClientRect();
      if (container.clientHeight <= 0 || targetRect.height <= 0) {
        return null;
      }

      const resolvedVerticalTargetScrollTop =
        options?.resolvedVerticalTargetScrollTop ??
        getTopAlignedVerticalScrollTop({
          container,
          targetNode,
          targetRect,
        });

      return {
        axis: "vertical" as const,
        duration: CONTINUOUS_PAGE_STEP_DURATION_MS,
        from: options?.from ?? container.scrollTop,
        source,
        startTime: null,
        targetIndex,
        to: resolvedVerticalTargetScrollTop,
      };
    },
    [layout],
  );

  const cancelContinuousVerticalTargetWait = useCallback(
    ({ stopHold = false, targetIndex }: { stopHold?: boolean; targetIndex: number }) => {
      continuousReadyWaitTokenRef.current += 1;
      clearContinuousReadyRetryFrame();
      setReaderContinuousWaitingForReadyPageIndex(null);
      if (continuousRequestedPageIndexRef.current === targetIndex) {
        setReaderContinuousRequestedPageIndex(null);
      }
      if (stopHold && activeKeyboardHoldDirectionRef.current !== null) {
        clearKeyboardPageHold(activeKeyboardHoldDirectionRef.current);
      }
    },
    [
      clearContinuousReadyRetryFrame,
      clearKeyboardPageHold,
      setReaderContinuousRequestedPageIndex,
      setReaderContinuousWaitingForReadyPageIndex,
    ],
  );

  const finishContinuousReaderAnimation = useCallback(
    (animation: ContinuousReaderAnimation) => {
      clearContinuousAnimationFrame();
      continuousAnimationRef.current = null;
      applyContinuousProgrammaticScrollPosition(animation.axis, animation.to);
      updateContinuousProgressVisualRatio();
      setReaderContinuousAnimatingPageIndex(null);
      if (continuousRequestedPageIndexRef.current === animation.targetIndex) {
        setReaderContinuousRequestedPageIndex(null);
      }

      if (animation.axis === "horizontal") {
        forceImmediateHorizontalPageUrlSyncRef.current = true;
        setReaderActivePageIndex(animation.targetIndex);
        return;
      }

      forceImmediateVerticalPageUrlSyncRef.current = true;
      setReaderActivePageIndex(animation.targetIndex);
    },
    [
      applyContinuousProgrammaticScrollPosition,
      clearContinuousAnimationFrame,
      setReaderContinuousAnimatingPageIndex,
      setReaderContinuousRequestedPageIndex,
      setReaderActivePageIndex,
      updateContinuousProgressVisualRatio,
    ],
  );

  const launchContinuousReaderAnimation = useCallback(
    (nextAnimation: ContinuousReaderAnimation) => {
      clearContinuousAnimationFrame();
      continuousAnimationRef.current = nextAnimation;
      setReaderContinuousWaitingForReadyPageIndex(null);
      setReaderContinuousAnimatingPageIndex(nextAnimation.targetIndex);

      if (Math.abs(nextAnimation.to - nextAnimation.from) <= 1) {
        finishContinuousReaderAnimation(nextAnimation);
        return true;
      }

      const runFrame = (timestamp: number) => {
        const currentAnimation = continuousAnimationRef.current;
        if (!currentAnimation || currentAnimation.targetIndex !== nextAnimation.targetIndex) {
          continuousAnimationFrameRef.current = null;
          return;
        }

        const startTime = currentAnimation.startTime ?? timestamp;
        if (currentAnimation.startTime === null) {
          currentAnimation.startTime = startTime;
        }

        const progress = clampProgressRatio(
          (timestamp - startTime) / Math.max(currentAnimation.duration, 1),
        );
        const nextPosition =
          currentAnimation.from +
          (currentAnimation.to - currentAnimation.from) * easeContinuousPageStep(progress);
        applyContinuousProgrammaticScrollPosition(currentAnimation.axis, nextPosition);

        if (progress >= 1) {
          finishContinuousReaderAnimation(currentAnimation);
          return;
        }

        continuousAnimationFrameRef.current = window.requestAnimationFrame(runFrame);
      };

      runFrame(window.performance?.now?.() ?? Date.now());
      return true;
    },
    [
      applyContinuousProgrammaticScrollPosition,
      clearContinuousAnimationFrame,
      finishContinuousReaderAnimation,
      setReaderContinuousAnimatingPageIndex,
      setReaderContinuousWaitingForReadyPageIndex,
    ],
  );

  const waitForContinuousVerticalTarget = useCallback(
    (targetIndex: number) => {
      if (layout !== "scroll-vertical") {
        return false;
      }

      if (continuousWaitingForReadyPageIndexRef.current === targetIndex) {
        return false;
      }

      continuousReadyWaitTokenRef.current += 1;
      const waitToken = continuousReadyWaitTokenRef.current;
      clearContinuousReadyRetryFrame();
      setReaderContinuousWaitingForReadyPageIndex(targetIndex);

      let retryCount = 0;
      const attempt = () => {
        if (continuousReadyWaitTokenRef.current !== waitToken) {
          return;
        }

        const requestedPageIndex = continuousRequestedPageIndexRef.current;
        if (requestedPageIndex === null) {
          setReaderContinuousWaitingForReadyPageIndex(null);
          return;
        }

        const expectedTargetIndex = clampIndex(
          activePageIndexRef.current + (requestedPageIndex > activePageIndexRef.current ? 1 : -1),
          Math.max(originalPages.length, 1),
        );
        if (expectedTargetIndex !== targetIndex) {
          setReaderContinuousWaitingForReadyPageIndex(null);
          return;
        }

        const nextAnimation = resolveContinuousReaderAnimation(
          targetIndex,
          continuousNavigationSourceRef.current,
        );
        if (nextAnimation) {
          setReaderContinuousWaitingForReadyPageIndex(null);
          launchContinuousReaderAnimation(nextAnimation);
          return;
        }

        retryCount += 1;
        if (retryCount >= CONTINUOUS_READY_LAYOUT_RETRY_MAX_FRAMES) {
          cancelContinuousVerticalTargetWait({
            stopHold: continuousNavigationSourceRef.current === "keyboard-hold",
            targetIndex,
          });
          return;
        }

        continuousReadyRetryFrameRef.current = window.requestAnimationFrame(attempt);
      };

      attempt();

      return false;
    },
    [
      cancelContinuousVerticalTargetWait,
      clearContinuousReadyRetryFrame,
      launchContinuousReaderAnimation,
      layout,
      originalPages.length,
      resolveContinuousReaderAnimation,
      setReaderContinuousWaitingForReadyPageIndex,
    ],
  );

  const startContinuousReaderAnimation = useCallback(
    (targetIndex: number) => {
      if (layout === "scroll-vertical") {
        const nextAnimation = resolveContinuousReaderAnimation(
          targetIndex,
          continuousNavigationSourceRef.current,
        );
        if (!nextAnimation) {
          return waitForContinuousVerticalTarget(targetIndex);
        }

        return launchContinuousReaderAnimation(nextAnimation);
      }

      const nextAnimation = resolveContinuousReaderAnimation(
        targetIndex,
        continuousNavigationSourceRef.current,
      );
      if (!nextAnimation) {
        setReaderContinuousAnimatingPageIndex(null);
        if (continuousRequestedPageIndexRef.current === targetIndex) {
          setReaderContinuousRequestedPageIndex(null);
        }
        if (layout === "scroll-horizontal") {
          forceImmediateHorizontalPageUrlSyncRef.current = true;
        } else if (layout === "scroll-vertical") {
          forceImmediateVerticalPageUrlSyncRef.current = true;
        }
        setReaderActivePageIndex(targetIndex);
        return false;
      }

      return launchContinuousReaderAnimation(nextAnimation);
    },
    [
      layout,
      launchContinuousReaderAnimation,
      resolveContinuousReaderAnimation,
      setReaderActivePageIndex,
      setReaderContinuousAnimatingPageIndex,
      setReaderContinuousRequestedPageIndex,
      waitForContinuousVerticalTarget,
    ],
  );

  const syncContinuousReaderState = useCallback(() => {
    updateContinuousActivePage();
    updateContinuousProgressVisualRatio();
  }, [updateContinuousActivePage, updateContinuousProgressVisualRatio]);

  useEffect(() => {
    if (
      paginated ||
      continuousAnimatingPageIndex !== null ||
      continuousWaitingForReadyPageIndex !== null ||
      continuousRequestedPageIndex === null
    ) {
      return;
    }

    const currentPageIndex = activePageIndexRef.current;
    if (continuousRequestedPageIndex === currentPageIndex) {
      setReaderContinuousRequestedPageIndex(null);
      return;
    }

    const nextPageIndex = clampIndex(
      currentPageIndex + (continuousRequestedPageIndex > currentPageIndex ? 1 : -1),
      Math.max(originalPages.length, 1),
    );
    startContinuousReaderAnimation(nextPageIndex);
  }, [
    activePageIndex,
    continuousAnimatingPageIndex,
    continuousWaitingForReadyPageIndex,
    continuousRequestedPageIndex,
    originalPages.length,
    paginated,
    setReaderContinuousRequestedPageIndex,
    startContinuousReaderAnimation,
  ]);

  useEffect(() => {
    if (paginated || activeKeyboardHoldDirectionRef.current === null) {
      return;
    }

    if (
      keyboardHoldStartTimeoutRef.current !== null ||
      continuousWaitingForReadyPageIndex !== null ||
      continuousAnimatingPageIndex !== null ||
      continuousRequestedPageIndex !== null
    ) {
      return;
    }

    const stepDirection = activeKeyboardHoldDirectionRef.current;
    const didQueue = queueContinuousHoldNavigation(stepDirection);
    if (!didQueue) {
      clearKeyboardPageHold(stepDirection);
    }
  }, [
    activePageIndex,
    clearKeyboardPageHold,
    continuousAnimatingPageIndex,
    continuousWaitingForReadyPageIndex,
    continuousRequestedPageIndex,
    paginated,
    queueContinuousHoldNavigation,
  ]);

  useEffect(() => {
    if (paginated) {
      return;
    }

    if (lastInitialReaderPositionKeyRef.current === currentInitialReaderPositionKey) {
      syncContinuousReaderState();
    }
    const handleScroll = () => syncContinuousReaderState();
    const handleResize = () => syncContinuousReaderState();
    const viewport = window.visualViewport;

    if (layout === "scroll-horizontal") {
      const container = horizontalScrollRef.current;
      const rail = horizontalScrollRailRef.current;
      const handleViewportScroll = () => {
        const nextScrollLeft = container?.scrollLeft ?? 0;
        if (!consumePendingHorizontalScrollSync("viewport", nextScrollLeft)) {
          syncHorizontalScrollPosition("viewport");
        }
        syncContinuousReaderState();
      };
      const handleRailScroll = () => {
        const nextScrollLeft = rail?.scrollLeft ?? 0;
        if (!consumePendingHorizontalScrollSync("rail", nextScrollLeft)) {
          syncHorizontalScrollPosition("rail");
        }
        syncContinuousReaderState();
      };

      container?.addEventListener("scroll", handleViewportScroll, {
        passive: true,
      });
      rail?.addEventListener("scroll", handleRailScroll, { passive: true });
      window.addEventListener("resize", handleResize, { passive: true });
      viewport?.addEventListener("resize", handleResize);
      viewport?.addEventListener("scroll", handleResize);
      return () => {
        clearPendingHorizontalScrollSync();
        container?.removeEventListener("scroll", handleViewportScroll);
        rail?.removeEventListener("scroll", handleRailScroll);
        window.removeEventListener("resize", handleResize);
        viewport?.removeEventListener("resize", handleResize);
        viewport?.removeEventListener("scroll", handleResize);
      };
    }

    if (layout === "scroll-vertical") {
      const container = verticalScrollRef.current;
      container?.addEventListener("scroll", handleScroll, { passive: true });
      window.addEventListener("resize", handleResize, { passive: true });
      viewport?.addEventListener("resize", handleResize);
      viewport?.addEventListener("scroll", handleResize);
      return () => {
        container?.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleResize);
        viewport?.removeEventListener("resize", handleResize);
        viewport?.removeEventListener("scroll", handleResize);
      };
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize, { passive: true });
    viewport?.addEventListener("resize", handleResize);
    viewport?.addEventListener("scroll", handleResize);
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      viewport?.removeEventListener("resize", handleResize);
      viewport?.removeEventListener("scroll", handleResize);
    };
  }, [
    clearPendingHorizontalScrollSync,
    consumePendingHorizontalScrollSync,
    currentInitialReaderPositionKey,
    layout,
    paginated,
    syncContinuousReaderState,
    syncHorizontalScrollPosition,
  ]);

  useLayoutEffect(() => {
    const nextInitialPositionKey = currentInitialReaderPositionKey;
    if (location.hash) {
      lastInitialReaderPositionKeyRef.current = nextInitialPositionKey;
      return;
    }
    if (lastInitialReaderPositionKeyRef.current === nextInitialPositionKey) {
      return;
    }
    if (stageViewportHeight === null) {
      return;
    }

    let initialPositionRetryCount = 0;
    function scheduleInitialPositionRetry() {
      if (initialPositionRetryCount >= 8) {
        initialReaderPositionFrameRef.current = null;
        return;
      }

      initialPositionRetryCount += 1;
      initialReaderPositionFrameRef.current = window.requestAnimationFrame(positionReader);
    }

    function positionReader() {
      const stage = stageRef.current;
      if (!stage) {
        initialReaderPositionFrameRef.current = null;
        return;
      }

      const stageRect = stage.getBoundingClientRect();
      if (stageRect.height <= 0 || stageRect.width <= 0) {
        scheduleInitialPositionRetry();
        return;
      }

      const viewportMetrics = getVisibleViewportMetrics();
      const targetPageNode = pageRefs.current[resolvedInitialPageIndex];

      if (layout === "scroll-horizontal") {
        const container = horizontalScrollRef.current;
        const targetPageRect = targetPageNode?.getBoundingClientRect();
        if (
          !container ||
          container.clientWidth <= 0 ||
          !targetPageRect ||
          targetPageRect.width <= 0
        ) {
          scheduleInitialPositionRetry();
          return;
        }
      }

      if (layout === "scroll-vertical") {
        const container = verticalScrollRef.current;
        const targetPageRect = targetPageNode?.getBoundingClientRect();
        if (
          !container ||
          container.clientHeight <= 0 ||
          !targetPageRect ||
          targetPageRect.height <= 0
        ) {
          scheduleInitialPositionRetry();
          return;
        }
      }

      window.scrollTo({
        top: getCenteredViewportScrollTop({
          targetRect: stageRect,
          viewportHeight: viewportMetrics.height,
          viewportOffsetTop: viewportMetrics.offsetTop,
        }),
        behavior: "auto",
      });

      if (layout === "scroll-horizontal") {
        const container = horizontalScrollRef.current;
        const rail = horizontalScrollRailRef.current;
        if (container && targetPageNode) {
          const nextScrollLeft = getCenteredHorizontalScrollLeft({
            container,
            targetNode: targetPageNode,
            targetRect: targetPageNode.getBoundingClientRect(),
          });
          container.scrollLeft = nextScrollLeft;
          if (rail && Math.abs(rail.scrollLeft - nextScrollLeft) > 1) {
            markPendingHorizontalScrollSync("rail", nextScrollLeft);
            rail.scrollLeft = nextScrollLeft;
          }
        }
      } else if (layout === "scroll-vertical") {
        const container = verticalScrollRef.current;
        if (container && targetPageNode) {
          container.scrollTop = getTopAlignedVerticalScrollTop({
            container,
            targetNode: targetPageNode,
            targetRect: targetPageNode.getBoundingClientRect(),
          });
        }
      }

      lastInitialReaderPositionKeyRef.current = nextInitialPositionKey;
      initialReaderPositionFrameRef.current = null;
    }

    clearInitialReaderPositionFrame();
    positionReader();

    return clearInitialReaderPositionFrame;
  }, [
    clearInitialReaderPositionFrame,
    currentInitialReaderPositionKey,
    horizontalScrollMetrics.clientWidth,
    layout,
    location.hash,
    markPendingHorizontalScrollSync,
    paginated,
    resolvedInitialPageIndex,
    stageViewportHeight,
  ]);

  const goToSlot = useCallback(
    (nextSlotIndex: number) => {
      if (!paginated) {
        return false;
      }

      return requestPaginatedSlotNavigation(nextSlotIndex);
    },
    [paginated, requestPaginatedSlotNavigation],
  );

  const resolveTargetReaderPageIndex = useCallback(
    (pageIndex: number) => {
      const clampedPageIndex = clampIndex(pageIndex, Math.max(originalPages.length, 1));
      return hasPurchaseGate && clampedPageIndex >= accessiblePageCount
        ? renderablePages.length - 1
        : clampedPageIndex;
    },
    [accessiblePageCount, hasPurchaseGate, originalPages.length, renderablePages.length],
  );

  const goToPrevious = useCallback(() => {
    if (!paginated) {
      return;
    }
    goToSlot((pendingSlotIndexRef.current ?? activeSlotIndexRef.current) - 1);
  }, [goToSlot, paginated]);

  const goToNext = useCallback(() => {
    if (!paginated) {
      return;
    }
    goToSlot((pendingSlotIndexRef.current ?? activeSlotIndexRef.current) + 1);
  }, [goToSlot, paginated]);

  const currentChapterOptionIndex = useMemo(
    () => chapterOptions.findIndex((option) => option.value === currentChapterValue),
    [chapterOptions, currentChapterValue],
  );
  const previousChapterOption =
    currentChapterOptionIndex > 0 ? chapterOptions[currentChapterOptionIndex - 1] : null;
  const nextChapterOption =
    currentChapterOptionIndex >= 0 && currentChapterOptionIndex < chapterOptions.length - 1
      ? chapterOptions[currentChapterOptionIndex + 1]
      : null;
  const showChapterNavigationActions = Boolean(previousChapterOption || nextChapterOption);

  const goToPage = useCallback(
    (
      pageIndex: number,
      {
        behavior: _behavior = "smooth",
        source = "ui",
      }: {
        behavior?: ScrollBehavior;
        source?: ReaderPageNavigationSource;
      } = {},
    ) => {
      const targetIndex = resolveTargetReaderPageIndex(pageIndex);

      if (paginated) {
        const nextSlotIndex = findSlotIndexForPage(slots, targetIndex);
        const nextPageIndex = getVisibleSlotPageIndex(nextSlotIndex);
        const currentSlotIndex = pendingSlotIndexRef.current ?? activeSlotIndexRef.current;
        const currentPageIndex =
          pendingSlotIndexRef.current === null
            ? activePageIndexRef.current
            : getVisibleSlotPageIndex(currentSlotIndex);
        if (nextSlotIndex === currentSlotIndex && nextPageIndex === currentPageIndex) {
          return false;
        }
        return requestPaginatedSlotNavigation(nextSlotIndex);
      }

      const currentPageIndex = activePageIndexRef.current;
      const currentTargetIndex = getContinuousNavigationAnchorPageIndex();
      if (targetIndex === currentTargetIndex && currentTargetIndex === currentPageIndex) {
        return false;
      }

      return requestContinuousPageNavigation({
        source,
        targetIndex,
      });
    },
    [
      getContinuousNavigationAnchorPageIndex,
      getVisibleSlotPageIndex,
      paginated,
      requestContinuousPageNavigation,
      requestPaginatedSlotNavigation,
      resolveTargetReaderPageIndex,
      slots,
    ],
  );

  const stepReaderPage = useCallback(
    ({
      direction: stepDirection,
      behavior: _behavior,
      source,
    }: {
      direction: ReaderPageStepDirection;
      behavior: ScrollBehavior;
      source: ReaderPageNavigationSource;
    }) => {
      lastKeyboardNavigationDirectionRef.current = stepDirection;

      if (paginated) {
        const currentSlotIndex = pendingSlotIndexRef.current ?? activeSlotIndexRef.current;
        const targetSlotIndex = clampIndex(
          currentSlotIndex + (stepDirection === "next" ? 1 : -1),
          slots.length,
        );
        if (targetSlotIndex === currentSlotIndex) {
          return false;
        }
        return requestPaginatedSlotNavigation(targetSlotIndex);
      }

      const currentTargetIndex = getContinuousNavigationAnchorPageIndex();
      return requestContinuousPageNavigation({
        source,
        targetIndex: currentTargetIndex + (stepDirection === "next" ? 1 : -1),
      });
    },
    [
      getContinuousNavigationAnchorPageIndex,
      paginated,
      requestContinuousPageNavigation,
      requestPaginatedSlotNavigation,
      slots.length,
    ],
  );

  const getKeyboardPageStepDirection = useCallback(
    (key: string): ReaderPageStepDirection | null => {
      if (layout === "scroll-vertical") {
        if (key === "ArrowLeft" || key === "ArrowUp") {
          return "previous";
        }
        if (key === "ArrowRight" || key === "ArrowDown") {
          return "next";
        }
        return null;
      }

      if (layout === "scroll-horizontal" || paginated) {
        if (key !== "ArrowLeft" && key !== "ArrowRight") {
          return null;
        }
        if (direction === "rtl") {
          return key === "ArrowLeft" ? "next" : "previous";
        }
        return key === "ArrowLeft" ? "previous" : "next";
      }

      return null;
    },
    [direction, layout, paginated],
  );

  const startKeyboardPageHold = useCallback(
    (stepDirection: ReaderPageStepDirection) => {
      activeKeyboardHoldDirectionRef.current = stepDirection;
      clearKeyboardHoldStartTimeout();
      clearKeyboardHoldRepeatInterval();

      if (!paginated) {
        keyboardHoldStartTimeoutRef.current = window.setTimeout(() => {
          keyboardHoldStartTimeoutRef.current = null;
          if (activeKeyboardHoldDirectionRef.current !== stepDirection) {
            return;
          }

          if (
            continuousAnimatingPageIndexRef.current !== null ||
            continuousRequestedPageIndexRef.current !== null ||
            continuousWaitingForReadyPageIndexRef.current !== null
          ) {
            return;
          }

          const didAdvance = queueContinuousHoldNavigation(stepDirection);
          if (!didAdvance) {
            clearKeyboardPageHold(stepDirection);
          }
        }, KEYBOARD_PAGE_HOLD_START_DELAY_MS);
        return;
      }

      keyboardHoldStartTimeoutRef.current = window.setTimeout(() => {
        keyboardHoldStartTimeoutRef.current = null;
        if (activeKeyboardHoldDirectionRef.current !== stepDirection) {
          return;
        }

        const repeatStep = () => {
          if (activeKeyboardHoldDirectionRef.current !== stepDirection) {
            return;
          }
          const didAdvance = stepReaderPage({
            direction: stepDirection,
            behavior: "smooth",
            source: "keyboard-hold",
          });
          if (!didAdvance) {
            clearKeyboardPageHold(stepDirection);
          }
        };

        repeatStep();
        if (activeKeyboardHoldDirectionRef.current !== stepDirection) {
          return;
        }

        keyboardHoldRepeatIntervalRef.current = window.setInterval(
          repeatStep,
          KEYBOARD_PAGE_HOLD_REPEAT_MS,
        );
      }, KEYBOARD_PAGE_HOLD_START_DELAY_MS);
    },
    [
      clearKeyboardHoldRepeatInterval,
      clearKeyboardHoldStartTimeout,
      clearKeyboardPageHold,
      paginated,
      queueContinuousHoldNavigation,
      stepReaderPage,
    ],
  );

  const handleReaderKeyDown = useCallback(
    (event: ReaderKeyEvent) => {
      const supportsArrowKeyPageNavigation =
        paginated || layout === "scroll-horizontal" || layout === "scroll-vertical";
      if (event.key === "Escape" && isMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        clearKeyboardPageHold();
        setIsMenuOpen(false);
        revealMenuTrigger();
        scheduleMenuTriggerHide();
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = String(target?.tagName || "").toLowerCase();
      if (tagName === "input" || tagName === "textarea" || target?.isContentEditable) {
        return;
      }
      if (!supportsArrowKeyPageNavigation) {
        return;
      }

      if (
        layout === "scroll-horizontal" &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const stepDirection = getKeyboardPageStepDirection(event.key);
      if (!stepDirection) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (
        event.repeat &&
        (activeKeyboardHoldDirectionRef.current === stepDirection ||
          lastKeyboardNavigationDirectionRef.current === stepDirection)
      ) {
        return;
      }

      if (activeKeyboardHoldDirectionRef.current === stepDirection) {
        return;
      }

      if (
        activeKeyboardHoldDirectionRef.current &&
        activeKeyboardHoldDirectionRef.current !== stepDirection
      ) {
        clearKeyboardPageHold();
      }

      const didAdvance = stepReaderPage({
        direction: stepDirection,
        behavior: "smooth",
        source: "keyboard",
      });
      if (!didAdvance) {
        clearKeyboardPageHold(stepDirection);
        return;
      }

      startKeyboardPageHold(stepDirection);
    },
    [
      clearKeyboardPageHold,
      getKeyboardPageStepDirection,
      isMenuOpen,
      layout,
      paginated,
      revealMenuTrigger,
      scheduleMenuTriggerHide,
      startKeyboardPageHold,
      stepReaderPage,
    ],
  );

  const handleReaderKeyUp = useCallback(
    (event: KeyboardEvent) => {
      const stepDirection = getKeyboardPageStepDirection(event.key);
      if (!stepDirection) {
        return;
      }
      clearKeyboardPageHold(stepDirection);
    },
    [clearKeyboardPageHold, getKeyboardPageStepDirection],
  );

  const focusReaderStage = useCallback(() => {
    stageRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    clearKeyboardPageHold();
    clearContinuousProgrammaticNavigation();
    if (!paginated) {
      return;
    }

    clearPaginatedSlotPromotionFrame();
    setReaderHandoffSlotIndex(null);
    setReaderPendingSlotIndex(null);
  }, [
    clearContinuousProgrammaticNavigation,
    clearKeyboardPageHold,
    clearPaginatedSlotPromotionFrame,
    isMenuOpen,
    paginated,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
  ]);

  useEffect(
    () => () => {
      clearContinuousProgrammaticNavigation();
    },
    [clearContinuousProgrammaticNavigation],
  );

  useEffect(() => {
    if (isMenuOpen) {
      return;
    }
    const activeElement = document.activeElement;
    if (
      activeElement &&
      activeElement !== document.body &&
      activeElement !== document.documentElement
    ) {
      return;
    }
    focusReaderStage();
  }, [currentChapterValue, focusReaderStage, isMenuOpen, layout]);

  useEffect(() => {
    document.addEventListener("keydown", handleReaderKeyDown as unknown as EventListener, {
      capture: true,
    });
    document.addEventListener("keyup", handleReaderKeyUp, { capture: true });
    const handleWindowBlur = () => clearKeyboardPageHold();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearKeyboardPageHold();
      }
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearKeyboardPageHold();
      document.removeEventListener("keydown", handleReaderKeyDown as unknown as EventListener, {
        capture: true,
      });
      document.removeEventListener("keyup", handleReaderKeyUp, {
        capture: true,
      });
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearKeyboardPageHold, handleReaderKeyDown, handleReaderKeyUp]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    clearKeyboardPageHold();
  }, [clearKeyboardPageHold, isMenuOpen]);

  useEffect(() => {
    if (visualState.progressStyle === "hidden" && isStageInViewport) {
      return;
    }

    clearHiddenProgressHideTimer();
    clearProgressInteractionTimer();
    setIsHiddenProgressRevealed(false);
    setIsProgressInteracting(false);
  }, [
    clearHiddenProgressHideTimer,
    clearProgressInteractionTimer,
    isStageInViewport,
    visualState.progressStyle,
  ]);

  const pageSummary = useMemo(
    () =>
      formatVisiblePageLabel({
        layout,
        activeSlotIndex,
        slots,
        activePageIndex,
        totalPages: originalPages.length,
        accessiblePageCount,
      }),
    [accessiblePageCount, activePageIndex, activeSlotIndex, layout, originalPages.length, slots],
  );
  const progressPageIndex = Math.min(
    Math.max(activePageIndex + 1, 1),
    accessiblePageCount || originalPages.length || 1,
  );
  const progressAnchorIndex = Math.min(
    Math.max(activePageIndex, 0),
    Math.max(originalPages.length - 1, 0),
  );
  const progressPositionRatio =
    originalPages.length > 1 ? progressAnchorIndex / (originalPages.length - 1) : 0;
  const progressVisualRatio =
    !paginated && progressPosition !== "bottom"
      ? continuousProgressVisualRatio
      : progressPositionRatio;
  const progressTrackRatio = getProgressAxisRatio({
    ratio: progressVisualRatio,
    position: progressPosition,
    direction,
  });
  const isViewportBoundedReader = usesViewportBoundedHeight(effectiveImageFit);
  const shouldUseFixedViewportHeight = viewportMode === "viewport";
  const horizontalScrollbarSpacerWidth = Math.max(
    horizontalScrollMetrics.scrollWidth,
    horizontalScrollMetrics.clientWidth,
  );
  const horizontalScrollViewportStyle = useMemo(() => {
    if (layout !== "scroll-horizontal" || !isViewportBoundedReader || !stageViewportHeight) {
      return undefined;
    }

    const compensatedHeight = stageViewportHeight + horizontalScrollMetrics.scrollbarHeight;
    return shouldUseFixedViewportHeight
      ? {
          minHeight: `${compensatedHeight}px`,
          height: `${compensatedHeight}px`,
        }
      : {
          minHeight: `${compensatedHeight}px`,
        };
  }, [
    horizontalScrollMetrics.scrollbarHeight,
    isViewportBoundedReader,
    layout,
    shouldUseFixedViewportHeight,
    stageViewportHeight,
  ]);
  const verticalScrollViewportStyle = useMemo(() => {
    if (layout !== "scroll-vertical" || !stageViewportHeight) {
      return undefined;
    }

    return shouldUseFixedViewportHeight
      ? {
          minHeight: `${stageViewportHeight}px`,
          height: `${stageViewportHeight}px`,
        }
      : {
          minHeight: `${stageViewportHeight}px`,
        };
  }, [layout, shouldUseFixedViewportHeight, stageViewportHeight]);
  const pageItems = useMemo(
    () =>
      buildReaderPageItems({
        totalPages: originalPages.length,
        accessiblePageCount,
      }),
    [accessiblePageCount, originalPages.length],
  );
  const stageViewportStyle = useMemo(() => {
    if (!stageViewportHeight) {
      return undefined;
    }
    return shouldUseFixedViewportHeight
      ? {
          minHeight: `${stageViewportHeight}px`,
          height: `${stageViewportHeight}px`,
        }
      : {
          minHeight: `${stageViewportHeight}px`,
        };
  }, [shouldUseFixedViewportHeight, stageViewportHeight]);
  const readerViewportStyle = useMemo(() => {
    if (!readerViewportHeight) {
      return undefined;
    }
    return shouldUseFixedViewportHeight
      ? {
          minHeight: `${readerViewportHeight}px`,
          height: `${readerViewportHeight}px`,
        }
      : {
          minHeight: `${readerViewportHeight}px`,
        };
  }, [readerViewportHeight, shouldUseFixedViewportHeight]);
  const viewportBoundedSurfaceStyle = useMemo(() => {
    if (!stageViewportHeight || !isViewportBoundedReader) {
      return undefined;
    }
    return {
      height: `${stageViewportHeight}px`,
    };
  }, [isViewportBoundedReader, stageViewportHeight]);
  const menuPanelBaseStyle = useMemo(() => {
    const panelWidth = isDesktopMenu ? "21rem" : "20.5rem";

    return {
      width: panelWidth,
      maxWidth: "calc(100% - 0.75rem)",
    };
  }, [isDesktopMenu]);
  const progressStyle: ReaderProgressStyle =
    visualState.progressStyle === "hidden" ? "hidden" : "default";
  const renderedProgressStyle =
    progressStyle === "hidden" ? (isHiddenProgressRevealed ? "default" : null) : "default";
  const progressOverlayContainerStyle = useMemo(
    () => getProgressOverlayContainerStyle(progressPosition),
    [progressPosition],
  );
  const hiddenProgressZoneStyle = useMemo(
    () => getHiddenProgressZoneStyle(progressPosition),
    [progressPosition],
  );
  const shouldDisplayProgressOverlay =
    !isMenuOpen && isStageInViewport && renderedProgressStyle !== null;
  const shouldShowProgressChip =
    renderedProgressStyle !== null &&
    (progressStyle === "hidden" ? isHiddenProgressRevealed : isProgressInteracting);
  const shouldEmphasizeProgress =
    progressStyle === "hidden" ? isHiddenProgressRevealed : isProgressInteracting;

  useEffect(() => {
    clearProgressOverlayUnmountTimer();

    if (shouldDisplayProgressOverlay) {
      setIsProgressOverlayMounted(true);
      return;
    }

    setIsProgressOverlayVisible(false);
    if (!isProgressOverlayMounted) {
      return;
    }

    progressOverlayUnmountTimeoutRef.current = window.setTimeout(() => {
      setIsProgressOverlayMounted(false);
      progressOverlayUnmountTimeoutRef.current = null;
    }, PROGRESS_OVERLAY_TRANSITION_MS);
  }, [clearProgressOverlayUnmountTimer, isProgressOverlayMounted, shouldDisplayProgressOverlay]);

  useEffect(() => {
    if (!shouldDisplayProgressOverlay || !isProgressOverlayMounted) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setIsProgressOverlayVisible(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isProgressOverlayMounted, shouldDisplayProgressOverlay]);

  useEffect(() => {
    const node = progressLabelRef.current;
    if (!node) {
      return;
    }

    const updateLabelSize = () => {
      const rect = node.getBoundingClientRect();
      const nextWidth = Math.max(
        rect.width || 0,
        node.offsetWidth || 0,
        PROGRESS_CHIP_MIN_WIDTH_PX,
      );
      const nextHeight = Math.max(
        rect.height || 0,
        node.offsetHeight || 0,
        PROGRESS_CHIP_MIN_HEIGHT_PX,
      );

      setProgressLabelSize((current) =>
        current.width === nextWidth && current.height === nextHeight
          ? current
          : {
              width: nextWidth,
              height: nextHeight,
            },
      );
    };

    updateLabelSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateLabelSize();
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [isProgressOverlayMounted, progressPageIndex, progressPosition, shouldShowProgressChip]);

  const getProgressInteractionRect = useCallback(() => {
    const preferredNode = progressTrackRef.current;
    const rect = preferredNode?.getBoundingClientRect();

    if (rect && rect.width > 0 && rect.height > 0) {
      return rect;
    }

    const progressViewportRect = progressViewportRef.current?.getBoundingClientRect();
    if (progressViewportRect && progressViewportRect.width > 0 && progressViewportRect.height > 0) {
      return getFallbackProgressTrackRect({
        position: progressPosition,
        containerRect: progressViewportRect,
      });
    }

    const stageRect = stageRef.current?.getBoundingClientRect();
    return getFallbackProgressTrackRect({
      position: progressPosition,
      containerRect: stageRect,
    });
  }, [progressPosition]);

  function applyProgressGeometry(
    metrics: VisibleStageChromeMetrics = visibleStageChromeMetricsRef.current,
  ) {
    const viewportNode = progressViewportRef.current;
    if (viewportNode) {
      viewportNode.style.height = `${Math.max(metrics.height, 0)}px`;
    }

    const containerLength = Math.max(
      (progressPosition === "bottom" ? metrics.width : metrics.height) -
        PROGRESS_EDGE_OFFSET_PX * 2,
      0,
    );
    const rootFontSizePx = getRootFontSizePx();
    const indicatorOffsetPx = getSafeCenteredProgressOffsetPx({
      ratio: progressTrackRatio,
      edgeInsetPx: rootFontSizePx * (progressPosition === "bottom" ? 3 : 2.25),
      containerLength,
    });
    const labelOffsetPx = getSafeCenteredProgressOffsetPx({
      ratio: progressTrackRatio,
      edgeInsetPx: Math.max(
        progressPosition === "bottom" ? progressLabelSize.width / 2 : progressLabelSize.height / 2,
        progressPosition === "bottom"
          ? PROGRESS_CHIP_MIN_WIDTH_PX / 2
          : PROGRESS_CHIP_MIN_HEIGHT_PX / 2,
      ),
      containerLength,
    });
    const axis = progressPosition === "bottom" ? "left" : "top";
    const resetAxis = axis === "left" ? "top" : "left";

    if (progressOverlayRef.current) {
      progressOverlayRef.current.style.setProperty(
        "--reader-progress-container-length",
        `${containerLength}px`,
      );
    }

    if (progressIndicatorRef.current) {
      progressIndicatorRef.current.style.setProperty(axis, `${indicatorOffsetPx}px`);
      progressIndicatorRef.current.style.removeProperty(resetAxis);
    }

    if (progressLabelRef.current) {
      progressLabelRef.current.style.setProperty(axis, `${labelOffsetPx}px`);
      progressLabelRef.current.style.removeProperty(resetAxis);
    }
  }

  const getProgressPageIndexFromClientPosition = useCallback(
    ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      if (originalPages.length <= 1) {
        return 0;
      }

      const rect = getProgressInteractionRect();
      const interactionRatio =
        progressPosition === "bottom"
          ? clampProgressRatio((clientX - rect.left) / Math.max(rect.width, 1))
          : clampProgressRatio((clientY - rect.top) / Math.max(rect.height, 1));
      const ratio = getProgressAxisRatio({
        ratio: interactionRatio,
        position: progressPosition,
        direction,
      });

      return Math.round(ratio * (originalPages.length - 1));
    },
    [direction, getProgressInteractionRect, originalPages.length, progressPosition],
  );

  const scrubToProgressClientPosition = useCallback(
    ({ clientX, clientY }: { clientX: number; clientY: number }) => {
      const nextPageIndex = getProgressPageIndexFromClientPosition({
        clientX,
        clientY,
      });

      if (lastScrubbedProgressPageRef.current === nextPageIndex) {
        return;
      }

      lastScrubbedProgressPageRef.current = nextPageIndex;
      goToPage(nextPageIndex);
    },
    [getProgressPageIndexFromClientPosition, goToPage],
  );

  const beginProgressScrub = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      { revealOnStart = false }: { revealOnStart?: boolean } = {},
    ) => {
      event.preventDefault();
      clearHiddenProgressHideTimer();
      clearProgressInteractionTimer();

      if (revealOnStart) {
        revealHiddenProgress();
      } else {
        setIsProgressInteracting(true);
      }

      isProgressPointerDraggingRef.current = true;
      activeProgressPointerIdRef.current = event.pointerId;
      lastScrubbedProgressPageRef.current = null;

      const target = event.currentTarget;
      if ("setPointerCapture" in target) {
        try {
          target.setPointerCapture(event.pointerId);
        } catch {
          // Ignore environments that do not fully support pointer capture.
        }
      }

      scrubToProgressClientPosition({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [
      clearHiddenProgressHideTimer,
      clearProgressInteractionTimer,
      revealHiddenProgress,
      scrubToProgressClientPosition,
    ],
  );

  const handleProgressScrubMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (
        !isProgressPointerDraggingRef.current ||
        activeProgressPointerIdRef.current !== event.pointerId
      ) {
        return;
      }

      event.preventDefault();
      scrubToProgressClientPosition({
        clientX: event.clientX,
        clientY: event.clientY,
      });
    },
    [scrubToProgressClientPosition],
  );

  const finishProgressScrub = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (activeProgressPointerIdRef.current !== event.pointerId) {
        return;
      }

      const target = event.currentTarget;
      if ("releasePointerCapture" in target) {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          // Ignore environments that do not fully support pointer capture.
        }
      }

      activeProgressPointerIdRef.current = null;
      isProgressPointerDraggingRef.current = false;
      lastScrubbedProgressPageRef.current = null;

      if (progressStyle === "hidden") {
        scheduleHiddenProgressHide();
        return;
      }

      if (event.pointerType === "mouse") {
        const rect = target.getBoundingClientRect();
        if (
          rect.width > 0 &&
          rect.height > 0 &&
          isPointWithinRect({
            x: event.clientX,
            y: event.clientY,
            rect,
          })
        ) {
          setIsProgressInteracting(true);
          return;
        }

        setIsProgressInteracting(false);
        return;
      }

      scheduleProgressInteractionReset();
    },
    [progressStyle, scheduleHiddenProgressHide, scheduleProgressInteractionReset],
  );

  const hiddenProgressZone = useMemo(() => {
    if (isMenuOpen || !isStageInViewport || visualState.progressStyle !== "hidden") {
      return null;
    }

    return (
      <div
        data-testid="project-reader-progress-activation-zone"
        className="absolute z-10 bg-transparent pointer-events-auto touch-none"
        style={hiddenProgressZoneStyle}
        onMouseEnter={revealHiddenProgress}
        onMouseLeave={handleProgressPointerLeave}
        onPointerDown={(event) => beginProgressScrub(event, { revealOnStart: true })}
        onPointerMove={handleProgressScrubMove}
        onPointerUp={finishProgressScrub}
        onPointerCancel={finishProgressScrub}
      />
    );
  }, [
    beginProgressScrub,
    finishProgressScrub,
    handleProgressPointerLeave,
    handleProgressScrubMove,
    hiddenProgressZoneStyle,
    isMenuOpen,
    isStageInViewport,
    revealHiddenProgress,
    visualState.progressStyle,
  ]);

  const progressOverlay = useMemo(() => {
    if (!isProgressOverlayMounted || !progressOverlayContainerStyle) {
      return null;
    }

    const isBottomProgress = progressPosition === "bottom";
    const placementClassName = isBottomProgress ? "-translate-x-1/2" : "-translate-y-1/2";
    const hitAreaClassName = isBottomProgress
      ? "absolute inset-x-0 bottom-0 h-16"
      : cn("absolute inset-y-0 bottom-0 w-16", progressPosition === "left" ? "left-0" : "right-0");
    const chipClassName = isBottomProgress
      ? cn(
          "absolute bottom-2 flex min-w-10 items-center justify-center rounded-full border border-accent/35 bg-accent px-3 py-0.5 text-xs font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition-[opacity,transform] duration-200",
          placementClassName,
          shouldShowProgressChip
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-2 scale-95 opacity-0",
        )
      : cn(
          "absolute flex min-h-7 min-w-8 items-center justify-center rounded-full border border-accent/35 bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground shadow-lg shadow-accent/20 transition-[opacity,transform] duration-200",
          placementClassName,
          progressPosition === "left"
            ? shouldShowProgressChip
              ? "left-5 translate-x-0 scale-100 opacity-100"
              : "left-3 -translate-x-1 scale-95 opacity-0"
            : shouldShowProgressChip
              ? "right-5 translate-x-0 scale-100 opacity-100"
              : "right-3 translate-x-1 scale-95 opacity-0",
        );

    return (
      <div
        ref={progressOverlayRef}
        data-testid="project-reader-progress-overlay"
        data-state={isProgressOverlayVisible ? "visible" : "hidden"}
        className={cn(
          "pointer-events-none absolute z-30 transition-[opacity,transform] ease-out",
          getProgressOverlayMotionClassName({
            position: progressPosition,
            isVisible: isProgressOverlayVisible,
          }),
        )}
        style={{
          ...progressOverlayContainerStyle,
          transitionDuration: `${PROGRESS_OVERLAY_TRANSITION_MS}ms`,
        }}
      >
        <div className="relative h-full w-full overflow-visible pointer-events-none">
          <div
            data-testid="project-reader-progress-hit-area"
            className={cn(
              hitAreaClassName,
              isProgressOverlayVisible ? "pointer-events-auto touch-none" : "pointer-events-none",
            )}
            onMouseEnter={handleProgressPointerEnter}
            onMouseLeave={handleProgressPointerLeave}
            onPointerDown={(event) => beginProgressScrub(event)}
            onPointerMove={handleProgressScrubMove}
            onPointerUp={finishProgressScrub}
            onPointerCancel={finishProgressScrub}
          />

          {isBottomProgress ? (
            <div
              ref={progressTrackRef}
              data-testid="project-reader-progress-track"
              className="absolute inset-x-0 bottom-0 h-full overflow-visible"
            >
              <div className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-white/12" />
              <div
                ref={progressIndicatorRef}
                data-testid="project-reader-progress-indicator"
                className={cn(
                  "absolute bottom-0 h-1 rounded-full bg-accent transition-[box-shadow,opacity] duration-300",
                  placementClassName,
                  shouldEmphasizeProgress ? "w-24" : "",
                )}
                style={{
                  width: shouldEmphasizeProgress ? "6rem" : "4.5rem",
                  boxShadow: shouldEmphasizeProgress
                    ? "0 0 28px hsl(var(--accent) / 0.65)"
                    : "0 0 20px hsl(var(--accent) / 0.45)",
                }}
              />
              <div
                data-testid="project-reader-progress-label"
                ref={progressLabelRef}
                className={chipClassName}
              >
                {progressPageIndex}
              </div>
            </div>
          ) : (
            <div
              ref={progressTrackRef}
              data-testid="project-reader-progress-track"
              className="absolute inset-y-0 h-full w-full overflow-visible"
            >
              <div
                className={cn(
                  "absolute bottom-0 top-0 w-1 rounded-full bg-white/12",
                  progressPosition === "left" ? "left-0" : "right-0",
                )}
              />
              <div
                ref={progressIndicatorRef}
                data-testid="project-reader-progress-indicator"
                className={cn(
                  "absolute w-1 rounded-full bg-accent transition-[box-shadow,opacity] duration-300",
                  placementClassName,
                  progressPosition === "left" ? "left-0" : "right-0",
                )}
                style={{
                  height: "4.5rem",
                  boxShadow: shouldEmphasizeProgress
                    ? "0 0 28px hsl(var(--accent) / 0.65)"
                    : "0 0 20px hsl(var(--accent) / 0.45)",
                }}
              >
                <span className="sr-only">Progresso da leitura</span>
              </div>
              <div
                data-testid="project-reader-progress-label"
                ref={progressLabelRef}
                className={chipClassName}
              >
                {progressPageIndex}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }, [
    beginProgressScrub,
    finishProgressScrub,
    handleProgressPointerEnter,
    handleProgressPointerLeave,
    handleProgressScrubMove,
    isProgressOverlayMounted,
    isProgressOverlayVisible,
    progressOverlayContainerStyle,
    progressPageIndex,
    progressPosition,
    shouldEmphasizeProgress,
    shouldShowProgressChip,
  ]);

  const renderProgressViewport = () => {
    return (
      <div className="pointer-events-none sticky top-0 z-30 h-0 overflow-visible">
        <div
          ref={progressViewportRef}
          data-testid="project-reader-progress-viewport"
          className="relative w-full overflow-hidden pointer-events-none"
          style={{ height: "0px" }}
        >
          {hiddenProgressZone}
          {progressOverlay}
        </div>
      </div>
    );
  };

  const renderMenuViewport = () => {
    return (
      <div className="pointer-events-none sticky top-0 z-40 h-0 overflow-visible">
        <div
          ref={menuViewportRef}
          data-testid="project-reader-menu-viewport"
          className="relative w-full overflow-hidden pointer-events-none"
          style={{ height: "0px" }}
        >
          {stageMenuOverlay}
        </div>
      </div>
    );
  };

  const setPageRef = useCallback((pageIndex: number, node: HTMLDivElement | null) => {
    pageRefs.current[pageIndex] = node;
  }, []);

  const continuousWarmPageIndices = useMemo(() => {
    const nextIndices = new Set<number>();
    if (paginated) {
      return nextIndices;
    }

    const addPageIndex = (pageIndex: number | null) => {
      if (typeof pageIndex !== "number") {
        return;
      }
      nextIndices.add(clampIndex(pageIndex, Math.max(originalPages.length, 1)));
    };

    addPageIndex(activePageIndex);
    addPageIndex(continuousRequestedPageIndex);
    addPageIndex(continuousWaitingForReadyPageIndex);
    addPageIndex(continuousAnimatingPageIndex);

    const directionTargetIndex =
      continuousWaitingForReadyPageIndex ??
      continuousAnimatingPageIndex ??
      continuousRequestedPageIndex;
    if (typeof directionTargetIndex === "number" && directionTargetIndex !== activePageIndex) {
      addPageIndex(activePageIndex + (directionTargetIndex > activePageIndex ? 1 : -1));
    }

    return nextIndices;
  }, [
    activePageIndex,
    continuousAnimatingPageIndex,
    continuousRequestedPageIndex,
    continuousWaitingForReadyPageIndex,
    originalPages.length,
    paginated,
  ]);

  const paginatedBufferedSlotIndices = useMemo(() => {
    if (!paginated) {
      return [];
    }

    const nextIndices = new Set<number>();
    const anchorSlotIndices = [activeSlotIndex, pendingSlotIndex, handoffSlotIndex].filter(
      (slotIndex): slotIndex is number => typeof slotIndex === "number",
    );

    anchorSlotIndices.forEach((slotIndex) => {
      const startSlotIndex = Math.max(slotIndex - 1, 0);
      const endSlotIndex = Math.min(slotIndex + 1, Math.max(slots.length - 1, 0));
      for (
        let bufferedSlotIndex = startSlotIndex;
        bufferedSlotIndex <= endSlotIndex;
        bufferedSlotIndex += 1
      ) {
        nextIndices.add(bufferedSlotIndex);
      }
    });

    if (nextIndices.size === 0 && slots.length > 0) {
      nextIndices.add(clampIndex(activeSlotIndex, slots.length));
    }

    return Array.from(nextIndices).sort((left, right) => left - right);
  }, [activeSlotIndex, handoffSlotIndex, paginated, pendingSlotIndex, slots.length]);

  const paginatedWarmPageIndices = useMemo(() => {
    const nextPageIndices = new Set<number>();
    paginatedBufferedSlotIndices.forEach((slotIndex) => {
      (slots[slotIndex]?.pages || []).forEach((pageIndex) => {
        nextPageIndices.add(pageIndex);
      });
    });
    return nextPageIndices;
  }, [paginatedBufferedSlotIndices, slots]);

  useEffect(() => {
    if (paginated || continuousWarmPageIndices.size === 0) {
      return;
    }

    continuousWarmPageIndices.forEach((pageIndex) => {
      const imageUrl = getContinuousPageImageUrl(pageIndex);
      if (imageUrl) {
        void ensureContinuousImageReady(imageUrl);
      }
    });
  }, [continuousWarmPageIndices, ensureContinuousImageReady, getContinuousPageImageUrl, paginated]);

  useEffect(() => {
    if (!paginated || paginatedBufferedSlotIndices.length === 0) {
      return;
    }

    paginatedBufferedSlotIndices.forEach((slotIndex) => {
      getPaginatedSlotImageUrls(slotIndex).forEach((imageUrl) => {
        void ensurePaginatedImageReady(imageUrl);
      });
    });
  }, [
    ensurePaginatedImageReady,
    getPaginatedSlotImageUrls,
    paginated,
    paginatedBufferedSlotIndices,
  ]);

  useEffect(() => {
    clearPaginatedSlotHandoffFrame();

    if (!paginated || handoffSlotIndex !== null || pendingSlotIndex === null) {
      return;
    }
    const normalizedPendingSlotIndex = clampIndex(pendingSlotIndex, slots.length);
    if (normalizedPendingSlotIndex !== pendingSlotIndex) {
      setReaderPendingSlotIndex(normalizedPendingSlotIndex);
      return;
    }
    if (!isPaginatedSlotReady(normalizedPendingSlotIndex)) {
      return;
    }

    paginatedSlotHandoffFrameRef.current = window.requestAnimationFrame(() => {
      paginatedSlotHandoffFrameRef.current = null;

      if (pendingSlotIndexRef.current !== normalizedPendingSlotIndex) {
        return;
      }
      if (handoffSlotIndexRef.current !== null) {
        return;
      }

      setReaderHandoffSlotIndex(normalizedPendingSlotIndex);
    });

    return clearPaginatedSlotHandoffFrame;
  }, [
    clearPaginatedSlotHandoffFrame,
    handoffSlotIndex,
    isPaginatedSlotReady,
    paginated,
    paginatedReadyVersion,
    pendingSlotIndex,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
    slots.length,
  ]);

  useEffect(() => {
    clearPaginatedSlotCommitFrame();

    if (!paginated || handoffSlotIndex === null) {
      return;
    }

    const normalizedHandoffSlotIndex = clampIndex(handoffSlotIndex, slots.length);
    if (normalizedHandoffSlotIndex !== handoffSlotIndex) {
      setReaderHandoffSlotIndex(normalizedHandoffSlotIndex);
      return;
    }

    paginatedSlotCommitFrameRef.current = window.requestAnimationFrame(() => {
      paginatedSlotCommitFrameRef.current = null;

      if (handoffSlotIndexRef.current !== normalizedHandoffSlotIndex) {
        return;
      }

      setReaderActiveSlotIndex(normalizedHandoffSlotIndex);
      setReaderActivePageIndex(getVisibleSlotPageIndex(normalizedHandoffSlotIndex));
      if (pendingSlotIndexRef.current === normalizedHandoffSlotIndex) {
        setReaderPendingSlotIndex(null);
      }
      setReaderHandoffSlotIndex(null);
    });

    return clearPaginatedSlotCommitFrame;
  }, [
    clearPaginatedSlotCommitFrame,
    getVisibleSlotPageIndex,
    handoffSlotIndex,
    paginated,
    setReaderActivePageIndex,
    setReaderActiveSlotIndex,
    setReaderHandoffSlotIndex,
    setReaderPendingSlotIndex,
    slots.length,
  ]);

  const renderReaderPage = useCallback(
    (
      page: ReaderRenderablePage,
      pageIndex: number,
      {
        className,
        surfaceClassName,
        imageFetchPriority,
        imageFit = effectiveImageFit,
        imageLoading,
      }: {
        className?: string;
        surfaceClassName?: string;
        imageFetchPriority?: ReaderPageImageFetchPriority;
        imageFit?: string;
        imageLoading?: ReaderPageImageLoading;
      } = {},
    ) => (
      <ReaderPageNode
        key={`reader-page-node-${pageIndex}`}
        accessiblePageCount={accessiblePageCount}
        backHref={backHref}
        className={className}
        imageFetchPriority={imageFetchPriority}
        imageFit={imageFit}
        imageLoading={imageLoading}
        page={page}
        pageIndex={pageIndex}
        purchasePrice={String(resolvedConfig.purchasePrice || "") || undefined}
        purchaseToneClassName={purchaseToneClassName}
        purchaseUrl={String(resolvedConfig.purchaseUrl || "") || undefined}
        setPageRef={setPageRef}
        surfaceClassName={surfaceClassName}
        totalPages={originalPages.length}
        viewportBoundedSurfaceStyle={viewportBoundedSurfaceStyle}
      />
    ),
    [
      accessiblePageCount,
      backHref,
      effectiveImageFit,
      originalPages.length,
      purchaseToneClassName,
      resolvedConfig.purchasePrice,
      resolvedConfig.purchaseUrl,
      setPageRef,
      viewportBoundedSurfaceStyle,
    ],
  );

  const renderContinuousPage = useCallback(
    (
      page: ReaderRenderablePage,
      pageIndex: number,
      className?: string,
      surfaceClassName?: string,
      imageFit = effectiveImageFit,
    ) =>
      renderReaderPage(page, pageIndex, {
        className,
        imageFetchPriority: continuousWarmPageIndices.has(pageIndex) ? "high" : "auto",
        surfaceClassName,
        imageFit,
        imageLoading: continuousWarmPageIndices.has(pageIndex) ? "eager" : "lazy",
      }),
    [continuousWarmPageIndices, effectiveImageFit, renderReaderPage],
  );

  const getContinuousVerticalPageContainerStyle = useCallback(
    (page: ReaderRenderablePage, imageFit: string): CSSProperties | undefined => {
      const intrinsicDimensions = getRenderablePageIntrinsicDimensions(page);
      const aspectRatio = getRenderablePageAspectRatio(page);
      if (!intrinsicDimensions || !aspectRatio || usesViewportBoundedHeight(imageFit)) {
        return undefined;
      }

      if (imageFit === "none") {
        return {
          aspectRatio,
          width: `${intrinsicDimensions.width}px`,
        };
      }

      return {
        aspectRatio,
      };
    },
    [],
  );

  const mobilePannableHeightPageClassName =
    visualState.imageFit === "height" ? "w-auto max-w-none shrink-0 items-center" : undefined;
  const mobilePannableHeightSurfaceClassName =
    visualState.imageFit === "height"
      ? "inline-flex h-full w-auto max-w-none shrink-0 items-center justify-center"
      : undefined;
  const paginatedStripClassName = cn(
    "mx-auto flex items-center justify-center gap-0",
    shouldPanPaginatedImage ? "w-max min-w-full justify-start" : "w-full",
    shouldTopAlignPaginatedImage ? "items-start" : "",
    shouldSafeCenterPaginatedImage ? "items-center-safe" : "",
    layout === "double" && direction === "rtl" ? "md:flex-row-reverse" : "md:flex-row",
  );

  const stageContent = paginated ? (
    <button
      type="button"
      className="relative flex w-full min-h-0 flex-1 cursor-default text-left select-none"
      onClick={(event) => {
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        const nextAction = resolvePaginatedPointerAction({
          layout,
          direction,
          pointerRatio: getPaginatedPointerRatio({
            clientX: event.clientX,
            rect,
          }),
        });
        if (nextAction === "next") {
          goToNext();
        }
        if (nextAction === "previous") {
          goToPrevious();
        }
      }}
      aria-label="Área de leitura paginada"
    >
      <div
        data-testid="project-reading-paginated-scroll-lane"
        className={cn(
          "no-scrollbar flex w-full items-center justify-center overflow-x-auto",
          shouldPanPaginatedVertically ? "overflow-y-auto" : "overflow-y-hidden",
          shouldTopAlignPaginatedImage ? "items-start" : "",
          shouldSafeCenterPaginatedImage ? "items-center-safe" : "",
          shouldContainPaginatedOverscroll ? "overscroll-contain" : "",
          shouldPanPaginatedImage ? "justify-start" : "",
          isCinemaMode || layout === "double" ? "px-0" : "px-2 md:px-4",
        )}
      >
        <div
          className={cn(
            "relative flex min-h-0 flex-1 items-center justify-center",
            shouldPanPaginatedImage ? "w-max min-w-full justify-start" : "w-full",
            shouldTopAlignPaginatedImage ? "items-start" : "",
            shouldSafeCenterPaginatedImage ? "items-center-safe" : "",
          )}
        >
          {paginatedBufferedSlotIndices.map((slotIndex) => {
            const slot = slots[slotIndex];
            if (!slot) {
              return null;
            }

            const isActiveSlot = slotIndex === activeSlotIndex;
            const isHandoffSlot = slotIndex === handoffSlotIndex;
            const isPendingSlot = slotIndex === pendingSlotIndex;
            const slotPages = slot.pages || [];
            const shouldCenterBufferedDoubleSlot =
              layout === "double" &&
              slot.spread === true &&
              slot.hasBlank === true &&
              slotPages.length === 1;
            const slotVisibility = isHandoffSlot ? "handoff" : isActiveSlot ? "visible" : "hidden";

            return (
              <div
                key={`reader-paginated-slot-${slotIndex}`}
                data-testid={`reader-paginated-slot-${slotIndex}`}
                data-state={isActiveSlot ? "active" : isPendingSlot ? "pending" : "buffered"}
                data-visibility={slotVisibility}
                aria-hidden={isActiveSlot ? undefined : true}
                className={cn(
                  "min-h-0",
                  isHandoffSlot
                    ? "pointer-events-none absolute inset-0 z-20 flex items-center justify-center"
                    : isActiveSlot
                      ? "relative z-10 flex w-full items-center justify-center"
                      : "pointer-events-none absolute inset-0 z-0 flex items-center justify-center opacity-0",
                  shouldPanPaginatedImage && isActiveSlot
                    ? "w-max max-w-none shrink-0 justify-start"
                    : "",
                  shouldTopAlignPaginatedImage && isActiveSlot ? "items-start" : "",
                  shouldSafeCenterPaginatedImage && isActiveSlot ? "items-center-safe" : "",
                )}
              >
                <div
                  data-testid={isActiveSlot ? "project-reading-paginated-strip" : undefined}
                  className={paginatedStripClassName}
                >
                  {layout === "double" &&
                  slot.spread === true &&
                  slot.hasBlank &&
                  !shouldCenterBufferedDoubleSlot ? (
                    <div
                      aria-hidden="true"
                      data-testid={isActiveSlot ? "reader-spread-blank" : undefined}
                      className="hidden md:block md:flex-1"
                    />
                  ) : null}

                  {slotPages.map((pageIndex, pagePosition) => {
                    const page = renderablePages[pageIndex];
                    if (!page) {
                      return null;
                    }

                    const pageImageFit =
                      shouldCenterBufferedDoubleSlot && effectiveImageFit === "width"
                        ? "none"
                        : effectiveImageFit;
                    const spreadAlignmentClassName = shouldCenterBufferedDoubleSlot
                      ? getHorizontalAlignmentClassName("center")
                      : layout === "double" && pageImageFit !== "none"
                        ? getHorizontalAlignmentClassName(
                            getDoublePageInnerAlignment({
                              direction,
                              pagePosition,
                            }),
                          )
                        : undefined;

                    return (
                      <div
                        key={`slot-page-${slotIndex}-${pageIndex}`}
                        className={cn(
                          getPaginatedSlotClassName({
                            layout,
                            imageFit: pageImageFit,
                            direction,
                            pagePosition,
                            centerSinglePage: shouldCenterBufferedDoubleSlot,
                          }),
                          shouldPanPaginatedImage
                            ? "w-auto max-w-none shrink-0 flex-none justify-start"
                            : "",
                          shouldTopAlignPaginatedImage ? "items-start" : "",
                          shouldSafeCenterPaginatedImage ? "items-center-safe" : "",
                        )}
                      >
                        {renderReaderPage(page, pageIndex, {
                          className: shouldPanPaginatedImage
                            ? mobilePannableHeightPageClassName
                            : undefined,
                          imageFetchPriority: isActiveSlot ? "high" : "auto",
                          imageFit: pageImageFit,
                          imageLoading: paginatedWarmPageIndices.has(pageIndex) ? "eager" : "lazy",
                          surfaceClassName: cn(
                            spreadAlignmentClassName,
                            shouldPanPaginatedImage
                              ? mobilePannableHeightSurfaceClassName
                              : undefined,
                          ),
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </button>
  ) : layout === "scroll-horizontal" ? (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col",
        isViewportBoundedReader ? "h-full min-h-0 overflow-hidden" : "",
      )}
    >
      <div
        ref={horizontalScrollRef}
        data-testid="project-reading-horizontal-scroll"
        className={cn(
          "no-scrollbar w-full min-w-0 overflow-x-auto overflow-y-hidden",
          isViewportBoundedReader ? "min-h-0" : "",
          isCinemaMode
            ? isViewportBoundedReader
              ? "px-0"
              : "px-0 py-0"
            : isViewportBoundedReader
              ? "px-0"
              : "px-0 py-2 md:py-4",
        )}
        style={horizontalScrollViewportStyle}
        aria-label="Leitura com rolagem horizontal"
      >
        <div
          ref={horizontalScrollStripRef}
          data-testid="project-reading-horizontal-strip"
          className={cn(
            "flex w-max min-w-full items-start gap-0",
            direction === "rtl" ? "flex-row-reverse" : "flex-row",
            isViewportBoundedReader ? "min-h-full" : "",
          )}
        >
          {renderablePages.map((page, pageIndex) =>
            renderContinuousPage(
              page,
              pageIndex,
              getContinuousHorizontalPageClassName(effectiveImageFit),
              getContinuousHorizontalSurfaceClassName(effectiveImageFit),
            ),
          )}
        </div>
      </div>
    </div>
  ) : layout === "scroll-vertical" ? (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      <div
        ref={verticalScrollRef}
        data-testid="project-reading-vertical-scroll"
        className={cn(
          "no-scrollbar h-full w-full min-h-0 overflow-y-auto",
          shouldPanVerticalImage ? "overflow-x-auto overscroll-contain" : "overflow-x-hidden",
          isCinemaMode ? "px-0 py-0" : "mx-auto px-2 py-2 md:px-4 md:py-4",
        )}
        style={verticalScrollViewportStyle}
        aria-label="Leitura com rolagem vertical"
      >
        <div
          ref={verticalScrollStripRef}
          data-testid="project-reading-vertical-strip"
          className={cn(
            "flex flex-col items-center gap-0",
            shouldPanVerticalImage ? "mx-0 w-max min-w-full" : "mx-auto w-full",
          )}
        >
          {renderablePages.map((page, pageIndex) => (
            <div
              key={`vertical-page-${pageIndex}`}
              className={
                shouldPanVerticalImage || effectiveImageFit === "none"
                  ? "w-auto max-w-none"
                  : "w-full"
              }
              style={getContinuousVerticalPageContainerStyle(page, effectiveImageFit)}
            >
              {renderContinuousPage(
                page,
                pageIndex,
                shouldPanVerticalImage ? mobilePannableHeightPageClassName : undefined,
                shouldPanVerticalImage ? mobilePannableHeightSurfaceClassName : undefined,
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  ) : (
    <div
      className={cn(
        "flex w-full flex-col items-center gap-0",
        isCinemaMode ? "px-0 py-0" : "mx-auto px-2 py-2 md:px-4 md:py-4",
      )}
    >
      {renderablePages.map((page, pageIndex) => (
        <div
          key={`vertical-page-${pageIndex}`}
          className={effectiveImageFit === "none" ? "w-auto max-w-none" : "w-full"}
          style={getContinuousVerticalPageContainerStyle(page, effectiveImageFit)}
        >
          {renderContinuousPage(page, pageIndex)}
        </div>
      ))}
    </div>
  );

  const closeMenu = useCallback(
    (delayMs = HIDDEN_PROGRESS_HIDE_DELAY_MS) => {
      setIsMenuOpen(false);
      revealMenuTrigger();
      if (!supportsHoverMenuActivation || !isMenuRegionHoveredRef.current) {
        scheduleMenuTriggerHide(delayMs);
      }
    },
    [revealMenuTrigger, scheduleMenuTriggerHide, supportsHoverMenuActivation],
  );

  const navigateChapterByOption = useCallback(
    (option: ReaderChapterOption | null) => {
      if (!option) {
        return;
      }
      closeMenu();
      onNavigateChapter(option.href);
    },
    [closeMenu, onNavigateChapter],
  );

  const handleMenuButtonClick = useCallback(() => {
    if (isMenuOpen) {
      closeMenu();
      return;
    }

    revealMenuTrigger();
    setIsMenuOpen(true);
  }, [closeMenu, isMenuOpen, revealMenuTrigger]);

  const handleMenuRegionEnter = useCallback(() => {
    isMenuRegionHoveredRef.current = true;
    if (!supportsHoverMenuActivation) {
      return;
    }

    revealMenuTrigger();
  }, [revealMenuTrigger, supportsHoverMenuActivation]);

  const handleMenuRegionLeave = useCallback(() => {
    isMenuRegionHoveredRef.current = false;
    if (!supportsHoverMenuActivation || isMenuOpen) {
      return;
    }

    scheduleMenuTriggerHide();
  }, [isMenuOpen, scheduleMenuTriggerHide, supportsHoverMenuActivation]);

  const handleMenuActivationPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const isMousePointer = event.pointerType === "mouse";
      if (supportsHoverMenuActivation && isMousePointer) {
        return;
      }

      event.preventDefault();
      revealMenuTrigger();
      setIsMenuOpen(true);
    },
    [revealMenuTrigger, supportsHoverMenuActivation],
  );

  const heroActions = useMemo(() => {
    const resolvedEditActionLabel = String(editActionLabel || "").trim() || "Editar capítulo";

    return (
      <>
        <Button
          asChild
          size="sm"
          variant="outline"
          className="project-reading-action-btn project-reading-action-btn--secondary"
        >
          <Link to={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Voltar ao projeto</span>
          </Link>
        </Button>

        {editHref ? (
          <Button
            asChild
            size="sm"
            className="project-reading-action-btn project-reading-action-btn--primary"
          >
            <Link to={editHref}>
              <PencilLine className="h-4 w-4" aria-hidden="true" />
              <span>{resolvedEditActionLabel}</span>
            </Link>
          </Button>
        ) : null}
      </>
    );
  }, [backHref, editActionLabel, editHref]);

  const sidebarContent = useMemo(
    () => (
      <div ref={menuContentRef} className="space-y-2.5 px-3.5 pb-5 pt-3.5 md:px-4 md:pt-4">
        <div className={cn(SIDEBAR_SECTION_CLASS_NAME, "space-y-2.5")}>
          <div className={SIDEBAR_SECTION_HEADER_CLASS_NAME}>
            <BookOpenText className={SIDEBAR_SECTION_ICON_CLASS_NAME} aria-hidden="true" />
            <p className="text-sm font-semibold leading-none text-foreground">Navegação</p>
          </div>
          <div className="space-y-2.5">
            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Capítulo</Label>
              <Combobox
                value={currentChapterValue}
                onValueChange={(value) => {
                  const nextChapter = chapterOptions.find((option) => option.value === value);
                  if (!nextChapter) {
                    return;
                  }
                  closeMenu();
                  onNavigateChapter(nextChapter.href);
                }}
                ariaLabel="Selecionar capítulo"
                options={chapterOptions}
                placeholder="Selecione um capítulo"
                searchable
                searchPlaceholder="Buscar capítulo"
                emptyMessage="Nenhum capítulo encontrado."
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Página</Label>
              <Combobox
                value={String(Math.min(activePageIndex, Math.max(originalPages.length - 1, 0)))}
                onValueChange={(value) => {
                  goToPage(Number(value));
                  closeMenu();
                }}
                ariaLabel="Selecionar página"
                options={pageItems}
                placeholder="Selecione uma página"
                searchable
                searchPlaceholder="Buscar página"
                emptyMessage="Nenhuma página encontrada."
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            {showChapterNavigationActions ? (
              <div
                className={cn(
                  "project-reading-reader-menu-nav grid gap-2.5",
                  previousChapterOption && nextChapterOption ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                {previousChapterOption ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="project-reading-nav-btn project-reading-nav-btn--secondary project-reading-reader-menu-nav__button h-10 w-full rounded-2xl px-4 shadow-sm"
                    onClick={() => navigateChapterByOption(previousChapterOption)}
                    aria-label="Capítulo anterior"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    <span>Anterior</span>
                  </Button>
                ) : null}

                {nextChapterOption ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="project-reading-nav-btn project-reading-nav-btn--next project-reading-reader-menu-nav__button h-10 w-full rounded-2xl px-4 shadow-sm"
                    onClick={() => navigateChapterByOption(nextChapterOption)}
                    aria-label="Próximo capítulo"
                  >
                    <span>Próximo</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={cn(SIDEBAR_SECTION_CLASS_NAME, "space-y-2.5")}>
          <div className={SIDEBAR_SECTION_HEADER_CLASS_NAME}>
            <Eye className={SIDEBAR_SECTION_ICON_CLASS_NAME} aria-hidden="true" />
            <p className="text-sm font-semibold leading-none text-foreground">Exibição</p>
          </div>
          <div className="space-y-2.5">
            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Layout</Label>
              <Combobox
                value={String(resolvedConfig.layout || "single")}
                onValueChange={(value) => updateConfig({ layout: value })}
                ariaLabel="Selecionar layout do leitor"
                options={readerLayoutOptions}
                placeholder="Selecione um layout"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Ajuste da imagem</Label>
              <Combobox
                value={String(resolvedConfig.imageFit || "both")}
                onValueChange={(value) => updateConfig({ imageFit: value })}
                ariaLabel="Selecionar ajuste da imagem"
                options={readerImageFitOptions}
                placeholder="Selecione o ajuste"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Sentido de leitura</Label>
              <Combobox
                value={String(resolvedConfig.direction || "rtl")}
                onValueChange={(value) => updateConfig({ direction: value })}
                ariaLabel="Selecionar direção do leitor"
                options={readerDirectionOptions}
                placeholder="Selecione a direção"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Fundo do palco</Label>
              <Combobox
                value={String(resolvedConfig.background || "theme")}
                onValueChange={(value) => updateConfig({ background: value })}
                ariaLabel="Selecionar fundo do palco"
                options={readerBackgroundOptions}
                placeholder="Selecione o fundo"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>
          </div>
        </div>

        <div className={cn(SIDEBAR_SECTION_CLASS_NAME, "space-y-2.5")}>
          <div className={SIDEBAR_SECTION_HEADER_CLASS_NAME}>
            <SlidersHorizontal className={SIDEBAR_SECTION_ICON_CLASS_NAME} aria-hidden="true" />
            <p className="text-sm font-semibold leading-none text-foreground">Interface</p>
          </div>
          <div className="space-y-2.5">
            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Barra do site</Label>
              <Combobox
                value={siteHeaderVariant}
                onValueChange={(value) =>
                  updateConfig({
                    siteHeaderVariant: value === "static" ? "static" : "fixed",
                  })
                }
                ariaLabel="Selecionar comportamento do header do site"
                options={readerSiteHeaderVariantOptions}
                placeholder="Selecione o comportamento do header"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Indicador de progresso</Label>
              <Combobox
                value={String(resolvedConfig.progressStyle || "default")}
                onValueChange={(value) => updateConfig({ progressStyle: value })}
                ariaLabel="Selecionar estilo do progresso"
                options={readerProgressStyleOptions}
                placeholder="Selecione o progresso"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <div className={SIDEBAR_FIELD_CLASS_NAME}>
              <Label className={SIDEBAR_LABEL_CLASS_NAME}>Posição do indicador</Label>
              <Combobox
                value={String(resolvedConfig.progressPosition || "bottom")}
                onValueChange={(value) => updateConfig({ progressPosition: value })}
                ariaLabel="Selecionar posição do progresso"
                options={readerProgressPositionOptions}
                placeholder="Selecione a posição"
                searchable={false}
                className={SIDEBAR_SELECT_TRIGGER_CLASS_NAME}
              />
            </div>

            <label className="flex items-center justify-between gap-4 rounded-2xl border border-border/55 bg-background/50 px-3.5 py-3.5 text-sm shadow-sm">
              <span>
                <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70">
                  Isolar primeira página
                </span>
              </span>
              <Switch
                checked={resolvedConfig.firstPageSingle !== false}
                onCheckedChange={(checked) => updateConfig({ firstPageSingle: checked })}
                aria-label="Alternar primeira página isolada"
              />
            </label>
          </div>
        </div>
      </div>
    ),
    [
      activePageIndex,
      chapterOptions,
      closeMenu,
      currentChapterValue,
      goToPage,
      navigateChapterByOption,
      nextChapterOption,
      onNavigateChapter,
      originalPages.length,
      pageItems,
      previousChapterOption,
      resolvedConfig.background,
      resolvedConfig.direction,
      resolvedConfig.firstPageSingle,
      resolvedConfig.imageFit,
      resolvedConfig.layout,
      resolvedConfig.progressPosition,
      resolvedConfig.progressStyle,
      resolvedConfig.siteHeaderVariant,
      showChapterNavigationActions,
      siteHeaderVariant,
      updateConfig,
    ],
  );

  const stageMenuOverlay = useMemo(
    () => (
      <>
        {isMenuOverlayMounted ? (
          <button
            type="button"
            data-testid="project-reader-menu-backdrop"
            className={cn(
              "absolute inset-0 z-20 transition-opacity duration-200 ease-out",
              isMenuOverlayVisible
                ? "pointer-events-auto bg-black/40 opacity-100 backdrop-blur-[1px]"
                : "pointer-events-none bg-black/0 opacity-0 backdrop-blur-0",
            )}
            onClick={() => closeMenu()}
            aria-label="Fechar menu do leitor"
          />
        ) : null}

        <div
          data-testid="project-reader-menu-host"
          className="pointer-events-none absolute inset-x-0 top-0 z-30"
        >
          <div ref={menuViewportInnerRef} className="px-2 md:px-4">
            <div
              className="relative ml-auto w-full max-w-full"
              onFocusCapture={revealMenuTrigger}
              onBlurCapture={(event) => {
                const nextTarget = event.relatedTarget as Node | null;
                if (!event.currentTarget.contains(nextTarget) && !isMenuOpen) {
                  scheduleMenuTriggerHide();
                }
              }}
            >
              <div
                className={cn(
                  "absolute right-0 top-0",
                  isMenuOpen ? "pointer-events-none" : "pointer-events-auto",
                )}
                style={{
                  width: `${MENU_TRIGGER_HOTSPOT_SIZE_PX}px`,
                  height: `${MENU_TRIGGER_HOTSPOT_SIZE_PX}px`,
                }}
                onMouseEnter={handleMenuRegionEnter}
                onMouseLeave={handleMenuRegionLeave}
              >
                {!isMenuOpen ? (
                  <div
                    data-testid="project-reader-menu-activation-zone"
                    className="absolute right-0 top-0 z-0 rounded-full bg-transparent touch-none"
                    style={{
                      width: `${MENU_TRIGGER_HOTSPOT_SIZE_PX}px`,
                      height: `${MENU_TRIGGER_HOTSPOT_SIZE_PX}px`,
                    }}
                    onPointerDown={handleMenuActivationPointerDown}
                    aria-hidden="true"
                  />
                ) : null}

                {isMenuTriggerMounted ? (
                  <div
                    data-testid="project-reader-menu-button-shell"
                    data-state={isMenuTriggerAnimatingVisible ? "visible" : "hidden"}
                    className={cn(
                      "absolute right-2 top-2 z-10 will-change-transform transition-[opacity,transform] ease-out",
                      isMenuTriggerAnimatingVisible
                        ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                        : "pointer-events-none translate-y-0 scale-[0.985] opacity-0",
                    )}
                    style={{
                      transitionDuration: `${isMenuTriggerAnimatingVisible ? MENU_TRIGGER_ENTER_TRANSITION_MS : MENU_TRIGGER_EXIT_TRANSITION_MS}ms`,
                    }}
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        "h-10 w-10 rounded-full border border-border/45 bg-card/45 text-foreground/85 shadow-reader-control backdrop-blur-sm transition-[background-color,border-color,color,box-shadow] duration-300 ease-out hover:bg-accent/90 hover:text-accent-foreground",
                        isCinemaMode ? "bg-background/75" : "",
                        isMenuOpen
                          ? "border-primary/25 bg-primary/8 text-foreground shadow-reader-active-control"
                          : "",
                      )}
                      onClick={handleMenuButtonClick}
                      onFocus={revealMenuTrigger}
                      aria-label="Abrir menu do leitor"
                      aria-controls={readerMenuPanelId}
                      aria-expanded={isMenuOpen}
                      aria-haspopup="dialog"
                      data-testid="project-reader-menu-button"
                      data-state={isMenuTriggerAnimatingVisible ? "visible" : "hidden"}
                    >
                      <Menu className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                ) : null}
              </div>

              {isMenuOverlayMounted ? (
                <aside
                  ref={menuPanelRef}
                  id={readerMenuPanelId}
                  aria-labelledby={readerMenuTitleId}
                  aria-modal="false"
                  role="dialog"
                  data-testid="project-reader-sidebar"
                  className={cn(
                    "absolute right-0 top-0 z-20 flex min-h-0 flex-col overflow-hidden rounded-4xl border shadow-reader-menu transition-[opacity,transform] duration-200 ease-out origin-top-right",
                    sidebarToneClassName,
                    isMenuOverlayVisible
                      ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
                      : "pointer-events-none -translate-y-2 scale-[0.985] opacity-0",
                  )}
                  style={menuPanelBaseStyle}
                >
                  <div
                    ref={menuHeaderRef}
                    className="relative border-b border-border/45 px-3.5 py-3 pr-14 md:px-4 md:py-4"
                  >
                    <div className="flex min-w-0 items-center">
                      <p
                        id={readerMenuTitleId}
                        className="truncate text-lg font-semibold tracking-tight text-foreground"
                      >
                        Leitor
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="absolute right-2.5 top-2.5 z-10 h-10 w-10 rounded-full border border-border/45 bg-background/70 text-foreground/80 shadow-sm backdrop-blur-sm transition-colors duration-200 hover:bg-accent hover:text-accent-foreground"
                      onClick={() => closeMenu()}
                      aria-label="Fechar menu do leitor"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div
                    ref={menuScrollAreaRef}
                    data-testid="project-reader-menu-scroll-area"
                    className="no-scrollbar min-h-0 flex-1 overflow-y-auto"
                  >
                    {sidebarContent}
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </div>
      </>
    ),
    [
      closeMenu,
      handleMenuActivationPointerDown,
      handleMenuButtonClick,
      handleMenuRegionEnter,
      handleMenuRegionLeave,
      isCinemaMode,
      isMenuOpen,
      isMenuOverlayMounted,
      isMenuOverlayVisible,
      isMenuTriggerAnimatingVisible,
      isMenuTriggerMounted,
      menuPanelBaseStyle,
      readerMenuPanelId,
      readerMenuTitleId,
      revealMenuTrigger,
      scheduleMenuTriggerHide,
      sidebarContent,
      sidebarToneClassName,
    ],
  );

  return (
    <div
      ref={shellRef}
      data-testid="project-reading-full-bleed-shell"
      className={cn(
        "project-reading-reader-shell relative flex w-full min-w-0 flex-col",
        isCinemaMode ? "gap-0" : "gap-2 md:gap-3",
        paginated ? "min-h-0 flex-1" : "",
      )}
      style={readerViewportStyle}
    >
      <div
        ref={infoBarRef}
        className={cn("w-full", isCinemaMode ? "absolute inset-x-0 top-0 z-20" : "relative z-10")}
      >
        <ProjectReadingInfoBar
          projectTitle={projectTitle}
          projectHref={backHref}
          chapterTitle={chapterTitle}
          chapterLabel={chapterLabel}
          projectType={projectType}
          synopsis={synopsis}
          volume={volume}
          pageSummary={pageSummary}
          actions={heroActions}
          variant={isCinemaMode ? "reader-cinema" : "reader-full-bleed"}
        />
      </div>

      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <section
          ref={stageRef}
          data-testid="project-reading-stage"
          data-layout={layout}
          data-image-fit={visualState.imageFit}
          data-background={visualState.background}
          data-progress-style={visualState.progressStyle}
          data-progress-position={visualState.progressPosition}
          data-chrome-mode={isCinemaMode ? "cinema" : "default"}
          data-viewport-mode={viewportMode}
          tabIndex={0}
          onPointerDownCapture={focusReaderStage}
          className={cn(
            "relative isolate w-full min-h-0 focus:outline-none",
            paginated ? "flex min-h-0 flex-col" : "",
            stageToneClassName,
          )}
          style={stageViewportStyle}
        >
          {renderMenuViewport()}
          {renderProgressViewport()}
          {stageContent}
        </section>

        {layout === "scroll-horizontal" ? (
          <div
            ref={horizontalScrollRailHostRef}
            data-testid="project-reading-horizontal-scrollbar-host"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-full z-10 overflow-visible",
              isCinemaMode ? "px-0 pt-1" : "px-0 pt-1",
            )}
          >
            <div
              ref={horizontalScrollRailRef}
              data-testid="project-reading-horizontal-scrollbar"
              className="reader-external-scrollbar pointer-events-auto h-4 w-full overflow-x-auto overflow-y-hidden"
              aria-label="Scrollbar horizontal do leitor"
            >
              <div
                data-testid="project-reading-horizontal-scrollbar-spacer"
                style={{
                  width: `${horizontalScrollbarSpacerWidth}px`,
                  minWidth: "100%",
                  height: "1px",
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const PublicProjectReaderWithPreferences = (props: PublicProjectReaderBaseProps) => {
  const preferences = useProjectReaderPreferences({
    projectType: props.projectType,
    baseConfig: props.baseConfig,
    currentUserId: props.currentUserId,
  });

  return <PublicProjectReaderContent {...props} preferences={preferences} />;
};

const PublicProjectReader = ({ preferences, ...props }: PublicProjectReaderProps) => {
  if (preferences) {
    return <PublicProjectReaderContent {...props} preferences={preferences} />;
  }

  return <PublicProjectReaderWithPreferences {...props} />;
};

export default PublicProjectReader;
