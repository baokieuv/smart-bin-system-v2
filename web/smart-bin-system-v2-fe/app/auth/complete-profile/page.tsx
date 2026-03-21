'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/services/api/auth';
import { AuthShell } from '@/components/ui/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';

export default function CompleteProfilePage() {
    const router = useRouter();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // States quản lý ẩn/hiện mật khẩu
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
            setError('Mật khẩu xác nhận không khớp!');
            return;
        }

        setIsLoading(true);

        try {
            const data = await authApi.completeProfile(password);

            if (data.success) {
                router.push('/dashboard');
            } else {
                setError(data.message || 'Cập nhật thất bại');
            }
        } catch {
            setError('Lỗi kết nối đến server');
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
                            minLength={6}
                        />
                        <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                </div>

                <div>
                    <label className="mb-1 block text-sm font-semibold text-slate-700">Confirm Password</label>
                    <div className="relative">
                        <Input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="pr-10"
                            required
                        />
                        <PasswordVisibilityButton open={showConfirmPassword} onToggle={() => setShowConfirmPassword(!showConfirmPassword)} />
                    </div>
                </div>

                <Button type="submit" disabled={isLoading} className="w-full" size="lg">
                    {isLoading ? 'Saving...' : 'Complete Profile & Continue'}
                </Button>
            </form>
        </AuthShell>
    );
}