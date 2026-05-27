import { ChevronDown, ChevronUp } from "lucide-react";
import type { KeyboardEvent } from "react";
import DashboardActionButton from "@/components/dashboard/DashboardActionButton";
import { useAccessibilityAnnouncer } from "@/hooks/accessibility-announcer";
import { cn } from "@/lib/utils";

type ReorderControlsProps = {
  label: string;
  index: number;
  total: number;
  onMove: (targetIndex: number) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
};

const ReorderControls = ({
  label,
  index,
  total,
  onMove,
  disabled = false,
  className,
  buttonClassName,
}: ReorderControlsProps) => {
  const { announce } = useAccessibilityAnnouncer();
  const canMoveUp = !disabled && index > 0;
  const canMoveDown = !disabled && index < total - 1;

  const moveTo = (targetIndex: number) => {
    if (disabled || targetIndex === index || targetIndex < 0 || targetIndex >= total) {
      return;
    }
    onMove(targetIndex);
    announce(`${label} movido para a posição ${targetIndex + 1}.`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) {
      return;
    }
    if (event.key === "ArrowUp" && canMoveUp) {
      event.preventDefault();
      moveTo(index - 1);
      return;
    }
    if (event.key === "ArrowDown" && canMoveDown) {
      event.preventDefault();
      moveTo(index + 1);
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <DashboardActionButton
        type="button"
        size="icon-sm"
        className={buttonClassName}
        aria-label={`Mover ${label} para cima`}
        disabled={!canMoveUp}
        onClick={() => moveTo(index - 1)}
        onKeyDown={handleKeyDown}
      >
        <ChevronUp className="h-4 w-4" aria-hidden="true" />
      </DashboardActionButton>
      <DashboardActionButton
        type="button"
        size="icon-sm"
        className={buttonClassName}
        aria-label={`Mover ${label} para baixo`}
        disabled={!canMoveDown}
        onClick={() => moveTo(index + 1)}
        onKeyDown={handleKeyDown}
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </DashboardActionButton>
    </div>
  );
};

export default ReorderControls;
