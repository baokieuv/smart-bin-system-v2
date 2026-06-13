"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { formatDateTime, unwrapListPayload } from "@/lib/admin-utils";
import { notificationsAdminApi } from "@/services/api/notifications-admin";
import type { NotificationDto } from "@/types/notification";

export default function NotificationsPage() {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [message, setMessage] = useState("");
  const [markingId, setMarkingId] = useState<string | number | null>(null);
  const [markAllLoading, setMarkAllLoading] = useState(false);

  const load = async () => {
    const response = await notificationsAdminApi.getNotifications({ page: 1, size: 100 });
    setItems(unwrapListPayload(response.data));
  };

  useEffect(() => {
    void load();
  }, []);

  const mark = async (id: string | number) => {
    try {
      setMarkingId(id);
      await notificationsAdminApi.markAsRead(id);
      setMessage(`InnoEco alert marked as read!`);
      await load();
    } finally {
      setMarkingId(null);
    }
  };

  const markAll = async () => {
    try {
      setMarkAllLoading(true);
      await notificationsAdminApi.readAll();
      setMessage("All InnoEco alerts have been marked as read!");
      await load();
    } finally {
      setMarkAllLoading(false);
    }
  };

  return (
    <Panel
      title="InnoEco System Alerts"
      subtitle="Stay updated and easily manage all your important system notifications in one place."
      action={
        <button
          type="button"
          onClick={() => void markAll()}
          disabled={markAllLoading}
          className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white"
        >
          {markAllLoading ? "Marking..." : "Mark all as read"}
        </button>
      }
    >
      <div className="space-y-3">
        {items.map((item) => (
          <article key={String(item.id)} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-slate-600">{item.type}</p>
                <h3 className="text-base font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.message}</p>
                <p className="mt-1 text-xs text-slate-600">{formatDateTime(item.createdDate)}</p>
              </div>
              {!item.isRead ? (
                <button
                  type="button"
                  onClick={() => void mark(item.id)}
                  disabled={markingId === item.id}
                  className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700"
                >
                  {markingId === item.id ? "Marking..." : "Mark as read"}
                </button>
              ) : (
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Read</span>
              )}
            </div>
          </article>
        ))}
      </div>
      {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
    </Panel>
  );
}