'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import { shopApi } from '@/services/api/shop';
import { formatCurrency, useAuthToken } from '@/lib/shop-utils';
import type { ProductCardDto, ProductDetailDto } from '@/types/shop';

type DetailState = {
  status: 'loading' | 'ready' | 'error';
  message?: string;
  product?: ProductDetailDto;
};

const fallbackRelated: ProductCardDto[] = [
  {
    id: 'sensor-pack',
    name: 'Sensor Pack Pro',
    description: 'Gói cảm biến mở rộng cho bin công nghiệp.',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
    price: 690000,
  },
  {
    id: 'service-refill',
    name: 'Maintenance Refill Bundle',
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
  const isLoggedIn = useAuthToken();

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

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Không tải được chi tiết sản phẩm.',
        });
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
    if (!isLoggedIn) {
      router.push(`/auth/login?returnUrl=${encodeURIComponent(`/shop/products/${productId}`)}`);
      return;
    }

    await shopApi.addOrUpdateCartItem({ productId, quantity });
    router.push('/shop/cart');
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
      <Surface className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="min-h-80 bg-slate-100">
            {image ? (
              <img src={image} alt={title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full min-h-80 items-center justify-center bg-gradient-to-br from-emerald-100 to-amber-100 text-sm font-semibold text-slate-600">
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

            {state.status === 'error' ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.message}</div>
            ) : null}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Giá</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{formatCurrency(price)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kho</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{product?.stock ?? 'N/A'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Đánh giá</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{product?.rating ?? '4.8'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Đã bán</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{product?.soldCount ?? '0'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
              {(product?.badges || ['Public view', 'Add to cart']).map((badge) => (
                <span key={badge} className="rounded-full bg-slate-100 px-3 py-1">{badge}</span>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Số lượng</p>
                  <div className="mt-2 flex w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white p-1">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>
                      -
                    </Button>
                    <Input
                      value={quantity}
                      onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
                      className="w-20 border-0 text-center shadow-none focus:ring-0"
                    />
                    <Button type="button" variant="ghost" size="sm" onClick={() => setQuantity((current) => current + 1)}>
                      +
                    </Button>
                  </div>
                </div>

                <div className="flex flex-1 flex-wrap justify-end gap-2">
                  <Link href="/shop" className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
                    Quay lại danh sách
                  </Link>
                  <Button onClick={() => void addToCart()} className="px-5">
                    Thêm vào giỏ
                  </Button>
                </div>
              </div>

              {!isLoggedIn ? (
                <p className="mt-3 text-xs text-slate-500">
                  Bạn vẫn có thể xem chi tiết công khai, nhưng cần đăng nhập để thêm vào giỏ hàng.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </Surface>

      <div className="space-y-5">
        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin sản phẩm</p>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">SKU</span>
              <span className="mt-1 block font-medium text-slate-900">{product?.sku || '—'}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Bảo hành</span>
              <span className="mt-1 block font-medium text-slate-900">{product?.warranty || '—'}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Xuất xứ</span>
              <span className="mt-1 block font-medium text-slate-900">{product?.origin || '—'}</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Kích thước / cân nặng</span>
              <span className="mt-1 block font-medium text-slate-900">{product?.dimensions || '—'} {product?.weight ? `· ${product.weight}` : ''}</span>
            </div>
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Highlights</p>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            {(product?.highlights?.length ? product.highlights : ['Public detail page', 'No auth required', 'Add to cart from detail']).map((item) => (
              <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3">{item}</div>
            ))}
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sản phẩm liên quan</p>
          <div className="mt-4 space-y-3">
            {relatedProducts.map((item) => (
              <Link key={item.id} href={`/shop/products/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-slate-300 hover:bg-slate-50">
                <div className="h-14 w-14 overflow-hidden rounded-xl bg-slate-100">
                  {item.imageUrl ? <img src={item.imageUrl} alt={item.name || 'related'} className="h-full w-full object-cover" /> : null}
                </div>
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