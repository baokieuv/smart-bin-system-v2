export type ProductCardDto = {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  shortDescription?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  categoryId?: string;
  categoryName?: string;
  price?: number | string;
  oldPrice?: number | string;
  discountPercent?: number | string;
  stock?: number | string;
  rating?: number | string;
  reviewCount?: number | string;
  soldCount?: number | string;
  unit?: string;
  badges?: string[];
  tags?: string[];
};

export type ProductDetailDto = ProductCardDto & {
  images?: string[];
  gallery?: string[];
  sku?: string;
  warranty?: string;
  origin?: string;
  weight?: string;
  dimensions?: string;
  highlights?: string[];
  specifications?: Array<{ label: string; value: string }>;
};

export type ProductListPayload =
  | ProductCardDto[]
  | {
      items?: ProductCardDto[];
      content?: ProductCardDto[];
      data?: ProductCardDto[];
      result?: ProductCardDto[];
      list?: ProductCardDto[];
      page?: number;
      pageNumber?: number;
      totalPages?: number;
      hasNext?: boolean;
      totalElements?: number;
    };

export type CartItemDto = {
  productId: string;
  quantity: number;
};

export type CartLineDto = {
  id?: string;
  productId?: string;
  productName?: string;
  name?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  unitPrice?: number | string;
  price?: number | string;
  quantity?: number | string;
  subtotal?: number | string;
  note?: string;
};

export type CartSummaryDto = {
  items?: CartLineDto[];
  content?: CartLineDto[];
  data?: CartLineDto[];
  subtotal?: number | string;
  shippingFee?: number | string;
  discount?: number | string;
  total?: number | string;
};

export type CheckoutRequest = {
  recipientName?: string;
  recipientPhone?: string;
  shippingAddress?: string;
  shippingMethod?: string;
  paymentMethod?: 'COD' | 'BANK_TRANSFER' | string;
  note?: string;
  discountCode?: string;
};

export type OrderItemDto = {
  productId?: string;
  productName?: string;
  name?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  quantity?: number | string;
  unitPrice?: number | string;
  subtotal?: number | string;
};

export type OrderDetailDto = {
  id: string;
  orderCode?: string;
  status?: string;
  paymentMethod?: 'COD' | 'BANK_TRANSFER' | string;
  paymentStatus?: string;
  shippingStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  subtotal?: number | string;
  shippingFee?: number | string;
  discount?: number | string;
  total?: number | string;
  items?: OrderItemDto[];
  shipping?: {
    recipientName?: string;
    recipientPhone?: string;
    address?: string;
    city?: string;
    district?: string;
    ward?: string;
    carrier?: string;
    trackingCode?: string;
    estimatedDelivery?: string;
    note?: string;
  };
};

export type OrderListPayload =
  | OrderDetailDto[]
  | {
      items?: OrderDetailDto[];
      content?: OrderDetailDto[];
      data?: OrderDetailDto[];
      result?: OrderDetailDto[];
      list?: OrderDetailDto[];
      page?: number;
      pageNumber?: number;
      totalPages?: number;
      hasNext?: boolean;
      totalElements?: number;
    };