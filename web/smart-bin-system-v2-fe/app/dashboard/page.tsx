'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  // Kiểm tra xem đã đăng nhập chưa
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/auth/login'); // Chưa có token thì đuổi ra trang login
    } else {
      setIsLoading(false);
    }
  }, [router]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm p-8">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <p className="mt-4 text-gray-600">Chào mừng bạn đã đăng nhập thành công vào Smart Bin System!</p>
        
        <button 
          onClick={() => {
            localStorage.removeItem('access_token');
            router.push('/auth/login');
          }}
          className="mt-8 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Đăng xuất
        </button>
      </div>
    </div>
  );
}