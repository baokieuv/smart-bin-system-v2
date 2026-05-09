'use client';

import Link from 'next/link';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Surface } from '@/components/ui/surface';
import { upsertGuestCartItem } from '@/lib/shop-cart';
import { shopApi } from '@/services/api/shop';
import { formatCurrency, unwrapListPayload, useValidAuthToken } from '@/lib/shop-utils';
import { useToast } from '@/components/ui/use-toast';
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
    sku: 'SB-STARTER-001',
    description: 'Bộ sản phẩm nhập môn để lắp đặt nhanh, tối ưu cho demo và triển khai nhỏ.',
    imageUrl: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?auto=format&fit=crop&w=900&q=80',
    category: { id: 'kit', name: 'Kit' },
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
    sku: 'SB-SENSOR-002',
    description: 'Gói cảm biến mở rộng cho bin công nghiệp, hiển thị dữ liệu ổn định trong vận hành thực tế.',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=900&q=80',
    category: { id: 'sensors', name: 'Sensors' },
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
    sku: 'SB-SERVICE-003',
    description: 'Gói phụ kiện và bảo trì định kỳ, phù hợp cho đội vận hành cần thay thế nhanh.',
    imageUrl: 'https://images.unsplash.com/photo-1531538606174-0f90ff5dce83?auto=format&fit=crop&w=900&q=80',
    category: { id: 'service', name: 'Service' },
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
  const [state, setState] = useState<ShopState>({ status: 'idle', products: fallbackProducts });
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const deferredSearch = useDeferredValue(search);
  const isLoggedIn = useValidAuthToken();
  const { pushToast, ToastContainer } = useToast();

  useEffect(() => {
    let cancelled = false;

    const loadProducts = async () => {
      setState((current) => ({ ...current, status: 'loading', message: undefined }));

      try {
        const response = await shopApi.getProducts({ page: 1, size: 24, searchParams: deferredSearch || undefined });
        if (cancelled) return;

        const products = normalizeProducts(response.data);
        setState({ status: 'ready', products: products.length > 0 ? products : fallbackProducts });
      } catch (error) {
        if (cancelled) return;

        const errorMsg = error instanceof Error ? error.message : 'Không tải được danh sách sản phẩm.';
        setState({ status: 'error', message: errorMsg, products: fallbackProducts });
        pushToast(errorMsg, 'error');
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
      if (product.category?.name) unique.add(product.category.name);
    });
    return Array.from(unique);
  }, [state.products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    return state.products.filter((product) => {
      const name = (product.name || product.title || '').toLowerCase();
      const description = (product.description || product.shortDescription || '').toLowerCase();
      const category = (product.category?.name || '').toLowerCase();
      const matchesSearch = !normalizedSearch || name.includes(normalizedSearch) || description.includes(normalizedSearch);
      const matchesCategory = activeCategory === 'Tất cả' || category === activeCategory.toLowerCase();

      return matchesSearch && matchesCategory;
    });
  }, [activeCategory, deferredSearch, state.products]);

  const featured = filteredProducts[0] ?? state.products[0] ?? fallbackProducts[0];

  const handleQuickAdd = async (productId: string, sku: string | undefined) => {
    if (!sku) {
      pushToast('Không thể thêm vào giỏ: Sản phẩm không có mã SKU', 'error');
      return;
    }

    const product = state.products.find((item) => item.id === productId);

    if (!isLoggedIn) {
      upsertGuestCartItem({
        sku,
        quantity: 1,
        productId,
        productName: product?.name || product?.title,
        imageUrl: product?.imageUrl,
        thumbnailUrl: product?.thumbnailUrl,
        price: typeof product?.price === 'number' ? product.price : Number(product?.price || 0),
      });
      pushToast('Đã thêm vào giỏ tạm thời. Bạn có thể checkout sau khi đăng nhập.', 'success');
      return;
    }

    try {
      const response = await shopApi.addOrUpdateCartItem({ sku, quantity: 1 });
      if (!response.success) {
        throw new Error(response.message || 'Thêm vào giỏ hàng thất bại');
      }
      pushToast('Đã thêm vào giỏ hàng', 'success');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'Thêm vào giỏ hàng thất bại', 'error');
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.6fr_0.9fr]">
      {ToastContainer}
      <div className="space-y-5">
        <Surface className="overflow-hidden border-0 bg-white/85 shadow-[0_22px_60px_-36px_rgba(15,23,42,0.45)]">
          <div className="relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.2),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.2),transparent_40%)]" />
            <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">Public shopping catalog</p>
                <h2 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Chọn nhanh, xem gọn, và mua lại chỉ trong vài giây.</h2>
                <p className="max-w-xl text-sm leading-6 text-slate-600 sm:text-base">Danh mục mở cho mọi người, hiển thị rõ giá và tồn kho. Đăng nhập để thêm giỏ, thanh toán, và theo dõi lịch sử đơn.</p>

                <div className="flex flex-wrap gap-3">
                  <Link href="/shop/cart" className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800">
                    Vào giỏ hàng
                  </Link>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="overflow-hidden rounded-3xl bg-slate-900">
                  {featured.imageUrl ? <img src={featured.imageUrl} alt={featured.name || featured.title || 'Featured product'} className="h-48 w-full object-cover sm:h-56" /> : <div className="flex h-48 items-center justify-center text-sm font-semibold text-slate-200">Featured preview</div>}
                </div>
                <div className="rounded-2xl bg-white/90 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Sản phẩm nổi bật</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{featured.name || featured.title}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-emerald-700">{formatCurrency(featured.price ?? 0)}</span>
                    <Link href={`/shop/products/${featured.id}`} className="text-sm font-semibold text-slate-700 hover:text-slate-900">
                      Xem nhanh →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Surface>

        <Surface className="border-0 bg-white/80 p-4 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Tìm sản phẩm</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nhập tên, mô tả, hoặc từ khóa..." />
                </div>
                <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">{filteredProducts.length} kết quả</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${activeCategory === category ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-700 shadow-sm hover:bg-white'}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{state.products.length} sản phẩm</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Đang xem {filteredProducts.length}</span>
            {state.message ? <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{state.message}</span> : null}
          </div>
        </Surface>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const image = product.imageUrl || product.thumbnailUrl || featured.imageUrl || '';
            const title = product.name || product.title || 'Unnamed product';
            const price = product.price ?? 0;

            return (
              <Surface key={product.id} className="overflow-hidden border-0 bg-white/90 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)]">
                <div className="relative aspect-4/3 bg-slate-100">
                  {image ? (
                    <img src={image} alt={title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-linear-to-br from-emerald-100 to-amber-100 text-sm font-semibold text-slate-600">Product preview</div>
                  )}
                  <div className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700">{formatCurrency(price)}</div>
                </div>

                <div className="space-y-3 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{product.category?.name || 'General'}</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
                  </div>

                  <p className="line-clamp-2 text-sm leading-6 text-slate-600">{product.description || product.shortDescription || 'Xem chi tiết để biết thông số, tính năng và tình trạng hàng.'}</p>

                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Còn {product.stock ?? 'nhiều'} {product.unit ?? 'item'}</span>
                    <span>Rating {product.rating ?? '4.8'}</span>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link href={`/shop/products/${product.id}`} className="inline-flex flex-1 items-center justify-center rounded-full bg-white/90 px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-white">
                      Chi tiết
                    </Link>
                    <Button variant="secondary" size="md" className="flex-1 rounded-full" onClick={() => void handleQuickAdd(product.id, product.sku)}>
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
        <Surface className="overflow-hidden border-0 bg-white/85 shadow-[0_20px_60px_-36px_rgba(15,23,42,0.45)]">
          <div className="aspect-4/3 bg-slate-900">
            {featured.imageUrl ? <img src={featured.imageUrl} alt={featured.name || featured.title || 'Featured product'} className="h-full w-full object-cover opacity-95" /> : null}
          </div>
          <div className="space-y-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Sản phẩm nổi bật</p>
              <h3 className="mt-1 text-2xl font-bold text-slate-900">{featured.name || featured.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{featured.description || featured.shortDescription}</p>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-emerald-700">{formatCurrency(featured.price ?? 0)}</span>
              <span className="text-slate-500">Đã bán {featured.soldCount ?? 0}</span>
            </div>

            <Link href={`/shop/products/${featured.id}`} className="block rounded-full bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800">
              Mở trang chi tiết
            </Link>
          </div>
        </Surface>

        <Surface className="border-0 bg-white/80 p-5 shadow-[0_16px_40px_-32px_rgba(15,23,42,0.4)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Vì sao chọn shop</p>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">Cập nhật tồn kho theo thời gian thực từ backend.</div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">Hỗ trợ mua lại nhanh và theo dõi trạng thái đơn hàng.</div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">Giao diện sáng, dễ đọc, tối ưu cho thao tác nhanh.</div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
