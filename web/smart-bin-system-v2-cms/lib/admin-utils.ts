import type { PagedPayload } from "@/types/core";

export const unwrapListPayload = <T>(payload: PagedPayload<T> | undefined): T[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;

  return payload.items || payload.content || payload.data || payload.result || payload.list || [];
};

export const toNumber = (value: string | number | undefined | null): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const formatCurrency = (value: number | string | undefined | null): string => {
  const normalized = toNumber(value);
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(normalized);
};

export const formatDateTime = (value: string | undefined): string => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN", {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};
