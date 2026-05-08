'use client';

// Login flow with email/password and Google authentication.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { authApi } from '@/services/api/auth';
import Link from 'next/link';
import { AuthShell } from '@/components/ui/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';
import { getRecaptchaToken } from '@/lib/recaptcha';
import { syncGuestCartToServer } from '@/lib/shop-cart';
import { useToast } from '@/components/ui/use-toast';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Password visibility state
    const [showPassword, setShowPassword] = useState(false);
    const { pushToast, ToastContainer } = useToast();

    const redirectAfterLogin = async () => {
        const safeReturnUrl = (() => {
            if (typeof window === 'undefined') return '/dashboard';

            const returnUrl = new URLSearchParams(window.location.search).get('returnUrl');
            return returnUrl && returnUrl.startsWith('/') ? returnUrl : '/dashboard';
        })();

        try {
            await syncGuestCartToServer();
        } catch {
            // Keep login successful even if guest-cart sync fails.
        }

        pushToast('Đăng nhập thành công. Đang chuyển trang...', 'success');
        router.push(safeReturnUrl);
    };

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) {
            return;
        }

        setError('');
        setIsLoading(true);

        try {
            const captcha = await getRecaptchaToken('LOGIN');
            const data = await authApi.loginPassword({ email, password, captcha });

            if (data.success) {
                localStorage.setItem('access_token', data.data.access_token);
                localStorage.setItem('refresh_token', data.data.refresh_token);
                await redirectAfterLogin();
            } else {
                setError(data.message || 'Incorrect email or password');
            }
        } catch (err: unknown) {
            const systemMessage = err instanceof Error ? err.message : '';
            const errorMsg = systemMessage || 'Failed to connect to the server';
            setError(errorMsg);
            pushToast(errorMsg, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const googleLogin = useGoogleLogin({
        flow: 'implicit',
        onSuccess: async (tokenResponse) => {
            setError('');
            try {
                const dataLogin = await authApi.loginGoogle({token: tokenResponse.access_token});

                if (dataLogin.success) {
                    localStorage.setItem('access_token', dataLogin.data.access_token);
                    localStorage.setItem('refresh_token', dataLogin.data.refresh_token);

                    await redirectAfterLogin();
                } else {
                    setError(dataLogin.message || 'Google sign-in failed');
                }
            } catch {
                setError('Google sign-in failed');
            }
        },
        onError: () => setError('Google Login Failed'),
    });

    return (
        <AuthShell
            title="Welcome Back"
            description="Sign in to access your dashboard and monitor smart bins in real time."
        >
            {ToastContainer}
            {error && <StatusMessage tone="error" className="mb-4">{error}</StatusMessage>}

            <form onSubmit={handlePasswordLogin} className="space-y-5">
                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
                    <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
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
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                            required
                        />
                        <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full" size="lg">
                    {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Or continue with</span>
                <div className="h-px flex-1 bg-slate-200" />
            </div>

            <button
                onClick={() => googleLogin()}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.85l6.1-6.1C34.46 3.09 29.5 1 24 1 14.82 1 7.07 6.48 3.82 14.18l7.1 5.52C12.6 13.36 17.85 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.14-3.13-.4-4.6H24v8.71h12.42c-.54 2.9-2.18 5.36-4.65 7.01l7.1 5.52C43.18 37.13 46.1 31.27 46.1 24.5z" />
                    <path fill="#FBBC05" d="M10.92 28.3A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.72-4.3l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.86.92 7.5 2.54 10.72l7.1-5.52-.72.1z" />
                    <path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.5-4.95l-7.1-5.52C28.6 38.1 26.42 39 24 39c-6.15 0-11.4-3.86-13.28-9.2l-7.1 5.52C7.07 43.52 14.82 47 24 47z" />
                </svg>
                Continue with Google
            </button>

            <p className="mt-5 text-center text-sm text-slate-600">
                Do not have an account?{' '}
                <Link href="/auth/register" className="font-semibold text-emerald-700 hover:underline">
                    Register
                </Link>
            </p>

        </AuthShell>
    );
}