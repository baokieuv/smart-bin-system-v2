type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

type ToastStackProps = {
  toasts: Toast[];
};

export function ToastStack({ toasts }: ToastStackProps) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
