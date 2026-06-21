import type { ReactNode } from "react";
import { useLanguage } from "@/lib/language";

type AuthShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AuthShell({ title, description, children, className }: AuthShellProps) {
  const { t } = useLanguage();

  return (
    <div className="auth-page-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className={`w-full max-w-md rounded-3xl border border-white/70 bg-white/92 p-8 shadow-[0_28px_65px_rgba(16,64,110,0.22)] backdrop-blur sm:p-9 ${className ?? ""}`}>
        <div className="mb-7 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">{t("appName")}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}