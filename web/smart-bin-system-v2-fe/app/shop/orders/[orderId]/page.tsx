'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Surface } from '@/components/ui/surface';
import { shopApi } from '@/services/api/shop';
import {
  formatCurrency,
  formatDateTime,
  formatOrderStatus,
  formatPaymentMethod,
  toNumber,
  useAuthToken,
} from '@/lib/shop-utils';
import type { OrderDetailDto } from '@/types/shop';

type OrderDetailState = {
  status: 'loading' | 'ready' | 'error';
  message?: string;
  order?: OrderDetailDto;
};

export default function OrderDetailPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const orderId = params.orderId;
  const [state, setState] = useState<OrderDetailState>({ status: 'loading' });
  const isLoggedIn = useAuthToken();

  useEffect(() => {
    if (!isLoggedIn) return;

    let cancelled = false;

    const loadOrder = async () => {
      setState({ status: 'loading' });

      try {
        const response = await shopApi.getOrderDetail(orderId);
        if (cancelled) return;

        setState({ status: 'ready', order: response.data });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Không tải được chi tiết đơn hàng.',
        });
      }
    };

    loadOrder();

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, orderId]);

  const order = state.order;

  const pricing = useMemo(() => {
    const subtotal = toNumber(order?.subtotal) ?? (order?.items || []).reduce((total, item) => total + ((toNumber(item.unitPrice) ?? 0) * (toNumber(item.quantity) ?? 0)), 0);
    const shippingFee = toNumber(order?.shippingFee) ?? 0;
    const discount = toNumber(order?.discount) ?? 0;
    const total = toNumber(order?.total) ?? Math.max(0, subtotal + shippingFee - discount);

    return { subtotal, shippingFee, discount, total };
  }, [order]);

  const handleBuyAgain = async () => {
    if (!order?.items?.length) return;

    for (const item of order.items) {
      const productId = item.productId;
      if (!productId) continue;
      const quantity = toNumber(item.quantity) ?? 1;
      await shopApi.addOrUpdateCartItem({ productId, quantity });
    }

    router.push('/shop/cart');
  };

  if (!isLoggedIn) {
    return (
      <Surface className="p-6 sm:p-8">
        <div className="max-w-2xl space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Order detail</p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Đăng nhập để xem chi tiết đơn.</h2>
          <div className="flex flex-wrap gap-3">
            <Link href={`/auth/login?returnUrl=${encodeURIComponent(`/shop/orders/${orderId}`)}`} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Đăng nhập
            </Link>
            <Link href="/shop/cart" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              Quay lại giỏ hàng
            </Link>
          </div>
        </div>
      </Surface>
    );
  }

  if (state.status === 'error') {
    return (
      <Surface className="p-6 sm:p-8">
        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">Lỗi tải đơn</p>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Không thể mở chi tiết đơn hàng</h2>
          <p className="text-sm text-slate-600">{state.message}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/shop/cart" className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Quay lại lịch sử đơn
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
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Surface className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Order detail</p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{order?.orderCode || order?.id || 'Đơn hàng'}</h2>
            <p className="mt-2 text-sm text-slate-600">Tạo lúc {formatDateTime(order?.createdAt)}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatOrderStatus(order?.status)}</span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thanh toán</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{formatPaymentMethod(order?.paymentMethod)}</p>
            <p className="mt-1 text-sm text-slate-600">Trạng thái: {order?.paymentStatus || 'Chưa rõ'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Shipping</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">{order?.shipping?.carrier || 'Standard delivery'}</p>
            <p className="mt-1 text-sm text-slate-600">ETA: {order?.shipping?.estimatedDelivery || '—'}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Mặt hàng trong đơn</h3>
          {(order?.items || []).map((item, index) => {
            const title = item.productName || item.name || `Item ${index + 1}`;
            const quantity = toNumber(item.quantity) ?? 0;
            const unitPrice = toNumber(item.unitPrice) ?? 0;
            const subtotal = toNumber(item.subtotal) ?? unitPrice * quantity;

            return (
              <div key={`${item.productId || title}-${index}`} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-16 w-16 overflow-hidden rounded-xl bg-slate-100">
                    {item.imageUrl || item.thumbnailUrl ? <img src={item.imageUrl || item.thumbnailUrl} alt={title} className="h-full w-full object-cover" /> : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{title}</p>
                    <p className="text-xs text-slate-500">SL {quantity} · {formatCurrency(unitPrice)}</p>
                  </div>
                </div>
                <div className="text-sm font-semibold text-slate-900">{formatCurrency(subtotal)}</div>
              </div>
            );
          })}
        </div>
      </Surface>

      <div className="space-y-5">
        <Surface className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Tổng quan giá</p>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between"><span className="text-slate-600">Tạm tính</span><span className="font-semibold text-slate-900">{formatCurrency(pricing.subtotal)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Phí ship</span><span className="font-semibold text-slate-900">{formatCurrency(pricing.shippingFee)}</span></div>
            <div className="flex items-center justify-between"><span className="text-slate-600">Giảm giá</span><span className="font-semibold text-slate-900">- {formatCurrency(pricing.discount)}</span></div>
            <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="text-slate-900">Tổng thanh toán</span><span className="text-lg font-bold text-slate-900">{formatCurrency(pricing.total)}</span></div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin giao hàng</p>
            <p className="mt-2">Người nhận: {order?.shipping?.recipientName || '—'}</p>
            <p>Điện thoại: {order?.shipping?.recipientPhone || '—'}</p>
            <p>Địa chỉ: {order?.shipping?.address || '—'}</p>
            <p>Tracking: {order?.shipping?.trackingCode || '—'}</p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Button onClick={() => void handleBuyAgain()} disabled={!order?.items?.length}>
              Mua lại
            </Button>
            <Button variant="secondary" onClick={() => router.push('/shop/cart')}>
              Về lịch sử đơn
            </Button>
          </div>
        </Surface>

        <Surface className="p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Trạng thái thanh toán</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Method: {formatPaymentMethod(order?.paymentMethod)}</div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Payment status: {order?.paymentStatus || 'Chưa thanh toán / chưa cập nhật'}</div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">Shipping status: {order?.shippingStatus || 'Chưa cập nhật'}</div>
          </div>
        </Surface>
      </div>
    </div>
  );
}