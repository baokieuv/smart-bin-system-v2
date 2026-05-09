'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import { upsertGuestCartItem } from '@/lib/shop-cart';
import { shopApi } from '@/services/api/shop';
import { formatCurrency, useValidAuthToken } from '@/lib/shop-utils';
import { useToast } from '@/components/ui/use-toast';
import type { ProductCardDto, ProductDetailDto } from '@/types/shop';

type DetailState = { status: 'loading' | 'ready' | 'error'; message?: string; product?: ProductDetailDto };

const fallbackRelated: ProductCardDto[] = [
  {
    id: 'sensor-pack',
    name: 'Sensor Pack Pro',
    sku: 'SB-SENSOR-002',
    description: 'Gói cảm biến mở rộng cho bin công nghiệp.',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
    price: 690000,
  },
  {
    id: 'service-refill',
    name: 'Maintenance Refill Bundle',
    sku: 'SB-SERVICE-003',
    description: 'Gói phụ kiện và bảo trì định kỳ.',
    imageUrl: 'https://images.unsplash.com/photo-1531538606174-0f90ff5dce83?auto=format&fit=crop&w=900&q=80',
    price: 450000,
  },
];

export default function ProductDetailPage() {
  const params = useParams<{ productId: string }>();
  const router = useRouter();
  const productId = params.productId;
  const [quantity, setQuantity] = useState(1);
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const isLoggedIn = useValidAuthToken();
  const { pushToast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const loadProduct = async () => {
      setState({ status: 'loading' });

      try {
        const response = await shopApi.getProductById(productId);
        if (cancelled) return;

        setState({ status: 'ready', product: response.data });
      } catch (error) {
        if (cancelled) return;

        const errorMsg = error instanceof Error ? error.message : 'Không tải được chi tiết sản phẩm.';
        setState({ status: 'error', message: errorMsg });
        pushToast(errorMsg, 'error');
      }
    };

    loadProduct();

    return () => {
      cancelled = true;
    };
  }, [productId]);

  const relatedProducts = useMemo(() => fallbackRelated, []);
  const product = state.product;
  const image = product?.imageUrl || product?.thumbnailUrl || product?.gallery?.[0] || product?.images?.[0] || '';
  const title = product?.name || product?.title || 'Chi tiết sản phẩm';
  const price = product?.price ?? 0;

  const addToCart = async () => {
    if (!product?.sku) {
      pushToast('Không thể thêm vào giỏ: Sản phẩm không có mã SKU', 'error');
      return;
    }

    if (!isLoggedIn) {
      upsertGuestCartItem({
        sku: product.sku,
        quantity,
        productId,
        productName: product.name || product.title,
        imageUrl: product.imageUrl,
        thumbnailUrl: product.thumbnailUrl,
        price: typeof product.price === 'number' ? product.price : Number(product.price || 0),
      });
      pushToast('Đã thêm vào giỏ tạm thời. Bạn có thể checkout sau khi đăng nhập.', 'success');
      return;
    }

    try {
      const response = await shopApi.addOrUpdateCartItem({ sku: product.sku, quantity });
      if (!response.success) {
        throw new Error(response.message || 'Thêm vào giỏ hàng thất bại');
      }
      pushToast('Đã thêm vào giỏ hàng', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Thêm vào giỏ hàng thất bại', 'error');
    }
  };

  const { ToastContainer } = useToast();

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      {ToastContainer}
      <Surface className="overflow-hidden border-0 bg-white/85 shadow-[0_22px_60px_-36px_rgba(15,23,42,0.45)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-h-80 bg-slate-100">
            {image ? (
              <img src={image} alt={title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center bg-linear-to-br from-emerald-100 to-amber-100 text-sm font-semibold text-slate-600">
                Public product preview
              </div>
            )}
          </div>

          <div className="space-y-5 p-6 sm:p-7">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Sản phẩm công khai</p>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h2>
              <p className="text-sm leading-6 text-slate-600">{product?.description || product?.shortDescription || 'Xem chi tiết sản phẩm, giá tiền, và thông số trước khi thêm vào giỏ.'}</p>
            </div>

            {state.status === 'error' ? <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.message}</div> : null}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-emerald-50 px-4 py-1.5 font-semibold text-emerald-700">{formatCurrency(price)}</span>
              <span className="rounded-full bg-slate-100 px-4 py-1.5 font-semibold text-slate-700">Kho {product?.stock ?? 'N/A'}</span>
              <span className="rounded-full bg-slate-100 px-4 py-1.5 font-semibold text-slate-700">Rating {product?.rating ?? '4.8'}</span>
              <span className="rounded-full bg-slate-100 px-4 py-1.5 font-semibold text-slate-700">Đã bán {product?.soldCount ?? '0'}</span>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              {(product?.badges || ['Public view', 'Add to cart']).map((badge) => (
                <span key={badge} className="rounded-full bg-slate-100 px-3 py-1">{badge}</span>
              ))}
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Số lượng</p>
                  <div className="mt-2 flex w-fit items-center gap-2 rounded-full bg-white p-1 shadow-sm">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>-</Button>
                    <Input value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="w-20 border-0 text-center shadow-none focus:ring-0" />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setQuantity((current) => current + 1)}>+</Button>
                  </div>
                </div>

                <div className="flex flex-1 flex-wrap justify-end gap-2">
                  <Link href="/shop" className="inline-flex items-center justify-center rounded-full bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white">
                    Quay lại danh sách
                  </Link>
                  <Button variant="secondary" size="md" className="rounded-full px-5" onClick={() => void addToCart()}>
                    Thêm vào giỏ
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      <div className="space-y-5">
        <Surface className="border-0 bg-white/85 p-5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin sản phẩm</p>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">SKU</span><span className="mt-1 block font-medium text-slate-900">{product?.sku || '—'}</span></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Bảo hành</span><span className="mt-1 block font-medium text-slate-900">{product?.warranty || '—'}</span></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Xuất xứ</span><span className="mt-1 block font-medium text-slate-900">{product?.origin || '—'}</span></div>
            <div className="rounded-xl bg-slate-50 p-3"><span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Kích thước / cân nặng</span><span className="mt-1 block font-medium text-slate-900">{product?.dimensions || '—'} {product?.weight ? `· ${product.weight}` : ''}</span></div>
          </div>
        </Surface>

        <Surface className="border-0 bg-white/85 p-5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Highlights</p>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            {(product?.highlights?.length ? product.highlights : ['Public detail page', 'No auth required', 'Add to cart from detail']).map((item) => (
              <div key={item} className="rounded-xl bg-slate-50 p-3">{item}</div>
            ))}
          </div>
        </Surface>

        <Surface className="border-0 bg-white/85 p-5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sản phẩm liên quan</p>
          <div className="mt-4 space-y-3">
            {relatedProducts.map((item) => (
              <Link key={item.id} href={`/shop/products/${item.id}`} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm transition hover:bg-slate-50">
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">{item.imageUrl ? <img src={item.imageUrl} alt={item.name || 'related'} className="h-full w-full object-cover" /> : null}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className="text-xs text-slate-500">{formatCurrency(item.price ?? 0)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Surface>
      </div>
    </div>
  );
}
