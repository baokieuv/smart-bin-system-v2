'use client';

// Main dashboard for account and device management.

import Cropper, { Area } from 'react-easy-crop';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usersApi } from '@/services/api/users';
import { UserDto } from '@/types/user';
import { useRouter } from 'next/navigation';
import { getCroppedImg } from '@/utils/cropImage';
import { Surface } from '@/components/ui/surface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToastStack } from '@/components/ui/toast-stack';
import DeviceMap from '@/components/layout/map';
import { LocationPickerMap, type LocationValue } from '@/components/layout/location-picker-map';
import { deviceApi } from '@/services/api/device';
import { DeviceDto, DeviceTelemetries } from '@/types/device';

type Toast = {
    id: number;
    message: string;
    type: 'success' | 'error';
};

type DashboardTab = 'devices' | 'account' | 'activity';

type DeviceTelemetrySummary = {
    fillLevel: number | null;
    thrownCount: number | null;
    sampledAt: number | null;
};

const formatTime = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });

const toNumber = (value: string | undefined) => {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
};

const getLatestTelemetryPoint = (telemetries: DeviceTelemetries, keys: string[]) => {
    const points = keys.flatMap((key) => telemetries[key] ?? []);
    if (points.length === 0) return null;
    return points.reduce((latest, point) => (point.ts > latest.ts ? point : latest));
};

const summarizeTelemetries = (telemetries: DeviceTelemetries): DeviceTelemetrySummary => {
    const latestFillPoint = getLatestTelemetryPoint(telemetries, ['fillLevel', 'trashLevel', 'binFillLevel']);
    const latestThrowPoint = getLatestTelemetryPoint(telemetries, ['throwCount', 'wasteCount', 'garbageThrowCount']);

    return {
        fillLevel: toNumber(latestFillPoint?.value),
        thrownCount: toNumber(latestThrowPoint?.value),
        sampledAt: Math.max(latestFillPoint?.ts ?? 0, latestThrowPoint?.ts ?? 0) || null,
    };
};

export default function DashboardPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [userInfo, setUserInfo] = useState<UserDto | null>(null);
    const [devices, setDevices] = useState<DeviceDto[]>([]);
    const [isDeviceLoading, setIsDeviceLoading] = useState(false);
    const [selectedDeviceTelemetry, setSelectedDeviceTelemetry] = useState<DeviceTelemetrySummary>({
        fillLevel: null,
        thrownCount: null,
        sampledAt: null,
    });
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isAddDevicePopupOpen, setIsAddDevicePopupOpen] = useState(false);
    const [macAddress, setMacAddress] = useState('');
    const [addDeviceLatitude, setAddDeviceLatitude] = useState('');
    const [addDeviceLongitude, setAddDeviceLongitude] = useState('');
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
    const [isDeletePopupOpen, setIsDeletePopupOpen] = useState(false);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [activeTab, setActiveTab] = useState<DashboardTab>('devices');
    const [isEditDevicePopupOpen, setIsEditDevicePopupOpen] = useState(false);
    const [editDeviceName, setEditDeviceName] = useState('');
    const [editDeviceLatitude, setEditDeviceLatitude] = useState('');
    const [editDeviceLongitude, setEditDeviceLongitude] = useState('');
    const [isSubmittingDeviceAction, setIsSubmittingDeviceAction] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [editableName, setEditableName] = useState('');

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

                    setIsDeviceLoading(true);
                    try {
                        const deviceResponse = await deviceApi.getList();
                        if (deviceResponse.success && Array.isArray(deviceResponse.data)) {
                            setDevices(deviceResponse.data);
                        } else {
                            setDevices([]);
                            pushToast(deviceResponse.message || 'Failed to load devices.', 'error');
                        }
                    } catch {
                        setDevices([]);
                        pushToast('Failed to load device list.', 'error');
                    } finally {
                        setIsDeviceLoading(false);
                    }
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

    useEffect(() => {
        if (userInfo) {
            const currentName = `${userInfo.firstName} ${userInfo.lastName}`.trim();
            setEditableName(currentName);
        }
    }, [userInfo]);

    const selectedDevice = useMemo(
        () => devices.find((device) => device.id === selectedDeviceId) ?? null,
        [selectedDeviceId, devices],
    );

    const pushToast = (message: string, type: Toast['type']) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setToasts((prev) => [...prev, { id, message, type }]);

        window.setTimeout(() => {
            setToasts((prev) => prev.filter((toast) => toast.id !== id));
        }, 2500);
    };

    const userInitial = userInfo?.firstName?.charAt(0).toUpperCase() ?? userInfo?.email?.charAt(0).toUpperCase() ?? 'U';
    const fullName = `${userInfo?.firstName ?? ''} ${userInfo?.lastName ?? ''}`.trim() || 'User';
    const normalizedFullName = fullName.trim().replace(/\s+/g, ' ');
    const normalizedEditableName = editableName.trim().replace(/\s+/g, ' ');
    const hasNameChanged = normalizedEditableName.length > 0 && normalizedEditableName !== normalizedFullName;
    const currentHour = new Date().getHours();
    const greeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';
    const hasDevices = devices.length > 0;
    const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

    const formatMacAddress = (rawValue: string) => {
        const normalized = rawValue
            .toUpperCase()
            .replace(/[^0-9A-F]/g, '')
            .slice(0, 12);

        const pairs = normalized.match(/.{1,2}/g);
        return pairs ? pairs.join(':') : '';
    };

    const handleMacAddressChange = (value: string) => {
        setMacAddress(formatMacAddress(value));
    };

    const parseCoordinatePair = (latitudeValue: string, longitudeValue: string): LocationValue | null => {
        const latitude = Number(latitudeValue);
        const longitude = Number(longitudeValue);

        if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
        if (latitude < -90 || latitude > 90) return null;
        if (longitude < -180 || longitude > 180) return null;

        return { latitude, longitude };
    };

    const addLocation = parseCoordinatePair(addDeviceLatitude, addDeviceLongitude);
    const editLocation = parseCoordinatePair(editDeviceLatitude, editDeviceLongitude);
    const isMacValid = MAC_PATTERN.test(macAddress.trim());
    const canSubmitAddDevice = isMacValid && addLocation !== null && !isSubmittingDeviceAction;

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

    const handleAddDevice = async () => {
        const normalizedMac = macAddress.trim().toUpperCase();

        if (!MAC_PATTERN.test(normalizedMac)) {
            pushToast('Add device failed. Invalid MAC address format.', 'error');
            return;
        }

        const location = parseCoordinatePair(addDeviceLatitude, addDeviceLongitude);
        if (!location) {
            pushToast('Add device failed. Please select a valid location on map.', 'error');
            return;
        }

        try {
            setIsSubmittingDeviceAction(true);

            const response = await deviceApi.add({
                mac: normalizedMac,
                latitude: location.latitude,
                longitude: location.longitude,
                name: `Smart Bin ${normalizedMac.slice(-8)}`,
            });

            if (!response.success) {
                pushToast(response.message || 'Failed to add device.', 'error');
                return;
            }

            const created = response.data as DeviceDto;
            setDevices((prev) => [created, ...prev]);
            setSelectedDeviceId(created.id);
            setIsAddDevicePopupOpen(false);
            setMacAddress('');
            setAddDeviceLatitude('');
            setAddDeviceLongitude('');
            pushToast('Device added successfully.', 'success');
        } catch {
            pushToast('Failed to add device.', 'error');
        } finally {
            setIsSubmittingDeviceAction(false);
        }
    };

    useEffect(() => {
        if (!selectedDeviceId || activeTab !== 'devices') {
            setSelectedDeviceTelemetry({ fillLevel: null, thrownCount: null, sampledAt: null });
            return;
        }

        const fetchTelemetrySummary = async () => {
            try {
                const now = Date.now();
                const response = await deviceApi.getTelemetries(selectedDeviceId, {
                    keys: 'fillLevel,trashLevel,binFillLevel,throwCount,wasteCount,garbageThrowCount',
                    startTs: now - 7 * 24 * 60 * 60 * 1000,
                    endTs: now,
                    limit: 50,
                });

                if (response.success && response.data) {
                    setSelectedDeviceTelemetry(summarizeTelemetries(response.data as DeviceTelemetries));
                } else {
                    setSelectedDeviceTelemetry({ fillLevel: null, thrownCount: null, sampledAt: null });
                }
            } catch {
                setSelectedDeviceTelemetry({ fillLevel: null, thrownCount: null, sampledAt: null });
            }
        };

        fetchTelemetrySummary();
    }, [selectedDeviceId, activeTab]);

    const openEditDevicePopup = () => {
        if (!selectedDevice) return;
        setEditDeviceName(selectedDevice.name || '');
        setEditDeviceLatitude(String(selectedDevice.latitude ?? ''));
        setEditDeviceLongitude(String(selectedDevice.longitude ?? ''));
        setIsEditDevicePopupOpen(true);
    };

    const handleUpdateDevice = async () => {
        if (!selectedDevice) return;

        const location = parseCoordinatePair(editDeviceLatitude, editDeviceLongitude);

        if (!editDeviceName.trim()) {
            pushToast('Device name is required.', 'error');
            return;
        }

        if (!location) {
            pushToast('Please select a valid location on map.', 'error');
            return;
        }

        try {
            setIsSubmittingDeviceAction(true);

            const response = await deviceApi.update(selectedDevice.id, {
                name: editDeviceName.trim(),
                latitude: location.latitude,
                longitude: location.longitude,
                scope: 'SERVER_SCOPE',
                additionalAttributes: {},
            });

            if (!response.success) {
                pushToast(response.message || 'Failed to update device.', 'error');
                return;
            }

            const updated = response.data as DeviceDto;
            setDevices((prev) => prev.map((item) => (item.id === selectedDevice.id ? updated : item)));
            setSelectedDeviceId(updated.id);
            setIsEditDevicePopupOpen(false);
            pushToast('Device updated successfully.', 'success');
        } catch {
            pushToast('Failed to update device.', 'error');
        } finally {
            setIsSubmittingDeviceAction(false);
        }
    };

    const handleDeleteDevice = async () => {
        if (!selectedDevice) return;

        try {
            setIsSubmittingDeviceAction(true);
            const response = await deviceApi.delete(selectedDevice.id);

            if (!response.success) {
                pushToast(response.message || 'Failed to delete device.', 'error');
                return;
            }

            setDevices((prev) => prev.filter((item) => item.id !== selectedDevice.id));
            setSelectedDeviceId(null);
            setIsDeletePopupOpen(false);
            pushToast('Device deleted successfully.', 'success');
        } catch {
            pushToast('Failed to delete device.', 'error');
        } finally {
            setIsSubmittingDeviceAction(false);
        }
    };

    const handleConfirmNameChange = async () => {
        const nextName = editableName.trim();

        if (!nextName) {
            pushToast('Name cannot be empty.', 'error');
            return;
        }

        if (!hasNameChanged) {
            return;
        }

        const [firstName, ...rest] = nextName.split(/\s+/);
        const lastName = rest.join(' ');

        try {
            const response = await usersApi.update({firstName, lastName});

            if (response.success){
                setUserInfo((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        firstName,
                        lastName,
                    };
                });
                pushToast('Name updated successfully.', 'success');
            }else{
                pushToast('Failed to updated name.', 'error');
            }
        } catch (err: unknown){
            const systemMessage = err instanceof Error ? err.message : '';

            pushToast(systemMessage || 'Error occured.', 'error');
        }

        setIsEditingName(false);
    };

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center text-slate-700">Loading...</div>;
    }

    return (
        <div className="h-screen w-full overflow-y-auto bg-slate-50">
            <Surface className="flex h-full w-full max-w-none flex-col gap-4 rounded-none border-0 bg-slate-50 p-4 shadow-none md:p-5">
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
                                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                        </svg>
                                        Add Device
                                    </Link>
                                    <Link
                                        href="/auth/change-password"
                                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-6.75a2.25 2.25 0 012.25-2.25z" />
                                        </svg>
                                        Change Password
                                    </Link>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            localStorage.removeItem('access_token');
                                            localStorage.removeItem('refresh_token');
                                            router.push('/auth/login');
                                        }}
                                        className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-7.5a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 006 21h7.5a2.25 2.25 0 002.25-2.25V15m-3 0l3-3m0 0l-3-3m3 3H9" />
                                        </svg>
                                        Logout
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <div className="flex gap-2 rounded-2xl border border-slate-200/80 bg-white p-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('devices')}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            activeTab === 'devices'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                        Devices
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('account');
                            setSelectedDeviceId(null);
                        }}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            activeTab === 'account'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                        Account
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setActiveTab('activity');
                            setSelectedDeviceId(null);
                        }}
                        className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                            activeTab === 'activity'
                                ? 'bg-slate-900 text-white'
                                : 'border border-slate-300 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                        Activity
                    </button>
                </div>

                <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-hidden">
                    {activeTab === 'devices' ? (
                    hasDevices ? (
                        <>
                    {!selectedDevice && (
                        <aside className="h-80 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-full lg:w-[30%]">
                            <div className="border-b border-slate-200 px-4 py-3">
                                <h2 className="text-lg font-bold text-slate-900">Your Devices</h2>
                                <p className="text-sm text-slate-500">Select a card to view details on the right.</p>
                            </div>

                            <div className="h-[calc(100%-4.25rem)] space-y-3 overflow-y-auto p-3">
                                {isDeviceLoading && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading devices...</div>
                                )}

                                {!isDeviceLoading && devices.map((device) => (
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
                                                    device.status === 'ONLINE'
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-slate-200 text-slate-700'
                                                }`}
                                            >
                                                {device.status === 'ONLINE' ? 'online' : 'offline'}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs font-medium tracking-wide text-slate-500">MAC: {device.mac}</p>
                                    </button>
                                ))}
                            </div>
                        </aside>
                    )}

                    <div className={`relative h-105 min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:h-full ${selectedDevice ? 'w-full lg:w-[60%]' : 'w-full lg:flex-1'}`}>
                        <DeviceMap
                            devices={devices}
                            selectedDeviceId={selectedDeviceId}
                            onSelectDevice={setSelectedDeviceId}
                            className="h-full w-full"
                        />

                        {selectedDevice && (
                            <button
                                type="button"
                                onClick={() => setSelectedDeviceId(null)}
                                className="absolute left-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-700 shadow-sm transition hover:bg-white"
                                aria-label="Back to map overview"
                                title="Back to map overview"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                                </svg>
                            </button>
                        )}

                        <div className={`absolute top-3 rounded-md bg-black/40 px-3 py-1 text-xs font-semibold text-white ${selectedDevice ? 'left-14' : 'left-3'}`}>
                            Click a marker or device card
                        </div>
                    </div>

                    {selectedDevice && (
                        <aside className="h-80 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:h-full lg:w-[40%]">
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
                                <p><span className="font-semibold text-slate-700">MAC Address:</span> {selectedDevice.mac}</p>
                                <p>
                                    <span className="font-semibold text-slate-700">Location:</span> {selectedDevice.longitude.toFixed(6)},{' '}
                                    {selectedDevice.latitude.toFixed(6)}
                                </p>
                                <p>
                                    <span className="font-semibold text-slate-700">Status:</span>{' '}
                                    <span
                                        className={`rounded-full px-2 py-1 text-xs font-bold ${
                                            selectedDevice.status === 'ONLINE'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-200 text-slate-700'
                                        }`}
                                    >
                                        {selectedDevice.status === 'ONLINE' ? 'online' : 'offline'}
                                    </span>
                                </p>
                                <p><span className="font-semibold text-slate-700">Added Time:</span> {formatTime(selectedDevice.createdDate)}</p>
                                <div>
                                    <p className="mb-2 font-semibold text-slate-700">
                                        Trash Level: {selectedDeviceTelemetry.fillLevel !== null ? `${selectedDeviceTelemetry.fillLevel}%` : 'N/A'}
                                    </p>
                                    <div className="h-2 w-full rounded-full bg-slate-200">
                                        <div
                                            className={`h-2 rounded-full ${
                                                (selectedDeviceTelemetry.fillLevel ?? 0) >= 80
                                                    ? 'bg-red-500'
                                                    : (selectedDeviceTelemetry.fillLevel ?? 0) >= 50
                                                        ? 'bg-amber-500'
                                                        : 'bg-emerald-500'
                                            }`}
                                            style={{ width: `${selectedDeviceTelemetry.fillLevel ?? 0}%` }}
                                        />
                                    </div>
                                </div>
                                <p>
                                    <span className="font-semibold text-slate-700">Waste Throws:</span>{' '}
                                    {selectedDeviceTelemetry.thrownCount ?? 'N/A'}
                                </p>
                                <p>
                                    <span className="font-semibold text-slate-700">Last Telemetry:</span>{' '}
                                    {selectedDeviceTelemetry.sampledAt
                                        ? formatTime(new Date(selectedDeviceTelemetry.sampledAt).toISOString())
                                        : 'N/A'}
                                </p>
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
                                    onClick={openEditDevicePopup}
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
                        </>
                    ) : (
                        <div className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 md:p-10">
                            <div className="mx-auto max-w-2xl text-center">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Welcome to Smart Bin</p>
                                <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                                    Keep your city cleaner with smart, connected bins.
                                </h2>
                                <p className="mt-4 text-sm leading-relaxed text-slate-600 md:text-base">
                                    Add your first device to start monitoring fill levels, improving collection efficiency, and getting actionable insights in real time.
                                </p>

                                <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
                                    <Button
                                        type="button"
                                        size="lg"
                                        onClick={() => setIsAddDevicePopupOpen(true)}
                                    >
                                        Add Your First Device
                                    </Button>
                                    <p className="text-xs text-slate-500">MAC format: AA:BB:CC:DD:EE:FF</p>
                                </div>
                            </div>
                        </div>
                    )) : activeTab === 'account' ? (
                        <div className="grid w-full gap-4 lg:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
                                <div className="flex flex-col items-center text-center">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="group relative"
                                        aria-label="Edit account avatar"
                                    >
                                        {userInfo?.avatarUrl ? (
                                            <img
                                                src={userInfo.avatarUrl}
                                                alt="User avatar"
                                                className={`h-24 w-24 rounded-full border border-slate-300 object-cover ${isUploading ? 'opacity-60' : ''}`}
                                            />
                                        ) : (
                                            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-slate-300 bg-slate-200 text-3xl font-bold text-slate-700">
                                                {userInitial}
                                            </div>
                                        )}

                                        <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition group-hover:bg-slate-100">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7H4.25A2.25 2.25 0 002 9.25v8.5A2.25 2.25 0 004.25 20h15.5A2.25 2.25 0 0022 17.75v-8.5A2.25 2.25 0 0019.75 7h-.936a2.31 2.31 0 01-1.64-.675l-.759-.759A2.25 2.25 0 0014.824 5h-5.648a2.25 2.25 0 00-1.591.659l-.758.516z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                                            </svg>
                                        </span>
                                    </button>

                                    <div className="mt-4 w-full">
                                        {!isEditingName ? (
                                            <div className="flex items-center justify-center gap-1">
                                                <h2 className="text-xl font-bold text-slate-900">{fullName}</h2>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingName(true)}
                                                    className="p-0.5 text-slate-500 transition hover:text-slate-900"
                                                    aria-label="Edit name"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="mx-auto max-w-xs space-y-2 text-left">
                                                <label htmlFor="account-name-input" className="block text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                                                    Full name
                                                </label>
                                                <Input
                                                    id="account-name-input"
                                                    value={editableName}
                                                    onChange={(event) => setEditableName(event.target.value)}
                                                    placeholder="Enter your full name"
                                                />
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => {
                                                            setEditableName(fullName);
                                                            setIsEditingName(false);
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={handleConfirmNameChange}
                                                        disabled={!hasNameChanged}
                                                        className={!hasNameChanged ? 'bg-slate-300 text-slate-600 shadow-none hover:bg-slate-300 active:bg-slate-300' : ''}
                                                    >
                                                        Confirm
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-1 text-sm text-slate-500">{userInfo?.email}</p>
                                    <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                                        {greeting}, welcome back to Smart Bin.
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
                                <div className="mb-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Account Settings</p>
                                    <h3 className="mt-1 text-xl font-bold text-slate-900">Personal Preferences</h3>
                                    <p className="mt-1 text-sm text-slate-600">Select a setting to configure your account. More features are being prepared.</p>
                                </div>

                                <div className="grid gap-3 sm:grid-cols-2">
                                    {[
                                        {
                                            title: 'Personal Information',
                                            description: 'Manage your display name, avatar, and account identity settings.',
                                            icon: (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            title: 'Notification Settings',
                                            description: 'Manage alert channels and notification frequency.',
                                            icon: (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9a6 6 0 10-12 0v.05c0 .238 0 .476.001.714A8.967 8.967 0 013.69 15.77a23.848 23.848 0 005.454 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            title: 'Security & Privacy',
                                            description: 'Control login security and account protection options.',
                                            icon: (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7.5 4.5v4.8c0 5.2-3.4 8.8-7.5 10.2C7.9 21.1 4.5 17.5 4.5 12.3V7.5L12 3z" />
                                                </svg>
                                            ),
                                        },
                                        {
                                            title: 'Language & Region',
                                            description: 'Choose language, timezone, and localization format.',
                                            icon: (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 010 18M12 3a15.3 15.3 0 000 18" />
                                                </svg>
                                            ),
                                        },
                                    ].map((setting) => (
                                        <button
                                            key={setting.title}
                                            type="button"
                                            onClick={() => pushToast('Feature coming soon.', 'success')}
                                            className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                                        >
                                            <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                                                {setting.icon}
                                            </div>
                                            <p className="text-sm font-semibold text-slate-900">{setting.title}</p>
                                            <p className="mt-1 text-xs leading-relaxed text-slate-600">{setting.description}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center">
                            <div className="max-w-lg">
                                <h2 className="text-2xl font-bold text-slate-900">Activity</h2>
                                <p className="mt-2 text-sm text-slate-600">Activity timeline is coming soon.</p>
                            </div>
                        </div>
                    )}
                </section>
            </Surface>

            {isDeletePopupOpen && selectedDevice && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                        <h4 className="text-lg font-bold text-slate-900">Delete Device</h4>
                        <p className="mt-2 text-sm text-slate-600">
                            Are you sure you want to delete {selectedDevice.name} ({selectedDevice.mac})?
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
                                onClick={handleDeleteDevice}
                                className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                                disabled={isSubmittingDeviceAction}
                            >
                                {isSubmittingDeviceAction ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isEditDevicePopupOpen && selectedDevice && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900">Edit Device</h2>
                        <p className="mt-2 text-sm text-slate-600">Update device basic information and location.</p>

                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="mb-1 block text-sm font-semibold text-slate-700">Device Name</label>
                                <Input value={editDeviceName} onChange={(event) => setEditDeviceName(event.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Latitude</label>
                                    <Input value={editDeviceLatitude} onChange={(event) => setEditDeviceLatitude(event.target.value)} />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-semibold text-slate-700">Longitude</label>
                                    <Input value={editDeviceLongitude} onChange={(event) => setEditDeviceLongitude(event.target.value)} />
                                </div>
                            </div>

                            <div>
                                <p className="mb-1 block text-sm font-semibold text-slate-700">Pick Location on Map</p>
                                <LocationPickerMap
                                    className="h-52 w-full rounded-xl border border-slate-200"
                                    value={editLocation}
                                    onChange={(location) => {
                                        setEditDeviceLatitude(location.latitude.toFixed(6));
                                        setEditDeviceLongitude(location.longitude.toFixed(6));
                                    }}
                                />
                                <p className="mt-1 text-xs text-slate-500">Click map to set new device location.</p>
                            </div>
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => setIsEditDevicePopupOpen(false)}
                                disabled={isSubmittingDeviceAction}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleUpdateDevice}
                                disabled={isSubmittingDeviceAction}
                            >
                                {isSubmittingDeviceAction ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {isAddDevicePopupOpen && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
                        <h2 className="text-lg font-bold text-slate-900">Add New Device</h2>
                        <p className="mt-2 text-sm text-slate-600">Complete both steps to enable Add Device.</p>

                        <div className="mt-4 space-y-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 1</p>
                                <label htmlFor="dashboard-mac-address" className="mb-1 mt-2 block text-sm font-semibold text-slate-700">
                                    MAC Address
                                </label>
                                <Input
                                    id="dashboard-mac-address"
                                    type="text"
                                    value={macAddress}
                                    onChange={(event) => handleMacAddressChange(event.target.value)}
                                    placeholder="AA:BB:CC:DD:EE:FF"
                                    maxLength={17}
                                    className={macAddress && !isMacValid ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/25' : ''}
                                />
                                {macAddress && !isMacValid && (
                                    <p className="mt-1 text-xs text-rose-600">Invalid MAC format. Use 12 letters/numbers, grouped as AA:BB:CC:DD:EE:FF.</p>
                                )}
                                <p className="mt-1 text-xs text-slate-500">You only type letters/numbers, the : separator is added automatically every 2 characters.</p>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Step 2</p>
                                <p className="mb-2 mt-2 text-sm font-semibold text-slate-700">Pick Device Location</p>
                                <LocationPickerMap
                                    className="h-52 w-full rounded-xl border border-slate-200"
                                    value={addLocation}
                                    onChange={(location) => {
                                        setAddDeviceLatitude(location.latitude.toFixed(6));
                                        setAddDeviceLongitude(location.longitude.toFixed(6));
                                    }}
                                />
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <Input
                                        value={addDeviceLatitude}
                                        onChange={(event) => setAddDeviceLatitude(event.target.value)}
                                        placeholder="Latitude"
                                    />
                                    <Input
                                        value={addDeviceLongitude}
                                        onChange={(event) => setAddDeviceLongitude(event.target.value)}
                                        placeholder="Longitude"
                                    />
                                </div>
                                {!addLocation && (addDeviceLatitude || addDeviceLongitude) && (
                                    <p className="mt-1 text-xs text-rose-600">Invalid coordinates. Latitude: -90..90, Longitude: -180..180.</p>
                                )}
                            </div>
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <Button
                                type="button"
                                onClick={() => {
                                    setIsAddDevicePopupOpen(false);
                                    setMacAddress('');
                                    setAddDeviceLatitude('');
                                    setAddDeviceLongitude('');
                                }}
                                variant="secondary"
                                disabled={isSubmittingDeviceAction}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                onClick={handleAddDevice}
                                disabled={!canSubmitAddDevice}
                            >
                                {isSubmittingDeviceAction ? 'Adding...' : 'Add Device'}
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