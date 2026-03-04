'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '@/utils/cropImage';

interface UserInfo {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    state: 'ACTIVE' | 'INACTIVE' | string;
}

export default function DashboardPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false); // State quản lý trạng thái đang upload
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    
    // Tham chiếu đến thẻ input file ẩn
    const fileInputRef = useRef<HTMLInputElement>(null);

    // States phục vụ cho việc cắt ảnh
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

    useEffect(() => {
        const fetchUserData = async () => {
            const token = localStorage.getItem('access_token');

            if (!token) {
                router.push('/auth/login');
                return;
            }

            try {
                const response = await fetch('/api/users/me', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                });
                
                const data = await response.json();

                if (response.ok) {
                    setUserInfo(data.data); // Cân nhắc tuỳ thuộc cấu trúc trả về
                } else {
                    localStorage.removeItem('access_token');
                    router.push('/auth/login');
                }
            } catch (error) {
                console.error('Lỗi khi lấy thông tin user:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
    }, [router]);

    // 1. Khi người dùng chọn file, chuyển file thành dạng Base64 URL để hiển thị lên Cropper
    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result?.toString() || null); // Mở Modal cắt ảnh
            });
            reader.readAsDataURL(file);
        }
    };

    // 2. Cập nhật toạ độ vùng cắt khi người dùng di chuột hoặc zoom
    const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    // 3. Xử lý khi bấm nút "Lưu ảnh" trong Modal
    const handleSaveCroppedImage = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        try {
            setIsUploading(true);
            
            // Cắt ảnh thật sự dựa trên toạ độ
            const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (!croppedBlob) throw new Error('Không thể cắt ảnh');

            // Chuyển Blob thành File để tương thích với FormData backend
            const croppedFile = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });

            const token = localStorage.getItem('access_token');
            const formData = new FormData();
            formData.append('file', croppedFile);

            // Đổi URL này thành API upload thực tế của bạn
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/upload-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await response.json();
            
            if (response.ok) {
                const newAvatarUrl = data.data.replace(/^"|"$/g, '');
                
                const timestamp = new Date().getTime();
                const separator = newAvatarUrl.includes('?') ? '&' : '?';
                const finalAvatarUrl = `${newAvatarUrl}${separator}t=${timestamp}`;

                setUserInfo((prev) => prev ? { ...prev, avatarUrl: finalAvatarUrl } : null);
                setImageSrc(null); // Đóng modal
            } else {
                alert(`Lỗi upload: ${data.message}`);
            }
        } catch (error) {
            console.error('Lỗi khi xử lý ảnh:', error);
            alert('Lỗi khi cắt hoặc tải ảnh lên.');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Hàm xử lý khi người dùng chọn ảnh
    const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Tùy chọn: Validate dung lượng hoặc định dạng file ở client
        if (file.size > 5 * 1024 * 1024) { // Giới hạn 5MB
            alert('File quá lớn. Vui lòng chọn ảnh dưới 5MB.');
            return;
        }

        setIsUploading(true);
        const token = localStorage.getItem('access_token');
        const formData = new FormData();
        formData.append('file', file); // 'file' phải khớp với tên tham số MultipartFile ở backend Java

        try {
            // Lưu ý: Đổi URL này thành API upload thực tế của bạn
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/upload-image`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            const data = await response.json();
            
            if (response.ok) {
                // Giả sử API trả về trực tiếp URL dạng string (như code Java bạn gửi lúc trước)
                // Hoặc trả về JSON có chứa url. Bạn linh hoạt điều chỉnh nhé.
                const newAvatarUrl = data.data; 
                
                // Cập nhật lại state để ảnh hiển thị ngay lập tức
                setUserInfo((prev) => prev ? { ...prev, avatarUrl: newAvatarUrl } : null);
                alert('Cập nhật avatar thành công!');
            } else {
                alert(`Lỗi upload: ${data}`);
            }
        } catch (error) {
            console.error('Lỗi khi upload avatar:', error);
            alert('Lỗi kết nối khi upload avatar.');
        } finally {
            setIsUploading(false);
            // Reset giá trị của thẻ input để có thể chọn lại cùng 1 file nếu cần
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const getInitial = () => {
        if (userInfo?.firstName) return userInfo.firstName.charAt(0).toUpperCase();
        if (userInfo?.email) return userInfo.email.charAt(0).toUpperCase();
        return 'U';
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm p-8">

                <div className="flex items-center space-x-6 border-b pb-6 mb-6">
                    {/* Avatar Clickable */}
                    <div 
                        className="relative group cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {userInfo?.avatarUrl ? (
                            <img src={userInfo.avatarUrl} alt="Avatar" className={`w-20 h-20 rounded-full object-cover border-4 border-blue-500 shadow-sm transition duration-200 ${isUploading ? 'opacity-50' : 'group-hover:opacity-75'}`} />
                        ) : (
                            <div className={`w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-3xl font-bold border-4 border-blue-200 transition duration-200 ${isUploading ? 'opacity-50' : 'group-hover:opacity-75'}`}>
                                {getInitial()}
                            </div>
                        )}

                        <div className={`absolute inset-0 bg-black bg-opacity-40 rounded-full flex flex-col items-center justify-center transition-opacity duration-200 ${(isUploading) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                            {isUploading ? (
                                <span className="text-white text-xs">Đang tải...</span>
                            ) : (
                                <span className="text-white text-xs mt-1 font-medium">Thay đổi</span>
                            )}
                        </div>
                    </div>

                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept="image/png, image/jpeg, image/jpg" 
                        className="hidden" 
                    />

                    <div>
                        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                        <p className="text-gray-600 mt-1">
                            Chào mừng <span className="font-semibold">{userInfo?.firstName} {userInfo?.lastName}</span>
                        </p>
                    </div>
                </div>

                {/* Thông tin chi tiết của User */}
                <div className="py-4">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">Thông tin tài khoản</h2>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                        <div className="flex">
                            <span className="w-24 text-gray-500">Email:</span>
                            <span className="font-medium text-gray-800">{userInfo?.email}</span>
                        </div>
                        <div className="flex">
                            <span className="w-24 text-gray-500">Trạng thái:</span>
                            <span className={`font-medium px-2 py-1 rounded text-sm ${userInfo?.state === 'ACTIVE'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-200 text-gray-700'
                                }`}>
                                {userInfo?.state || 'UNKNOWN'}
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={() => {
                        localStorage.removeItem('access_token');
                        router.push('/auth/login');
                    }}
                    className="mt-8 px-6 py-2 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 transition duration-200"
                >
                    Đăng xuất
                </button>

                {/* MODAL CẮT ẢNH */}
                {imageSrc && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
                        <div className="bg-white p-6 rounded-xl shadow-2xl w-[90%] max-w-lg">
                            <h3 className="text-lg font-bold mb-4">Chỉnh sửa ảnh đại diện</h3>
                            
                            {/* Khu vực chứa Cropper */}
                            <div className="relative w-full h-64 bg-gray-200 rounded-lg overflow-hidden">
                                <Cropper
                                    image={imageSrc}
                                    crop={crop}
                                    zoom={zoom}
                                    aspect={1} // Tỉ lệ 1:1 (Hình vuông/Tròn)
                                    cropShape="round" // Hiển thị khung cắt hình tròn
                                    onCropChange={setCrop}
                                    onZoomChange={setZoom}
                                    onCropComplete={onCropComplete}
                                />
                            </div>

                            {/* Thanh trượt Zoom */}
                            <div className="mt-4">
                                <label className="text-sm text-gray-600 block mb-1">Thu phóng</label>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            {/* Các nút hành động */}
                            <div className="mt-6 flex justify-end space-x-3">
                                <button
                                    onClick={() => setImageSrc(null)} // Hủy bỏ
                                    className="px-4 py-2 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                    disabled={isUploading}
                                >
                                    Hủy
                                </button>
                                <button
                                    onClick={handleSaveCroppedImage}
                                    className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg flex items-center"
                                    disabled={isUploading}
                                >
                                    {isUploading ? 'Đang lưu...' : 'Lưu ảnh'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}