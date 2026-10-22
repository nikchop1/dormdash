"use client";

import { forwardRef, useId, useState } from "react";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { checkPassword } from "@/lib/validation";

const control =
  "block w-full rounded-sm border border-line bg-surface px-3 text-body text-ink placeholder:text-ink-3 " +
  "transition-colors duration-[120ms] hover:border-ink-3 focus:border-line-strong focus:outline-none " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-3 aria-invalid:border-danger";

type FieldProps = {
  label: string;
  hint?: React.ReactNode;
  error?: string;
  optional?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
};

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-small font-medium text-ink">
        {label}
        {optional && <span className="text-caption font-normal text-ink-3">Optional</span>}
      </label>
      {children({ id, describedBy: error || hint ? msgId : undefined, invalid: !!error })}
      {error ? (
        <p id={msgId} role="alert" className="flex items-start gap-1.5 text-small text-danger">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-small text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode; error?: string; optional?: boolean; fieldClassName?: string };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, className, fieldClassName, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(control, "h-11", className)}
          {...rest}
        />
      )}
    </Field>
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: React.ReactNode; error?: string; fieldClassName?: string };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, fieldClassName, children, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <select
            ref={ref}
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn(control, "h-11 appearance-none pr-10", className)}
            {...rest}
          >
            {children}
          </select>
          <svg aria-hidden viewBox="0 0 12 8" className="pointer-events-none absolute top-1/2 right-3.5 w-3 -translate-y-1/2 text-ink-2">
            <path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" strokeWidth="1.75" />
          </svg>
        </div>
      )}
    </Field>
  );
});

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: React.ReactNode; error?: string; optional?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, className, ...rest },
  ref,
) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(control, "min-h-24 py-2.5", className)}
          {...rest}
        />
      )}
    </Field>
  );
});

export function PasswordInput({
  showStrength,
  ...props
}: Omit<InputProps, "type"> & { showStrength?: boolean }) {
  const [visible, setVisible] = useState(false);
  const value = typeof props.value === "string" ? props.value : "";
  const strength = checkPassword(value);
  return (
    <Field label={props.label} hint={props.hint} error={props.error} className={props.fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <>
          <div className="relative">
            <input
              {...props}
              id={id}
              type={visible ? "text" : "password"}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              className={cn(control, "h-11 pr-12", props.className)}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center rounded-sm text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
            >
              {visible ? <EyeOff className="size-5" strokeWidth={1.75} /> : <Eye className="size-5" strokeWidth={1.75} />}
            </button>
          </div>
          {showStrength && value && (
            <div aria-live="polite" className="flex items-center gap-3">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1 flex-1 transition-colors duration-200",
                      i <= strength.score
                        ? strength.score <= 1
                          ? "bg-danger"
                          : strength.score === 2
                            ? "bg-warning"
                            : "bg-success"
                        : "bg-line",
                    )}
                  />
                ))}
              </div>
              <span className="w-16 text-right text-caption font-medium text-ink-2">{strength.label}</span>
            </div>
          )}
        </>
      )}
    </Field>
  );
}

export function Checkbox({
  label,
  error,
  className,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label: React.ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="relative flex cursor-pointer items-start gap-3 text-small text-ink">
        <input
          id={id}
          type="checkbox"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          className="peer mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-xs border-2 border-ink-2 bg-surface transition-colors checked:border-ink checked:bg-ink-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-invalid:border-danger"
          {...rest}
        />
        <svg aria-hidden viewBox="0 0 12 10" className="pointer-events-none absolute top-[7px] left-[4px] hidden w-3 text-on-ink-fill peer-checked:block">
          <path d="M1 5l3.5 3.5L11 1.5" fill="none" stroke="currentColor" strokeWidth="2.25" />
        </svg>
        <span className="leading-6">{label}</span>
      </label>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1.5 ml-8 text-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-body text-ink">{label}</span>
        {description && <span className="block text-small text-ink-3">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full border-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40",
          checked ? "border-ink bg-ink-fill" : "border-ink-3 bg-sunken",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full transition-transform duration-200 ease-out",
            checked ? "translate-x-5 bg-accent" : "translate-x-0 bg-ink-3",
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-1 rounded-sm bg-sunken p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "tnum h-10 flex-1 rounded-xs px-2 text-small font-semibold transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink",
              active ? "bg-surface text-ink shadow-[inset_0_0_0_1.5px_var(--ink)]" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
