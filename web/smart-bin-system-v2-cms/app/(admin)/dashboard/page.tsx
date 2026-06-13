"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import Panel from "@/components/ui/panel";
import DeviceLocationMap from "@/components/layout/device-location-map";
import { unwrapListPayload, getListCount } from "@/lib/admin-utils";
import { getCmsAccessRole } from "@/lib/auth-session";
import { deviceApi } from "@/services/api/device";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { notificationsAdminApi } from "@/services/api/notifications-admin";
import { usersAdminApi } from "@/services/api/users-admin";
import { tenantsAdminApi } from "@/services/api/tenants-admin";
import { usersApi } from "@/services/api/users";
import type { DeviceDto } from "@/types/device";
import type { NotificationDto } from "@/types/notification";
import type { BaseResponse, PagedPayload } from "@/types/core";
import type { UserDto } from "@/types/user";

interface Stats {
  users: number;
  devices: number;
  tenants: number;
  unreadNotifications: number;
}

const withAvatarCacheBuster = (avatarUrl?: string) => {
  if (!avatarUrl) return avatarUrl;

  const sanitizedUrl = usersApi.sanitizeAvatarUrl(avatarUrl);
  if (!sanitizedUrl) return avatarUrl;

  const separator = sanitizedUrl.includes("?") ? "&" : "?";
  return `${sanitizedUrl}${separator}v=${Math.floor(Math.random() * 1_000_000_000)}`;
};

const getInitials = (name?: string, email?: string) => (name || email || "U").trim().slice(0, 1).toUpperCase();

const resolveCmsRole = (candidateRole?: string | null) => {
  if (candidateRole === "super_admin" || candidateRole === "admin" || candidateRole === "user") {
    return candidateRole;
  }

  return null;
};

export default function DashboardPage() {
  const [role, setRole] = useState<"super_admin" | "admin" | "user" | null>(null);
  const [stats, setStats] = useState<Stats>({
    users: 0,
    devices: 0,
    tenants: 0,
    unreadNotifications: 0,
  });
  const [mapDevices, setMapDevices] = useState<DeviceDto[]>([]);
  const [userProfile, setUserProfile] = useState<UserDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const cachedRole = typeof window !== "undefined" ? localStorage.getItem("admin_role") : null;
    const normalizedCachedRole = resolveCmsRole(cachedRole);

    if (normalizedCachedRole) {
      setRole(normalizedCachedRole);
    } else {
      const cachedRoles = typeof window !== "undefined" ? localStorage.getItem("admin_roles") : null;
      if (cachedRoles) {
        try {
          const parsedRoles = JSON.parse(cachedRoles) as unknown;
          if (Array.isArray(parsedRoles)) {
            const accessRole = getCmsAccessRole(parsedRoles.filter((candidate): candidate is string => typeof candidate === "string"));
            setRole(accessRole);
          } else {
            setRole(null);
          }
        } catch {
          setRole(null);
        }
      } else {
        setRole(null);
      }
    }

    const loadUserView = async () => {
      try {
        const [profileResponse, devicesResponse] = await Promise.all([usersApi.me(), deviceApi.getList()]);

        if (cancelled) return;

        if (profileResponse.success) {
          const resolvedRole = resolveCmsRole(profileResponse.data.userRole) ?? "user";
          setUserProfile({
            ...profileResponse.data,
            avatarUrl: profileResponse.data.avatarUrl ? withAvatarCacheBuster(profileResponse.data.avatarUrl) : undefined,
          });

          if (!normalizedCachedRole) {
            setRole(resolvedRole);
          }
        }

        if (devicesResponse.success && Array.isArray(devicesResponse.data)) {
          setMapDevices(devicesResponse.data);
        } else {
          setMapDevices([]);
        }
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Oops! We couldn't load your dashboard right now.");
        setMapDevices([]);
      }
    };

    const loadAdminView = async () => {
      const results = await Promise.allSettled([
        usersAdminApi.getUsers({ page: 1, size: 999 }),
        devicesAdminApi.getDevices({ page: 1, size: 1000 }),
        notificationsAdminApi.getNotifications({ page: 1, size: 200 }),
        tenantsAdminApi.getTenants({ page: 1, size: 1 }),
      ]);

      if (cancelled) return;

      const settledValues = results.map((result) => (result.status === "fulfilled" ? (result as PromiseFulfilledResult<BaseResponse<unknown>>).value : undefined));

      const usersRes = settledValues[0] as BaseResponse<unknown> | undefined;
      const devicesRes = settledValues[1] as BaseResponse<unknown> | undefined;
      const notifRes = settledValues[2] as BaseResponse<unknown> | undefined;
      const tenantsRes = settledValues[3] as BaseResponse<unknown> | undefined;

      try {
        const notificationList = notifRes ? unwrapListPayload<NotificationDto>(notifRes.data as PagedPayload<NotificationDto>) : [];
        const deviceList = devicesRes ? unwrapListPayload<DeviceDto>(devicesRes.data as PagedPayload<DeviceDto>) : [];

        setStats({
          users: usersRes ? getListCount((usersRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          devices: devicesRes ? getListCount((devicesRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          tenants: tenantsRes ? getListCount((tenantsRes.data as PagedPayload<unknown>) ?? undefined) : 0,
          unreadNotifications: notificationList.filter((item) => !item.isRead).length,
        });
        setMapDevices(deviceList);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Oops! We couldn't load your dashboard statistics right now.");
      }
    };

    const load = async () => {
      if (role === "user") {
        await loadUserView();
        return;
      }

      if (role === "super_admin" || role === "admin") {
        await loadAdminView();
        return;
      }

      await loadUserView();
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [role]);

  if (role === "user") {
    const deviceCount = mapDevices.length;
    const onlineCount = mapDevices.filter((device) => String(device.status).toUpperCase() === "ONLINE").length;
    const offlineCount = deviceCount - onlineCount;
    const fullName = userProfile?.name?.trim() || "Your account";

    return (
      <div className="space-y-4">
        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Panel title="My Account" subtitle="Avatar and profile overview">
            <div className="flex flex-col items-center text-center">
              <div className="relative h-24 w-24 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                {userProfile?.avatarUrl ? (
                  <Image src={userProfile.avatarUrl} alt={fullName} fill className="object-cover" sizes="96px" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-sky-100 text-2xl font-semibold text-sky-700">
                    {getInitials(userProfile?.name, userProfile?.email)}
                  </div>
                )}
              </div>

              <h2 className="mt-4 text-2xl font-bold text-foreground">{fullName}</h2>
              <p className="mt-1 text-sm text-slate-600">{userProfile?.email}</p>
              <p className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">
                {role.replaceAll("_", " ")}
              </p>

              <Link
                href="/settings"
                className="mt-4 rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110"
              >
                Edit Profile
              </Link>
            </div>
          </Panel>

          <Panel title="My Devices" subtitle="Live device map and location overview">
            <div style={{ height: 520 }}>
              <DeviceLocationMap devices={mapDevices} className="w-full" />
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Panel title="My Devices">
            <p className="text-3xl font-semibold text-foreground">{deviceCount}</p>
          </Panel>
          <Panel title="Online">
            <p className="text-3xl font-semibold text-foreground">{onlineCount}</p>
          </Panel>
          <Panel title="Offline">
            <p className="text-3xl font-semibold text-foreground">{offlineCount}</p>
          </Panel>
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Active Users", value: stats.users },
    { label: "InnoEco Devices", value: stats.devices },
    { label: "Partner Organizations", value: stats.tenants },
    { label: "Unread Alerts", value: stats.unreadNotifications },
  ].filter((card) => {
    if (role === "admin") {
      return ["Active Users", "InnoEco Devices", "Unread Alerts"].includes(card.label);
    }

    return true;
  });

  const notes = [
    {
      title: "InnoEco Store",
      body: "Manage product listings, categories, and the overall lifecycle of items visible to your customers.",
      visibleTo: ["super_admin"],
    },
    {
      title: "Orders & Fulfillment",
      body: "Keep track of customer orders from the moment they check out to successful delivery.",
      visibleTo: ["super_admin"],
    },
    {
      title: "InnoEco Fleet Status",
      body: "Easily monitor the health, location, and telemetry of all connected InnoEco devices.",
      visibleTo: ["super_admin", "admin"],
    },
    {
      title: "System Alerts",
      body: "Stay on top of important updates, user activities, and centralized alerts in real-time.",
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

      <Panel title="InnoEco Device Map" subtitle="Real-time locations of your deployed InnoEco devices">
        <div style={{ height: 520 }}>
          <DeviceLocationMap devices={mapDevices} className="w-full" />
        </div>
      </Panel>

      <Panel title="Operational Guidelines" subtitle="A quick overview of how platform data is managed within your admin hub">
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