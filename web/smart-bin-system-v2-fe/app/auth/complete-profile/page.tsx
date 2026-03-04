'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CompleteProfilePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Kiểm tra xem user có token không (phải đăng nhập Google rồi mới được vào đây)
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
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
    const token = localStorage.getItem('access_token');

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/complete-profile`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}` // Truyền token để backend biết là ai
        },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (data.success) {
        // Cập nhật thành công, cho vào thẳng app
        router.push('/dashboard');
      } else {
        setError(data.message || 'Cập nhật thất bại');
      }
    } catch (err) {
      setError('Lỗi kết nối đến server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full p-8 bg-white rounded-xl shadow-lg border-t-4 border-green-500">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">Almost there!</h2>
        <p className="text-center text-gray-600 mb-8 text-sm">
          Please set a password for your account. You can use this password to log in next time instead of Google.
        </p>
        
        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700">Set New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none disabled:opacity-50"
          >
            {isLoading ? 'Saving...' : 'Complete Profile & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}