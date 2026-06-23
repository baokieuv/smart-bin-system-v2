"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { authApi } from "@/services/api/auth";
import { useLanguage } from "@/lib/language";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { t } = useLanguage();
  
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const captcha = await getRecaptchaToken("RESET_PASSWORD");
      const response = await authApi.resetPassword(email, captcha);
      setStatus("success");
      // Sử dụng API response hoặc fallback dịch thuật
      setMessage(response.data || t("resetPasswordSuccessFallback"));
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : t("resetPasswordError"));
    }
  };

  return (
    <AuthShell title={t("resetPasswordTitle")} description={t("resetPasswordDesc")}>
      
      {status === "success" ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{t("checkYourInbox")}</h3>
          <p className="mt-2 text-sm text-slate-600">{message}</p>
          <Button onClick={() => router.push("/auth/login")} className="mt-6 w-full" size="lg">
            {t("backToLogin")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {status === "error" ? <StatusMessage tone="error">{message}</StatusMessage> : null}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t("emailAddress")}</label>
            <Input 
              type="email" 
              value={email} 
              onChange={(event) => setEmail(event.target.value)} 
              placeholder="hello@innoeco.com" 
              required 
            />
          </div>

          <Button type="submit" disabled={status === "loading"} className="w-full" size="lg">
            {status === "loading" ? t("sending") : t("sendResetLink")}
          </Button>

          <button type="button" onClick={() => router.push("/auth/login")} className="w-full text-sm font-medium text-slate-600 transition hover:text-slate-900">
            {t("backToLogin")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}