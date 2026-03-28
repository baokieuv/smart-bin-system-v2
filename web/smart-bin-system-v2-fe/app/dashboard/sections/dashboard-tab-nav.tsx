'use client';

export type DashboardTab = 'devices' | 'account' | 'activity';

type DashboardTabNavProps = {
  activeTab: DashboardTab;
  unreadActivityCount: number;
  onChangeTab: (nextTab: DashboardTab) => void;
};

export default function DashboardTabNav({
  activeTab,
  unreadActivityCount,
  onChangeTab,
}: DashboardTabNavProps) {
  return (
    <div className="flex gap-2 rounded-2xl border border-slate-200/80 bg-white p-2">
      <button
        type="button"
        onClick={() => onChangeTab('devices')}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
          activeTab === 'devices'
            ? 'bg-slate-900 text-white'
            : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
        }`}
      >
        Devices
      </button>
      <button
        type="button"
        onClick={() => onChangeTab('account')}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
          activeTab === 'account'
            ? 'bg-slate-900 text-white'
            : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
        }`}
      >
        Account
      </button>
      <button
        type="button"
        onClick={() => onChangeTab('activity')}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
          activeTab === 'activity'
            ? 'bg-slate-900 text-white'
            : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
        }`}
      >
        <span>Activity</span>
        {unreadActivityCount > 0 ? (
          <span
            className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
              activeTab === 'activity'
                ? 'bg-white text-slate-900'
                : 'bg-rose-600 text-white'
            }`}
          >
            {unreadActivityCount > 99 ? '99+' : unreadActivityCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
