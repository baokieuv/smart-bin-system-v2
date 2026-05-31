import type { ReactNode } from "react";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
}

export default function Modal({ title, subtitle, onClose, children, widthClassName = "w-[min(900px,95vw)]" }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-8">
      <div className={`rounded-2xl bg-white shadow-2xl ${widthClassName}`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="max-h-[calc(100vh-140px)] overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}