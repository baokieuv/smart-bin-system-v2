import { useSyncExternalStore } from 'react';

export const formatCurrency = (value: number | string | null | undefined) => {
  const amount = typeof value === 'string' ? Number(value) : value;
  const safeAmount = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;

  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(safeAmount);
};

export const formatDateTime = (value?: string | number | null) => {
  if (value === null || value === undefined) return 'Chưa cập nhật';

  const parsed = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Chưa cập nhật';

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed));
};

export const formatPaymentMethod = (value?: string) => {
  if (value === 'COD') return 'COD';
  if (value === 'BANK_TRANSFER') return 'Chuyển khoản';
  return value || 'Chưa xác định';
};

export const formatOrderStatus = (value?: string) => {
  if (!value) return 'Chưa xác định';

  const normalized = value.toLowerCase();
  if (normalized.includes('cancel')) return 'Đã hủy';
  if (normalized.includes('deliver')) return 'Đang giao';
  if (normalized.includes('ship')) return 'Đang giao';
  if (normalized.includes('paid')) return 'Đã thanh toán';
  if (normalized.includes('complete') || normalized.includes('done') || normalized.includes('success')) return 'Hoàn tất';
  if (normalized.includes('pending') || normalized.includes('processing')) return 'Đang xử lý';

  return value;
};

export const hasAuthToken = () => {
  if (typeof window === 'undefined') return false;
  return Boolean(window.localStorage.getItem('access_token'));
};

const subscribeToAuthToken = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') return () => undefined;

  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
};

const getAuthTokenSnapshot = () => hasAuthToken();

const getServerAuthTokenSnapshot = () => false;

export const useAuthToken = () => {
  return useSyncExternalStore(subscribeToAuthToken, getAuthTokenSnapshot, getServerAuthTokenSnapshot);
};

export const unwrapListPayload = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];

  if (!payload || typeof payload !== 'object') return [];

  const source = payload as Record<string, unknown>;
  const candidates = [source.items, source.content, source.data, source.result, source.list];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as T[];
  }

  return [];
};

export const toNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};