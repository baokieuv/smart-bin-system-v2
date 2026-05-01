import { api } from "@/lib/api-client";
import type { CategoryDto, CategoryListPayload, OrderDto, OrderListPayload, ProductDto, ProductListPayload } from "@/types/shop";

export const shopAdminApi = {
  getCategories: async () => api.get<CategoryListPayload>("/categories", { page: 1, size: 100 }),
  createCategory: async (payload: Partial<CategoryDto>) => api.post<CategoryDto>("/categories", payload),
  updateCategory: async (categoryId: string, payload: Partial<CategoryDto>) => api.put<CategoryDto>(`/categories/${categoryId}`, payload),
  deleteCategory: async (categoryId: string) => api.delete<string>(`/categories/${categoryId}`),

  getProducts: async (params?: { page?: number; size?: number; searchParams?: string }) =>
    api.get<ProductListPayload>("/products", params),
  getProductById: async (productId: string) => api.get<ProductDto>(`/products/${productId}`),
  createProduct: async (payload: Partial<ProductDto>) => api.post<ProductDto>("/products", payload),
  updateProduct: async (productId: string, payload: Partial<ProductDto>) => api.put<ProductDto>(`/products/${productId}`, payload),
  deleteProduct: async (productId: string) => api.delete<string>(`/products/${productId}`),

  getOrders: async (params?: { page?: number; size?: number }) => api.get<OrderListPayload>("/orders", params),
  getOrderDetail: async (orderId: string) => api.get<OrderDto>(`/orders/${orderId}`),
  updateOrderStatus: async (orderId: string, status: string) => api.patch<OrderDto>(`/orders/${orderId}/status`, { status }),
};
