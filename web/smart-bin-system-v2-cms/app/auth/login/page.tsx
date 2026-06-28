"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGoogleLogin } from "@react-oauth/google";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordVisibilityButton } from "@/components/ui/password-visibility-button";
import { StatusMessage } from "@/components/ui/status-message";
import { extractRolesFromAccessToken, getCmsAccessRole, hasCmsAdminAccess } from "@/lib/auth-session";
import { useLanguage } from "@/lib/language";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { authApi } from "@/services/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  
  // Dữ liệu mock (có thể bạn sẽ muốn xóa giá trị mặc định ở production)
  const [email, setEmail] = useState("admin@innoeco.com");
  const [password, setPassword] = useState("Admin@123");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  
  // Tách riêng state loading cho 2 hành động
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  // Biến cờ kiểm tra xem có bất kỳ hành động nào đang tải không để disable form
  const isSubmitting = passwordLoading || googleLoading;

  const handleLoginSuccess = (accessToken: string, refreshToken: string) => {
    const roles = extractRolesFromAccessToken(accessToken);
    const role = getCmsAccessRole(roles);

    if (!hasCmsAdminAccess(roles) || !role) {
      // Đa ngôn ngữ cho lỗi phân quyền
      setMessage(t("loginNoPermission"));
      return false;
    }

    localStorage.setItem("access_token", accessToken);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("admin_roles", JSON.stringify(roles));
    localStorage.setItem("admin_role", role);
    router.push("/dashboard");
    return true;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordLoading(true);
    setMessage("");

    try {
      const captcha = await getRecaptchaToken("LOGIN");
      const response = await authApi.loginPassword({ email, password, captcha });

      if (!handleLoginSuccess(response.data.access_token, response.data.refresh_token)) {
        return;
      }
    } catch (error) {
      // Đa ngôn ngữ cho lỗi kết nối hoặc sai mật khẩu
      setMessage(error instanceof Error ? error.message : t("signInErrorFallback"));
    } finally {
      setPasswordLoading(false);
    }
  };

  const googleLogin = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (tokenResponse) => {
      setMessage("");
      setGoogleLoading(true);

      try {
        const response = await authApi.loginGoogle({ token: tokenResponse.access_token });

        if (!handleLoginSuccess(response.data.access_token, response.data.refresh_token)) {
          return;
        }
      } catch (error) {
        // Đa ngôn ngữ cho lỗi server khi login bằng Google
        setMessage(error instanceof Error ? error.message : t("googleSignInFailed"));
      } finally {
        setGoogleLoading(false);
      }
    },
    // Đa ngôn ngữ cho lỗi popup bị chặn hoặc user hủy
    onError: () => setMessage(t("googleSignInFailed")),
  });

  return (
    <AuthShell title={t("welcomeToInnoEco")} description={t("loginDescription")}>
      
      <form onSubmit={submit} className="space-y-5">
        {message ? <StatusMessage tone="error" className="mb-4">{message}</StatusMessage> : null}

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t("emailAddress")}</label>
          <Input 
            type="email" 
            value={email} 
            onChange={(event) => setEmail(event.target.value)} 
            placeholder="hello@innoeco.com" 
            required 
            disabled={isSubmitting}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-semibold text-slate-700">{t("passwordLabel")}</label>
            <Link href="/auth/reset-password" className="text-sm text-emerald-700 transition hover:text-emerald-800 hover:underline">
              {t("forgotPassword")}
            </Link>
          </div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
              required
              disabled={isSubmitting}
            />
            <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
          {passwordLoading ? t("signingIn") : t("signIn")}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{t("orContinueWith")}</span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={() => googleLogin()}
        disabled={isSubmitting}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.85l6.1-6.1C34.46 3.09 29.5 1 24 1 14.82 1 7.07 6.48 3.82 14.18l7.1 5.52C12.6 13.36 17.85 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.1 24.5c0-1.6-.14-3.13-.4-4.6H24v8.71h12.42c-.54 2.9-2.18 5.36-4.65 7.01l7.1 5.52C43.18 37.13 46.1 31.27 46.1 24.5z" />
          <path fill="#FBBC05" d="M10.92 28.3A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.72-4.3l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.86.92 7.5 2.54 10.72l7.1-5.52-.72.1z" />
          <path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.5-4.95l-7.1-5.52C28.6 38.1 26.42 39 24 39c-6.15 0-11.4-3.86-13.28-9.2l-7.1 5.52C7.07 43.52 14.82 47 24 47z" />
        </svg>
        {/* Chỉ đổi text nếu đang submit bằng google */}
        {googleLoading ? t("signingIn") : t("continueWithGoogle")}
      </button>

      <p className="mt-5 text-center text-sm text-slate-600">
        {t("dontHaveAccount")} {" "}
        <Link href="/auth/register" className="font-semibold text-emerald-700 hover:underline">
          {t("register")}
        </Link>
      </p>
    </AuthShell>
  );
}