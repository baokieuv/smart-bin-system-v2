import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#e8f3ff] p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(10,132,255,0.2),transparent_35%),radial-gradient(circle_at_78%_15%,rgba(12,190,170,0.2),transparent_35%),radial-gradient(circle_at_50%_88%,rgba(251,146,60,0.18),transparent_40%)]" />
      <main className="relative w-full max-w-3xl rounded-3xl border border-white/70 bg-white/90 p-8 shadow-[0_30px_60px_rgba(18,64,108,0.26)] backdrop-blur sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Smart Bin v2</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Admin CMS</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
          Nhanh chóng quản trị danh mục, sản phẩm, đơn hàng, người dùng, thiết bị và cảnh báo hệ thống từ một bảng điều khiển tập trung.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
          >
            Open dashboard
          </Link>
          <Link
            href="/auth/login"
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Go to login
          </Link>
        </div>
      </main>
    </div>
  );
}

