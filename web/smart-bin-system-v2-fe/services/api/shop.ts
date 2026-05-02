import { api } from '@/lib/api-client';
import { getCache, setCache } from '@/lib/cache';
import type {
  CartItemDto,
  CartSummaryDto,
  CheckoutRequest,
  OrderDetailDto,
  OrderListPayload,
  ProductDetailDto,
  ProductListPayload,
} from '@/types/shop';

export const shopApi = {
  // Products
  getProducts: async (params?: { page?: number; size?: number; categoryId?: string; searchParams?: string }) => {
    const key = `products:${JSON.stringify(params || {})}`;
    // cache product list for 2 minutes
    const cached = getCache<ProductListPayload>(key);
    if (cached) return { success: true, data: cached } as any;

    const res = await api.get<ProductListPayload>('/products', params, { skipAuthRefresh: true });
    if (res && res.success && res.data) {
      setCache(key, res.data, 2 * 60 * 1000);
    }
    return res;
  },

  getProductById: async (productId: string) => {
    const key = `product:${productId}`;
    const cached = getCache<ProductDetailDto>(key);
    if (cached) return { success: true, data: cached } as any;

    const res = await api.get<ProductDetailDto>(`/products/${productId}`, undefined, { skipAuthRefresh: true });
    if (res && res.success && res.data) setCache(key, res.data, 5 * 60 * 1000);
    return res;
  },

  getProductsBySkus: async (skus: string[]) => {
    const normalizedSkus = Array.from(new Set(skus.map((sku) => String(sku).trim()).filter(Boolean))).sort();
    if (!normalizedSkus.length) return { success: true, data: [] } as any;

    const cachedBySku = normalizedSkus
      .map((sku) => getCache<ProductDetailDto>(`product:sku:${sku}`))
      .filter(Boolean) as ProductDetailDto[];

    const hitSkus = new Set(cachedBySku.map((item) => String(item.sku || '').trim()).filter(Boolean));
    const missingSkus = normalizedSkus.filter((sku) => !hitSkus.has(sku));

    if (!missingSkus.length) {
      return { success: true, data: cachedBySku } as any;
    }

    const key = `products:skus:${missingSkus.join(',')}`;
    const cachedMissingBatch = getCache<ProductDetailDto[]>(key);
    if (cachedMissingBatch) {
      cachedMissingBatch.forEach((product) => {
        const sku = String(product.sku || '').trim();
        if (sku) setCache(`product:sku:${sku}`, product, 5 * 60 * 1000);
      });

      return { success: true, data: [...cachedBySku, ...cachedMissingBatch] } as any;
    }

    const res = await api.post<ProductDetailDto[]>('/products/by-skus', missingSkus, { skipAuthRefresh: true });
    if (res && res.success && res.data) {
      setCache(key, res.data, 5 * 60 * 1000);
      res.data.forEach((product) => {
        const sku = String(product.sku || '').trim();
        if (sku) setCache(`product:sku:${sku}`, product, 5 * 60 * 1000);
      });

      return { ...res, data: [...cachedBySku, ...res.data] };
    }

    return res;
  },

  // Categories
  getCategories: async (params?: { page?: number; size?: number }) => {
    const key = `categories:${JSON.stringify(params || {})}`;
    const cached = getCache<any>(key);
    if (cached) return { success: true, data: cached } as any;

    const res = await api.get<any>('/categories', params, { skipAuthRefresh: true });
    if (res && res.success && res.data) {
      setCache(key, res.data, 10 * 60 * 1000);
    }
    return res;
  },

  getCategoryById: async (categoryId: string) => {
    const key = `category:${categoryId}`;
    const cached = getCache<any>(key);
    if (cached) return { success: true, data: cached } as any;

    const res = await api.get<any>(`/categories/${categoryId}`, undefined, { skipAuthRefresh: true });
    if (res && res.success && res.data) {
      setCache(key, res.data, 10 * 60 * 1000);
    }
    return res;
  },

  // Cart
  getCart: async () => {
    return api.get<CartSummaryDto>('/cart');
  },

  addOrUpdateCartItem: async (item: CartItemDto) => {
    return api.post<CartSummaryDto>('/cart', item);
  },

  clearCart: async () => {
    return api.delete<string>('/cart');
  },

  // Orders
  checkout: async (request: CheckoutRequest) => {
    return api.post<OrderDetailDto>('/orders/checkout', request);
  },

  getMyOrders: async (params?: { page?: number; size?: number }) => {
    const key = `orders:${JSON.stringify(params || {})}`;
    const cached = getCache<OrderListPayload>(key);
    if (cached) return { success: true, data: cached } as any;

    const res = await api.get<OrderListPayload>('/orders/my-orders', params);
    if (res && res.success && res.data) {
      setCache(key, res.data, 1 * 60 * 1000);
    }
    return res;
  },

  getOrderDetail: async (orderId: string) => {
    const key = `order:${orderId}`;
    const cached = getCache<OrderDetailDto>(key);
    if (cached) return { success: true, data: cached } as any;

    const res = await api.get<OrderDetailDto>(`/orders/${orderId}`);
    if (res && res.success && res.data) {
      setCache(key, res.data, 3 * 60 * 1000);
    }
    return res;
  },

  updateOrder: async (orderId: string, request: { shippingAddress: string }) => {
    return api.patch<OrderDetailDto>(`/orders/${orderId}`, request);
  },

  cancelOrder: async (orderId: string) => {
    return api.put<OrderDetailDto>(`/orders/${orderId}/cancel`);
  },

  // Payments
  processVnpayReturn: async (params?: any) => {
    return api.get<any>('/payments/vnpay_return', params, { skipAuthRefresh: true });
  },
};