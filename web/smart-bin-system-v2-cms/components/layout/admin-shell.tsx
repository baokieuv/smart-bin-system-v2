"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { extractRolesFromAccessToken, getCmsAccessRole, hasCmsAdminAccess } from "@/lib/auth-session";
import { authApi } from "@/services/api/auth";
import { ApiError } from "@/lib/api-client";
// Import thêm TranslationKey để fix lỗi type cho mảng navItems
import { useLanguage, type TranslationKey } from "@/lib/language";

// Định nghĩa kiểu dữ liệu chặt chẽ cho mảng điều hướng
type NavItem = {
  href: string;
  key: TranslationKey;
  roles: string[];
};

const navItems: NavItem[] = [
  { href: "/dashboard", key: "overview", roles: ["super_admin", "admin", "user"] },
  { href: "/tenants", key: "partners", roles: ["super_admin"] },
  { href: "/users", key: "users", roles: ["super_admin", "admin"] },
  { href: "/device-groups", key: "deviceGroups", roles: ["admin"] },
  { href: "/devices", key: "devices", roles: ["super_admin", "admin", "user"] },
  { href: "/firmwares", key: "updatePackages", roles: ["super_admin"] },
  { href: "/firmware-mappings", key: "updateRouting", roles: ["super_admin"] },
  { href: "/notifications", key: "systemAlerts", roles: ["super_admin", "admin", "user"] },
  { href: "/settings", key: "settings", roles: ["super_admin", "admin", "user"] },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<"super_admin" | "admin" | "user" | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const cachedRoles = localStorage.getItem("admin_roles");
    let roles: string[] = [];

    if (cachedRoles) {
      try {
        const parsedRoles = JSON.parse(cachedRoles) as unknown;
        if (Array.isArray(parsedRoles)) {
          roles = parsedRoles.filter((candidate): candidate is string => typeof candidate === "string");
        }
      } catch {
        roles = [];
      }
    }

    if (!roles.length) {
      roles = extractRolesFromAccessToken(token);
    }

    const accessRole = getCmsAccessRole(roles);

    if (!hasCmsAdminAccess(roles) || !accessRole) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("admin_email");
      localStorage.removeItem("admin_roles");
      localStorage.removeItem("admin_role");
      router.push("/auth/login");
      return;
    }

    setRole(accessRole);

    const permittedItems = navItems.filter((item) => item.roles.includes(accessRole));
    const isAllowedRoute = permittedItems.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

    if (!isAllowedRoute) {
      router.replace(permittedItems[0]?.href || "/auth/login");
      return;
    }

    (async () => {
      try {
        const me = await authApi.me();
        if (!me.success) {
          throw new Error(me.message || "Unauthorized");
        }

        const cachedEmail = localStorage.getItem("admin_email") || me.data?.email || "admin@innoeco.com";
        setEmail(cachedEmail);
      } catch (err) {
        const error = err as unknown as Error;
        const isAuthFailure =
          (err instanceof ApiError && err.status === 401) ||
          /No refresh token available|Refresh token failed|Invalid refresh token response|Unauthorized/i.test(error.message);

        if (isAuthFailure) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          localStorage.removeItem("admin_email");
          localStorage.removeItem("admin_roles");
          localStorage.removeItem("admin_role");
          router.push("/auth/login");
          return;
        }

        const cachedEmail = localStorage.getItem("admin_email") || "admin@innoeco.com";
        setEmail(cachedEmail);
      }
    })();
  }, [pathname, router]);

  const title = useMemo(() => {
    const hit = navItems.find((item) => pathname.startsWith(item.href));
    return hit ? t(hit.key) : t("adminHub");
  }, [pathname, t]);

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("admin_email");
    localStorage.removeItem("admin_roles");
    localStorage.removeItem("admin_role");
    router.push("/auth/login");
  };

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => (role ? item.roles.includes(role) : true)),
    [role],
  );

  return (
    <div className="min-h-screen bg-sky-50 text-foreground">
      <div className="mx-auto grid min-h-screen max-w-350 grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#0b2d45_0%,#134b6f_100%)] p-5 text-white shadow-[0_20px_45px_rgba(14,41,65,0.38)]">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">{t("appName")}</p>
          <h1 className="mt-2 text-2xl font-semibold">{t("adminHub")}</h1>
          <p className="mt-1 text-sm text-cyan-100/85">{t("adminHubDescription")}</p>

          <nav className="mt-8 space-y-1">
            {visibleNavItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-white text-slate-900" : "text-cyan-100 hover:bg-white/15"}`}
                >
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-xl border border-white/20 bg-white/8 p-3 text-sm">
            <p className="text-cyan-100">{t("signedInAs")}</p>
            <p className="font-semibold text-white">{email}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-cyan-100/80">
              {role === "super_admin" ? t("fullAccess") : t("limitedAccess")}
            </p>
            <button
              type="button"
              onClick={logout}
              className="mt-3 w-full rounded-lg border border-white/30 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
            >
              {t("signOut")}
            </button>
          </div>
        </aside>

        <main className="rounded-2xl border border-slate-200 bg-white/60 p-4 shadow-[0_16px_35px_rgba(36,80,130,0.12)] backdrop-blur lg:p-6">
          <header className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-600">{t("appName")} {(t as any)("workspace")}</p>
            <h2 className="text-2xl font-semibold">{title}</h2>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}