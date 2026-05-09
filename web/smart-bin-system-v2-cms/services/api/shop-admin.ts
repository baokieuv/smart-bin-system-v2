import { api } from "@/lib/api-client";
import type { CategoryDto, CategoryListPayload, OrderDto, OrderListPayload, ProductDto, ProductListPayload } from "@/types/shop";

export const shopAdminApi = {
  getCategories: async () => api.get<CategoryListPayload>("/categories", { page: 1, size: 100 }, { cacheTTL: 60000 }),
  createCategory: async (payload: Partial<CategoryDto>) => api.post<CategoryDto>("/categories", payload),
  updateCategory: async (categoryId: string, payload: Partial<CategoryDto>) => api.put<CategoryDto>(`/categories/${categoryId}`, payload),
  deleteCategory: async (categoryId: string) => api.delete<string>(`/categories/${categoryId}`),

  importCategories: async (payload: { categories: { name: string; description?: string }[] }) =>
    api.post("/categories/import", payload),

  getProducts: async (params?: { page?: number; size?: number; searchParams?: string }) =>
    api.get<ProductListPayload>("/products", params, { cacheTTL: 60000 }),
  getProductById: async (productId: string) => api.get<ProductDto>(`/products/${productId}`),
  createProduct: async (payload: Partial<ProductDto>) => api.post<ProductDto>("/products", payload),
  updateProduct: async (productId: string, payload: Partial<ProductDto>) => api.put<ProductDto>(`/products/${productId}`, payload),
  deleteProduct: async (productId: string) => api.delete<string>(`/products/${productId}`),

  // Backend expects ImportProductsRequest: { products: CreateProductRequest[] }
  importProducts: async (payload: { products: { name: string; description?: string; price: string | number; sku: string; imageUrl?: string; categoryId?: string }[] }) =>
    api.post("/products/import", payload),

  getOrders: async (params?: { page?: number; size?: number }) => api.get<OrderListPayload>("/orders", params, { cacheTTL: 60000 }),
  getOrderDetail: async (orderId: string) => api.get<OrderDto>(`/orders/${orderId}`),
  updateOrderStatus: async (orderId: string, status: string) => api.patch<OrderDto>(`/orders/${orderId}/status`, { status }),
};
