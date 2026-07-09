import type { ReactNode } from "react";

import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import DashboardEditorBackdrop from "@/components/dashboard/DashboardEditorBackdrop";
import {
  dashboardEditorDialogWidthClassName,
  dashboardSubtleSurfaceHoverClassName,
} from "@/components/dashboard/dashboard-page-tokens";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const projectEditorSummarySurfaceClassName = `rounded-xl border border-border/60 bg-card/65 ${dashboardSubtleSurfaceHoverClassName}`;

type ProjectEditorDialogShellProps = {
  anilistId?: number | string | null;
  children: ReactNode;
  editorEpisodeCount: number;
  editorProjectId: string;
  editorProjectLabel: string;
  editorProjectTitle: string;
  editorStatusLabel: string;
  editorTypeLabel: string;
  footerLinks?: ReactNode;
  isChapterBased: boolean;
  isEditing: boolean;
  isLibraryOpen: boolean;
  isScrolled: boolean;
  onCancel: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onScrolledChange: (nextScrolled: boolean) => void;
  open: boolean;
};

const shouldPreventEditorDismiss = (isLibraryOpen: boolean, target: EventTarget | null) => {
  if (isLibraryOpen) {
    return true;
  }
  return target instanceof HTMLElement && Boolean(target.closest(".lexical-playground"));
};

export const ProjectEditorDialogShell = ({
  anilistId,
  children,
  editorEpisodeCount,
  editorProjectId,
  editorProjectLabel,
  editorProjectTitle,
  editorStatusLabel,
  editorTypeLabel,
  footerLinks,
  isChapterBased,
  isEditing,
  isLibraryOpen,
  isScrolled,
  onCancel,
  onOpenChange,
  onSave,
  onScrolledChange,
  open,
}: ProjectEditorDialogShellProps) => (
  <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
    {open ? <DashboardEditorBackdrop /> : null}

    <DialogContent
      className={`project-editor-dialog ${dashboardEditorDialogWidthClassName} gap-0 p-0 ${
        isScrolled ? "editor-modal-scrolled" : ""
      }`}
      onPointerDownOutside={(event) => {
        if (shouldPreventEditorDismiss(isLibraryOpen, event.target)) {
          event.preventDefault();
        }
      }}
      onFocusOutside={(event) => {
        event.preventDefault();
      }}
      onInteractOutside={(event) => {
        if (shouldPreventEditorDismiss(isLibraryOpen, event.target)) {
          event.preventDefault();
        }
      }}
    >
      <div className="project-editor-modal-frame flex max-h-[min(90vh,calc(100dvh-1.5rem))] min-h-0 flex-col">
        <div
          className="project-editor-scroll-shell flex-1 overflow-y-auto no-scrollbar"
          onScroll={(event) => {
            onScrolledChange(event.currentTarget.scrollTop > 0);
          }}
        >
          <div className="project-editor-top sticky top-0 z-20 border-b border-border/60 bg-background/95">
            <DialogHeader className="space-y-0 px-4 pb-2.5 pt-3.5 text-left md:px-6 lg:px-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                      {editorProjectLabel}
                    </Badge>
                    {anilistId ? (
                      <Badge variant="outline" className="text-[10px] uppercase tracking-[0.12em]">
                        AniList {anilistId}
                      </Badge>
                    ) : null}
                  </div>
                  <DialogTitle className="text-xl md:text-2xl">
                    {isEditing ? "Editar projeto" : "Novo projeto"}
                  </DialogTitle>
                  <DialogDescription className="max-w-2xl text-xs md:text-sm">
                    Busque no AniList para preencher automaticamente ou ajuste todos os dados
                    manualmente.
                  </DialogDescription>
                </div>
                <div className={`${projectEditorSummarySurfaceClassName} px-3 py-1.5 text-right`}>
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    Projeto
                  </p>
                  <p className="max-w-[210px] truncate text-sm font-medium text-foreground">
                    {editorProjectTitle}
                  </p>
                </div>
              </div>
            </DialogHeader>
            <div className="project-editor-status-bar flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-1.5 md:px-6 lg:px-8">
              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.12em]">
                ID {editorProjectId}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                {editorTypeLabel}
              </Badge>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.12em]">
                {editorStatusLabel}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                {editorEpisodeCount} {isChapterBased ? "capítulos" : "episódios"}
              </span>
            </div>
          </div>

          {children}
        </div>

        <div className="project-editor-footer grid gap-3 border-t border-border/60 bg-background/95 px-4 py-2 backdrop-blur-sm supports-backdrop-filter:bg-background/80 sm:flex sm:items-center sm:justify-between md:px-6 lg:px-8">
          <div className="flex min-w-0 flex-wrap items-center gap-2 md:gap-3">{footerLinks}</div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-3">
            <DashboardActionButton size="sm" onClick={onCancel}>
              Cancelar
            </DashboardActionButton>
            <DashboardActionButton size="sm" tone="primary" onClick={onSave}>
              Salvar projeto
            </DashboardActionButton>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export default ProjectEditorDialogShell;
