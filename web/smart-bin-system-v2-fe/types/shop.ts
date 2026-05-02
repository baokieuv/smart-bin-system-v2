export type CategoryResponse = {
  id: string;
  name?: string;
  description?: string;
};

export type ProductCardDto = {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  shortDescription?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  sku?: string;
  price?: number | string;
  oldPrice?: number | string;
  discountPercent?: number | string;
  stock?: number | string;
  rating?: number | string;
  reviewCount?: number | string;
  soldCount?: number | string;
  unit?: string;
  category?: CategoryResponse;
  badges?: string[];
  tags?: string[];
};

export type ProductDetailDto = ProductCardDto & {
  images?: string[];
  gallery?: string[];
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
  sku: string;
  quantity: number;
};

export type CartLineDto = {
  id?: string;
  productSku?: string;
  productName?: string;
  price?: number | string;
  quantity?: number | string;
  imageUrl?: string;
  thumbnailUrl?: string;
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
  shippingAddress: string;
  paymentMethod: 'VNPAY' | 'MOMO' | 'COD';
};

export type OrderItemDto = {
  id?: string;
  productSku?: string;
  productName?: string;
  price?: number | string;
  quantity?: number | string;
  imageUrl?: string;
  thumbnailUrl?: string;
};

export type OrderDetailDto = {
  id: string;
  orderId?: string;
  orderCode?: string;
  status?: string;
  paymentMethod?: 'VNPAY' | 'MOMO' | 'COD';
  paymentStatus?: string;
  shippingStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  totalAmount?: number | string;
  paymentUrl?: string;
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