import { useId, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label + control + hint/error, wired for accessibility. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | undefined;
  children: (props: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const errorText = error && i18n.exists(`validation.${error}`) ? t(`validation.${error}`) : error ? t("validation.invalid") : null;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id} className="text-sm font-semibold">
        {label}
      </Label>
      {children({ id, ...(error ? { "aria-invalid": true } : {}), ...(describedBy ? { "aria-describedby": describedBy } : {}) })}
      {errorText ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {errorText}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Large, thumb-friendly text input. */
export function TextInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input className={cn("h-12 rounded-lg bg-card px-4 text-base", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-lg border border-input bg-card px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

/** Amount input with a € suffix; parsing happens in the caller's hook. */
export function MoneyInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <TextInput inputMode="decimal" autoComplete="off" className={cn("pr-10 tabular", className)} {...props} />
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">€</span>
    </div>
  );
}

/** Multi-choice as toggleable chips (e.g. which costs the tenant covers). */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              "h-10 rounded-sm border px-4 text-sm font-medium transition-colors",
              on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/50",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Single choice as a segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-10 flex-1 rounded-md px-2 text-sm font-semibold transition-colors",
            o.value === value ? "bg-card text-foreground shadow-sm ring-1 ring-border dark:bg-secondary" : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
