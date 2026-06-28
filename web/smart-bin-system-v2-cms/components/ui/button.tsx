import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
  size?: "md" | "lg";
  children: ReactNode;
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
  const variants =
    variant === "secondary"
      ? "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      : "bg-[linear-gradient(120deg,#0b3b62,#176ea5)] text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] hover:brightness-110";
  const sizes = size === "lg" ? "px-6 py-3 text-sm" : "px-4 py-2.5 text-sm";

  return (
    <button {...props} className={`${base} ${variants} ${sizes} ${className}`}>
      {children}
    </button>
  );
}