import { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-[0_1px_0_0_rgba(148,163,184,0.15)] transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25',
        className,
      )}
      {...props}
    />
  );
}
