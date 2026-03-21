'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import { AuthShell } from '@/components/ui/auth-shell';
import { StatusMessage } from '@/components/ui/status-message';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function ResetPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('loading');
        setMessage('');

        try {
            const data = await authApi.resetPassword(email);
            setStatus('success');
            setMessage(data.data || 'Nếu email hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi.');
        } catch {
            setStatus('error');
            setMessage('Có lỗi xảy ra, vui lòng thử lại sau.');
        }
    };

    return (
        <AuthShell
            title="Reset Password"
            description="Enter your account email and we will send a password reset link."
        >
            {status === 'success' ? (
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Check your inbox</h3>
                    <p className="mt-2 text-sm text-slate-600">{message}</p>
                    <Button onClick={() => router.push('/auth/login')} className="mt-6 w-full" size="lg">
                        Back to Login
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {status === 'error' && <StatusMessage tone="error">{message}</StatusMessage>}

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
                        <Input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <Button type="submit" disabled={status === 'loading'} className="w-full" size="lg">
                        {status === 'loading' ? 'Sending...' : 'Send Reset Link'}
                    </Button>

                    <button
                        type="button"
                        onClick={() => router.push('/auth/login')}
                        className="w-full text-sm font-medium text-slate-600 transition hover:text-slate-900"
                    >
                        Back to Login
                    </button>
                </form>
            )}
        </AuthShell>
    );
}