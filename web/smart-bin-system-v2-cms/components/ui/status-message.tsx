import type { ReactNode } from "react";

type StatusTone = "success" | "error" | "info";

type StatusMessageProps = {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
};

const styles: Record<StatusTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusMessage({ tone, children, className }: StatusMessageProps) {
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${styles[tone]} ${className ?? ""}`}>{children}</div>;
}