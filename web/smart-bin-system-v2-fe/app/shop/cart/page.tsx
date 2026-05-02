'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import {
  clearCheckoutDraft,
  clearGuestCart,
  extractCartLines,
  hydrateCartLines,
  readCheckoutDraft,
  saveCheckoutDraft,
  syncGuestCartToServer,
  toCartLinesFromGuest,
  updateGuestCartQuantity,
} from '@/lib/shop-cart';
import { useToast } from '@/components/ui/use-toast';
import { shopApi } from '@/services/api/shop';
import {
  formatCurrency,
  formatDateTime,
  toNumber,
  unwrapListPayload,
  useValidAuthToken,
} from '@/lib/shop-utils';
import type { CartLineDto, CartSummaryDto, OrderDetailDto } from '@/types/shop';

type CartState = {
  status: 'loading' | 'ready' | 'error';
  message?: string;
  summary?: CartSummaryDto;
  items: CartLineDto[];
};

type OrderState = {
  status: 'loading' | 'ready' | 'error';
  message?: string;
  orders: OrderDetailDto[];
};

const paymentOptions = [
  { value: 'COD', label: 'COD' },
  { value: 'MOMO', label: 'MoMo' },
  { value: 'VNPAY', label: 'VNPay' },
] as const;

export default function CartPage() {
  const router = useRouter();
  const isLoggedIn = useValidAuthToken();
  const { pushToast, ToastContainer } = useToast();
  const [cartState, setCartState] = useState<CartState>({ status: 'loading', items: [] });
  const [orderState, setOrderState] = useState<OrderState>({ status: 'loading', orders: [] });
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'MOMO' | 'VNPAY'>('COD');
  const [updatingSku, setUpdatingSku] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);

  useEffect(() => {
    const draft = readCheckoutDraft();
    if (!draft) return;

    setShippingAddress(draft.shippingAddress || '');
    setPaymentMethod(draft.paymentMethod || 'COD');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCart = async () => {
      setCartState((current) => ({ ...current, status: 'loading', message: undefined }));

      if (!isLoggedIn) {
        setCartState({
          status: 'ready',
          summary: undefined,
          items: toCartLinesFromGuest(),
        });
        return;
      }

      try {
        await syncGuestCartToServer();
        const response = await shopApi.getCart();
        if (cancelled) return;

        const summary = response.data;
        const items = await hydrateCartLines(extractCartLines(summary));

        setCartState({ status: 'ready', summary, items });
      } catch (error) {
        if (cancelled) return;
        const errorMsg = error instanceof Error ? error.message : 'Không tải được giỏ hàng.';
        setCartState({
          status: 'error',
          message: errorMsg,
          items: [],
        });
        pushToast(errorMsg, 'error');
      }
    };

    const loadOrders = async () => {
      if (!isLoggedIn) {
        setOrderState({ status: 'ready', orders: [] });
        return;
      }

      setOrderState((current) => ({ ...current, status: 'loading', message: undefined }));
      try {
        const response = await shopApi.getMyOrders({ page: 1, size: 5 });
        if (cancelled) return;

        const orders = unwrapListPayload<OrderDetailDto>(response.data);
        setOrderState({ status: 'ready', orders });
      } catch (error) {
        if (cancelled) return;

        const errorMsg = error instanceof Error ? error.message : 'Không tải được lịch sử đơn hàng.';
        setOrderState({
          status: 'error',
          message: errorMsg,
          orders: [],
        });
        pushToast(errorMsg, 'error');
      }
    };

    loadCart();
    loadOrders();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (typeof window === 'undefined') return;
    if (new URLSearchParams(window.location.search).get('checkout') !== '1') return;

    setCheckoutMessage('Bạn đã đăng nhập. Vui lòng xác nhận thanh toán.');
  }, [isLoggedIn]);

  const totals = useMemo(() => {
    const subtotal = toNumber(cartState.summary?.subtotal);
    const shippingFee = toNumber(cartState.summary?.shippingFee) ?? 0;
    const discount = toNumber(cartState.summary?.discount) ?? 0;

    const computedSubtotal = cartState.items.reduce((sum, item) => {
      const price = toNumber(item.price) ?? 0;
      const quantity = toNumber(item.quantity) ?? 0;
      return sum + price * quantity;
    }, 0);

    const base = subtotal ?? computedSubtotal;
    const total = toNumber(cartState.summary?.total) ?? Math.max(0, base + shippingFee - discount);

    return {
      subtotal: base,
      shippingFee,
      discount,
      total,
    };
  }, [cartState.items, cartState.summary]);

  const updateQuantity = async (sku: string | undefined, quantity: number) => {
    if (!sku) return;

    setUpdatingSku(sku);

    if (!isLoggedIn) {
      updateGuestCartQuantity(sku, quantity);
      setCartState((current) => ({
        ...current,
        status: 'ready',
        items: toCartLinesFromGuest(),
      }));
      setUpdatingSku(null);
      return;
    }

    try {
      const updateResponse = await shopApi.addOrUpdateCartItem({ sku, quantity });
      if (!updateResponse.success) {
        throw new Error(updateResponse.message || 'Cập nhật số lượng thất bại.');
      }

      const response = await shopApi.getCart();
      if (!response.success) {
        throw new Error(response.message || 'Không tải được giỏ hàng.');
      }

      const summary = response.data;
      const items = await hydrateCartLines(extractCartLines(summary));
      setCartState({ status: 'ready', summary, items });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Cập nhật số lượng thất bại.';
      setCartState((current) => ({
        ...current,
        status: 'error',
        message: errorMsg,
      }));
      pushToast(errorMsg, 'error');
    } finally {
      setUpdatingSku(null);
    }
  };

  const handleClearCart = async () => {
    setIsClearing(true);

    if (!isLoggedIn) {
      clearGuestCart();
      setCartState({ status: 'ready', summary: undefined, items: [] });
      setIsClearing(false);
      return;
    }

    try {
      await shopApi.clearCart();
      setCartState({ status: 'ready', summary: undefined, items: [] });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Không thể xóa giỏ hàng.';
      setCartState((current) => ({
        ...current,
        status: 'error',
        message: errorMsg,
      }));
      pushToast(errorMsg, 'error');
    } finally {
      setIsClearing(false);
    }
  };

  const handleCheckout = async () => {
    if (!isLoggedIn) {
      saveCheckoutDraft({ shippingAddress, paymentMethod });
      pushToast('Vui lòng đăng nhập để tiếp tục checkout.', 'error');
      router.push(`/auth/login?returnUrl=${encodeURIComponent('/shop/cart?checkout=1')}`);
      return;
    }

    if (!shippingAddress.trim()) {
      setCheckoutMessage('Vui lòng nhập địa chỉ giao hàng.');
      return;
    }

    setCheckoutMessage(null);
    setIsCheckingOut(true);
    try {
      const response = await shopApi.checkout({
        shippingAddress: shippingAddress.trim(),
        paymentMethod,
      });

      if (!response.success) {
        throw new Error(response.message || 'Thanh toán thất bại.');
      }

      if (response.data.paymentUrl) {
        pushToast('Đang chuyển sang cổng thanh toán.', 'success');
        window.location.href = response.data.paymentUrl;
        return;
      }

      const orderId = response.data.id || response.data.orderId;
      if (orderId) {
        clearCheckoutDraft();
        pushToast('Đặt hàng thành công. Đang chuyển đến chi tiết đơn hàng.', 'success');
        router.push(`/shop/orders/${orderId}`);
        return;
      }

      setCheckoutMessage('Đặt hàng thành công.');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Thanh toán thất bại.';
      setCheckoutMessage(errorMsg);
      pushToast(errorMsg, 'error');
    } finally {
      setIsCheckingOut(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
      {ToastContainer}
      <Surface className="border-0 bg-white/85 p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Giỏ hàng</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">Sản phẩm bạn đang chọn</h2>
            <p className="mt-2 text-sm text-slate-600">Cập nhật số lượng và thanh toán nhanh ngay tại đây.</p>
          </div>
          <button
            type="button"
            onClick={handleClearCart}
            disabled={isClearing || cartState.items.length === 0}
            className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isClearing ? 'Đang xóa...' : 'Xóa giỏ hàng'}
          </button>
        </div>

        {cartState.message ? (
          <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {cartState.message}
          </div>
        ) : null}

        {cartState.status === 'loading' ? (
          <div className="mt-6 text-sm text-slate-600">Đang tải giỏ hàng...</div>
        ) : cartState.items.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-slate-50 p-6 text-center">
            <h3 className="text-lg font-semibold text-slate-900">Giỏ hàng trống</h3>
            <p className="mt-2 text-sm text-slate-600">Chọn sản phẩm trong shop để bắt đầu đặt hàng.</p>
            <Link href="/shop" className="mt-4 inline-flex rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
              Về trang sản phẩm
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {cartState.items.map((item, index) => {
              const title = item.productName || `Item ${index + 1}`;
              const quantity = toNumber(item.quantity) ?? 0;
              const price = toNumber(item.price) ?? 0;
              const lineTotal = price * quantity;

              return (
                <div key={`${item.productSku || title}-${index}`} className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
                      {item.imageUrl || item.thumbnailUrl ? (
                        <img src={item.imageUrl || item.thumbnailUrl} alt={title} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{title}</p>
                      <p className="text-xs text-slate-500">SKU: {item.productSku || '—'}</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">{formatCurrency(price)}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productSku, Math.max(1, quantity - 1))}
                        disabled={!item.productSku || updatingSku === item.productSku}
                        className="h-6 w-6 rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        -
                      </button>
                      <span className="min-w-6 text-center text-sm font-semibold text-slate-700">{quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productSku, quantity + 1)}
                        disabled={!item.productSku || updatingSku === item.productSku}
                        className="h-6 w-6 rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{formatCurrency(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <div className="space-y-5">
        <Surface className="border-0 bg-white/85 p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Tóm tắt thanh toán</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Tạm tính</span>
              <span className="font-semibold text-slate-900">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Phí vận chuyển</span>
              <span className="font-semibold text-slate-900">{formatCurrency(totals.shippingFee)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Giảm giá</span>
              <span className="font-semibold text-amber-700">- {formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-200/70 pt-3">
              <span className="text-slate-900">Tổng cộng</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Địa chỉ giao hàng</label>
              <Input
                value={shippingAddress}
                onChange={(event) => setShippingAddress(event.target.value)}
                placeholder="Nhập địa chỉ đầy đủ..."
                className="mt-2"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Phương thức thanh toán</label>
              <select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value as 'COD' | 'MOMO' | 'VNPAY')}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_0_0_rgba(148,163,184,0.15)] focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
              >
                {paymentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {checkoutMessage ? (
              <div className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                {checkoutMessage}
              </div>
            ) : null}

            <Button
              onClick={() => void handleCheckout()}
              disabled={isCheckingOut || cartState.items.length === 0}
              className="w-full rounded-full"
            >
              {isCheckingOut ? 'Đang xử lý...' : 'Thanh toán ngay'}
            </Button>
          </div>
        </Surface>

        <Surface className="border-0 bg-white/85 p-5 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.45)] sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Đơn hàng gần đây</p>
            <Link href="/shop" className="text-xs font-semibold text-slate-600 hover:text-slate-900">Xem shop</Link>
          </div>

          {!isLoggedIn ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              Đăng nhập để xem lịch sử đơn hàng.
            </div>
          ) : orderState.status === 'loading' ? (
            <p className="mt-4 text-sm text-slate-600">Đang tải đơn hàng...</p>
          ) : orderState.orders.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              Chưa có đơn hàng nào gần đây.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {orderState.orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/shop/orders/${order.id}`}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm transition hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{order.orderCode || order.id}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(order.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-700">{formatCurrency(order.totalAmount ?? 0)}</p>
                    <p className="text-xs text-slate-500">{order.status || 'Đang xử lý'}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
