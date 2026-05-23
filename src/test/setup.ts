import "@testing-library/jest-dom";
import { toHaveNoViolations } from "jest-axe";

expect.extend(toHaveNoViolations);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const createStorageMock = (): Storage => {
  const entries = new Map<string, string>();

  return {
    get length() {
      return entries.size;
    },
    clear: () => {
      entries.clear();
    },
    getItem: (key: string) => entries.get(String(key)) ?? null,
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    removeItem: (key: string) => {
      entries.delete(String(key));
    },
    setItem: (key: string, value: string) => {
      entries.set(String(key), String(value));
    },
  };
};

const ensureWindowProperty = <T>(name: keyof Window, value: T) => {
  if (typeof window === "undefined" || window[name]) {
    return;
  }

  Object.defineProperty(window, name, {
    configurable: true,
    value,
    writable: true,
  });
};

ensureWindowProperty("localStorage", createStorageMock());
ensureWindowProperty("sessionStorage", createStorageMock());
ensureWindowProperty("scrollTo", () => {});
ensureWindowProperty("scrollBy", () => {});

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (callback: FrameRequestCallback) =>
    window.setTimeout(() => callback(performance.now()), 16);
}

if (!window.cancelAnimationFrame) {
  window.cancelAnimationFrame = (handle: number) => {
    window.clearTimeout(handle);
  };
}

if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!window.IntersectionObserver) {
  window.IntersectionObserver = class IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly scrollMargin = "";
    readonly thresholds = [];

    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}

    disconnect() {}
    observe() {}
    takeRecords() {
      return [];
    }
    unobserve() {}
  };
}

if (!window.visualViewport) {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: {
      addEventListener: () => {},
      dispatchEvent: () => false,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      removeEventListener: () => {},
      scale: 1,
      width: window.innerWidth,
    },
  });
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

const reactRouterFutureWarnings = [
  "React Router Future Flag Warning: React Router will begin wrapping state updates in `React.startTransition` in v7.",
  "React Router Future Flag Warning: Relative route resolution within Splat routes is changing in v7.",
];

const originalConsoleWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  const firstArg = args[0];
  if (
    typeof firstArg === "string" &&
    reactRouterFutureWarnings.some((warning) => firstArg.includes(warning))
  ) {
    return;
  }
  originalConsoleWarn(...args);
};
