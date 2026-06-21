"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordVisibilityButton } from "@/components/ui/password-visibility-button";
import { StatusMessage } from "@/components/ui/status-message";
import { getPasswordRules, getPasswordStrengthScore, isPasswordStrongEnough, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { useLanguage } from "@/lib/language";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { usersApi } from "@/services/api/users";

export default function RegisterPage() {
  const router = useRouter();
  // Lấy hàm t() và các state từ context
  const { t, language, setLanguage, languageLabels } = useLanguage();
  
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error" | ""; message: string }>({ type: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const strength = getPasswordStrengthScore(password);
  const passwordRules = getPasswordRules(password, t);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    // Sử dụng t() cho các thông báo lỗi validation
    if (!isPasswordStrongEnough(password)) {
      // Ép kiểu (any) tạm thời nếu bạn chưa kịp update file translations
      setStatus({ type: "error", message: (t as any)("passwordTooWeak") });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: (t as any)("passwordMismatch") });
      return;
    }

    setIsSubmitting(true);

    try {
      const captcha = await getRecaptchaToken("REGISTER");
      const response = await usersApi.register({
        email,
        password,
        name: `${firstName} ${lastName}`.trim(),
        captcha,
      });

      if (response.success) {
        setStatus({ type: "success", message: t("registrationSuccess") });
        setTimeout(() => router.push("/auth/login"), 2500);
        return;
      }

      setStatus({ type: "error", message: response.message || (t as any)("registrationFailed") });
    } catch (error) {
      setStatus({ type: "error", message: (t as any)("serverError") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title={t("createAccount")} description={t("createAccountDescription")}>
      
      {status.message ? (
        <StatusMessage tone={status.type === "error" ? "error" : "success"} className="mb-4">
          {status.message}
        </StatusMessage>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t("firstName")}</label>
            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t("lastName")}</label>
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t("email")}</label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t("passwordLabel")}</label>
          <div className="relative">
            <Input 
              type={showPassword ? "text" : "password"} 
              value={password} 
              onChange={(event) => setPassword(event.target.value)} 
              className="pr-10" 
              required 
              minLength={PASSWORD_MIN_LENGTH} 
            />
            <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </div>
          {password && (
            <div className="mt-2 space-y-1">
              <div className="mb-1 flex gap-1">
                {[1, 2, 3, 4].map((step) => (
                  <div 
                    key={step} 
                    className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                      step <= strength 
                        ? (strength <= 1 ? "bg-red-400" : strength === 2 ? "bg-yellow-400" : strength === 3 ? "bg-blue-400" : "bg-green-500") 
                        : "bg-slate-200"
                    }`} 
                  />
                ))}
              </div>
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
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t("confirmPassword")}</label>
          <div className="relative">
            <Input 
              type={showConfirmPassword ? "text" : "password"} 
              value={confirmPassword} 
              onChange={(event) => setConfirmPassword(event.target.value)} 
              className="pr-10" 
              required 
            />
            <PasswordVisibilityButton open={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
          {/* Lưu ý: Nếu rule.label từ getPasswordRules là tiếng Anh cứng, 
              bạn sẽ cần update logic trong file password-policy.ts để nhận hàm t() */}
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
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
          {isSubmitting ? t("creating") : t("register")}
        </Button>

        <p className="mt-5 text-center text-sm text-slate-600">
          {t("alreadyHaveAccount")} <Link href="/auth/login" className="font-semibold text-emerald-700 hover:underline">{t("signIn")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}