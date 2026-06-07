import { $createCodeNode } from "@lexical/code";
import { $createHorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { render, screen } from "@testing-library/react";
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from "lexical";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import LexicalViewer from "@/components/lexical/LexicalViewer";
import LexicalViewerNodes from "@/components/lexical/LexicalViewerNodes";
import { $createEpubAnchorNode } from "@/components/lexical/nodes/EpubAnchorNode";
import { $createEpubHeadingNode } from "@/components/lexical/nodes/EpubHeadingNode";
import { $createEpubImageNode } from "@/components/lexical/nodes/EpubImageNode";
import { $createEpubParagraphNode } from "@/components/lexical/nodes/EpubParagraphNode";
import {
  $createViewerPollNode,
  createViewerPollOption,
} from "@/components/lexical/viewer-nodes/ViewerPollNode";
import { $createTweetNode } from "@/components/lexical/editor/nodes/TweetNode";
import { $createYouTubeNode } from "@/components/lexical/editor/nodes/YouTubeNode";

vi.mock("@/lib/api-base", () => ({
  getApiBase: () => "http://api.local",
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@lexical/react/LexicalBlockWithAlignableContents", () => ({
  BlockWithAlignableContents: ({ children }: { children: ReactNode }) => (
    <div data-testid="decorator-block">{children}</div>
  ),
}));

const serializeViewerState = (build: () => void) => {
  const editor = createEditor({
    namespace: "LexicalViewerFidelityTest",
    nodes: LexicalViewerNodes,
    editable: false,
    onError: (error: Error) => {
      throw error;
    },
  });

  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      build();
    },
    { discrete: true },
  );

  return JSON.stringify(editor.getEditorState().toJSON());
};

describe("LexicalViewer fidelity", () => {
  it("renderiza code block, tabela, hr, enquete e embeds com wrappers de bloco", async () => {
    const createTweetMock = vi.fn(async (_tweetId: string, container: HTMLElement | null) => {
      if (!container) {
        return null;
      }

      const tweet = document.createElement("blockquote");
      tweet.className = "twitter-tweet twitter-tweet-rendered";
      tweet.textContent = "tweet mockado";

      const iframe = document.createElement("iframe");
      iframe.src = "https://twitter.com/test/status/1";

      container.append(tweet, iframe);
      return container;
    });

    (
      window as typeof window & {
        twttr?: { widgets: { createTweet: typeof createTweetMock } };
      }
    ).twttr = {
      widgets: {
        createTweet: createTweetMock,
      },
    };

    const value = serializeViewerState(() => {
      const code = $createCodeNode("js");
      code.append($createTextNode("const valor = 1;"));

      const table = $createTableNodeWithDimensions(2, 2, true);
      const hr = $createHorizontalRuleNode();
      const poll = $createViewerPollNode("Qual opção?", [
        createViewerPollOption("A"),
        createViewerPollOption("B"),
      ]);
      const tweet = $createTweetNode("1234567890");
      const youtube = $createYouTubeNode("dQw4w9WgXcQ");

      const afterEmbedParagraph = $createParagraphNode();
      afterEmbedParagraph.append($createTextNode("Parágrafo depois do embed"));

      $getRoot().append(code, table, hr, poll, tweet, youtube, afterEmbedParagraph);
    });

    const { container } = render(
      <LexicalViewer
        value={value}
        className="reader-content post-content"
        ariaLabel="Conteúdo de fidelidade"
      />,
    );

    expect(await screen.findByText("Qual opção?")).toBeInTheDocument();
    expect(container.querySelector(".editor-shell--read-only")).toBeTruthy();
    expect(container.querySelector(".ContentEditable__root")).toBeTruthy();
    expect(container.querySelector(".PlaygroundEditorTheme__code")).toBeTruthy();
    expect(container.querySelector(".PlaygroundEditorTheme__table")).toBeTruthy();
    expect(container.querySelector(".PlaygroundEditorTheme__tableCell")).toBeTruthy();
    expect(container.querySelector(".PlaygroundEditorTheme__tableCellHeader")).toBeTruthy();
    expect(container.querySelector(".PlaygroundEditorTheme__hr")).toBeTruthy();
    expect(container.querySelector('[data-lexical-viewer-poll="true"]')).toBeTruthy();
    expect(container.querySelector(".PollNode__container")).toBeTruthy();
    const tweetContainer = container.querySelector(".lexical-tweet") as HTMLElement | null;
    const tweetTarget = container.querySelector(".lexical-tweet__target") as HTMLElement | null;
    expect(tweetContainer).toBeTruthy();
    expect(tweetTarget).toBeTruthy();
    expect(container.querySelector(".lexical-youtube")).toBeTruthy();
    expect(container.querySelector('iframe[data-lexical-youtube-iframe="true"]')).toBeTruthy();
    await createTweetMock("1234567890", tweetTarget);
    expect(container.querySelector(".twitter-tweet-rendered")).toBeTruthy();
    expect(container.querySelector('iframe[src*="twitter.com"]')).toBeTruthy();
  });

  it("preserva estilos explicitos de nodes EPUB acima da escala nativa compartilhada", async () => {
    const value = serializeViewerState(() => {
      const heading = $createEpubHeadingNode({
        tag: "h2",
        editorialStyle:
          "font-size: 26px; line-height: 1.4; font-family: serif; margin-top: 12px; margin-bottom: 18px;",
      });
      heading.append($createTextNode("Capítulo EPUB"));

      const paragraph = $createEpubParagraphNode({
        editorialStyle:
          "font-size: 19px; line-height: 1.95; font-family: serif; margin-top: 10px; margin-bottom: 14px; text-indent: 2em;",
      });
      const styledText = $createTextNode("Texto EPUB estilizado");
      styledText.setStyle(
        "font-size: 21px; font-family: serif; font-style: italic; font-weight: 700;",
      );
      paragraph.append(styledText);

      const image = $createEpubImageNode({
        src: "/uploads/tmp/epub-imports/test/image.jpg",
        altText: "Ilustração EPUB",
        editorialStyle: "width: 240px; display: block; margin-left: auto; margin-right: auto;",
        align: "center",
      });

      $getRoot().append(heading, paragraph, image);
    });

    render(<LexicalViewer value={value} ariaLabel="Conteúdo EPUB" />);

    const heading = await screen.findByText("Capítulo EPUB");
    expect(heading.closest("h2")?.getAttribute("style")).toContain("font-size: 26px");
    expect(heading.closest("h2")?.getAttribute("style")).toContain("line-height: 1.4");
    expect(heading.closest("h2")?.getAttribute("style")).toContain("font-family: serif");

    const paragraphText = screen.getByText("Texto EPUB estilizado");
    expect(paragraphText.closest("p")?.getAttribute("style")).toContain("font-size: 19px");
    expect(paragraphText.closest("p")?.getAttribute("style")).toContain("line-height: 1.95");
    expect(paragraphText.closest("p")?.getAttribute("style")).toContain("text-indent: 2em");
    expect(paragraphText.getAttribute("style")).toContain("font-size: 21px");
    expect(paragraphText.getAttribute("style")).toContain("font-family: serif");
    expect(paragraphText.getAttribute("style")).toContain("font-style: italic");

    const image = screen.getByRole("img", { name: "Ilustração EPUB" });
    expect(image.getAttribute("style")).toContain("width: 240px");
    expect(image.getAttribute("style")).toContain("display: block");
    expect(image.getAttribute("style")).toContain("margin-left: auto");
    expect(image.getAttribute("style")).toContain("margin-right: auto");
  });

  it("renderiza anchors EPUB com id navegavel no DOM do viewer", async () => {
    const value = serializeViewerState(() => {
      const paragraph = $createParagraphNode();
      paragraph.append($createEpubAnchorNode({ anchorId: "note-1" }), $createTextNode("Nota EPUB"));
      $getRoot().append(paragraph);
    });

    const { container } = render(<LexicalViewer value={value} ariaLabel="Conteudo com ancora" />);

    expect(await screen.findByRole("textbox", { name: "Conteudo com ancora" })).toBeInTheDocument();
    expect(container.querySelector('span#note-1[data-lexical-epub-anchor="note-1"]')).toBeTruthy();
  });

  it("renderiza colapsavel fechado por padrao no fallback de chrome", async () => {
    vi.resetModules();
    vi.doMock("@lexical/utils", async () => {
      const actual = await vi.importActual<typeof import("@lexical/utils")>("@lexical/utils");
      return {
        ...actual,
        IS_CHROME: true,
      };
    });

    try {
      const { default: ChromeLexicalViewer } = await import("@/components/lexical/LexicalViewer");
      const { default: ChromeLexicalViewerNodes } = await import(
        "@/components/lexical/LexicalViewerNodes"
      );
      const {
        createEditor: createChromeEditor,
        $getRoot: $getChromeRoot,
        $createParagraphNode: $createChromeParagraphNode,
        $createTextNode: $createChromeTextNode,
      } = await import("lexical");
      const { $createCollapsibleContainerNode } = await import(
        "@/components/lexical/editor/plugins/CollapsiblePlugin/CollapsibleContainerNode"
      );
      const { $createCollapsibleTitleNode } = await import(
        "@/components/lexical/editor/plugins/CollapsiblePlugin/CollapsibleTitleNode"
      );
      const { $createCollapsibleContentNode } = await import(
        "@/components/lexical/editor/plugins/CollapsiblePlugin/CollapsibleContentNode"
      );

      const chromeEditor = createChromeEditor({
        namespace: "LexicalViewerChromeCollapsibleTest",
        nodes: ChromeLexicalViewerNodes,
        editable: false,
        onError: (error: Error) => {
          throw error;
        },
      });

      chromeEditor.update(
        () => {
          const root = $getChromeRoot();
          root.clear();

          const titleParagraph = $createChromeParagraphNode();
          titleParagraph.append($createChromeTextNode("Titulo recolhivel"));

          const contentParagraph = $createChromeParagraphNode();
          contentParagraph.append($createChromeTextNode("Conteudo recolhido"));

          root.append(
            $createCollapsibleContainerNode(true).append(
              $createCollapsibleTitleNode().append(titleParagraph),
              $createCollapsibleContentNode().append(contentParagraph),
            ),
          );
        },
        { discrete: true },
      );

      const value = JSON.stringify(chromeEditor.getEditorState().toJSON());

      const { container } = render(
        <ChromeLexicalViewer
          value={value}
          className="reader-content post-content"
          ariaLabel="Conteudo recolhivel"
        />,
      );

      const collapsibleContainer = container.querySelector(".Collapsible__container");
      expect(collapsibleContainer).toBeTruthy();
      expect(collapsibleContainer).toHaveTextContent("Titulo recolhivel");
      expect(collapsibleContainer).not.toHaveAttribute("open");

      const collapsibleContent = container.querySelector(".Collapsible__content");
      expect(collapsibleContent).toBeTruthy();
      expect(collapsibleContent).toHaveAttribute("hidden", "until-found");
    } finally {
      vi.doUnmock("@lexical/utils");
      vi.resetModules();
    }
  });
});
