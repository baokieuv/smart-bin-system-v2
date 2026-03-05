'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';
import { authApi } from '@/services/api/auth';
import { LoginRequest } from '@/types/auth';
import { usersApi } from '@/services/api/users';

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    // State quản lý ẩn/hiện mật khẩu
    const [showPassword, setShowPassword] = useState(false);

    const handlePasswordLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        try {
            const data = await authApi.loginPassword({ email, password })

            if (data.success) {
                localStorage.setItem('access_token', data.data.access_token);
                router.push('/dashboard');
            } else {
                setError(data.message || 'Sai email hoặc mật khẩu');
            }
        } catch (err) {
            setError('Lỗi kết nối đến server');
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

                    const userData = await usersApi.me(dataLogin.data.access_token);

                    if (userData.data.state === 'PENDING') {
                        router.push('/auth/complete-profile');
                    } else {
                        router.push('/dashboard');
                    }
                } else {
                    setError(dataLogin.message || 'Đăng nhập Google thất bại');
                }
            } catch (err) {
                setError('Đăng nhập Google thất bại');
            }
        },
        onError: () => setError('Google Login Failed'),
    });

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-8">Smart Bin Login</h2>

                {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">{error}</div>}

                <form onSubmit={handlePasswordLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-green-500 focus:border-green-500"
                            required
                        />
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="block text-sm font-medium text-gray-700">Password</label>
                            {/* ← THÊM LINK QUÊN MẬT KHẨU */}
                            <a
                                href="/auth/reset-password"
                                className="text-sm text-green-600 hover:text-green-700 hover:underline"
                            >
                                Quên mật khẩu?
                            </a>
                        </div>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-green-500 focus:border-green-500"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 focus:outline-none"
                            >
                                {showPassword ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none"
                    >
                        Sign in
                    </button>
                </form>

                <div className="mt-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">Or continue with</span>
                        </div>
                    </div>

                    <div className="mt-6 flex justify-center">
                        <button
                            onClick={() => googleLogin()}
                            className="flex items-center gap-3 px-6 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 text-sm font-medium text-gray-700"
                        >
                            <svg width="20" height="20" viewBox="0 0 48 48">
                                <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.85l6.1-6.1C34.46 3.09 29.5 1 24 1 14.82 1 7.07 6.48 3.82 14.18l7.1 5.52C12.6 13.36 17.85 9.5 24 9.5z" />
                                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.14-3.13-.4-4.6H24v8.71h12.42c-.54 2.9-2.18 5.36-4.65 7.01l7.1 5.52C43.18 37.13 46.1 31.27 46.1 24.5z" />
                                <path fill="#FBBC05" d="M10.92 28.3A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.72-4.3l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.86.92 7.5 2.54 10.72l7.1-5.52-.72.1z" />
                                <path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.5-4.95l-7.1-5.52C28.6 38.1 26.42 39 24 39c-6.15 0-11.4-3.86-13.28-9.2l-7.1 5.52C7.07 43.52 14.82 47 24 47z" />
                            </svg>
                            Continue with Google
                        </button>
                    </div>
                </div>

                <div className="mt-4 text-center text-sm">
                    Don't have an account? <a href="/auth/register" className="text-green-600 hover:underline">Register</a>
                </div>
            </div>
        </div>
    );
}