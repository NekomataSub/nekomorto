import {
  PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT,
  canUsePublicAstroClientNavigation,
  navigatePublicDocument,
  usePublicDocumentLocation,
} from "@/lib/public-document-navigation";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, useEffect } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("public-document-navigation", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("usa navegacao client-side entre / e /projetos", () => {
    window.history.replaceState({ from: "home" }, "", "/");
    const listener = vi.fn();
    window.addEventListener(PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT, listener);

    navigatePublicDocument("/projetos");

    expect(window.location.pathname).toBe("/projetos");
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(PUBLIC_DOCUMENT_LOCATION_CHANGE_EVENT, listener);
  });

  it("explicita quais pares podem usar navegacao client-side", () => {
    expect(canUsePublicAstroClientNavigation({ currentPath: "/", targetPath: "/projetos" })).toBe(
      true,
    );
    expect(
      canUsePublicAstroClientNavigation({
        currentPath: "/projetos",
        targetPath: "/projeto/slug-teste",
      }),
    ).toBe(true);
    expect(
      canUsePublicAstroClientNavigation({
        currentPath: "/projeto/slug-teste",
        targetPath: "/",
      }),
    ).toBe(true);
    expect(
      canUsePublicAstroClientNavigation({
        currentPath: "/equipe",
        targetPath: "/projeto/slug-teste",
      }),
    ).toBe(true);
    expect(
      canUsePublicAstroClientNavigation({
        currentPath: "/faq",
        targetPath: "/login",
      }),
    ).toBe(true);
    expect(
      canUsePublicAstroClientNavigation({
        currentPath: "/projetos",
        targetPath: "/projeto/slug-teste/leitura/capitulo-1",
      }),
    ).toBe(false);
  });

  it("usa initialPath no primeiro render e sincroniza window.location em efeito", async () => {
    window.history.replaceState(null, "", "/projetos?tag=acao");

    const LocationProbe = () => {
      const location = usePublicDocumentLocation("/projeto/slug-teste");
      return createElement("span", null, `${location.pathname}${location.search}`);
    };

    expect(renderToString(createElement(LocationProbe))).toContain("/projeto/slug-teste");

    const { result } = renderHook(() => usePublicDocumentLocation("/projeto/slug-teste"));

    await waitFor(() => {
      expect(result.current.pathname).toBe("/projetos");
      expect(result.current.search).toBe("?tag=acao");
    });
  });

  it("nao publica nova referencia quando initialPath ja corresponde a window.location", async () => {
    window.history.replaceState(null, "", "/projetos?tag=acao");
    const snapshots: Array<ReturnType<typeof usePublicDocumentLocation>> = [];

    const { result } = renderHook(() => {
      const location = usePublicDocumentLocation("/projetos?tag=acao");
      useEffect(() => {
        snapshots.push(location);
      }, [location]);
      return location;
    });

    await waitFor(() => {
      expect(result.current.pathname).toBe("/projetos");
    });

    expect(result.current.search).toBe("?tag=acao");
    expect(snapshots).toHaveLength(1);
  });
});
