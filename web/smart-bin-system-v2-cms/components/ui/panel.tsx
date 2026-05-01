import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export default function Panel({ title, subtitle, action, children }: PanelProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 shadow-[0_10px_30px_rgba(20,45,80,0.08)] backdrop-blur">
      {(title || subtitle || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            {title ? <h2 className="text-lg font-semibold text-foreground">{title}</h2> : null}
            {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

