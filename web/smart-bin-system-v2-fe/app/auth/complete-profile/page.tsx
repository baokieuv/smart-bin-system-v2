'use client';

// First-login profile completion with password setup.

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import { AuthShell } from '@/components/ui/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';
import { PASSWORD_MIN_LENGTH, getPasswordRules, getPasswordStrengthScore, isPasswordStrongEnough } from '@/lib/password-policy';

export default function CompleteProfilePage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Password visibility state
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const strengthColors = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];
    const passwordStrength = getPasswordStrengthScore(password);
    const passwordRules = getPasswordRules(password);

    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            router.push('/auth/login');
        }
    }, [router]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Password confirmation does not match.');
            return;
        }

        if (!isPasswordStrongEnough(password)) {
            setError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a number, and a special character.`);
            return;
        }

        setIsLoading(true);

        try {
            const data = await authApi.completeProfile(password);

            if (data.success) {
                router.push('/dashboard');
            } else {
                setError(data.message || 'Profile update failed');
            }
        } catch {
            setError('Failed to connect to the server');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell
            title="Complete Profile"
            description="Set your account password so you can sign in with email and password later."
        >
            {error && <StatusMessage tone="error" className="mb-4">{error}</StatusMessage>}

            <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Set New Password</label>
                    <div className="relative">
                        <Input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="pr-10"
                            required
                            minLength={PASSWORD_MIN_LENGTH}
                        />
                        <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                    {password && (
                        <div className="mt-2">
                            <div className="mb-1 flex gap-1">
                                {[1, 2, 3, 4].map((i) => (
                                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength ? strengthColors[passwordStrength] : 'bg-slate-200'}`} />
                                ))}
                            </div>
                            <p className={`text-xs ${passwordStrength <= 1 ? 'text-rose-600' : passwordStrength === 2 ? 'text-amber-600' : passwordStrength === 3 ? 'text-cyan-700' : 'text-emerald-700'}`}>
                                Strength: {strengthLabels[passwordStrength]}
                            </p>
                        </div>
                    )}
                </div>

                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Confirm Password</label>
                    <div className="relative">
                        <Input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={`pr-10 ${
                                confirmPassword && confirmPassword !== password
                                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25'
                                    : ''
                            }`}
                            required
                        />
                        <PasswordVisibilityButton open={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} />
                    </div>
                    {confirmPassword && confirmPassword !== password && (
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

                <Button type="submit" disabled={isLoading} className="w-full" size="lg">
                    {isLoading ? 'Saving...' : 'Complete Profile & Continue'}
                </Button>
            </form>
        </AuthShell>
    );
}