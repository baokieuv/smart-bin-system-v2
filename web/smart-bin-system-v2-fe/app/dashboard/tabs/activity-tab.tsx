'use client';

import { Button } from '@/components/ui/button';
import { NotificationDto, NotificationType } from '@/types/notification';

type ActivityFilter = 'all' | 'unread' | 'critical';

type ActivityTabProps = {
  filteredActivities: NotificationDto[];
  selectedActivityIds: Array<string | number>;
  markingActivityIds: Array<string | number>;
  activityFilter: ActivityFilter;
  unreadActivityCount: number;
  selectedVisibleCount: number;
  allVisibleSelected: boolean;
  activityPage: number;
  activityTotalPages: number;
  isActivityLoading: boolean;
  isBatchUpdatingActivities: boolean;
  isMarkingAllActivityRead: boolean;
  criticalTypes: NotificationType[];
  warningTypes: NotificationType[];
  formatTime: (value: string) => string;
  toNotificationLabel: (value: NotificationType) => string;
  onRefresh: () => void;
  onSetFilter: (value: ActivityFilter) => void;
  onMarkAllRead: () => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  onToggleActivitySelection: (id: string | number, checked: boolean) => void;
  onMarkActivityRead: (id: string | number) => void;
  onBatchUpdateSelected: (isRead: boolean) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export default function ActivityTab({
  filteredActivities,
  selectedActivityIds,
  markingActivityIds,
  activityFilter,
  unreadActivityCount,
  selectedVisibleCount,
  allVisibleSelected,
  activityPage,
  activityTotalPages,
  isActivityLoading,
  isBatchUpdatingActivities,
  isMarkingAllActivityRead,
  criticalTypes,
  warningTypes,
  formatTime,
  toNotificationLabel,
  onRefresh,
  onSetFilter,
  onMarkAllRead,
  onToggleSelectAllVisible,
  onToggleActivitySelection,
  onMarkActivityRead,
  onBatchUpdateSelected,
  onPrevPage,
  onNextPage,
}: ActivityTabProps) {
  return (
    <div className="grid h-full min-h-0 w-full min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="order-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:order-2 lg:h-fit">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Operations</p>
            <h2 className="mt-1 text-base font-bold text-slate-900">Activity Timeline</h2>
            <p className="mt-1 text-xs text-slate-600">Inbox controls and quick stats.</p>
          </div>

          <Button type="button" variant="secondary" onClick={onRefresh} disabled={isActivityLoading}>
            {isActivityLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={onMarkAllRead}
            disabled={isMarkingAllActivityRead || unreadActivityCount === 0}
          >
            {isMarkingAllActivityRead ? 'Marking...' : 'Mark All as Read'}
          </Button>
        </div>

        <div className="mt-3 grid gap-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">Unread notifications</p>
            <p className="mt-0.5 text-xl font-bold text-amber-700">{unreadActivityCount}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSetFilter('all')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              activityFilter === 'all' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => onSetFilter('unread')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              activityFilter === 'unread' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Unread
          </button>
          <button
            type="button"
            onClick={() => onSetFilter('critical')}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              activityFilter === 'critical' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            Critical
          </button>
        </div>
      </div>

      <div className="order-1 min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:order-1">
        {isActivityLoading ? (
          <p className="text-sm text-slate-600">Loading activity feed...</p>
        ) : filteredActivities.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">No activities found</h3>
              <p className="mt-1 text-sm text-slate-600">Try another filter or refresh once new notifications are generated.</p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto rounded-xl border border-slate-200">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => onToggleSelectAllVisible(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                />
                <span>Select all on this page</span>
              </label>
              <span>{filteredActivities.length} items</span>
            </div>

            {selectedActivityIds.length > 0 ? (
              <div className="sticky top-9.25 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onBatchUpdateSelected(true)}
                    disabled={isBatchUpdatingActivities}
                  >
                    Mark selected read
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onBatchUpdateSelected(false)}
                    disabled={isBatchUpdatingActivities}
                  >
                    Mark selected unread
                  </Button>
                </div>
                <p className="text-xs font-medium text-slate-600">{selectedVisibleCount} selected</p>
              </div>
            ) : null}

            {filteredActivities.map((item) => {
              const isCritical = criticalTypes.includes(item.type);
              const isWarning = warningTypes.includes(item.type);
              const isChecked = selectedActivityIds.some((itemId) => String(itemId) === String(item.id));

              const badgeClass = isCritical
                ? 'bg-rose-100 text-rose-700'
                : isWarning
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700';

              return (
                <article
                  key={item.id}
                  className={`border-b border-slate-200 px-3 py-2.5 transition last:border-b-0 ${item.isRead ? 'bg-white' : 'bg-slate-50'}`}
                >
                  <div className="flex items-start gap-3">
                    <label className="mt-0.5 flex h-5 items-center">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(event) => onToggleActivitySelection(item.id, event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      />
                    </label>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {!item.isRead ? <span className="h-2 w-2 rounded-full bg-amber-500" /> : null}
                            <h3 className="truncate text-sm font-semibold text-slate-900">{item.title}</h3>
                          </div>
                          <p className="mt-1 truncate text-sm text-slate-600">{item.message}</p>
                        </div>

                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass}`}>
                          {toNotificationLabel(item.type)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>{formatTime(item.createdDate)}</span>
                        <div className="flex items-center gap-2">
                          <span>{item.isRead ? 'Read' : 'Unread'}</span>
                          {!item.isRead ? (
                            <button
                              type="button"
                              onClick={() => onMarkActivityRead(item.id)}
                              className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-100"
                              disabled={markingActivityIds.some((itemId) => String(itemId) === String(item.id))}
                            >
                              {markingActivityIds.some((itemId) => String(itemId) === String(item.id)) ? 'Saving...' : 'Mark as read'}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}

            <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2">
              <Button
                type="button"
                variant="secondary"
                onClick={onPrevPage}
                disabled={isActivityLoading || activityPage <= 1}
              >
                {'<-'}
              </Button>

              <p className="text-xs font-medium text-slate-600">
                Page {Math.max(activityPage, 1)} / {Math.max(activityTotalPages, 1)}
              </p>

              <Button
                type="button"
                variant="secondary"
                onClick={onNextPage}
                disabled={isActivityLoading || activityPage >= Math.max(activityTotalPages, 1)}
              >
                {'->'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
