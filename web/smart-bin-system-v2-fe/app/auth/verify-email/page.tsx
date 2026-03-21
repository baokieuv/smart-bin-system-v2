'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import Link from 'next/link';
import { AuthShell } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/button';

export default function VerifyEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';
    const hasToken = Boolean(token);

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>(hasToken ? 'loading' : 'error');
    const [message, setMessage] = useState(hasToken ? '' : 'Liên kết xác thực không hợp lệ. Vui lòng kiểm tra lại email.');
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        if (!hasToken) {
            return;
        }

        const verify = async () => {
            try {
                const data = await authApi.verifyEmail(token);
                setStatus('success');
                setMessage(data.data || 'Email của bạn đã được xác thực thành công!');
            } catch {
                setStatus('error');
                setMessage('Liên kết xác thực không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu gửi lại email xác thực.');
            }
        };

        verify();
    }, [token, hasToken]);

    // Countdown & auto redirect after success
    useEffect(() => {
        if (status !== 'success') return;

        const interval = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    router.push('/auth/login');
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [status, router]);

    return (
        <AuthShell
            title="Email Verification"
            description="We are validating your email confirmation link."
            className="text-center"
        >

                {status === 'loading' && (
                    <>
                        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                            <svg className="h-7 w-7 animate-spin text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                        <h2 className="mb-2 text-xl font-bold text-slate-900">Verifying your email...</h2>
                        <p className="text-sm text-slate-600">Please wait a moment.</p>
                    </>
                )}

                {status === 'success' && (
                    <>
                        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <h2 className="mb-2 text-xl font-bold text-slate-900">Email verified</h2>
                        <p className="mb-6 text-sm text-slate-600">{message}</p>

                        <div className="mb-6 flex items-center justify-center">
                            <div className="relative h-16 w-16">
                                <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
                                    <circle cx="32" cy="32" r="28" fill="none" stroke="#E5E7EB" strokeWidth="4" />
                                    <circle
                                        cx="32"
                                        cy="32"
                                        r="28"
                                        fill="none"
                                        stroke="#10B981"
                                        strokeWidth="4"
                                        strokeDasharray={`${2 * Math.PI * 28}`}
                                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - countdown / 5)}`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-lg font-bold text-emerald-600">{countdown}</span>
                                </div>
                            </div>
                        </div>
                        <p className="mb-4 text-sm text-slate-500">Redirecting to login in {countdown} seconds.</p>

                        <Button onClick={() => router.push('/auth/login')} className="w-full" size="lg">Go to Login</Button>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-rose-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="mb-2 text-xl font-bold text-slate-900">Verification failed</h2>
                        <p className="mb-6 text-sm text-slate-600">{message}</p>

                        <div className="space-y-3">
                            <Link href="/auth/resend-verification" className="block">
                                <Button className="w-full" size="lg">Resend Verification Email</Button>
                            </Link>
                            <Button onClick={() => router.push('/auth/login')} variant="secondary" className="w-full" size="lg">
                                Back to Login
                            </Button>
                        </div>
                    </>
                )}
        </AuthShell>
    );
}