import { shopApi } from '@/services/api/shop';
import type { CartLineDto, CartSummaryDto } from '@/types/shop';
import { toNumber } from '@/lib/shop-utils';

type GuestCartItem = {
  sku: string;
  quantity: number;
  productId?: string;
  productName?: string;
  price?: number;
  imageUrl?: string;
  thumbnailUrl?: string;
};

const GUEST_CART_KEY = 'smart_bin_guest_cart_v1';
const CHECKOUT_DRAFT_KEY = 'smart_bin_checkout_draft_v1';

const canUseStorage = () => typeof window !== 'undefined';

const readJson = <T,>(key: string, fallback: T): T => {
  if (!canUseStorage()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
};

const pickArray = (source: Record<string, unknown>) => {
  const candidates = [
    source.items,
    source.content,
    source.data,
    source.result,
    source.list,
    source.cartItems,
    source.lines,
    source.lineItems,
    source.cartLines,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (candidate && typeof candidate === 'object') {
      const nested = candidate as Record<string, unknown>;
      const deepCandidates = [nested.items, nested.content, nested.data, nested.result, nested.list, nested.cartItems, nested.lines];
      for (const deepCandidate of deepCandidates) {
        if (Array.isArray(deepCandidate)) return deepCandidate;
      }
    }
  }

  return null;
};

export const readGuestCart = () => {
  const items = readJson<GuestCartItem[]>(GUEST_CART_KEY, []);
  return items.filter((item) => item.sku && (toNumber(item.quantity) ?? 0) > 0);
};

export const writeGuestCart = (items: GuestCartItem[]) => {
  writeJson(GUEST_CART_KEY, items);
};

export const clearGuestCart = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(GUEST_CART_KEY);
};

export const upsertGuestCartItem = (item: GuestCartItem) => {
  const quantity = Math.max(1, toNumber(item.quantity) ?? 1);
  const existing = readGuestCart();
  const index = existing.findIndex((line) => line.sku === item.sku);

  if (index === -1) {
    existing.push({ ...item, quantity });
  } else {
    existing[index] = {
      ...existing[index],
      ...item,
      quantity: (toNumber(existing[index].quantity) ?? 0) + quantity,
    };
  }

  writeGuestCart(existing);
};

export const updateGuestCartQuantity = (sku: string, quantity: number) => {
  const safeQuantity = Math.max(1, toNumber(quantity) ?? 1);
  const updated = readGuestCart().map((item) => (item.sku === sku ? { ...item, quantity: safeQuantity } : item));

  writeGuestCart(updated);
};

export const toCartLinesFromGuest = (): CartLineDto[] => {
  return readGuestCart().map((item, index) => ({
    id: `${item.sku}-${index}`,
    productSku: item.sku,
    productName: item.productName,
    quantity: item.quantity,
    price: item.price,
    imageUrl: item.imageUrl,
    thumbnailUrl: item.thumbnailUrl,
  }));
};

const toCartLine = (item: unknown, index: number): CartLineDto => {
  if (!item || typeof item !== 'object') {
    return {
      id: `line-${index}`,
      quantity: 1,
    };
  }

  const source = item as Record<string, unknown>;
  const product = source.product && typeof source.product === 'object' ? (source.product as Record<string, unknown>) : null;

  return {
    id: String(source.id ?? source.productSku ?? source.sku ?? `line-${index}`),
    productSku: String(source.productSku ?? source.sku ?? product?.sku ?? ''),
    productName:
      source.productName || source.name || product?.name || product?.title
        ? String(source.productName ?? source.name ?? product?.name ?? product?.title)
        : undefined,
    quantity: toNumber(source.quantity) ?? toNumber(source.qty) ?? 1,
    price: toNumber(source.price) ?? toNumber(source.unitPrice) ?? toNumber(product?.price) ?? undefined,
    imageUrl:
      source.imageUrl || source.productImage || product?.imageUrl ? String(source.imageUrl ?? source.productImage ?? product?.imageUrl) : undefined,
    thumbnailUrl:
      source.thumbnailUrl || source.productThumbnail || product?.thumbnailUrl
        ? String(source.thumbnailUrl ?? source.productThumbnail ?? product?.thumbnailUrl)
        : undefined,
  };
};

export const extractCartLines = (payload: CartSummaryDto | unknown): CartLineDto[] => {
  if (Array.isArray(payload)) {
    return payload.map((item, index) => toCartLine(item, index));
  }

  if (!payload || typeof payload !== 'object') return [];

  const source = payload as Record<string, unknown>;
  const picked = pickArray(source);

  if (picked) {
    return picked.map((item, index) => toCartLine(item, index));
  }

  return [];
};

export const hydrateCartLines = async (lines: CartLineDto[]): Promise<CartLineDto[]> => {
  if (!lines.length) return lines;

  const skus = Array.from(new Set(lines.map((item) => item.productSku).filter(Boolean) as string[]));
  if (!skus.length) return lines;

  try {
    const productsResponse = await shopApi.getProductsBySkus(skus);
    const products = productsResponse.data || [];
    const bySku = new Map<string, Record<string, unknown>>(products.map((product: Record<string, unknown>) => [String(product.sku), product]));

    return lines.map((line) => {
      const product = line.productSku ? bySku.get(line.productSku) : undefined;
      const fallbackNamePattern = /^Item\s+\d+$/i;
      const lineName = String(line.productName ?? '').trim();
      const linePrice = toNumber(line.price);

      const productName = String(product?.['name'] ?? product?.['title'] ?? '').trim();
      const productPrice = toNumber(product?.['price']);
      const productImageUrl = String(product?.['imageUrl'] ?? '').trim();
      const productThumbnailUrl = String(product?.['thumbnailUrl'] ?? '').trim();

      const safeLineName = lineName && !fallbackNamePattern.test(lineName) ? lineName : '';
      const safeLinePrice = linePrice !== null && linePrice > 0 ? linePrice : null;

      return {
        ...line,
        productName: productName || safeLineName || undefined,
        price: productPrice ?? safeLinePrice ?? line.price,
        imageUrl: productImageUrl || line.imageUrl,
        thumbnailUrl: productThumbnailUrl || line.thumbnailUrl || productImageUrl || undefined,
      };
    });
  } catch {
    return lines;
  }
};

export const syncGuestCartToServer = async () => {
  const items = readGuestCart();
  if (!items.length) return 0;

  const syncedSkus = new Set<string>();

  for (const item of items) {
    const response = await shopApi.addOrUpdateCartItem({
      sku: item.sku,
      quantity: Math.max(1, toNumber(item.quantity) ?? 1),
    });

    if (response.success) {
      syncedSkus.add(item.sku);
    }
  }

  if (!syncedSkus.size) return 0;

  try {
    const cartResponse = await shopApi.getCart();
    const serverLines = extractCartLines(cartResponse.data);
    const serverSkuSet = new Set(serverLines.map((line) => line.productSku).filter(Boolean) as string[]);

    const remaining = items.filter((item) => !(syncedSkus.has(item.sku) && serverSkuSet.has(item.sku)));
    writeGuestCart(remaining);
  } catch {
    // Keep local guest cart if verification fails.
  }

  return syncedSkus.size;
};

type CheckoutDraft = {
  shippingAddress: string;
  paymentMethod: 'COD' | 'MOMO' | 'VNPAY';
};

export const saveCheckoutDraft = (draft: CheckoutDraft) => {
  writeJson(CHECKOUT_DRAFT_KEY, draft);
};

export const readCheckoutDraft = (): CheckoutDraft | null => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(CHECKOUT_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CheckoutDraft;
  } catch {
    return null;
  }
};

export const clearCheckoutDraft = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(CHECKOUT_DRAFT_KEY);
};
