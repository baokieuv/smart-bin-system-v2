'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Surface } from '@/components/ui/surface';

export default function ShopLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/shop';

  const isActive = (path: string) => {
    if (path === '/shop') return pathname === '/shop' || pathname.startsWith('/shop/products');
    return pathname === path || pathname.startsWith(path + '/');
  };

  return (
    <main className="shop-page-bg min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <Surface className="overflow-hidden border-0 bg-white/85 shadow-[0_20px_60px_-36px_rgba(15,23,42,0.45)]">
          <div className="relative px-5 py-5 sm:px-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.12),transparent_40%)]" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">Smart Bin Marketplace</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Shop thiết bị, theo dõi đơn, và mua lại chỉ trong vài giây.</h1>
                <p className="max-w-2xl text-sm text-slate-600">Giao diện mua sắm chạy độc lập với dashboard, ưu tiên thao tác nhanh và đơn giản.</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <Link
                  href="/shop"
                  className={`rounded-full px-4 py-2 transition ${isActive('/shop') ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-700 shadow-sm hover:bg-white'}`}
                >
                  Sản phẩm
                </Link>
                <Link
                  href="/shop/cart"
                  className={`rounded-full px-4 py-2 transition ${isActive('/shop/cart') ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-700 shadow-sm hover:bg-white'}`}
                >
                  Giỏ hàng & đơn hàng
                </Link>
                <Link
                  href="/auth/login"
                  className={`rounded-full px-4 py-2 transition ${isActive('/auth/login') ? 'bg-slate-900 text-white' : 'bg-white/70 text-slate-700 border border-white/70 hover:bg-white'}`}
                >
                  Đăng nhập
                </Link>
              </div>
            </div>
          </div>
        </Surface>

        {children}
      </div>
    </main>
  );
}
