"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/categories", label: "Categories" },
  { href: "/products", label: "Products" },
  { href: "/orders", label: "Orders" },
  { href: "/users", label: "Users" },
  { href: "/devices", label: "Devices" },
  { href: "/notifications", label: "Notifications" },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/auth/login");
      return;
    }

    const cachedEmail = localStorage.getItem("admin_email") || "admin@smartbin.local";
    setEmail(cachedEmail);
  }, [router]);

  const title = useMemo(() => {
    const hit = navItems.find((item) => pathname.startsWith(item.href));
    return hit?.label || "Admin";
  }, [pathname]);

  const logout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("admin_email");
    router.push("/auth/login");
  };

  return (
    <div className="min-h-screen bg-sky-50 text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 gap-4 p-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#0b2d45_0%,#134b6f_100%)] p-5 text-white shadow-[0_20px_45px_rgba(14,41,65,0.38)]">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-200">Smart Bin</p>
          <h1 className="mt-2 text-2xl font-semibold">CMS Console</h1>
          <p className="mt-1 text-sm text-cyan-100/85">Control products, categories, and system operations.</p>

          <nav className="mt-6 space-y-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`block rounded-xl px-3 py-2 text-sm font-medium transition ${active ? "bg-white text-slate-900" : "text-cyan-100 hover:bg-white/15"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-xl border border-white/20 bg-white/8 p-3 text-sm">
            <p className="text-cyan-100">Signed in as</p>
            <p className="font-semibold text-white">{email}</p>
            <button
              type="button"
              onClick={logout}
              className="mt-3 w-full rounded-lg border border-white/30 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-white/15"
            >
              Log out
            </button>
          </div>
        </aside>

        <main className="rounded-2xl border border-slate-200 bg-white/60 p-4 shadow-[0_16px_35px_rgba(36,80,130,0.12)] backdrop-blur lg:p-6">
          <header className="mb-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-600">Admin area</p>
            <h2 className="text-2xl font-semibold">{title}</h2>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}

