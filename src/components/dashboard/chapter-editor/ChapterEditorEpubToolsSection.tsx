import { Loader2 } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { Input } from "@/components/dashboard/dashboard-form-controls";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import ChapterEditorAccordionHeader from "./ChapterEditorAccordionHeader";

type EpubCapabilityState = {
  message: string;
  variant: "destructive" | "warning";
} | null;

type ChapterEditorEpubToolsSectionProps = {
  supportsEpubTools: boolean;
  epubCapabilityState: EpubCapabilityState;
  backendBuildLabel: string | null;
  frontendBuildLabel: string | null;
  backendSupportsEpubImport: boolean;
  backendSupportsEpubExport: boolean;
  epubImportInputRef: RefObject<HTMLInputElement | null>;
  epubImportFile: File | null;
  epubImportTargetVolume: string;
  onEpubImportTargetVolumeChange: (nextValue: string) => void;
  epubImportAsDraft: boolean;
  onEpubImportAsDraftChange: (nextValue: boolean) => void;
  isImportingEpub: boolean;
  onOpenEpubPicker: (options: { autoImportAfterSelect: boolean }) => void;
  onEpubImportFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onEpubImportFileCancel: () => void;
  onImportEpub: () => void | Promise<void>;
  epubExportVolume: string;
  onEpubExportVolumeChange: (nextValue: string) => void;
  epubExportIncludeDrafts: boolean;
  onEpubExportIncludeDraftsChange: (nextValue: boolean) => void;
  isExportingEpub: boolean;
  onExportEpub: () => void | Promise<void>;
};

const Button = DashboardActionButton;

export const ChapterEditorEpubToolsSection = ({
  supportsEpubTools,
  epubCapabilityState,
  backendBuildLabel,
  frontendBuildLabel,
  backendSupportsEpubImport,
  backendSupportsEpubExport,
  epubImportInputRef,
  epubImportFile,
  epubImportTargetVolume,
  onEpubImportTargetVolumeChange,
  epubImportAsDraft,
  onEpubImportAsDraftChange,
  isImportingEpub,
  onOpenEpubPicker,
  onEpubImportFileChange,
  onEpubImportFileCancel,
  onImportEpub,
  epubExportVolume,
  onEpubExportVolumeChange,
  epubExportIncludeDrafts,
  onEpubExportIncludeDraftsChange,
  isExportingEpub,
  onExportEpub,
}: ChapterEditorEpubToolsSectionProps) => {
  if (!supportsEpubTools) {
    return null;
  }

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="epub-tools"
      className="project-editor-accordion space-y-2.5"
      data-testid="chapter-epub-tools"
    >
      <AccordionItem
        value="epub-tools"
        className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-editor-epub-tools"
      >
        <AccordionTrigger className="project-editor-section-trigger flex w-full items-start gap-4 px-5 py-3.5 text-left hover:no-underline md:py-4">
          <ChapterEditorAccordionHeader
            title="Ferramentas EPUB"
            subtitle="Importação e exportação por volume"
          />
        </AccordionTrigger>
        <AccordionContent className="project-editor-section-content px-5 pb-5">
          <div className="space-y-5">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Importe capítulos para o editor Lexical e exporte o snapshot atual da página.
              </p>
              {epubCapabilityState ? (
                <p
                  className={
                    epubCapabilityState.variant === "destructive"
                      ? "text-xs text-destructive"
                      : "text-xs text-amber-700"
                  }
                >
                  {epubCapabilityState.message}
                </p>
              ) : null}
              {backendBuildLabel ? (
                <p className="text-[11px] text-muted-foreground">
                  Contrato da API: {backendBuildLabel}
                </p>
              ) : null}
              {frontendBuildLabel ? (
                <p className="text-[11px] text-muted-foreground">Frontend: {frontendBuildLabel}</p>
              ) : null}
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-foreground">Importar EPUB</h4>
                <p className="hidden">
                  O arquivo é convertido para Lexical, mergeado no projeto e salvo imediatamente.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chapter-editor-epub-import-file">Arquivo .epub</Label>
                <Input
                  ref={epubImportInputRef}
                  id="chapter-editor-epub-import-file"
                  type="file"
                  accept=".epub,application/epub+zip"
                  className="sr-only"
                  onChange={onEpubImportFileChange}
                  onCancel={onEpubImportFileCancel}
                />
                {epubImportFile ? (
                  <button
                    type="button"
                    onClick={() => onOpenEpubPicker({ autoImportAfterSelect: false })}
                    disabled={isImportingEpub || !backendSupportsEpubImport}
                    className="w-full rounded-xl border border-border/60 bg-background/50 px-3 py-3 text-left transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {epubImportFile.name}
                    </span>
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenEpubPicker({ autoImportAfterSelect: false })}
                      disabled={isImportingEpub || !backendSupportsEpubImport}
                    >
                      Escolher arquivo
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Nenhum arquivo selecionado
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="chapter-editor-epub-import-volume">Volume de destino</Label>
                <Input
                  id="chapter-editor-epub-import-volume"
                  type="number"
                  value={epubImportTargetVolume}
                  onChange={(event) => onEpubImportTargetVolumeChange(event.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm">
                <span className="space-y-1">
                  <span className="block font-medium text-foreground">Importar como rascunho</span>
                  <span className="block text-xs text-muted-foreground">
                    Capítulos importados ficam ocultos ao público até a publicação.
                  </span>
                </span>
                <Switch
                  checked={epubImportAsDraft}
                  onCheckedChange={(checked) => onEpubImportAsDraftChange(checked === true)}
                  className="shrink-0"
                />
              </label>
              <DashboardActionButton
                type="button"
                size="toolbar"
                onClick={onImportEpub}
                disabled={isImportingEpub || !backendSupportsEpubImport}
              >
                {isImportingEpub ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Importar EPUB
              </DashboardActionButton>
            </div>

            <div className="space-y-4 rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-foreground">Exportar EPUB</h4>
                <p className="text-xs text-muted-foreground">
                  Usa o estado atual da página, inclusive alterações ainda não salvas no capítulo
                  aberto.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="chapter-editor-epub-export-volume">Volume para exportação</Label>
                <Input
                  id="chapter-editor-epub-export-volume"
                  type="number"
                  value={epubExportVolume}
                  onChange={(event) => onEpubExportVolumeChange(event.target.value)}
                  placeholder="Deixe vazio para Sem volume"
                />
              </div>
              <label className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm">
                <span className="space-y-1">
                  <span className="block font-medium text-foreground">Incluir rascunhos</span>
                  <span className="block text-xs text-muted-foreground">
                    Exporta também capítulos em draft que tenham conteúdo.
                  </span>
                </span>
                <Switch
                  checked={epubExportIncludeDrafts}
                  onCheckedChange={(checked) => onEpubExportIncludeDraftsChange(checked === true)}
                  className="shrink-0"
                />
              </label>
              <DashboardActionButton
                type="button"
                size="toolbar"
                onClick={onExportEpub}
                disabled={isExportingEpub || !backendSupportsEpubExport}
              >
                {isExportingEpub ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Exportar volume em EPUB
              </DashboardActionButton>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default ChapterEditorEpubToolsSection;
