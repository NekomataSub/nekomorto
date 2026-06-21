import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { dashboardPageLayoutTokens } from "@/components/dashboard/dashboard-page-tokens";
import { Switch } from "@/components/ui/switch";
import type { AutosaveStatus } from "@/hooks/use-autosave";
import { uiCopy } from "@/lib/ui-copy";
import { cn } from "@/lib/utils";

type DashboardAutosaveStatusProps = {
  title?: string;
  status: AutosaveStatus;
  enabled: boolean;
  onEnabledChange: (nextEnabled: boolean) => void;
  lastSavedAt: number | null;
  errorMessage?: string | null;
  toggleDisabled?: boolean;
  onManualSave?: () => void;
  manualActionLabel?: string;
  manualActionDisabled?: boolean;
};

const DashboardAutosaveStatus = ({
  title = "Autosave",
  status,
  enabled,
  onEnabledChange,
  lastSavedAt,
  errorMessage,
  toggleDisabled = false,
  onManualSave,
  manualActionLabel = uiCopy.actions.saveNow,
  manualActionDisabled = false,
}: DashboardAutosaveStatusProps) => {
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);
  const [showErrorFeedback, setShowErrorFeedback] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setShowSavedFeedback(false);
      return;
    }
    if (status !== "saved") {
      return;
    }
    setShowSavedFeedback(true);
    const timer = window.setTimeout(() => setShowSavedFeedback(false), 1600);
    return () => window.clearTimeout(timer);
  }, [enabled, status]);

  useEffect(() => {
    if (!enabled) {
      setShowErrorFeedback(false);
      return;
    }
    if (status !== "error") {
      return;
    }
    setShowErrorFeedback(true);
    const timer = window.setTimeout(() => setShowErrorFeedback(false), 4000);
    return () => window.clearTimeout(timer);
  }, [enabled, status]);

  const buttonMode = useMemo(() => {
    if (!enabled) {
      return "default" as const;
    }
    if (status === "saving") {
      return "saving" as const;
    }
    if (showSavedFeedback) {
      return "saved" as const;
    }
    return "default" as const;
  }, [enabled, showSavedFeedback, status]);

  const statusDotClass = useMemo(() => {
    if (!enabled) {
      return "bg-muted-foreground/40";
    }
    if (status === "saving") {
      return "bg-sky-400";
    }
    if (status === "pending") {
      return "bg-amber-400";
    }
    if (status === "saved") {
      return "bg-emerald-400";
    }
    if (status === "error") {
      return "bg-destructive";
    }
    return "bg-muted-foreground/50";
  }, [enabled, status]);

  const showErrorState = enabled && status === "error";
  const errorFeedbackText = errorMessage?.trim() || uiCopy.feedback.saveFailedTitle;
  void lastSavedAt;

  return (
    <div
      className={cn(
        `relative flex w-full max-w-full flex-col gap-2 self-start overflow-hidden px-3 py-2.5 transition-[border-color,box-shadow,background-color] duration-200 sm:inline-flex sm:w-auto sm:flex-row sm:items-center sm:gap-2.5 sm:self-end ${dashboardPageLayoutTokens.controlSurface}`,
        showErrorState ? "border-destructive/70 ring-1 ring-destructive/35" : "border-border/70",
      )}
    >
      <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full transition-colors duration-200",
              statusDotClass,
              status === "saving" ? "animate-pulse" : "",
            )}
            aria-hidden="true"
          />
          <p className="truncate text-xs font-semibold uppercase tracking-widest text-foreground/70">
            {title}
          </p>
          <span
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center text-destructive transition-opacity duration-200",
              showErrorFeedback ? "opacity-100" : "opacity-0",
            )}
            title={errorFeedbackText}
            aria-hidden={!showErrorFeedback}
          >
            <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-foreground/70">Ativo</span>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            disabled={toggleDisabled}
            aria-label="Alternar autosave"
          />
        </div>
      </div>

      {onManualSave ? (
        <div className="w-full sm:w-auto">
          <DashboardActionButton
            type="button"
            tone="primary"
            size="sm"
            className="relative w-full justify-center overflow-hidden whitespace-nowrap sm:w-42"
            onClick={onManualSave}
            disabled={manualActionDisabled || (enabled && status === "saving")}
          >
            <span className="relative inline-grid h-5 items-center justify-items-center">
              <span
                className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                aria-hidden="true"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {manualActionLabel}
              </span>
              <span
                className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                aria-hidden="true"
              >
                <Loader2 className="h-4 w-4" aria-hidden="true" />
                {uiCopy.actions.saving}
              </span>
              <span
                className="invisible col-start-1 row-start-1 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                aria-hidden="true"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {uiCopy.actions.saved}
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-150",
                  buttonMode === "default" ? "opacity-100" : "opacity-0",
                )}
                aria-hidden={buttonMode !== "default"}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {manualActionLabel}
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-150",
                  buttonMode === "saving" ? "opacity-100" : "opacity-0",
                )}
                aria-hidden={buttonMode !== "saving"}
              >
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {uiCopy.actions.saving}
              </span>
              <span
                className={cn(
                  "col-start-1 row-start-1 inline-flex items-center justify-center gap-2 transition-opacity duration-150",
                  buttonMode === "saved" ? "opacity-100" : "opacity-0",
                )}
                aria-hidden={buttonMode !== "saved"}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {uiCopy.actions.saved}
              </span>
            </span>
          </DashboardActionButton>
        </div>
      ) : null}
    </div>
  );
};

export default DashboardAutosaveStatus;
