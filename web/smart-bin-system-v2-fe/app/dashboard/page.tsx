'use client';

import Cropper, { Area } from 'react-easy-crop';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { mockDevices } from '../../lib/mock-devices';
import { usersApi } from '@/services/api/users';
import { UserDto } from '@/types/user';
import { useRouter } from 'next/navigation';
import { getCroppedImg } from '@/utils/cropImage';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastStack } from '@/components/ui/toast-stack';

type Toast = {
    id: number;
    message: string;
    type: 'success' | 'error';
};

const getDotPosition = (latitude: number, longitude: number) => {
    const x = ((longitude + 180) / 360) * 100;
    const y = ((90 - latitude) / 180) * 100;

    return {
        x: Math.min(Math.max(x, 8), 92),
        y: Math.min(Math.max(y, 8), 92),
    };
};

const formatTime = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

export default function DashboardPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [userInfo, setUserInfo] = useState<UserDto | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAddDevicePopupOpen, setIsAddDevicePopupOpen] = useState(false);
    const [macAddress, setMacAddress] = useState('');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);

    useEffect(() => {
        const fetchUser = async () => {
            const token = localStorage.getItem('access_token');
            if (!token) {
                router.push('/auth/login');
                return;
            }

            try {
                const response = await usersApi.me();
                if (response.success) {
                    setUserInfo(response.data);
                } else {
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    router.push('/auth/login');
                }
            } catch {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                router.push('/auth/login');
            } finally {
                setIsLoading(false);
            }
        };

        fetchUser();
    }, [router]);

    const selectedDevice = useMemo(
        () => mockDevices.find((device) => device.id === selectedDeviceId) ?? null,
        [selectedDeviceId],
    );

    const pushToast = (message: string, type: Toast['type']) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((prev) => [...prev, { id, message, type }]);

        window.setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 2500);
    };

    const selectedDotPosition = selectedDevice
        ? getDotPosition(selectedDevice.latitude, selectedDevice.longitude)
        : null;

    const userInitial = userInfo?.firstName?.charAt(0).toUpperCase() ?? userInfo?.email?.charAt(0).toUpperCase() ?? 'U';
    const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files.length > 0) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                setImageSrc(reader.result?.toString() || null);
            });
            reader.readAsDataURL(file);
        }
    };

    const onCropComplete = (_croppedArea: Area, newCroppedAreaPixels: Area) => {
        setCroppedAreaPixels(newCroppedAreaPixels);
    };

    const handleSaveCroppedImage = async () => {
        if (!imageSrc || !croppedAreaPixels) return;

        try {
            setIsUploading(true);

            const croppedBlob = await getCroppedImg(imageSrc, croppedAreaPixels);
            if (!croppedBlob) {
                throw new Error('Cannot crop image');
            }

            const croppedFile = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
            const formData = new FormData();
            formData.append('file', croppedFile);

            const response = await usersApi.uploadImage(formData);

            if (response.success) {
                const newAvatarUrl = response.data.replace(/^"|"$/g, '');
                const timestamp = Date.now();
                const separator = newAvatarUrl.includes('?') ? '&' : '?';
                const finalAvatarUrl = `${newAvatarUrl}${separator}t=${timestamp}`;

                setUserInfo((prev) => (prev ? { ...prev, avatarUrl: finalAvatarUrl } : prev));
                setImageSrc(null);
                pushToast('Avatar updated successfully.', 'success');
            } else {
                pushToast(response.message || 'Failed to update avatar.', 'error');
            }
        } catch {
            pushToast('Failed to update avatar.', 'error');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleAddDevice = () => {
        if (!MAC_PATTERN.test(macAddress.trim())) {
            pushToast('Add device failed. Invalid MAC address format.', 'error');
            return;
        }

        setIsAddDevicePopupOpen(false);
        setMacAddress('');
        pushToast('Device added successfully (UI demo).', 'success');
    };

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center text-slate-700">Loading...</div>;
    }

    return (
        <div className="min-h-screen px-4 py-5 md:px-6 md:py-7">
            <Surface className="mx-auto flex h-[calc(100vh-2.5rem)] w-full max-w-screen-2xl flex-col gap-4 p-4 md:h-[calc(100vh-3.5rem)] md:p-5">
                <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Smart Bin Platform</p>
                        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Device Dashboard</h1>
                    </div>

                    <div className="relative flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="group relative"
                            aria-label="Update avatar"
                        >
                            {userInfo?.avatarUrl ? (
                                <img
                                    src={userInfo.avatarUrl}
                                    alt="User avatar"
                                    className={`h-11 w-11 rounded-full border border-slate-300 object-cover ${isUploading ? 'opacity-60' : ''}`}
                                />
                            ) : (
                                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-slate-200 font-bold text-slate-700">
                                    {userInitial}
                                </div>
                            )}

                            <span className="pointer-events-none absolute inset-0 hidden items-center justify-center rounded-full bg-black/45 text-[10px] font-semibold text-white group-hover:flex">
                                Edit
                            </span>
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={handleFileChange}
                            accept="image/png, image/jpeg, image/jpg"
                            className="hidden"
                        />

                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen((prev) => !prev)}
                            className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                            User Settings
                        </button>

                        {isSettingsOpen && (
                            <div className="absolute right-0 top-14 z-20 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                                <p className="text-sm font-semibold text-slate-900">{userInfo?.firstName} {userInfo?.lastName}</p>
                                <p className="mb-3 text-xs text-slate-500">{userInfo?.email}</p>

                                <div className="space-y-2">
                                    <Link
                                        href="#"
                                        onClick={(event) => {
                                            event.preventDefault();
                                            setIsSettingsOpen(false);
                                            setIsAddDevicePopupOpen(true);
                                        }}
                                        className="block rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                                    >
                                        Add Device
                                    </Link>
                                    <Link
                                        href="/auth/change-password"
                                        className="block rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                    >
                                        Change Password
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            localStorage.removeItem('access_token');
                                            localStorage.removeItem('refresh_token');
                                            router.push('/auth/login');
                                        }}
                                        className="w-full rounded-xl bg-rose-600 px-3 py-2 text-left text-sm font-semibold text-white transition hover:bg-rose-700"
                                    >
                                        Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex gap-2 rounded-2xl border border-slate-200/80 bg-white p-2">
                    <button type="button" className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                        Devices
                    </button>
                    <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                        Account
                    </button>
                    <button type="button" className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                        Activity
                    </button>
                </div>

                <section className="relative flex min-h-0 flex-1 gap-4 overflow-hidden">
                    {!selectedDevice && (
                        <aside className="h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:w-[30%]">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <h2 className="text-lg font-bold text-slate-900">Your Devices</h2>
                                <p className="text-sm text-slate-500">Select a card to view details on the right.</p>
                            </div>

                            <div className="h-[calc(100%-4.25rem)] space-y-3 overflow-y-auto p-3">
                                {mockDevices.map((device) => (
                                    <button
                                        key={device.id}
                                        type="button"
                                        onClick={() => setSelectedDeviceId(device.id)}
                                        className="w-full rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="font-semibold text-slate-900">{device.name}</p>
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs font-bold ${
                                                    device.status === 'online'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}
                                            >
                                                {device.status}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs font-medium tracking-wide text-slate-500">MAC: {device.macAddress}</p>
                                    </button>
                                ))}
                            </div>
                        </aside>
                    )}

                    <div className={`relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 ${selectedDevice ? 'w-[60%]' : 'flex-1'}`}>
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.25),transparent_30%),radial-gradient(circle_at_70%_80%,rgba(239,68,68,0.25),transparent_28%),linear-gradient(120deg,#0f172a_10%,#1e293b_50%,#0f172a_95%)]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-size-[36px_36px]" />

                        <div
                            className="absolute inset-0 transition-transform duration-500"
                            style={{
                                transform:
                                    selectedDevice && selectedDotPosition
                                        ? `scale(1.8) translate(${(50 - selectedDotPosition.x) / 1.8}%, ${(50 - selectedDotPosition.y) / 1.8}%)`
                                        : 'scale(1)',
                            }}
                        >
                            {mockDevices.map((device) => {
                                const dot = getDotPosition(device.latitude, device.longitude);

                                return (
                                    <button
                                        key={device.id}
                                        type="button"
                                        onClick={() => setSelectedDeviceId(device.id)}
                                        className="group absolute -translate-x-1/2 -translate-y-1/2"
                                        style={{ left: `${dot.x}%`, top: `${dot.y}%` }}
                                        aria-label={`Open ${device.name}`}
                                    >
                                        <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/35 blur-sm" />
                                        <span
                                            className={`relative block h-4 w-4 rounded-full border-2 border-white shadow-[0_0_0_4px_rgba(239,68,68,0.25)] ${
                                                selectedDeviceId === device.id ? 'bg-red-400' : 'bg-red-500'
                                            }`}
                                        />
                                        <span className="absolute left-1/2 top-6 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-white group-hover:block">
                                            {device.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="absolute left-3 top-3 rounded-md bg-black/40 px-3 py-1 text-xs font-semibold text-white">
                            {selectedDevice ? 'Zoomed on selected device' : 'Click a device card or red dot'}
                        </div>
                    </div>

                    {selectedDevice && (
                        <aside className="h-full w-[40%] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Device Detail</p>
                                    <h3 className="text-xl font-bold text-slate-900">{selectedDevice.name}</h3>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setSelectedDeviceId(null)}
                                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                                <p><span className="font-semibold text-slate-700">Name:</span> {selectedDevice.name}</p>
                                <p><span className="font-semibold text-slate-700">MAC Address:</span> {selectedDevice.macAddress}</p>
                                <p>
                                    <span className="font-semibold text-slate-700">Location:</span> {selectedDevice.longitude.toFixed(6)},{' '}
                                    {selectedDevice.latitude.toFixed(6)}
                                </p>
                                <p>
                                    <span className="font-semibold text-slate-700">Status:</span>{' '}
                                    <span
                                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                                            selectedDevice.status === 'online'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-200 text-slate-700'
                                        }`}
                                    >
                                        {selectedDevice.status}
                                    </span>
                                </p>
                                <p><span className="font-semibold text-slate-700">Added Time:</span> {formatTime(selectedDevice.addedAt)}</p>
                                <div>
                                    <p className="mb-2 font-semibold text-slate-700">Trash Level: {selectedDevice.trashLevel}%</p>
                                    <div className="h-2 w-full rounded-full bg-slate-200">
                                        <div
                                            className={`h-2 rounded-full ${
                                                selectedDevice.trashLevel >= 80
                                                    ? 'bg-red-500'
                                                    : selectedDevice.trashLevel >= 50
                                                        ? 'bg-amber-500'
                                                        : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${selectedDevice.trashLevel}%` }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link
                                    href={`/dashboard/devices/${selectedDevice.id}`}
                                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                >
                                    Open Full Detail Page
                                </Link>

                                <button
                                    type="button"
                                    onClick={() => pushToast('Device updated successfully (UI demo).', 'success')}
                                    className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
                                >
                                    Edit Device
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setIsDeletePopupOpen(true)}
                                    className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                                >
                                    Delete Device
                                </button>
                            </div>
                        </aside>
                    )}
                </section>
            </Surface>

            {isDeletePopupOpen && selectedDevice && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                        <h4 className="text-lg font-bold text-slate-900">Delete Device</h4>
                        <p className="mt-2 text-sm text-slate-600">
                            Are you sure you want to delete {selectedDevice.name} ({selectedDevice.macAddress})?
                        </p>

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsDeletePopupOpen(false)}
                                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsDeletePopupOpen(false);
                                    setSelectedDeviceId(null);
                                    pushToast('Device deleted (UI demo).', 'success');
                                }}
                                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                            >
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isAddDevicePopupOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900">Add New Device</h2>
                        <p className="mt-2 text-sm text-slate-600">Please enter your smart bin MAC address.</p>

                        <div className="mt-4">
                            <label htmlFor="dashboard-mac-address" className="mb-1 block text-sm font-semibold text-slate-700">
                                MAC Address
                            </label>
                            <Input
                                id="dashboard-mac-address"
                                type="text"
                                value={macAddress}
                                onChange={(event) => setMacAddress(event.target.value)}
                                placeholder="AA:BB:CC:DD:EE:FF"
                            />
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <Button
                                type="button"
                                onClick={() => setIsAddDevicePopupOpen(false)}
                                variant="secondary"
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleAddDevice}
                            >
                                Add Device
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {imageSrc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
                        <h3 className="text-lg font-bold text-slate-900">Update Avatar</h3>

                        <div className="relative mt-4 h-72 w-full overflow-hidden rounded-lg bg-slate-100">
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
                            <label className="mb-1 block text-sm font-semibold text-slate-700">Zoom</label>
                            <input
                                type="range"
                                min={1}
                                max={3}
                                step={0.1}
                                value={zoom}
                                onChange={(event) => setZoom(Number(event.target.value))}
                                className="w-full"
                            />
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setImageSrc(null)}
                                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                                disabled={isUploading}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveCroppedImage}
                                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                                disabled={isUploading}
                            >
                                {isUploading ? 'Updating...' : 'Save Avatar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ToastStack toasts={toasts} />
        </div>
    );
}