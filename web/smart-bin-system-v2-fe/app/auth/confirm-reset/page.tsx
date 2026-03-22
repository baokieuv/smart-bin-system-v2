'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import { AuthShell } from '@/components/ui/auth-shell';
import { StatusMessage } from '@/components/ui/status-message';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';

function ConfirmResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';
    const isInvalidToken = !token;

    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [error, setError] = useState('');

    const getPasswordStrength = (pwd: string) => {
        let score = 0;
        if (pwd.length >= 8) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;
        return score;
    };

    const strengthLabels = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];
    const strengthColors = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];
    const strength = getPasswordStrength(newPassword);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!token) {
            setStatus('error');
            setError('Liên kết đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu lại.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp.');
            return;
        }
        if (newPassword.length < 8) {
            setError('Mật khẩu phải có ít nhất 8 ký tự.');
            return;
        }

        setStatus('loading');
        try {
            await authApi.confirmResetPassword({ token, newPassword });
            setStatus('success');
        } catch {
            setStatus('error');
            setError('Token không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu đặt lại mật khẩu mới.');
        }
    };

    return (
        <AuthShell
            title="Set New Password"
            description="Choose a strong password to secure your account."
        >
            {status === 'success' ? (
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Password updated</h3>
                    <p className="mt-2 text-sm text-slate-600">Your password has been reset successfully.</p>
                    <Button onClick={() => router.push('/auth/login')} className="mt-6 w-full" size="lg">
                        Go to Login
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {(error || isInvalidToken) && (
                        <StatusMessage tone="error">
                            {error || 'Liên kết đặt lại mật khẩu không hợp lệ. Vui lòng yêu cầu lại.'}
                        </StatusMessage>
                    )}

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700">New Password</label>
                        <div className="relative">
                            <Input
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minimum 8 characters"
                                className="pr-10"
                                required
                                disabled={isInvalidToken}
                            />
                            <PasswordVisibilityButton open={showNew} onToggle={() => setShowNew(!showNew)} />
                        </div>
                        {newPassword && (
                            <div className="mt-2">
                                <div className="mb-1 flex gap-1">
                                    {[1, 2, 3, 4].map((i) => (
                                        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColors[strength] : 'bg-slate-200'}`} />
                                    ))}
                                </div>
                                <p className={`text-xs ${strength <= 1 ? 'text-rose-600' : strength === 2 ? 'text-amber-600' : strength === 3 ? 'text-cyan-700' : 'text-emerald-700'}`}>
                                    Strength: {strengthLabels[strength]}
                                </p>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700">Confirm Password</label>
                        <div className="relative">
                            <Input
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Re-enter password"
                                className={`pr-10 ${
                                    confirmPassword && confirmPassword !== newPassword
                                        ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25'
                                        : ''
                                }`}
                                required
                                disabled={isInvalidToken}
                            />
                            <PasswordVisibilityButton open={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
                        </div>
                        {confirmPassword && confirmPassword !== newPassword && (
                            <p className="mt-1 text-xs text-rose-600">Passwords do not match</p>
                        )}
                    </div>

                    <Button type="submit" disabled={status === 'loading' || isInvalidToken} className="w-full" size="lg">
                        {status === 'loading' ? 'Processing...' : 'Reset Password'}
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

export default function ConfirmResetPasswordPage() {
    return (
        <Suspense
            fallback={
                <AuthShell
                    title="Set New Password"
                    description="Choose a strong password to secure your account."
                >
                    <div className="text-center text-sm text-slate-600">Loading reset link...</div>
                </AuthShell>
            }
        >
            <ConfirmResetPasswordForm />
        </Suspense>
    );
}