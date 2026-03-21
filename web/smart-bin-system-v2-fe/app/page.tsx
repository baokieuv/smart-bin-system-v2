import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="home-hero-bg min-h-screen px-4 py-12 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200/70 bg-white/85 p-6 shadow-[0_30px_80px_-44px_rgba(15,23,42,0.55)] backdrop-blur sm:p-10">
        <section className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
          <div className="space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Smart Waste Management</p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Operate your bin network with clarity and confidence.
            </h1>
            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg">
              Smart Bin helps teams monitor fill levels, prioritize collections, and keep service quality high using real-time device signals.
            </p>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition hover:bg-emerald-700"
              >
                Sign In
              </Link>
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Create Account
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-slate-100 shadow-lg">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">Operations Snapshot</p>
            <div className="mt-4 space-y-4">
              {[
                { label: 'Monitored Bins', value: '128' },
                { label: 'Active Devices', value: '124' },
                { label: 'Pickup Efficiency', value: '94%' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3">
                  <span className="text-sm text-slate-300">{item.label}</span>
                  <span className="text-lg font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Real-time Tracking</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Monitor bin fill-levels continuously using live IoT updates.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Smart Routing</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Prioritize pickups where they are needed most to reduce wasted trips.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Analytics</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Discover trends in usage to improve planning and sustainability outcomes.</p>
          </div>
        </section>
      </div>
    </main>
  );
}