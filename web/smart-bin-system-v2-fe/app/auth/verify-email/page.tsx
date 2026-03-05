'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/services/api/auth';

export default function VerifyEmailPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token') || '';

    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [countdown, setCountdown] = useState(5);

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('Liên kết xác thực không hợp lệ. Vui lòng kiểm tra lại email.');
            return;
        }

        const verify = async () => {
            try {
                const data = await authApi.verifyEmail(token);
                setStatus('success');
                setMessage(data.data || 'Email của bạn đã được xác thực thành công!');
            } catch (err) {
                setStatus('error');
                setMessage('Liên kết xác thực không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu gửi lại email xác thực.');
            }
        };

        verify();
    }, [token]);

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
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg text-center">

                {/* Loading */}
                {status === 'loading' && (
                    <>
                        <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="animate-spin w-8 h-8 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Đang xác thực email...</h2>
                        <p className="text-gray-500 text-sm">Vui lòng chờ trong giây lát</p>
                    </>
                )}

                {/* Success */}
                {status === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Xác thực thành công!</h2>
                        <p className="text-gray-500 text-sm mb-6">{message}</p>

                        {/* Countdown ring */}
                        <div className="flex items-center justify-center mb-6">
                            <div className="relative w-16 h-16">
                                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                                    <circle cx="32" cy="32" r="28" fill="none" stroke="#E5E7EB" strokeWidth="4" />
                                    <circle
                                        cx="32" cy="32" r="28"
                                        fill="none" stroke="#10B981" strokeWidth="4"
                                        strokeDasharray={`${2 * Math.PI * 28}`}
                                        strokeDashoffset={`${2 * Math.PI * 28 * (1 - countdown / 5)}`}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 1s linear' }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-lg font-bold text-green-600">{countdown}</span>
                                </div>
                            </div>
                        </div>
                        <p className="text-gray-400 text-sm mb-4">Tự động chuyển đến trang đăng nhập sau {countdown} giây</p>

                        <button
                            onClick={() => router.push('/auth/login')}
                            className="w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition duration-200"
                        >
                            Đăng nhập ngay
                        </button>
                    </>
                )}

                {/* Error */}
                {status === 'error' && (
                    <>
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Xác thực thất bại</h2>
                        <p className="text-gray-500 text-sm mb-6">{message}</p>

                        <div className="space-y-3">
                            <a
                                href="/auth/resend-verification"
                                className="block w-full py-2.5 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition duration-200 text-center"
                            >
                                Gửi lại email xác thực
                            </a>
                            <button
                                onClick={() => router.push('/auth/login')}
                                className="w-full py-2.5 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition duration-200"
                            >
                                Quay lại đăng nhập
                            </button>
                        </div>
                    </>
                )}

            </div>
        </div>
    );
}