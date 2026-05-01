import { api } from '@/lib/api-client';
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
  getProducts: async (params?: { page?: number; size?: number; categoryId?: string; searchParams?: string }) => {
    return api.get<ProductListPayload>('/products', params, { skipAuthRefresh: true });
  },

  getProductById: async (productId: string) => {
    return api.get<ProductDetailDto>(`/products/${productId}`, undefined, { skipAuthRefresh: true });
  },

  getCart: async () => {
    return api.get<CartSummaryDto>('/cart');
  },

  addOrUpdateCartItem: async (item: CartItemDto) => {
    return api.post<string | CartSummaryDto>('/cart', item);
  },

  clearCart: async () => {
    return api.delete<string>('/cart');
  },

  checkout: async (request: CheckoutRequest) => {
    return api.post<unknown>('/orders/checkout', request);
  },

  getMyOrders: async (params?: { page?: number; size?: number }) => {
    return api.get<OrderListPayload>('/orders/my-orders', params);
  },

  getOrderDetail: async (orderId: string) => {
    return api.get<OrderDetailDto>(`/orders/${orderId}`);
  },

  cancelOrder: async (orderId: string) => {
    return api.put<OrderDetailDto>(`/orders/${orderId}/cancel`);
  },
};