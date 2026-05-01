"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { authApi } from "@/services/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@smartbin.vn");
  const [password, setPassword] = useState("Admin@123");
  const [message, setMessage] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await authApi.loginPassword({ email, password });

      if (!response.success || !response.data.access_token) {
        setMessage(response.message || "Login failed");
        return;
      }

      localStorage.setItem("access_token", response.data.access_token);
      if (response.data.refresh_token) {
        localStorage.setItem("refresh_token", response.data.refresh_token);
      }
      localStorage.setItem("admin_email", email);
      router.push("/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f2f8ff] p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_25%,rgba(35,140,255,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(12,198,170,0.18),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(251,146,60,0.16),transparent_35%)]" />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-3xl border border-white/70 bg-white/92 p-7 shadow-[0_28px_65px_rgba(16,64,110,0.22)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">Smart Bin</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">CMS Admin Login</h1>
        <p className="mt-2 text-sm text-slate-600">Đăng nhập để quản lý categories, products, orders, users và devices.</p>

        <label className="mt-6 block text-sm font-medium text-slate-700">Email</label>
        <input
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="admin@smartbin.vn"
        />

        <label className="mt-4 block text-sm font-medium text-slate-700">Password</label>
        <input
          type="password"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none transition focus:border-sky-500"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
        />

        {message ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{message}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded-xl bg-[linear-gradient(120deg,#0b3b62,#176ea5)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(22,99,156,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}

