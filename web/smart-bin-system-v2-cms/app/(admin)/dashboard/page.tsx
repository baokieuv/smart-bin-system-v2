"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload, getListCount } from "@/lib/admin-utils";
import type { BaseResponse, PagedPayload } from "@/types/core";
import type { NotificationDto } from "@/types/notification";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { notificationsAdminApi } from "@/services/api/notifications-admin";
import { shopAdminApi } from "@/services/api/shop-admin";
import { usersAdminApi } from "@/services/api/users-admin";

interface Stats {
  categories: number;
  products: number;
  orders: number;
  users: number;
  devices: number;
  unreadNotifications: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    categories: 0,
    products: 0,
    orders: 0,
    users: 0,
    devices: 0,
    unreadNotifications: 0,
  });

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Use allSettled so one failing endpoint doesn't prevent other counts from showing
      const results = await Promise.allSettled([
        shopAdminApi.getCategories(),
        shopAdminApi.getProducts({ page: 1, size: 999 }),
        shopAdminApi.getOrders({ page: 1, size: 999 }),
        usersAdminApi.getUsers({ page: 1, size: 999 }),
        devicesAdminApi.getDevices(),
        notificationsAdminApi.getNotifications({ page: 1, size: 200 }),
      ]);

      if (cancelled) return;

      const settledValues = results.map((r) => (r.status === "fulfilled" ? (r as PromiseFulfilledResult<BaseResponse<unknown>>).value : undefined));
      const [catRes, prodRes, orderRes, usersRes, devicesRes, notifRes] = settledValues as Array<BaseResponse<unknown> | undefined>;

      try {
        const notificationList = notifRes
          ? unwrapListPayload<NotificationDto>(notifRes.data as PagedPayload<NotificationDto>)
          : [];

        setStats({
          categories: catRes ? getListCount((catRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          products: prodRes ? getListCount((prodRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          orders: orderRes ? getListCount((orderRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          users: usersRes ? getListCount((usersRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          devices: devicesRes ? getListCount((devicesRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          unreadNotifications: notificationList.filter((item) => !item.isRead).length,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to compute dashboard stats");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const cards = [
    { label: "Categories", value: stats.categories },
    { label: "Products", value: stats.products },
    { label: "Orders", value: stats.orders },
    { label: "Users", value: stats.users },
    { label: "Devices", value: stats.devices },
    { label: "Unread Alerts", value: stats.unreadNotifications },
  ];

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Panel key={card.label} title={card.label}>
            <p className="text-3xl font-semibold text-foreground">{card.value}</p>
          </Panel>
        ))}
      </div>

      <Panel title="CMS Mapping Notes" subtitle="From smart-bin-system-v2-fe user flows to admin operations">
        <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-foreground">Shop Public</p>
            <p>Products public listing/detail to admin-owned category and product lifecycle.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-foreground">Checkout and Orders</p>
            <p>Customer checkout/cart/order detail to admin tracking and status updates.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-foreground">Dashboard Devices</p>
            <p>User dashboard device list and telemetry to fleet-level device governance.</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-foreground">Notifications</p>
            <p>User activity feed to centralized alert triage and read state handling.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}

