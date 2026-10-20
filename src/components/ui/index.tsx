import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50",
  secondary: "bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-gray-700 hover:bg-gray-100",
};

type ButtonVariant = keyof typeof buttonVariants;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed min-h-10";

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return <Link className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 sm:p-6", className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
      <div>
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-gray-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  name,
  error,
  hint,
  children,
}: {
  label: string;
  name?: string;
  error?: string[] | string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  const message = Array.isArray(error) ? error[0] : error;
  // Подсказка и ошибка вне <label>, чтобы не попадать в доступное имя поля
  return (
    <div>
      <label className="block" htmlFor={name}>
        <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
        {children}
      </label>
      {hint && !message && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
      {message && <span className="mt-1 block text-xs text-red-600" role="alert">{message}</span>}
    </div>
  );
}

const inputBase =
  "block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-base text-gray-900 ring-1 ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-brand-500 focus:outline-none sm:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input id={props.name} className={cn(inputBase, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea id={props.name} className={cn(inputBase, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select id={props.name} className={cn(inputBase, className)} {...props} />;
}

const badgeColors = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-brand-100 text-brand-700",
};

export function Badge({ color = "gray", children }: { color?: keyof typeof badgeColors; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", badgeColors[color])}>
      {children}
    </span>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "error" | "success" | "warning"; children: ReactNode }) {
  const tones = {
    info: "bg-brand-50 text-brand-700 ring-brand-100",
    error: "bg-red-50 text-red-700 ring-red-200",
    success: "bg-green-50 text-green-800 ring-green-200",
    warning: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  };
  return <div className={cn("rounded-lg px-4 py-3 text-sm ring-1", tones[tone])}>{children}</div>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">{children}</div>;
}

export function Spinner() {
  return <div className="p-8 text-center text-sm text-gray-500">Загрузка…</div>;
}

export function DefinitionList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-gray-100">
      {items.map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-3 sm:gap-4">
          <dt className="text-sm text-gray-500">{k}</dt>
          <dd className="text-sm text-gray-900 sm:col-span-2">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
