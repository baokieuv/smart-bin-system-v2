'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import { AuthShell } from '@/components/ui/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';

export default function ChangePasswordPage() {
    const router = useRouter();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrent, setShowCurrent] = useState(false);
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

        if (currentPassword === newPassword) {
            setError('Mật khẩu mới không được trùng với mật khẩu hiện tại.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp.');
            return;
        }
        if (newPassword.length < 8) {
            setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
            return;
        }

        setStatus('loading');

        try {
            await authApi.changePassword({ currentPassword, newPassword, confirmPassword });
            setStatus('success');
        } catch (err: unknown) {
            setStatus('error');
            const message = err instanceof Error ? err.message : '';
            setError(message || 'Mật khẩu hiện tại không đúng hoặc có lỗi xảy ra.');
        }
    };

    return (
        <AuthShell
            title="Change Password"
            description="Update your password regularly to keep your account secure."
        >
            {status === 'success' ? (
                <div className="text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">Password changed</h3>
                    <p className="mt-2 text-sm text-slate-600">Your account password has been updated successfully.</p>
                    <Button onClick={() => router.push('/dashboard')} className="mt-6 w-full" size="lg">
                        Back to Dashboard
                    </Button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                    {error && <StatusMessage tone="error">{error}</StatusMessage>}

                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700">Current Password</label>
                        <div className="relative">
                            <Input
                                type={showCurrent ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                placeholder="Enter current password"
                                className="pr-10"
                                required
                            />
                            <PasswordVisibilityButton open={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />
                        </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                        <div className="mb-4">
                            <label className="mb-1 block text-sm font-semibold text-slate-700">New Password</label>
                            <div className="relative">
                                <Input
                                    type={showNew ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Minimum 8 characters"
                                    className="pr-10"
                                    required
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
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Confirm New Password</label>
                            <div className="relative">
                                <Input
                                    type={showConfirm ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter new password"
                                    className={`pr-10 ${
                                        confirmPassword && confirmPassword !== newPassword
                                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25'
                                            : ''
                                    }`}
                                    required
                                />
                                <PasswordVisibilityButton open={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
                            </div>
                            {confirmPassword && confirmPassword !== newPassword && (
                                <p className="mt-1 text-xs text-rose-600">Passwords do not match</p>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-1.5">
                            {[
                            { label: 'At least 8 characters', check: newPassword.length >= 8 },
                            { label: 'Contains uppercase letter', check: /[A-Z]/.test(newPassword) },
                            { label: 'Contains number', check: /[0-9]/.test(newPassword) },
                            { label: 'Contains special character', check: /[^A-Za-z0-9]/.test(newPassword) },
                        ].map((rule) => (
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

                    <div className="flex gap-3 pt-1">
                        <Button type="button" onClick={() => router.push('/dashboard')} variant="secondary" className="flex-1" size="lg">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={status === 'loading'} className="flex-1" size="lg">
                            {status === 'loading' ? 'Saving...' : 'Change Password'}
                        </Button>
                    </div>
                </form>
            )}
        </AuthShell>
    );
}