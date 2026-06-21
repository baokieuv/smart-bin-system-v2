"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/status-message";
import { authApi } from "@/services/api/auth";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { useLanguage } from "@/lib/language"; // Import hook ngôn ngữ

type VerifyStatus = "loading" | "success" | "error";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language, setLanguage, languageLabels } = useLanguage();

  const token = searchParams.get("token") || "";
  const emailFromQuery = searchParams.get("email") || "";
  const hasToken = Boolean(token);

  const [status, setStatus] = useState<VerifyStatus>(hasToken ? "loading" : "error");
  const [message, setMessage] = useState(hasToken ? "" : t("verifyEmailInvalidLink"));
  const [email, setEmail] = useState(emailFromQuery);
  const [isResending, setIsResending] = useState(false);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!hasToken) return;

    const verify = async () => {
      try {
        const response = await authApi.verifyEmail(token);
        setStatus("success");
        setMessage(response.data || t("verifyEmailSuccess"));
      } catch {
        setStatus("error");
        setMessage(t("verifyEmailExpired"));
      }
    };

    void verify();
  }, [token, hasToken, t]);

  useEffect(() => {
    if (status !== "success") return;

    const interval = window.setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === "success" && countdown === 0) {
      router.push("/auth/login");
    }
  }, [status, countdown, router]);

  const handleResendVerification = async () => {
    const targetEmail = email.trim();

    if (!targetEmail) {
      setMessage(t("verifyEmailEmpty"));
      return;
    }

    try {
      setIsResending(true);
      const captcha = await getRecaptchaToken("RESEND_VERIFICATION");
      await authApi.resendVerification({ email: targetEmail, captcha });

      setCountdown(5);
      setStatus("success");
      setMessage(t("verifyEmailResent"));
    } catch {
      setStatus("error");
      setMessage(t("verifyEmailResendError"));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthShell title={t("verifyEmailTitle")} description={t("verifyEmailDesc")} className="text-center">

      {status === "loading" ? (
        <>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
            <svg className="h-7 w-7 animate-spin text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">{t("confirmingEmail")}</h2>
          <p className="text-sm text-slate-600">{t("pleaseWait")}</p>
        </>
      ) : null}

      {status === "success" ? (
        <>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">{t("emailVerified")}</h2>
          <p className="mb-6 text-sm text-slate-600">{message}</p>

          <p className="mb-4 text-sm text-slate-500">
            {t("takingYouToLogin")} {countdown} {t("seconds")}
          </p>
          <Button onClick={() => router.push("/auth/login")} className="w-full" size="lg">
            {t("goToLogin")}
          </Button>
        </>
      ) : null}

      {status === "error" ? (
        <>
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">{t("verificationFailed")}</h2>
          <p className="mb-6 text-sm text-slate-600">{message}</p>

          <div className="space-y-3">
            {emailFromQuery ? (
              <StatusMessage tone="info" className="text-left">
                {t("sendNewLinkTo")} <span className="font-semibold">{emailFromQuery}</span>
              </StatusMessage>
            ) : (
              <div className="space-y-1 text-left">
                <label htmlFor="verify-email-input" className="block text-sm font-semibold text-slate-700">
                  {t("emailAddress")}
                </label>
                <Input 
                  id="verify-email-input" 
                  type="email" 
                  placeholder="hello@innoeco.com" 
                  value={email} 
                  onChange={(event) => setEmail(event.target.value)} 
                />
              </div>
            )}

            <Button className="w-full" size="lg" onClick={handleResendVerification} disabled={isResending}>
              {isResending ? t("sending") : t("sendNewVerificationLink")}
            </Button>
            <Button onClick={() => router.push("/auth/login")} variant="secondary" className="w-full" size="lg">
              {t("backToLogin")}
            </Button>
          </div>
        </>
      ) : null}
    </AuthShell>
  );
}

// Wrapper component để khởi tạo Suspense
export default function VerifyEmailPage() {
  return (
    <Suspense 
      fallback={
        <AuthShell title="Verify Your Email" description="Just a moment while we confirm your email address.">
          <div className="text-sm text-slate-600">Loading...</div>
        </AuthShell>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}