import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl text-center space-y-8">
        
        {/* Tiêu đề chính */}
        <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 tracking-tight">
          Welcome to <span className="text-green-600">Smart Bin</span>
        </h1>
        
        {/* Lời giới thiệu */}
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          The intelligent way to monitor, manage, and optimize your waste collection operations in real-time.
        </p>
        
        {/* Khu vực nút bấm */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
          <Link 
            href="/auth/login" 
            className="w-full sm:w-auto px-8 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
          >
            Sign In
          </Link>
          <Link 
            href="/auth/register" 
            className="w-full sm:w-auto px-8 py-3 bg-white text-green-600 font-medium rounded-lg border border-green-600 hover:bg-green-50 transition-colors shadow-sm"
          >
            Create Account
          </Link>
        </div>
        
        {/* Optional: Thêm một chút minh họa hoặc features ở dưới */}
        <div className="pt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 text-left">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg text-gray-900">Real-time Tracking</h3>
            <p className="mt-2 text-gray-500 text-sm">Monitor bin fill-levels instantly using IoT sensors.</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg text-gray-900">Smart Routing</h3>
            <p className="mt-2 text-gray-500 text-sm">Optimize collection routes based on actual needs.</p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-lg text-gray-900">Analytics</h3>
            <p className="mt-2 text-gray-500 text-sm">Gain insights into waste generation patterns.</p>
          </div>
        </div>

      </div>
    </div>
  );
}