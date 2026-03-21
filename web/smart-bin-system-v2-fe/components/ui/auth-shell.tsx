import { ReactNode } from 'react';
import { Surface } from '@/components/ui/surface';
import { cn } from '@/lib/cn';

type AuthShellProps = {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function AuthShell({ title, description, children, className }: AuthShellProps) {
  return (
    <div className="auth-page-bg flex min-h-screen items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <Surface className={cn('w-full max-w-md p-8 sm:p-9', className)}>
        <div className="mb-7 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Smart Bin</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
        </div>
        {children}
      </Surface>
    </div>
  );
}
