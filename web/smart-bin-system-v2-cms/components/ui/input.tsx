import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className = "", ...props }: InputProps) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-emerald-500 ${className}`}
    />
  );
}