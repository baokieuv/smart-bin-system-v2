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
import { getRecaptchaToken } from "@/lib/recaptcha";
import { authApi } from "@/services/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@innoeco.com");
  const [password, setPassword] = useState("Admin@123");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLoginSuccess = (accessToken: string, refreshToken: string) => {
    const roles = extractRolesFromAccessToken(accessToken);
    const role = getCmsAccessRole(roles);

    if (!hasCmsAdminAccess(roles) || !role) {
      setMessage("This account does not have access to the CMS.");
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
    setIsSubmitting(true);
    setMessage("");

    try {
      const captcha = await getRecaptchaToken("LOGIN");
      const response = await authApi.loginPassword({ email, password, captcha });

      if (!handleLoginSuccess(response.data.access_token, response.data.refresh_token)) {
        return;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const googleLogin = useGoogleLogin({
    flow: "implicit",
    onSuccess: async (tokenResponse) => {
      setMessage("");
      setIsSubmitting(true);

      try {
        const response = await authApi.loginGoogle({ token: tokenResponse.access_token });

        if (!handleLoginSuccess(response.data.access_token, response.data.refresh_token)) {
          return;
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Google sign-in failed.");
      } finally {
        setIsSubmitting(false);
      }
    },
    onError: () => setMessage("Google sign-in failed."),
  });

  return (
    <AuthShell title="Welcome to Smart Bin" description="Sign in to access the platform as super-admin, admin, or user.">
      <form onSubmit={submit} className="space-y-5">
        {message ? <StatusMessage tone="error" className="mb-4">{message}</StatusMessage> : null}

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Email Address</label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@innoeco.com" required />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-sm font-semibold text-slate-700">Password</label>
            <Link href="/auth/reset-password" className="text-sm text-emerald-700 transition hover:text-emerald-800 hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
              required
            />
            <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </div>
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Or continue with</span>
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
        {isSubmitting ? "Signing in..." : "Continue with Google"}
      </button>

      <p className="mt-5 text-center text-sm text-slate-600">
        Don&apos;t have an account?{" "}
        <Link href="/auth/register" className="font-semibold text-emerald-700 hover:underline">
          Register
        </Link>
      </p>
    </AuthShell>
  );
}
