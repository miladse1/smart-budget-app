import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const STYLES: Record<Variant, string> = {
  primary: "bg-forest text-white hover:bg-forest-dark",
  secondary: "border border-line bg-card text-ink hover:bg-paper",
  danger: "bg-danger text-white hover:opacity-90",
  ghost: "text-forest hover:underline",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const controlClass =
  "h-8 w-full rounded-md border border-line bg-card px-2 text-sm text-ink outline-none focus:border-forest";

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-line bg-card px-3 py-2 text-sm text-ink">{children}</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-danger">{children}</p>;
}
