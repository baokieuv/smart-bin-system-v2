'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersApi } from '@/services/api/users';
import Link from 'next/link';
import { AuthShell } from '@/components/ui/auth-shell';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusMessage } from '@/components/ui/status-message';
import { PasswordVisibilityButton } from '@/components/ui/password-visibility-button';

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
    });
    const [status, setStatus] = useState({ type: '', message: '' });
    const [isLoading, setIsLoading] = useState(false);

    // State quản lý ẩn/hiện mật khẩu
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus({ type: '', message: '' });
        setIsLoading(true);

        try {
            const data = await usersApi.register(formData);

            if (data.success) {
                setStatus({
                    type: 'success',
                    message: 'Đăng ký thành công! Vui lòng kiểm tra email của bạn để kích hoạt tài khoản.',
                });
                setTimeout(() => router.push('/auth/login'), 3000);
            } else {
                setStatus({ type: 'error', message: data.message || 'Đăng ký thất bại' });
            }
        } catch {
            setStatus({ type: 'error', message: 'Lỗi kết nối đến server' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <AuthShell
            title="Create Account"
            description="Set up your Smart Bin account and start managing devices efficiently."
        >
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
                            minLength={6}
                        />
                        <PasswordVisibilityButton open={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
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