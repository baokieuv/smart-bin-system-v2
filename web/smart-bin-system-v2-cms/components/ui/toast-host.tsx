"use client";

import { useEffect, useState } from "react";
import { TOAST_EVENT_NAME, type ToastEventDetail, type ToastTone } from "@/lib/toast";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

const toneClasses: Record<ToastTone, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
};

export default function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<ToastEventDetail>).detail;
      const nextToast: ToastItem = {
        id: detail.id,
        message: detail.message,
        tone: detail.tone ?? "error",
      };

      setToasts((current) => [nextToast, ...current].slice(0, 3));

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== detail.id));
      }, 3200);
    };

    window.addEventListener(TOAST_EVENT_NAME, handleToast as EventListener);
    return () => window.removeEventListener(TOAST_EVENT_NAME, handleToast as EventListener);
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-2xl border px-4 py-3 text-sm font-medium shadow-[0_16px_34px_rgba(15,32,49,0.16)] ${toneClasses[toast.tone]}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
