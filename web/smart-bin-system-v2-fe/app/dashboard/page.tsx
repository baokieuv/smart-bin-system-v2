'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cropper from 'react-easy-crop';
import { getCroppedImg } from '@/utils/cropImage';
import { usersApi } from '@/services/api/users';
import { UserDto } from '@/types/user';

export default function DashboardPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [userInfo, setUserInfo] = useState<UserDto | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

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
                const data = await usersApi.me();

                if (data.success) {
                    setUserInfo(data.data);
                } else {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    router.push('/auth/login');
                }
            } catch (error) {
                console.error('Lỗi khi lấy thông tin user:', error);
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                router.push('/auth/login');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserData();
    }, [router]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result?.toString() || null);
            });
            reader.readAsDataURL(file);
        }
    };

    const onCropComplete = (croppedArea: any, croppedAreaPixels: any) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleSaveCroppedImage = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        try {
            setIsUploading(true);

            const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (!croppedBlob) throw new Error('Không thể cắt ảnh');

            const croppedFile = new File([croppedBlob], "avatar.jpg", { type: "image/jpeg" });

            const formData = new FormData();
            formData.append('file', croppedFile);

            const data = await usersApi.uploadImage(formData);

            if (data.success) {
                const newAvatarUrl = data.data.replace(/^"|"$/g, '');
                const timestamp = new Date().getTime();
                const separator = newAvatarUrl.includes('?') ? '&' : '?';
                const finalAvatarUrl = `${newAvatarUrl}${separator}t=${timestamp}`;

                setUserInfo((prev) => prev ? { ...prev, avatarUrl: finalAvatarUrl } : null);
                setImageSrc(null);
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

    if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const getInitial = () => {
        if (userInfo?.firstName) return userInfo.firstName.charAt(0).toUpperCase();
        if (userInfo?.email) return userInfo.email.charAt(0).toUpperCase();
        return 'U';
    };

    return (
        <div className="min-h-screen bg-gray-100 p-8">
            <div className="max-w-7xl mx-auto bg-white rounded-xl shadow-sm p-8">

                {/* Header: Avatar + tên + actions */}
                <div className="flex items-center justify-between border-b pb-6 mb-6">
                    <div className="flex items-center space-x-6">
                        {/* Avatar Clickable */}
                        <div
                            className="relative group cursor-pointer"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            {userInfo?.avatarUrl ? (
                                <img
                                    src={userInfo.avatarUrl}
                                    alt="Avatar"
                                    className={`w-20 h-20 rounded-full object-cover border-4 border-blue-500 shadow-sm transition duration-200 ${isUploading ? 'opacity-50' : 'group-hover:opacity-75'}`}
                                />
                            ) : (
                                <div className={`w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-3xl font-bold border-4 border-blue-200 transition duration-200 ${isUploading ? 'opacity-50' : 'group-hover:opacity-75'}`}>
                                    {getInitial()}
                                </div>
                            )}

                            <div className={`absolute inset-0 bg-black bg-opacity-40 rounded-full flex flex-col items-center justify-center transition-opacity duration-200 ${isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
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

                    {/* Action buttons (top-right) */}
                    <div className="flex items-center gap-3">
                        {/* Change Password Button */}
                        <button
                            onClick={() => router.push('/auth/change-password')}
                            title="Đổi mật khẩu"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition duration-200 border border-gray-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                            Đổi mật khẩu
                        </button>

                        {/* Logout Button */}
                        <button
                            onClick={() => {
                                localStorage.removeItem('access_token');
                                localStorage.removeItem('refresh_token');
                                router.push('/auth/login');
                            }}
                            title="Đăng xuất"
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition duration-200"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                            </svg>
                            Đăng xuất
                        </button>
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

                {/* MODAL CẮT ẢNH */}
                {imageSrc && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
                        <div className="bg-white p-6 rounded-xl shadow-2xl w-[90%] max-w-lg">
                            <h3 className="text-lg font-bold mb-4">Chỉnh sửa ảnh đại diện</h3>

                            <div className="relative w-full h-64 bg-gray-200 rounded-lg overflow-hidden">
                                <Cropper
                                    image={imageSrc}
                                    crop={crop}
                                    zoom={zoom}
                                    aspect={1}
                                    cropShape="round"
                                    onCropChange={setCrop}
                                    onZoomChange={setZoom}
                                    onCropComplete={onCropComplete}
                                />
                            </div>

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

                            <div className="mt-6 flex justify-end space-x-3">
                                <button
                                    onClick={() => setImageSrc(null)}
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