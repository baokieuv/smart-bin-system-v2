'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import { shopApi } from '@/services/api/shop';
import { formatCurrency, unwrapListPayload, useAuthToken } from '@/lib/shop-utils';
import type { ProductCardDto, ProductListPayload } from '@/types/shop';

type ShopState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  message?: string;
  products: ProductCardDto[];
};

const fallbackProducts: ProductCardDto[] = [
  {
    id: 'starter-kit',
    name: 'Starter Smart Bin Kit',
    description: 'Bộ sản phẩm nhập môn để lắp đặt nhanh, tối ưu cho demo và triển khai nhỏ.',
    imageUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=900&q=80',
    categoryName: 'Kit',
    price: 1290000,
    oldPrice: 1490000,
    discountPercent: 13,
    stock: 18,
    rating: 4.8,
    soldCount: 128,
    unit: 'set',
    badges: ['Bán chạy', 'Lắp nhanh'],
  },
  {
    id: 'sensor-pack',
    name: 'Sensor Pack Pro',
    description: 'Gói cảm biến mở rộng cho bin công nghiệp, hiển thị dữ liệu ổn định trong vận hành thực tế.',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
    categoryName: 'Sensors',
    price: 690000,
    oldPrice: 790000,
    discountPercent: 12,
    stock: 32,
    rating: 4.7,
    soldCount: 86,
    unit: 'pack',
    badges: ['Public detail', 'IoT ready'],
  },
  {
    id: 'service-refill',
    name: 'Maintenance Refill Bundle',
    description: 'Gói phụ kiện và bảo trì định kỳ, phù hợp cho đội vận hành cần thay thế nhanh.',
    imageUrl: 'https://images.unsplash.com/photo-1531538606174-0f90ff5dce83?auto=format&fit=crop&w=900&q=80',
    categoryName: 'Service',
    price: 450000,
    stock: 44,
    rating: 4.9,
    soldCount: 72,
    unit: 'bundle',
    badges: ['Giao nhanh', 'Phù hợp bảo trì'],
  },
];

const normalizeProducts = (payload: ProductListPayload) => unwrapListPayload<ProductCardDto>(payload);

export default function ShopHomePage() {
  const router = useRouter();
  const [state, setState] = useState<ShopState>({
    status: 'idle',
    products: fallbackProducts,
  });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const deferredSearch = useDeferredValue(search);
  const isLoggedIn = useAuthToken();

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setState((current) => ({ ...current, status: 'loading', message: undefined }));

      try {
        const response = await shopApi.getProducts({ page: 1, size: 24, searchParams: deferredSearch || undefined });
        if (cancelled) return;

        const products = normalizeProducts(response.data);
        setState({
          status: 'ready',
          products: products.length > 0 ? products : fallbackProducts,
        });
      } catch (error) {
        if (cancelled) return;

        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Không tải được danh sách sản phẩm.',
          products: fallbackProducts,
        });
      }
    };

    loadProducts();

    return () => {
      cancelled = true;
    };
  }, [deferredSearch]);

  const categories = useMemo(() => {
    const unique = new Set(['Tất cả']);
    state.products.forEach((product) => {
      if (product.categoryName) unique.add(product.categoryName);
    });

    return Array.from(unique);
  }, [state.products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return state.products.filter((product) => {
      const name = (product.name || product.title || '').toLowerCase();
      const description = (product.description || product.shortDescription || '').toLowerCase();
      const category = (product.categoryName || '').toLowerCase();
      const matchesSearch = !normalizedSearch || name.includes(normalizedSearch) || description.includes(normalizedSearch);
      const matchesCategory = activeCategory === 'Tất cả' || category === activeCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, deferredSearch, state.products]);

  const featured = filteredProducts[0] ?? state.products[0] ?? fallbackProducts[0];

  const handleQuickAdd = async (productId: string) => {
    if (!isLoggedIn) {
      router.push(`/auth/login?returnUrl=${encodeURIComponent(`/shop/products/${productId}`)}`);
      return;
    }

    await shopApi.addOrUpdateCartItem({ productId, quantity: 1 });
    router.push('/shop/cart');
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
      <div className="space-y-5">
        <Surface className="overflow-hidden">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="relative overflow-hidden bg-slate-950 px-6 py-7 text-white sm:px-8 sm:py-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.28),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.24),transparent_38%)]" />
              <div className="relative space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">Public shopping catalog</p>
                <h2 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">Mua nhanh, xem rõ, và quay lại đơn cũ chỉ bằng một chạm.</h2>
                <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                  Danh mục này cho phép xem chi tiết sản phẩm mà không cần đăng nhập, tìm theo tên, thêm vào giỏ khi đã xác thực, và mở lại lịch sử mua hàng từ một màn hình duy nhất.
                </p>

                <div className="flex flex-wrap gap-3">
                  <Link href="/shop/cart" className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
                    Vào giỏ hàng
                  </Link>
                  <Link href="/auth/login" className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10">
                    Đăng nhập để đặt hàng
                  </Link>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-6 py-6 sm:px-8">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tìm sản phẩm</p>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nhập tên mặt hàng..."
                />
                <p className="text-xs text-slate-500">Tìm theo tên, mô tả, hoặc từ khóa sản phẩm.</p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Sản phẩm</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-950">{state.products.length}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Đang xem</p>
                  <p className="mt-2 text-2xl font-bold text-amber-950">{filteredProducts.length}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Đăng nhập</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900">{isLoggedIn ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {state.message ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {state.message}
                </div>
              ) : null}
            </div>
          </div>
        </Surface>

        <Surface className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  activeCategory === category
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </Surface>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const image = product.imageUrl || product.thumbnailUrl || featured.imageUrl || '';
            const title = product.name || product.title || 'Unnamed product';
            const price = product.price ?? 0;

            return (
              <Surface key={product.id} className="overflow-hidden">
                <div className="aspect-[4/3] bg-slate-100">
                  {image ? (
                    <img src={image} alt={title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-emerald-100 to-amber-100 text-sm font-semibold text-slate-600">
                      Product preview
                    </div>
                  )}
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{product.categoryName || 'General'}</p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatCurrency(price)}</span>
                  </div>

                  <p className="line-clamp-3 text-sm leading-6 text-slate-600">
                    {product.description || product.shortDescription || 'Xem chi tiết để biết đầy đủ thông số, tính năng và tình trạng hàng.'}
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    <span className="rounded-full bg-slate-100 px-3 py-1">Còn {product.stock ?? 'nhiều'} hàng</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">Rating {product.rating ?? '4.8'}</span>
                    <span className="rounded-full bg-slate-100 px-3 py-1">{product.unit ?? 'item'}</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/shop/products/${product.id}`}
                      className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Xem chi tiết
                    </Link>
                    <Button className="flex-1" onClick={() => void handleQuickAdd(product.id)}>
                      Thêm vào giỏ
                    </Button>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">
        <Surface className="overflow-hidden">
          <div className="aspect-[4/3] bg-slate-900">
            {featured.imageUrl ? (
              <img src={featured.imageUrl} alt={featured.name || featured.title || 'Featured product'} className="h-full w-full object-cover opacity-95" />
            ) : null}
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Sản phẩm nổi bật</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">{featured.name || featured.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{featured.description || featured.shortDescription}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Giá</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{formatCurrency(featured.price ?? 0)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Đã bán</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{featured.soldCount ?? 0}</p>
              </div>
            </div>

            <Link href={`/shop/products/${featured.id}`} className="block rounded-xl bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800">
              Mở trang chi tiết
            </Link>
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Luồng mua hàng</p>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            <li className="rounded-xl border border-slate-200 bg-slate-50 p-3">1. Xem danh sách sản phẩm công khai và mở chi tiết không cần auth.</li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 p-3">2. Thêm vào giỏ sau khi đăng nhập để lưu trạng thái theo user.</li>
            <li className="rounded-xl border border-slate-200 bg-slate-50 p-3">3. Mở lịch sử đơn hàng để xem payment, shipping, totals, và mua lại.</li>
          </ol>
        </Surface>
      </div>
    </div>
  );
}