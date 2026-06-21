"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordVisibilityButton } from "@/components/ui/password-visibility-button";
import { StatusMessage } from "@/components/ui/status-message";
import { PASSWORD_MIN_LENGTH, getPasswordRules, getPasswordStrengthScore, isPasswordStrongEnough } from "@/lib/password-policy";
import { authApi } from "@/services/api/auth";
import { useLanguage } from "@/lib/language";

function ConfirmResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language, setLanguage, languageLabels } = useLanguage();

  const token = searchParams.get("token") || "";
  const isInvalidToken = !token;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");

  const strength = getPasswordStrengthScore(newPassword);
  const passwordRules = getPasswordRules(newPassword, t);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (!token) {
      setStatus("error");
      setError((t as any)("invalidResetLink"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError((t as any)("passwordMismatch"));
      return;
    }

    if (!isPasswordStrongEnough(newPassword)) {
      setError((t as any)("passwordTooWeak"));
      return;
    }

    setStatus("loading");

    try {
      await authApi.confirmResetPassword({ token, newPassword });
      setStatus("success");
    } catch {
      setStatus("error");
      setError((t as any)("resetLinkExpired"));
    }
  };

  return (
    <AuthShell title={(t as any)("setNewPasswordTitle")} description={(t as any)("setNewPasswordDesc")}>
  
      {status === "success" ? (
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900">{(t as any)("passwordUpdated")}</h3>
          <p className="mt-2 text-sm text-slate-600">{(t as any)("passwordResetSuccess")}</p>
          <Button onClick={() => router.push("/auth/login")} className="mt-6 w-full" size="lg">
            {(t as any)("goToLogin")}
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {(error || isInvalidToken) ? (
            <StatusMessage tone="error">
              {error || (t as any)("invalidResetLink")}
            </StatusMessage>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t("newPassword")}</label>
            <div className="relative">
              <Input 
                type={showNew ? "text" : "password"} 
                value={newPassword} 
                onChange={(event) => setNewPassword(event.target.value)} 
                placeholder={(t as any)("min8Chars")} 
                className="pr-10" 
                required 
                disabled={isInvalidToken} 
              />
              <PasswordVisibilityButton open={showNew} onToggle={() => setShowNew((value) => !value)} />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t("confirmPassword")}</label>
            <div className="relative">
              <Input 
                type={showConfirm ? "text" : "password"} 
                value={confirmPassword} 
                onChange={(event) => setConfirmPassword(event.target.value)} 
                placeholder={(t as any)("reEnterPassword")} 
                className="pr-10" 
                required 
                disabled={isInvalidToken} 
              />
              <PasswordVisibilityButton open={showConfirm} onToggle={() => setShowConfirm((value) => !value)} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
            {passwordRules.map((rule) => (
              <div key={rule.label} className="flex items-center gap-2 text-xs">
                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${rule.check ? "bg-emerald-500" : "bg-slate-300"}`}>
                  {rule.check ? (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : null}
                </div>
                <span className={rule.check ? "text-emerald-700" : "text-slate-600"}>{rule.label}</span>
              </div>
            ))}
            <p className={`text-xs ${strength <= 1 ? "text-rose-600" : strength === 2 ? "text-amber-600" : strength === 3 ? "text-cyan-700" : "text-emerald-700"}`}>
              {(t as any)("passwordStrength")}: {
                strength === 0 ? "" : 
                strength === 1 ? (t as any)("strengthWeak") : 
                strength === 2 ? (t as any)("strengthFair") : 
                strength === 3 ? (t as any)("strengthGood") : 
                (t as any)("strengthStrong")
              }
            </p>
          </div>

          <Button type="submit" disabled={status === "loading" || isInvalidToken} className="w-full" size="lg">
            {status === "loading" ? (t as any)("processing") : (t as any)("resetPasswordBtn")}
          </Button>

          <button type="button" onClick={() => router.push("/auth/login")} className="w-full text-sm font-medium text-slate-600 transition hover:text-slate-900">
            {(t as any)("backToLogin")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ConfirmResetPasswordPage() {
  return (
    <Suspense 
      fallback={
        <AuthShell title="Set New Password" description="Choose a strong password to secure your account.">
          <div className="text-center text-sm text-slate-600">Loading reset link...</div>
        </AuthShell>
      }
    >
      <ConfirmResetPasswordForm />
    </Suspense>
  );
}