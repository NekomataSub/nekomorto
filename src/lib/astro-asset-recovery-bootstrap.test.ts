import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildAstroAssetRecoveryBootstrapScript } from "@/lib/astro-asset-recovery-bootstrap";

const createMemoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const runBootstrap = () => {
  const windowTarget = new EventTarget() as EventTarget & {
    location: { reload: ReturnType<typeof vi.fn> };
    sessionStorage: ReturnType<typeof createMemoryStorage>;
    __NEKOMATA_ASTRO_ASSET_RECOVERY__?: boolean;
  };
  windowTarget.location = { reload: vi.fn() };
  windowTarget.sessionStorage = createMemoryStorage();
  const documentTarget = new EventTarget();
  const run = new Function("window", "document", buildAstroAssetRecoveryBootstrapScript());
  run(windowTarget, documentTarget);
  return { documentTarget, windowTarget };
};

describe("Astro asset recovery bootstrap", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reloads once for the same missing Astro asset", () => {
    const { documentTarget, windowTarget } = runBootstrap();
    const dispatchFailure = () => {
      const event = new Event("astro:hydration-error", { cancelable: true });
      Object.defineProperty(event, "detail", {
        value: {
          error: new TypeError(
            "Failed to fetch dynamically imported module: https://nekomata.moe/_astro/client.oldhash.js",
          ),
        },
      });
      documentTarget.dispatchEvent(event);
      return event;
    };

    const first = dispatchFailure();
    const second = dispatchFailure();

    expect(first.defaultPrevented).toBe(true);
    expect(second.defaultPrevented).toBe(false);
    expect(windowTarget.location.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for unrelated application errors", () => {
    const { windowTarget } = runBootstrap();
    const event = new Event("error", { cancelable: true });
    Object.defineProperty(event, "error", {
      value: new TypeError("Cannot read properties of undefined"),
    });

    windowTarget.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(windowTarget.location.reload).not.toHaveBeenCalled();
  });
});

