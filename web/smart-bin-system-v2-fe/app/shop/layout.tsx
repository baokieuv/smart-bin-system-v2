import Link from 'next/link';
import type { ReactNode } from 'react';
import { Surface } from '@/components/ui/surface';

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <main className="shop-page-bg min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <Surface className="overflow-hidden">
          <div className="border-b border-slate-200/80 bg-white/90 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">Smart Bin Marketplace</p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Mua hàng, xem đơn, và quản lý lại trải nghiệm sau bán hàng.</h1>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <Link
                  href="/shop"
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-slate-700 transition hover:bg-slate-50"
                >
                  Sản phẩm
                </Link>
                <Link
                  href="/shop/cart"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-amber-900 transition hover:bg-amber-100"
                >
                  Giỏ hàng & đơn hàng
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-slate-300 bg-slate-900 px-4 py-2 text-white transition hover:bg-slate-800"
                >
                  Dashboard
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