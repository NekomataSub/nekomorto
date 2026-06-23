import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Lexical viewer styles", () => {
  it("usa o shell read-only e o tema visual do editor", () => {
    const viewerSource = readSource("src/components/lexical/LexicalViewer.tsx");
    const viewerCss = readSource("src/components/lexical/lexical-viewer.css");

    expect(viewerSource).toContain("PlaygroundEditorTheme");
    expect(viewerSource).toContain("editor-shell editor-shell--read-only");
    expect(viewerSource).toContain('className="ContentEditable__root"');
    expect(viewerCss).not.toContain("LexicalViewerTheme__");
    expect(viewerCss).toContain(
      ".lexical-playground.lexical-playground--viewer .ContentEditable__root",
    );
    expect(viewerCss).toContain(".PlaygroundEditorTheme__layoutItem");
  });

  it("mantem os estilos compartilhados do editor para WYSIWYG no viewer", () => {
    const editorThemeCss = readSource(
      "src/components/lexical/editor/themes/PlaygroundEditorTheme.css",
    );
    const editorOverridesCss = readSource("src/components/lexical/editor/playground-overrides.css");
    const editableCss = readSource("src/components/lexical/editor/ui/ContentEditable.css");

    expect(editorThemeCss).toContain(".PlaygroundEditorTheme__table");
    expect(editorThemeCss).toContain(".PlaygroundEditorTheme__tableCell");
    expect(editorThemeCss).toContain("width: 75px;");
    expect(editorThemeCss).toContain(".PlaygroundEditorTheme__code");
    expect(editorThemeCss).toContain(".PlaygroundEditorTheme__hr:after");
    expect(editorOverridesCss).toContain(".ContentEditable__root > * + *");
    expect(editorOverridesCss).toContain(
      ".editor-shell.editor-shell--read-only .ContentEditable__root",
    );
    expect(editorOverridesCss).toContain(".lexical-tweet__target");
    expect(editorOverridesCss).toContain(
      "clip-path: inset(-3px round calc(var(--lexical-content-embed-radius, 16px) + 8px));",
    );
    expect(editableCss).toContain("font-size: var(--lexical-content-font-size, 15px);");
    expect(editableCss).toContain("line-height: var(--lexical-content-line-height, 1.75);");
  });

  it("mantem CSS publico legado fora do escopo Lexical viewer", () => {
    const richContentCss = readSource("src/styles/rich-content.css");

    expect(richContentCss).toContain(".post-content:not(.lexical-playground--viewer) h1");
    expect(richContentCss).toContain(".reader-content:not(.lexical-playground--viewer) h1");
    expect(richContentCss).toContain(".PlaygroundEditorTheme__code");
    expect(richContentCss).toContain(".PlaygroundEditorTheme__textCode");
    expect(richContentCss).toContain(".PlaygroundEditorTheme__table");
    expect(richContentCss).not.toContain("LexicalViewerTheme__");
  });

  it("mantem checklist normalizado e colapsavel do viewer sem comportamento interativo falso", () => {
    const viewerCss = readSource("src/components/lexical/lexical-viewer.css");

    expect(viewerCss).toContain('li[data-lexical-checklist-item="true"]');
    expect(viewerCss).toContain('data-lexical-checked="true"');
    expect(viewerCss).toContain(".Collapsible__container");
    expect(viewerCss).toContain(".Collapsible__content");
    expect(viewerCss).toContain(".Collapsible__content[hidden]");
    expect(viewerCss).toContain('.Collapsible__content[hidden="until-found"]');
    expect(viewerCss).toContain("display: none !important;");
  });
});
