import { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type SurfaceProps = {
  children: ReactNode;
  className?: string;
};

export function Surface({ children, className }: SurfaceProps) {
  return (
    <div className={cn('rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.55)] backdrop-blur', className)}>
      {children}
    </div>
  );
}
