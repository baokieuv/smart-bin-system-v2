'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/services/api/auth';

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
        } catch (err: any) {
            setStatus('error');
            setError(err.message || 'Mật khẩu hiện tại không đúng hoặc có lỗi xảy ra.');
        }
    };

    const EyeIcon = ({ open }: { open: boolean }) => open ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
    ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800">Đổi mật khẩu</h2>
                    <p className="text-gray-500 text-sm mt-2">Cập nhật mật khẩu để bảo mật tài khoản của bạn</p>
                </div>

                {status === 'success' ? (
                    <div className="text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">Đổi mật khẩu thành công!</h3>
                        <p className="text-gray-500 text-sm mb-6">Mật khẩu của bạn đã được cập nhật.</p>
                        <button
                            onClick={() => router.push('/dashboard')}
                            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200"
                        >
                            Quay lại Dashboard
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg flex items-start gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {/* Current Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu hiện tại</label>
                            <div className="relative">
                                <input
                                    type={showCurrent ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Nhập mật khẩu hiện tại"
                                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                    required
                                />
                                <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                                    <EyeIcon open={showCurrent} />
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            {/* New Password */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu mới</label>
                                <div className="relative">
                                    <input
                                        type={showNew ? 'text' : 'password'}
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        placeholder="Tối thiểu 8 ký tự"
                                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                                        required
                                    />
                                    <button type="button" onClick={() => setShowNew(!showNew)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                                        <EyeIcon open={showNew} />
                                    </button>
                                </div>
                                {/* Strength bar */}
                                {newPassword && (
                                    <div className="mt-2">
                                        <div className="flex gap-1 mb-1">
                                            {[1, 2, 3, 4].map((i) => (
                                                <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= strength ? strengthColors[strength] : 'bg-gray-200'}`} />
                                            ))}
                                        </div>
                                        <p className={`text-xs ${strength <= 1 ? 'text-red-500' : strength === 2 ? 'text-yellow-600' : strength === 3 ? 'text-blue-600' : 'text-green-600'}`}>
                                            Độ mạnh: {strengthLabels[strength]}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Confirm Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Xác nhận mật khẩu mới</label>
                                <div className="relative">
                                    <input
                                        type={showConfirm ? 'text' : 'password'}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="Nhập lại mật khẩu mới"
                                        className={`w-full px-3 py-2 pr-10 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:border-transparent transition ${
                                            confirmPassword && confirmPassword !== newPassword
                                                ? 'border-red-400 focus:ring-red-400'
                                                : 'border-gray-300 focus:ring-blue-500'
                                        }`}
                                        required
                                    />
                                    <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                                        <EyeIcon open={showConfirm} />
                                    </button>
                                </div>
                                {confirmPassword && confirmPassword !== newPassword && (
                                    <p className="text-xs text-red-500 mt-1">Mật khẩu không khớp</p>
                                )}
                            </div>
                        </div>

                        {/* Checklist */}
                        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                            {[
                                { label: 'Ít nhất 8 ký tự', check: newPassword.length >= 8 },
                                { label: 'Có chữ hoa', check: /[A-Z]/.test(newPassword) },
                                { label: 'Có số', check: /[0-9]/.test(newPassword) },
                                { label: 'Có ký tự đặc biệt', check: /[^A-Za-z0-9]/.test(newPassword) },
                            ].map((rule) => (
                                <div key={rule.label} className="flex items-center gap-2 text-xs">
                                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${rule.check ? 'bg-green-500' : 'bg-gray-200'}`}>
                                        {rule.check && (
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        )}
                                    </div>
                                    <span className={rule.check ? 'text-green-700' : 'text-gray-500'}>{rule.label}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button
                                type="button"
                                onClick={() => router.push('/dashboard')}
                                className="flex-1 py-2.5 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition duration-200"
                            >
                                Hủy
                            </button>
                            <button
                                type="submit"
                                disabled={status === 'loading'}
                                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition duration-200 flex items-center justify-center gap-2"
                            >
                                {status === 'loading' ? (
                                    <>
                                        <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                        Đang lưu...
                                    </>
                                ) : 'Đổi mật khẩu'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}