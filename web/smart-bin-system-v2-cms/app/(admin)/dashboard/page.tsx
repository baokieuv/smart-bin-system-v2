"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload, getListCount } from "@/lib/admin-utils";
import { getCmsAccessRole } from "@/lib/auth-session";
import type { BaseResponse, PagedPayload } from "@/types/core";
import type { DeviceDto } from "@/types/device";
import type { NotificationDto } from "@/types/notification";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { notificationsAdminApi } from "@/services/api/notifications-admin";
import { usersAdminApi } from "@/services/api/users-admin";
import { tenantsAdminApi } from "@/services/api/tenants-admin";
import DeviceLocationMap from "@/components/layout/device-location-map";

interface Stats {
  users: number;
  devices: number;
  tenants: number;
  unreadNotifications: number;
}

export default function DashboardPage() {
  const [role, setRole] = useState<"super_admin" | "admin" | null>(null);
  const [stats, setStats] = useState<Stats>({
    users: 0,
    devices: 0,
    tenants: 0,
    unreadNotifications: 0,
  });
  const [mapDevices, setMapDevices] = useState<DeviceDto[]>([]);

  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const cachedRole = typeof window !== "undefined" ? localStorage.getItem("admin_role") : null;
    if (cachedRole === "super_admin" || cachedRole === "admin") {
      setRole(cachedRole);
    } else {
      const cachedRoles = typeof window !== "undefined" ? localStorage.getItem("admin_roles") : null;
      if (cachedRoles) {
        try {
          const parsedRoles = JSON.parse(cachedRoles) as unknown;
          if (Array.isArray(parsedRoles)) {
            const accessRole = getCmsAccessRole(parsedRoles.filter((candidate): candidate is string => typeof candidate === "string"));
            setRole(accessRole);
          }
        } catch {
          setRole(null);
        }
      }
    }

    const load = async () => {
      // Use allSettled so one failing endpoint doesn't prevent other counts from showing
      const results = await Promise.allSettled([
        usersAdminApi.getUsers({ page: 1, size: 999 }),
        devicesAdminApi.getDevices({ page: 1, size: 1000 }),
        notificationsAdminApi.getNotifications({ page: 1, size: 200 }),
        tenantsAdminApi.getTenants({ page: 1, size: 1 }),
      ]);

      if (cancelled) return;

      const settledValues = results.map((r) => (r.status === "fulfilled" ? (r as PromiseFulfilledResult<BaseResponse<unknown>>).value : undefined));

      const usersRes = settledValues[0] as BaseResponse<unknown> | undefined;
      const devicesRes = settledValues[1] as BaseResponse<unknown> | undefined;
      const notifRes = settledValues[2] as BaseResponse<unknown> | undefined;
      const tenantsRes = settledValues[3] as BaseResponse<unknown> | undefined;

      try {
        const notificationList = notifRes
          ? unwrapListPayload<NotificationDto>(notifRes.data as PagedPayload<NotificationDto>)
          : [];
        const deviceList = devicesRes ? unwrapListPayload<DeviceDto>(devicesRes.data as PagedPayload<DeviceDto>) : [];

        setStats({
          users: usersRes ? getListCount((usersRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          devices: devicesRes ? getListCount((devicesRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          tenants: tenantsRes ? getListCount((tenantsRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          unreadNotifications: notificationList.filter((item) => !item.isRead).length,
        });
        setMapDevices(deviceList);
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
    { label: "Users", value: stats.users },
    { label: "Devices", value: stats.devices },
    { label: "Tenants", value: stats.tenants },
    { label: "Unread Alerts", value: stats.unreadNotifications },
  ].filter((card) => {
    if (role === "admin") {
      return ["Users", "Devices", "Unread Alerts"].includes(card.label);
    }

    return true;
  });

  const notes = [
    {
      title: "Shop Public",
      body: "Products public listing/detail to admin-owned category and product lifecycle.",
      visibleTo: ["super_admin"],
    },
    {
      title: "Checkout and Orders",
      body: "Customer checkout/cart/order detail to admin tracking and status updates.",
      visibleTo: ["super_admin"],
    },
    {
      title: "Dashboard Devices",
      body: "User dashboard device list and telemetry to fleet-level device governance.",
      visibleTo: ["super_admin", "admin"],
    },
    {
      title: "Notifications",
      body: "User activity feed to centralized alert triage and read state handling.",
      visibleTo: ["super_admin", "admin"],
    },
  ].filter((item) => item.visibleTo.includes(role ?? "admin"));

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

      <Panel title="Device Map" subtitle="Static device positions rendered from the CMS dashboard data">
        <DeviceLocationMap devices={mapDevices} className="h-[520px] w-full" />
      </Panel>

      <Panel title="CMS Mapping Notes" subtitle="From smart-bin-system-v2-fe user flows to admin operations">
        <div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          {notes.map((item) => (
            <div key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-foreground">{item.title}</p>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

