'use client';

// Registration flow with shared password policy validation.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/services/api/users';
import Link from 'next/link';
import { AuthShell } from '@/components/ui/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';
import { PASSWORD_MIN_LENGTH, getPasswordRules, getPasswordStrengthScore, isPasswordStrongEnough } from '@/lib/password-policy';
import { getRecaptchaToken } from '@/lib/recaptcha';
import { useToast } from '@/components/ui/use-toast';

export default function RegisterPage() {
    const router = useRouter();
    const { pushToast, ToastContainer } = useToast();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
    });
    const [confirmPassword, setConfirmPassword] = useState('');
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isLoading, setIsLoading] = useState(false);

    // Password visibility state
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const strengthColors = ['', 'bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];
    const passwordStrength = getPasswordStrengthScore(formData.password);
    const passwordRules = getPasswordRules(formData.password);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: '', message: '' });

        if (!isPasswordStrongEnough(formData.password)) {
            const msg = `Password must be at least ${PASSWORD_MIN_LENGTH} characters and include an uppercase letter, a number, and a special character.`;
            setStatus({
                type: 'error',
                message: msg,
            });
            pushToast(msg, 'error');
            return;
        }

        if (formData.password !== confirmPassword) {
            setStatus({ type: 'error', message: 'Password confirmation does not match.' });
            pushToast('Password confirmation does not match.', 'error');
            return;
        }

        setIsLoading(true);

        try {
            const captcha = await getRecaptchaToken('REGISTER');
            const data = await usersApi.register({ ...formData, captcha });

            if (data.success) {
                setStatus({
                    type: 'success',
                    message: 'Registration successful! Please check your email to activate your account.',
                });
                pushToast('Registration successful!', 'success');
                setTimeout(() => router.push('/auth/login'), 3000);
            } else {
                const msg = data.message || 'Registration failed';
                setStatus({ type: 'error', message: msg });
                pushToast(msg, 'error');
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Failed to connect to the server';
            setStatus({ type: 'error', message: msg });
            pushToast(msg, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell
            title="Create Account"
            description="Set up your Smart Bin account and start managing devices efficiently."
        >
            {ToastContainer}
            {status.message && (
                <StatusMessage tone={status.type === 'error' ? 'error' : 'success'} className="mb-4">
                    {status.message}
                </StatusMessage>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700">First Name</label>
                        <Input
                            type="text"
                            name="firstName"
                            value={formData.firstName}
                            onChange={handleChange}
                            required
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-semibold text-slate-700">Last Name</label>
                        <Input
                            type="text"
                            name="lastName"
                            value={formData.lastName}
                            onChange={handleChange}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
                    <Input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
                    <div className="relative">
                        <Input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            className="pr-10"
                            required
                            minLength={PASSWORD_MIN_LENGTH}
                        />
                        <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                    {formData.password && (
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
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className={`pr-10 ${
                                confirmPassword && confirmPassword !== formData.password
                                    ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25'
                                    : ''
                            }`}
                            required
                        />
                        <PasswordVisibilityButton open={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} />
                    </div>
                    {confirmPassword && confirmPassword !== formData.password && (
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
                    {isLoading ? 'Creating...' : 'Register'}
                </Button>
            </form>

            <p className="mt-5 text-center text-sm text-slate-600">
                Already have an account?{' '}
                <Link href="/auth/login" className="font-semibold text-emerald-700 hover:underline">
                    Sign in
                </Link>
            </p>
        </AuthShell>
    );
}