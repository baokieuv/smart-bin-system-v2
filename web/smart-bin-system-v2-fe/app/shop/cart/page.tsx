'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import { shopApi } from '@/services/api/shop';
import {
  formatCurrency,
  formatDateTime,
  formatOrderStatus,
  formatPaymentMethod,
  toNumber,
  unwrapListPayload,
  useAuthToken,
} from '@/lib/shop-utils';
import type { CartLineDto, CartSummaryDto, OrderDetailDto, OrderListPayload } from '@/types/shop';

type CartState = {
  loading: boolean;
  message?: string;
  cart: CartSummaryDto | null;
  orders: OrderDetailDto[];
};

const emptyCartState = {
  cart: null,
  orders: [],
};

const toCartLines = (payload: CartSummaryDto | null) => {
  if (!payload) return [] as CartLineDto[];
  return unwrapListPayload<CartLineDto>(payload);
};

const normalizeOrderPayload = (payload: OrderListPayload) => unwrapListPayload<OrderDetailDto>(payload);

export default function CartPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, setState] = useState<CartState>({
    loading: true,
    ...emptyCartState,
  });
  const isLoggedIn = useAuthToken();
  const [checkoutDraft, setCheckoutDraft] = useState({
    recipientName: '',
    recipientPhone: '',
    shippingAddress: '',
    paymentMethod: 'COD' as 'COD' | 'BANK_TRANSFER',
    note: '',
  });

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    let cancelled = false;

    const loadCartAndOrders = async () => {
      setState((current) => ({ ...current, loading: true, message: undefined }));

      try {
        const [cartResponse, orderResponse] = await Promise.all([
          shopApi.getCart(),
          shopApi.getMyOrders({ page: 1, size: 8 }),
        ]);

        if (cancelled) return;

        setState({
          loading: false,
          cart: cartResponse.data,
          orders: normalizeOrderPayload(orderResponse.data),
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          loading: false,
          message: error instanceof Error ? error.message : 'Không tải được giỏ hàng hoặc lịch sử đơn.',
          cart: null,
          orders: [],
        });
      }
    };

    loadCartAndOrders();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    const repeatOrderId = searchParams.get('repeat');
    if (!repeatOrderId || !isLoggedIn) return;
  }, [isLoggedIn, searchParams]);

  const cartLines = useMemo(() => toCartLines(state.cart), [state.cart]);

  const summary = useMemo(() => {
    const subtotal = toNumber(state.cart?.subtotal) ?? cartLines.reduce((total, item) => total + (toNumber(item.subtotal) ?? ((toNumber(item.unitPrice) ?? 0) * (toNumber(item.quantity) ?? 0))), 0);
    const shippingFee = toNumber(state.cart?.shippingFee) ?? (subtotal > 0 ? 25000 : 0);
    const discount = toNumber(state.cart?.discount) ?? 0;
    const total = toNumber(state.cart?.total) ?? Math.max(0, subtotal + shippingFee - discount);

    return { subtotal, shippingFee, discount, total };
  }, [cartLines, state.cart]);

  const handleAddSampleCheckout = async () => {
    if (!isLoggedIn) {
      router.push('/auth/login?returnUrl=/shop/cart');
      return;
    }

    const response = await shopApi.checkout(checkoutDraft);
    setState((current) => ({
      ...current,
      message: response.message || 'Đã gửi yêu cầu checkout.',
    }));
    router.push('/shop');
  };

  const handleRepeatFromOrder = async (order: OrderDetailDto) => {
    if (!isLoggedIn) {
      router.push('/auth/login?returnUrl=/shop/cart');
      return;
    }

    const items = order.items || [];
    for (const item of items) {
      const quantity = toNumber(item.quantity) ?? 1;
      const productId = item.productId;
      if (!productId) continue;
      await shopApi.addOrUpdateCartItem({ productId, quantity });
    }

    router.push('/shop/cart');
  };

  if (!isLoggedIn) {
    return (
      <Surface className="p-6 sm:p-8">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Giỏ hàng & lịch sử đơn</p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Đăng nhập để xem giỏ hàng, lịch sử mua, và chi tiết giao nhận.</h2>
          <p className="text-sm leading-6 text-slate-600">
            Phần xem sản phẩm vẫn công khai, nhưng giỏ hàng và đơn mua được bảo vệ theo user.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/auth/login?returnUrl=/shop/cart" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Đăng nhập
            </Link>
            <Link href="/shop" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              Xem sản phẩm
            </Link>
          </div>
        </div>
      </Surface>
    );
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-5">
        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Cart</p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Giỏ hàng và lịch sử mua hàng</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Xem các mặt hàng hiện có trong giỏ, thanh toán, và mở lại đơn cũ.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/shop" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                Tiếp tục mua hàng
              </Link>
              <Button variant="secondary" onClick={() => void shopApi.clearCart().then(() => router.refresh())}>
                Xóa giỏ
              </Button>
            </div>
          </div>

          {state.message ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{state.message}</div>
          ) : null}
        </Surface>

        <Surface className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Items in cart</h3>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{cartLines.length} items</span>
          </div>

          <div className="mt-4 space-y-3">
            {cartLines.length > 0 ? cartLines.map((item, index) => {
              const title = item.productName || item.name || `Item ${index + 1}`;
              const unitPrice = toNumber(item.unitPrice) ?? toNumber(item.price) ?? 0;
              const quantity = toNumber(item.quantity) ?? 1;
              const subtotal = toNumber(item.subtotal) ?? unitPrice * quantity;

              return (
                <div key={`${item.productId || title}-${index}`} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm">
                      {item.imageUrl || item.thumbnailUrl ? <img src={item.imageUrl || item.thumbnailUrl} alt={title} className="h-full w-full object-cover" /> : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
                      <p className="text-xs text-slate-500">Đơn giá {formatCurrency(unitPrice)}</p>
                      <p className="text-xs text-slate-500">Số lượng {quantity}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Subtotal</p>
                      <p className="text-sm font-semibold text-slate-900">{formatCurrency(subtotal)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => router.push(`/shop/products/${item.productId}`)}>
                      Chi tiết
                    </Button>
                  </div>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">Giỏ hàng đang trống. Hãy quay về danh sách sản phẩm để thêm mặt hàng.</div>
            )}
          </div>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-900">Lịch sử đơn hàng</h3>
            <p className="text-xs text-slate-500">Click để mở chi tiết đơn</p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {state.orders.length > 0 ? state.orders.map((order) => (
              <button
                key={order.id}
                type="button"
                onClick={() => router.push(`/shop/orders/${order.id}`)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{order.orderCode || order.id}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatOrderStatus(order.status)}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600">
                  <span>Payment: {formatPaymentMethod(order.paymentMethod)}</span>
                  <span>Total: {formatCurrency(order.total ?? 0)}</span>
                </div>
              </button>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">Chưa có đơn nào. Sau khi checkout, lịch sử sẽ xuất hiện ở đây.</div>
            )}
          </div>
        </Surface>
      </div>

      <div className="space-y-5">
        <Surface className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Checkout summary</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Tạm tính</span>
              <span className="font-semibold text-slate-900">{formatCurrency(summary.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Phí ship</span>
              <span className="font-semibold text-slate-900">{formatCurrency(summary.shippingFee)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Giảm giá</span>
              <span className="font-semibold text-slate-900">- {formatCurrency(summary.discount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-slate-900">Tổng thanh toán</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(summary.total)}</span>
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin nhận hàng</p>
            <Input
              value={checkoutDraft.recipientName}
              onChange={(event) => setCheckoutDraft((current) => ({ ...current, recipientName: event.target.value }))}
              placeholder="Tên người nhận"
            />
            <Input
              value={checkoutDraft.recipientPhone}
              onChange={(event) => setCheckoutDraft((current) => ({ ...current, recipientPhone: event.target.value }))}
              placeholder="Số điện thoại"
            />
            <Input
              value={checkoutDraft.shippingAddress}
              onChange={(event) => setCheckoutDraft((current) => ({ ...current, shippingAddress: event.target.value }))}
              placeholder="Địa chỉ giao hàng"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCheckoutDraft((current) => ({ ...current, paymentMethod: 'COD' }))}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${checkoutDraft.paymentMethod === 'COD' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                COD
              </button>
              <button
                type="button"
                onClick={() => setCheckoutDraft((current) => ({ ...current, paymentMethod: 'BANK_TRANSFER' }))}
                className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${checkoutDraft.paymentMethod === 'BANK_TRANSFER' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
              >
                Chuyển khoản
              </button>
            </div>
            <Input
              value={checkoutDraft.note}
              onChange={(event) => setCheckoutDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="Ghi chú giao hàng"
            />
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => void handleAddSampleCheckout()} disabled={cartLines.length === 0}>
              Xác nhận mua hàng
            </Button>
            <p className="text-xs text-slate-500">Checkout đang dùng payload linh hoạt theo DTO backend. Nếu DTO thay đổi, chỉ cần chỉnh ở service.</p>
          </div>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Mua lại gần đây</p>
          <div className="mt-4 space-y-3">
            {state.orders.slice(0, 3).map((order) => (
              <div key={`${order.id}-repeat`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{order.orderCode || order.id}</p>
                    <p className="text-xs text-slate-500">{order.items?.length || 0} items</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => void handleRepeatFromOrder(order)}>
                    Mua lại
                  </Button>
                </div>
              </div>
            ))}

            {state.orders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Đơn gần đây sẽ xuất hiện ở đây để bạn mua lại nhanh.</div>
            ) : null}
          </div>
        </Surface>
      </div>
    </div>
  );
}