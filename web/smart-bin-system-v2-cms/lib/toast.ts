export type ToastTone = "info" | "success" | "error";

export const TOAST_EVENT_NAME = "smartbin:toast";

export type ToastEventDetail = {
  id: string;
  message: string;
  tone?: ToastTone;
};

export const emitToast = (message: string, tone: ToastTone = "error") => {
  if (typeof window === "undefined") {
    return;
  }

  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  window.dispatchEvent(
    new CustomEvent<ToastEventDetail>(TOAST_EVENT_NAME, {
      detail: { id, message, tone },
    }),
  );
};
