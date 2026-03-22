'use client';

// Confirm password reset using token from email.

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import { AuthShell } from '@/components/ui/auth-shell';
import { StatusMessage } from '@/components/ui/status-message';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';
import { PASSWORD_MIN_LENGTH, getPasswordRules, getPasswordStrengthScore, isPasswordStrongEnough } from '@/lib/password-policy';

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

    const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const strengthColors = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];
    const strength = getPasswordStrengthScore(newPassword);
    const passwordRules = getPasswordRules(newPassword);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!token) {
            setStatus('error');
            setError('The password reset link is invalid. Please request a new one.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Password confirmation does not match.');
            return;
        }
        if (!isPasswordStrongEnough(newPassword)) {
            setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a number, and a special character.`);
            return;
        }

        setStatus('loading');
        try {
            await authApi.confirmResetPassword({ token, newPassword });
            setStatus('success');
        } catch {
            setStatus('error');
            setError('The token is invalid or has expired. Please request a new password reset link.');
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
                            {error || 'The password reset link is invalid. Please request a new one.'}
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

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                        {passwordRules.map((rule) => (
                            <div key={rule.label} className="flex items-center gap-2 text-xs">
                                <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${rule.check ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                                    {rule.check && (
                                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                        </svg>
                                    )}
                                </div>
                                <span className={rule.check ? 'text-emerald-700' : 'text-slate-600'}>{rule.label}</span>
                            </div>
                        ))}
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