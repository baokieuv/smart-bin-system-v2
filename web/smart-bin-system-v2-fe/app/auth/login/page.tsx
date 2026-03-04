'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGoogleLogin } from '@react-oauth/google';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('access_token', data.data.accessToken);
        router.push('/dashboard');
      } else {
        setError(data.message || 'Sai email hoặc mật khẩu');
      }
    } catch (err) {
      setError('Lỗi kết nối đến server');
    }
  };

  // ✅ Đổi sang useGoogleLogin flow="implicit" để lấy access_token thật
  const googleLogin = useGoogleLogin({
    flow: 'implicit',
    onSuccess: async (tokenResponse) => {
      setError('');
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/login-google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: tokenResponse.access_token }), // ✅ access_token
        });
        const data = await res.json();

        if (data.success) {
          localStorage.setItem('access_token', data.data.access_token);

          // console.log(data)

          console.log(data.data.accessToken)

          const meRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${data.data.access_token}` }
          });
          const meData = await meRes.json();

          if (meData.data.state === 'PENDING') {
            router.push('/auth/complete-profile');
          } else {
            router.push('/dashboard');
          }
        } else {
          setError(data.message || 'Đăng nhập Google thất bại');
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
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-green-500 focus:border-green-500"
              required
            />
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

          {/* ✅ Đổi thành button thường gọi googleLogin() */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => googleLogin()}
              className="flex items-center gap-3 px-6 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 text-sm font-medium text-gray-700"
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.14 0 5.95 1.08 8.17 2.85l6.1-6.1C34.46 3.09 29.5 1 24 1 14.82 1 7.07 6.48 3.82 14.18l7.1 5.52C12.6 13.36 17.85 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.1 24.5c0-1.6-.14-3.13-.4-4.6H24v8.71h12.42c-.54 2.9-2.18 5.36-4.65 7.01l7.1 5.52C43.18 37.13 46.1 31.27 46.1 24.5z"/>
                <path fill="#FBBC05" d="M10.92 28.3A14.6 14.6 0 0 1 9.5 24c0-1.49.26-2.93.72-4.3l-7.1-5.52A23.93 23.93 0 0 0 0 24c0 3.86.92 7.5 2.54 10.72l7.1-5.52-.72.1z"/>
                <path fill="#34A853" d="M24 47c5.5 0 10.12-1.82 13.5-4.95l-7.1-5.52C28.6 38.1 26.42 39 24 39c-6.15 0-11.4-3.86-13.28-9.2l-7.1 5.52C7.07 43.52 14.82 47 24 47z"/>
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