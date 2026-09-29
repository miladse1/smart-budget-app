import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Link } from "react-router-dom";

/* ------------------------------------------------------------------ buttons */

type Variant = "primary" | "lime" | "secondary" | "ghost" | "quiet" | "dangerQuiet" | "danger" | "onForest";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover shadow-card",
  lime: "bg-pastel-lime text-pastel-ink hover:bg-lime-strong",
  secondary: "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2",
  ghost: "text-accent-ink hover:bg-accent-soft",
  quiet: "text-muted hover:bg-surface-2 hover:text-ink",
  dangerQuiet: "text-danger hover:bg-danger-soft",
  danger: "bg-danger text-white hover:brightness-95 [:root[data-theme=dark]_&]:text-[#1a0806]",
  onForest: "bg-white/12 text-forest-ink hover:bg-white/20",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-13 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = ""): string {
  return `inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-[-0.01em] transition-[background-color,color,transform,box-shadow] duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${SIZES[size]} ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  to,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  to: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link to={to} className={buttonClass(variant, size, className)}>
      {children}
    </Link>
  );
}

export function IconButton({
  label,
  className = "",
  type = "button",
  tone = "plain",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "plain" | "filled" | "onForest" | "onDark" | "onDarkFilled" }) {
  const tones = {
    plain: "text-muted hover:bg-surface-2 hover:text-ink",
    filled: "bg-surface text-ink ring-1 ring-inset ring-line hover:bg-surface-2 shadow-card",
    onForest: "bg-white/12 text-forest-ink hover:bg-white/20",
    onDark: "text-noir-ink hover:bg-white/10",
    onDarkFilled: "bg-white/10 text-noir-ink hover:bg-white/18",
  };
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-[background-color,color,transform] duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------- forms */

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {hint && !error && <span className="text-[13px] text-muted">{hint}</span>}
      {error && (
        <span role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </span>
      )}
    </label>
  );
}

/** Control look without size, so callers can set height, width and padding. */
export const controlBase =
  "min-w-0 rounded-[14px] border border-line-strong bg-surface text-ink transition-colors placeholder:text-subtle hover:border-subtle/60 focus:border-accent-ink focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent-ink/30 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const controlClass = `${controlBase} h-12 w-full px-4 text-base`;

export function control(size: string): string {
  return `${controlBase} ${size}`;
}

export function Select({
  className = "",
  wrapperClassName = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <span className={`relative inline-flex min-w-0 ${wrapperClassName}`}>
      <select className={`${controlBase} h-12 w-full cursor-pointer appearance-none pr-10 pl-4 text-base ${className}`} {...props}>
        {children}
      </select>
      <ChevronDown size={17} aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-subtle" />
    </span>
  );
}

/** Radio group rendered as selectable cards or pills. Arrow keys move the selection. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  layout = "list",
}: {
  label: string;
  value: T | null;
  onChange: (next: T) => void;
  options: { value: T; title: string; description?: string; icon?: ReactNode }[];
  layout?: "list" | "pills";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  function onKey(event: KeyboardEvent, current: number) {
    const keys = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const step = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const next = (current + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label={label} className={layout === "pills" ? "flex flex-wrap gap-2" : "grid gap-2.5"}>
      {options.map((option, position) => {
        const selected = option.value === value;
        const common = {
          ref: (node: HTMLButtonElement | null) => {
            refs.current[position] = node;
          },
          type: "button" as const,
          role: "radio",
          "aria-checked": selected,
          tabIndex: position === index ? 0 : -1,
          onKeyDown: (event: KeyboardEvent) => onKey(event, position),
          onClick: () => onChange(option.value),
        };
        if (layout === "pills") {
          return (
            <button
              key={option.value}
              {...common}
              className={`h-11 min-w-16 rounded-full px-5 text-[15px] font-semibold transition-colors ${
                selected ? "bg-accent text-accent-fg" : "bg-surface text-ink ring-1 ring-inset ring-line-strong hover:bg-surface-2"
              }`}
            >
              {option.title}
            </button>
          );
        }
        return (
          <button
            key={option.value}
            {...common}
            className={`flex min-h-[4.25rem] w-full items-center gap-3.5 rounded-[20px] bg-surface p-3.5 text-left transition-[box-shadow,transform] duration-200 active:scale-[0.99] ${
              selected ? "shadow-card ring-2 ring-ink" : "ring-1 ring-line hover:ring-line-strong"
            }`}
          >
            {option.icon && (
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] transition-colors ${
                  selected ? "bg-pastel-lime text-pastel-ink" : "bg-surface-2 text-muted"
                }`}
              >
                {option.icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{option.title}</span>
              {option.description && <span className="mt-0.5 block text-[13px] text-muted">{option.description}</span>}
            </span>
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors ${
                selected ? "bg-accent text-accent-fg" : "ring-2 ring-inset ring-line-strong"
              }`}
            >
              {selected && <Check size={14} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- surfaces */

export function Card({
  children,
  className = "",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <section className={`rounded-[24px] bg-surface shadow-card ring-1 ring-line ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function SectionHeader({
  id,
  title,
  action,
  className = "",
}: {
  id?: string;
  title: string;
  action?: { to: string; label: string };
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <h2 id={id} className="text-[17px] font-semibold tracking-[-0.02em]">
        {title}
      </h2>
      {action && (
        <Link
          to={action.to}
          className="-mr-2 inline-flex h-9 items-center gap-0.5 rounded-full px-3 text-[13px] font-semibold text-accent-ink hover:bg-accent-soft"
        >
          {action.label}
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[-0.045em] lg:text-[40px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}

type Tone = "info" | "success" | "error" | "warning";

const TONE_STYLE: Record<Tone, string> = {
  info: "bg-surface ring-line",
  success: "bg-lime-soft ring-lime-strong/40",
  warning: "bg-warning-soft ring-warning/25",
  error: "bg-danger-soft ring-danger/25",
};

const TONE_ICON: Record<Tone, { icon: typeof Info; colour: string }> = {
  info: { icon: Info, colour: "text-muted" },
  success: { icon: CheckCircle2, colour: "text-lime-ink" },
  warning: { icon: AlertTriangle, colour: "text-warning" },
  error: { icon: AlertTriangle, colour: "text-danger" },
};

export function Callout({
  tone = "info",
  title,
  children,
  onDismiss,
  action,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  onDismiss?: () => void;
  action?: ReactNode;
}) {
  const { icon: Icon, colour } = TONE_ICON[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-[16px] px-4 py-3 text-[14px] ring-1 ring-inset ${TONE_STYLE[tone]}`}>
      <Icon size={18} aria-hidden="true" className={`mt-px shrink-0 ${colour}`} />
      <div className="min-w-0 flex-1 text-pretty">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-muted" : ""}>{children}</div>}
        {action && <div className="mt-2.5">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="-my-1.5 -mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export function ErrorText({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <Callout
      tone="error"
      title="Something went wrong"
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {children}
    </Callout>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-[12px] bg-surface-3/70 ${className}`} />;
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "lime" | "warning" | "danger" | "forest";
}) {
  const styles = {
    neutral: "bg-surface-2 text-muted",
    lime: "bg-lime-soft text-lime-ink",
    warning: "bg-warning-soft text-warning",
    danger: "bg-danger-soft text-danger",
    forest: "bg-accent-soft text-accent-ink",
  }[tone];
  return <span className={`inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap ${styles}`}>{children}</span>;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  compact = false,
}: {
  icon: typeof Info;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 text-center ${compact ? "py-8" : "py-14"}`}>
      <span className="grid h-14 w-14 place-items-center rounded-[18px] bg-pastel-lime text-pastel-ink">
        <Icon size={24} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[17px] font-semibold tracking-[-0.02em]">{title}</p>
      {children && <p className="mt-1.5 max-w-[34ch] text-[14px] text-pretty text-muted">{children}</p>}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- progress */

export type Status = "ok" | "near" | "over";

const BAR: Record<Status, string> = {
  ok: "bg-bar-ok",
  near: "bg-warning-bar",
  over: "bg-danger-bar",
};

/** Budget progress. The fill animates with transform so it stays on the compositor. */
export function ProgressBar({
  percent,
  status = "ok",
  label,
  onForest = false,
  className = "h-2",
}: {
  percent: number;
  status?: Status;
  label: string;
  onForest?: boolean;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(percent, 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      aria-valuetext={`${percent}% used`}
      className={`w-full overflow-hidden rounded-full ${onForest ? "bg-white/14" : "bg-track"} ${className}`}
    >
      <div
        className={`h-full w-full origin-left rounded-full transition-transform duration-700 ease-out-soft ${onForest && status === "ok" ? "bg-lime" : BAR[status]}`}
        style={{ transform: `scaleX(${clamped / 100})` }}
      />
    </div>
  );
}

export function Ring({
  percent,
  status = "ok",
  size = 64,
  stroke = 8,
  children,
  label,
  track = "var(--track)",
  ink,
}: {
  percent: number;
  status?: Status;
  size?: number;
  stroke?: number;
  children?: ReactNode;
  label: string;
  track?: string;
  ink?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(percent, 100));
  const colour = ink ?? { ok: "var(--bar-ok)", near: "var(--warning-bar)", over: "var(--danger-bar)" }[status];
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out-soft"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------- month nav */

function shiftMonth(value: string, delta: number): string {
  const [yearText, monthText] = value.split("-");
  const index = Number(yearText) * 12 + (Number(monthText) - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export function monthName(value: string, style: "long" | "short" = "long"): string {
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month - 1, 1).toLocaleDateString("en-CA", { month: style, year: "numeric" });
}

const supportsMonthInput = (() => {
  if (typeof document === "undefined") return false;
  const input = document.createElement("input");
  input.setAttribute("type", "month");
  return input.type === "month";
})();

/**
 * Compact month switcher. Tapping the label opens the native month picker where the
 * browser has one; the arrows step one month either way.
 */
export function MonthSwitcher({
  value,
  onChange,
  tone = "light",
}: {
  value: string;
  onChange: (next: string) => void;
  tone?: "light" | "dark";
}) {
  const valid = /^\d{4}-\d{2}$/.test(value);
  const dark = tone === "dark";
  const arrow = dark ? "onDark" : "plain";
  return (
    <div className={`inline-flex h-10 items-center rounded-full ${dark ? "bg-white/10 text-noir-ink" : "bg-surface shadow-card ring-1 ring-line"}`}>
      <IconButton label="Previous month" tone={arrow} disabled={!valid} onClick={() => onChange(shiftMonth(value, -1))}>
        <ChevronLeft size={18} aria-hidden="true" />
      </IconButton>
      <span className="relative flex h-full items-center">
        <span aria-live="polite" className="tnum min-w-[7.75rem] text-center text-[14px] font-semibold whitespace-nowrap">
          {valid ? monthName(value) : "Loading…"}
        </span>
        {supportsMonthInput && valid && (
          <input
            aria-label="Choose month"
            type="month"
            value={value}
            required
            onChange={(event) => event.target.value && onChange(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        )}
      </span>
      <IconButton label="Next month" tone={arrow} disabled={!valid} onClick={() => onChange(shiftMonth(value, 1))}>
        <ChevronRight size={18} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

/* ------------------------------------------------------------------ sheet */

/**
 * Bottom sheet on phones, centred dialog on larger screens. Built on <dialog> for a real
 * focus trap, Escape handling and top-layer stacking; focus returns to the opener.
 */
export function Sheet({
  open,
  title,
  description,
  children,
  onClose,
  footer,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => opener?.focus?.();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="bf-sheet m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] bg-surface p-0 text-ink shadow-float backdrop:bg-[#0b100d]/45 sm:m-auto sm:max-w-[440px] sm:rounded-[28px]"
    >
      <div className="px-5 pt-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-6 sm:pb-6">
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line-strong sm:hidden" />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-[20px] font-semibold tracking-[-0.025em]">
              {title}
            </h2>
            {description && <div className="mt-1 text-[14px] text-pretty text-muted">{description}</div>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mt-1 -mr-2">
            <X size={18} aria-hidden="true" />
          </IconButton>
        </div>
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ toasts */

type Toast = { id: number; tone: "success" | "error" | "info"; text: string };
const ToastContext = createContext<(tone: Toast["tone"], text: string) => void>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}

/** Short confirmations after saves. Announced politely; errors stay until dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((toast) => toast.id !== id)), []);
  const push = useCallback(
    (tone: Toast["tone"], text: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, tone, text }]);
      if (tone !== "error") window.setTimeout(() => dismiss(id), 3200);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className="bf-toast pointer-events-auto flex max-w-[420px] items-center gap-2.5 rounded-full bg-[#17191a] py-2 pr-2 pl-4 text-[14px] font-medium text-[#f2f1eb] shadow-float [:root[data-theme=dark]_&]:bg-[#eef0ea] [:root[data-theme=dark]_&]:text-[#17191a]"
          >
            {toast.tone === "error" ? (
              <AlertTriangle size={17} aria-hidden="true" className="shrink-0 text-[#f3897d] [:root[data-theme=dark]_&]:text-[#b3261e]" />
            ) : (
              <CheckCircle2 size={17} aria-hidden="true" className="shrink-0 text-lime [:root[data-theme=dark]_&]:text-[#1d5a41]" />
            )}
            <span className="min-w-0 text-pretty">{toast.text}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full opacity-70 hover:bg-white/10 hover:opacity-100"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
