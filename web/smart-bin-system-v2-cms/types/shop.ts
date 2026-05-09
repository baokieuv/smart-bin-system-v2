import type { PagedPayload } from "@/types/core";

export interface CategoryDto {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: string;
}

export interface ProductDto {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  categoryId?: string;
  categoryName?: string;
  price?: number | string;
  // Backend now returns `quantityAvailable` in ProductResponse
  quantityAvailable?: number | string;
  sku?: string;
  isPublished?: boolean;
  createdAt?: string;
}

export interface OrderDto {
  id: string;
  orderCode?: string;
  userId?: string;
  userName?: string;
  status?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  shippingStatus?: string;
  total?: number | string;
  createdAt?: string;
}

export type CategoryListPayload = PagedPayload<CategoryDto>;
export type ProductListPayload = PagedPayload<ProductDto>;
export type OrderListPayload = PagedPayload<OrderDto>;
