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
import { getRecaptchaToken } from "@/lib/recaptcha";
import { usersApi } from "@/services/api/users";

export default function RegisterPage() {
  const router = useRouter();
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
  const passwordRules = getPasswordRules(password);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus({ type: "", message: "" });

    if (!isPasswordStrongEnough(password)) {
      const message = `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a number, and a special character.`;
      setStatus({ type: "error", message });
      return;
    }

    if (password !== confirmPassword) {
      setStatus({ type: "error", message: "Password confirmation does not match." });
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
        setStatus({ type: "success", message: "Registration successful! Please check your email to activate your account." });
        setTimeout(() => router.push("/auth/login"), 2500);
        return;
      }

      setStatus({ type: "error", message: response.message || "Registration failed" });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Failed to connect to the server" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell title="Create Account" description="Set up your Smart Bin account and start managing devices efficiently.">
      {status.message ? <StatusMessage tone={status.type === "error" ? "error" : "success"} className="mb-4">{status.message}</StatusMessage> : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">First Name</label>
            <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">Last Name</label>
            <Input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
          <div className="relative">
            <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="pr-10" required minLength={PASSWORD_MIN_LENGTH} />
            <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword((value) => !value)} />
          </div>
          {password && (
            <div className="mt-2 space-y-1">
              <div className="mb-1 flex gap-1">
                {[1, 2, 3, 4].map((step) => (
                  <div key={step} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${step <= strength ? (strength <= 1 ? "bg-red-400" : strength === 2 ? "bg-yellow-400" : strength === 3 ? "bg-blue-400" : "bg-green-500") : "bg-slate-200"}`} />
                ))}
              </div>
              <p className={`text-xs ${strength <= 1 ? "text-rose-600" : strength === 2 ? "text-amber-600" : strength === 3 ? "text-cyan-700" : "text-emerald-700"}`}>
                Strength: {strength === 0 ? "" : strength === 1 ? "Weak" : strength === 2 ? "Fair" : strength === 3 ? "Good" : "Strong"}
              </p>
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Confirm Password</label>
          <div className="relative">
            <Input type={showConfirmPassword ? "text" : "password"} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="pr-10" required />
            <PasswordVisibilityButton open={showConfirmPassword} onToggle={() => setShowConfirmPassword((value) => !value)} />
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
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
          {isSubmitting ? "Creating..." : "Register"}
        </Button>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already have an account? <Link href="/auth/login" className="font-semibold text-emerald-700 hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}