"use client";

import { createContext, useContext, useMemo, useState } from 'react';
import { ToastStack } from './toast-stack';

type Toast = { id: number; message: string; type: 'success' | 'error' };

type ToastContextValue = {
  pushToast: (message: string, type?: Toast['type'], ttl?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = (message: string, type: Toast['type'] = 'success', ttl = 2500) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, type }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, ttl);
  };

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }

  // Kept for backward compatibility with existing pages.
  return { pushToast: context.pushToast, ToastContainer: null } as const;
}
