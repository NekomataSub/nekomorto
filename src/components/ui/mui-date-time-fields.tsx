import { Input } from "@/components/ui/input";
import {
  displayDateToIso,
  displayTimeToCanonical,
  formatDateDigitsToDisplay,
  formatTimeDigitsToDisplay,
  isoToDisplayDate,
} from "@/lib/dashboard-date-time";
import { cn } from "@/lib/utils";
import type { ChangeEvent, ReactNode } from "react";
import { useEffect, useState } from "react";

type MuiFieldBaseProps = {
  id?: string;
  value: Date | null;
  onChange: (value: Date | null) => void;
  disabled?: boolean;
  className?: string;
};

const normalizeDate = (value: Date | null): Date | null => {
  if (!value) {
    return null;
  }
  return Number.isNaN(value.getTime()) ? null : value;
};

const muiDateTimeFieldEditorClassName = "mui-date-time-field--editor";
const muiDateTimeFieldDashboardFilterClassName = "mui-date-time-field--dashboard-filter";
const baseInputClassName =
  "h-10 min-w-0 rounded-[calc(var(--radius)-2px)] border-input bg-background text-base md:text-sm";
const dashboardFilterInputClassName = "h-11 rounded-xl border-border/60 bg-background/60";

const parseDisplayDateToDate = (value: string, previousValue: Date | null) => {
  const iso = displayDateToIso(value);
  if (!iso) {
    return null;
  }
  const [year, month, day] = iso.split("-").map(Number);
  const next = previousValue ? new Date(previousValue) : new Date();
  next.setFullYear(year, month - 1, day);
  next.setSeconds(0, 0);
  return normalizeDate(next);
};

const parseDisplayTimeToDate = (value: string, previousValue: Date | null) => {
  const trimmed = String(value || "").trim();
  const matched = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  const canonical = matched
    ? `${matched[1].padStart(2, "0")}:${matched[2]}:00`
    : displayTimeToCanonical(trimmed);
  if (!canonical) {
    return null;
  }
  const [hoursPart, minutesPart] = canonical.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  const next = previousValue ? new Date(previousValue) : new Date();
  next.setHours(hours, minutes, 0, 0);
  return normalizeDate(next);
};

const formatDateValue = (value: Date | null) =>
  value ? isoToDisplayDate(value.toISOString()) : "";

const formatTimeValue = (value: Date | null) =>
  value
    ? `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
    : "";

type NativeFieldProps = MuiFieldBaseProps & {
  formatValue: (value: Date | null) => string;
  formatInput: (value: string) => string;
  parseValue: (value: string, previousValue: Date | null) => Date | null;
  placeholder: string;
};

const NativeField = ({
  id,
  value,
  onChange,
  disabled,
  className,
  formatValue,
  formatInput,
  parseValue,
  placeholder,
}: NativeFieldProps) => {
  const [textValue, setTextValue] = useState(() => formatValue(value));

  useEffect(() => {
    setTextValue(formatValue(value));
  }, [formatValue, value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextText = formatInput(event.target.value);
    setTextValue(nextText);
    if (!nextText.trim()) {
      onChange(null);
      return;
    }
    const parsed = parseValue(nextText, value);
    if (parsed) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    if (!textValue.trim()) {
      onChange(null);
      setTextValue("");
      return;
    }
    const parsed = parseValue(textValue, value);
    if (!parsed) {
      onChange(null);
      setTextValue("");
      return;
    }
    setTextValue(formatValue(parsed));
    onChange(parsed);
  };

  return (
    <Input
      id={id}
      value={textValue}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={cn(
        baseInputClassName,
        className?.includes(muiDateTimeFieldEditorClassName) ? baseInputClassName : "",
        className?.includes(muiDateTimeFieldDashboardFilterClassName)
          ? dashboardFilterInputClassName
          : "",
        className,
      )}
    />
  );
};

export const MuiDateTimeFieldsProvider = ({ children }: { children: ReactNode }) => <>{children}</>;

export const MuiBrazilDateField = ({
  id,
  value,
  onChange,
  disabled,
  className,
}: MuiFieldBaseProps) => (
  <NativeField
    id={id}
    value={value}
    onChange={onChange}
    disabled={disabled}
    className={className}
    formatValue={formatDateValue}
    formatInput={formatDateDigitsToDisplay}
    parseValue={parseDisplayDateToDate}
    placeholder="dd/mm/aaaa"
  />
);

export const MuiBrazilTimeField = ({
  id,
  value,
  onChange,
  disabled,
  className,
}: MuiFieldBaseProps) => (
  <NativeField
    id={id}
    value={value}
    onChange={onChange}
    disabled={disabled}
    className={className}
    formatValue={formatTimeValue}
    formatInput={formatTimeDigitsToDisplay}
    parseValue={parseDisplayTimeToDate}
    placeholder="hh:mm"
  />
);
