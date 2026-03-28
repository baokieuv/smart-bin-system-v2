'use client';

// Main dashboard for account and device management.

import type { Area } from 'react-easy-crop';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usersApi } from '@/services/api/users';
import { UserDto } from '@/types/user';
import { useRouter } from 'next/navigation';
import { getCroppedImg } from '@/utils/cropImage';
import { Surface } from '@/components/ui/surface';
import { ToastStack } from '@/components/ui/toast-stack';
import { type LocationValue } from '@/components/layout/location-picker-map';
import { deviceApi } from '@/services/api/device';
import { DeviceDto, DeviceTelemetries } from '@/types/device';
import { notificationApi } from '@/services/api/notification';
import { NotificationDto, NotificationListPayload, NotificationType, UnreadCountPayload } from '@/types/notification';
import DevicesTab from '@/app/dashboard/tabs/devices-tab';
import AccountTab from '@/app/dashboard/tabs/account-tab';
import ActivityTab from '@/app/dashboard/tabs/activity-tab';
import DashboardHeader from '@/app/dashboard/sections/dashboard-header';
import DashboardTabNav, { DashboardTab } from '@/app/dashboard/sections/dashboard-tab-nav';
import DashboardOverlays from '@/app/dashboard/sections/dashboard-overlays';

type Toast = {
    id: number;
    message: string;
    type: 'success' | 'error';
};

type ActivityFilter = 'all' | 'unread' | 'critical';

type DeviceTelemetrySummary = {
    fillLevel: number | null;
    thrownCount: number | null;
    sampledAt: number | null;
};

const CRITICAL_NOTIFICATION_TYPES: NotificationType[] = [
    'THRESHOLD_CRITICAL',
    'ANOMALY_DETECTED',
    'DEVICE_OFFLINE',
    'LOW_BATTERY',
    'SENSOR_FAULT',
    'COMMAND_FAILED',
    'FIRMWARE_UPDATE_FAILED',
    'MAINTENANCE_REQUIRED',
];

const WARNING_NOTIFICATION_TYPES: NotificationType[] = [
    'THRESHOLD_WARNING',
    'LOW_BATTERY',
    'MAINTENANCE_REQUIRED',
];

const toNotificationLabel = (value: NotificationType) =>
    value
        .split('_')
        .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
        .join(' ');

const toNumberFromUnknown = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

type ActivityPageData = {
    items: NotificationDto[];
    page: number;
    totalPages: number;
    hasNext: boolean;
};

const toActivityPageData = (
    payload: NotificationListPayload,
    requestedPage: number,
    pageSize: number,
): ActivityPageData => {
    if (Array.isArray(payload)) {
        const hasNext = payload.length >= pageSize;
        return {
            items: payload,
            page: requestedPage,
            totalPages: hasNext ? requestedPage + 1 : requestedPage,
            hasNext,
        };
    }

    const items = Array.isArray(payload.items)
        ? payload.items
        : Array.isArray(payload.content)
            ? payload.content
            : Array.isArray(payload.data)
                ? payload.data
                : [];

    const pageFromPayload = toNumberFromUnknown(payload.pageNumber) ?? toNumberFromUnknown(payload.page);
    const totalPages = toNumberFromUnknown(payload.totalPages);
    const hasNext = typeof payload.hasNext === 'boolean'
        ? payload.hasNext
        : totalPages !== null
            ? (pageFromPayload ?? requestedPage) < totalPages
            : items.length >= pageSize;

    const resolvedPage = pageFromPayload ?? requestedPage;

    return {
        items,
        page: resolvedPage,
        totalPages: totalPages ?? (resolvedPage + (hasNext ? 1 : 0)),
        hasNext,
    };
};

const toUnreadCount = (payload: UnreadCountPayload): number => {
    if (typeof payload === 'number') return payload;

    const candidates = [payload.unreadCount, payload.count, payload.total];
    for (const candidate of candidates) {
        const parsed = toNumberFromUnknown(candidate);
        if (parsed !== null) return parsed;
    }

    return 0;
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
    const [activities, setActivities] = useState<NotificationDto[]>([]);
    const [isActivityLoading, setIsActivityLoading] = useState(false);
    const [isMarkingAllActivityRead, setIsMarkingAllActivityRead] = useState(false);
    const [markingActivityIds, setMarkingActivityIds] = useState<Array<string | number>>([]);
    const [selectedActivityIds, setSelectedActivityIds] = useState<Array<string | number>>([]);
    const [isBatchUpdatingActivities, setIsBatchUpdatingActivities] = useState(false);
    const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
    const [activityPage, setActivityPage] = useState(1);
    const [activityTotalPages, setActivityTotalPages] = useState(1);
    const [activityUnreadCount, setActivityUnreadCount] = useState(0);

    const ACTIVITY_PAGE_SIZE = 5;

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

    const unreadActivityCount = useMemo(() => {
        if (activityUnreadCount >= 0) return activityUnreadCount;
        return activities.filter((item) => !item.isRead).length;
    }, [activities, activityUnreadCount]);

    const filteredActivities = useMemo(() => {
        const sorted = [...activities].sort(
            (a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime(),
        );

        if (activityFilter === 'unread') {
            return sorted.filter((item) => !item.isRead);
        }

        if (activityFilter === 'critical') {
            return sorted.filter((item) => CRITICAL_NOTIFICATION_TYPES.includes(item.type));
        }

        return sorted;
    }, [activities, activityFilter]);

    const visibleActivityIds = useMemo(
        () => filteredActivities.map((item) => item.id),
        [filteredActivities],
    );

    const allVisibleSelected = useMemo(() => {
        if (visibleActivityIds.length === 0) return false;
        return visibleActivityIds.every((id) => selectedActivityIds.some((selectedId) => String(selectedId) === String(id)));
    }, [visibleActivityIds, selectedActivityIds]);

    const selectedVisibleCount = useMemo(
        () => visibleActivityIds.filter((id) => selectedActivityIds.some((selectedId) => String(selectedId) === String(id))).length,
        [visibleActivityIds, selectedActivityIds],
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

    const loadUnreadCount = async () => {
        try {
            const response = await notificationApi.getUnreadCount();
            if (response.success) {
                setActivityUnreadCount(toUnreadCount(response.data));
            }
        } catch {
            // Keep previous count when unread endpoint fails.
        }
    };

    const loadActivities = async (page: number) => {
        try {
            setIsActivityLoading(true);

            const response = await notificationApi.getList({ page, size: ACTIVITY_PAGE_SIZE });

            if (!response.success) {
                setActivities([]);
                setSelectedActivityIds([]);
                pushToast(response.message || 'Failed to load activity feed.', 'error');
                return;
            }

            const parsed = toActivityPageData(response.data, page, ACTIVITY_PAGE_SIZE);
            setActivities(parsed.items);

            setActivityPage(parsed.page);
            setActivityTotalPages(parsed.totalPages);
            setSelectedActivityIds([]);
        } catch {
            setActivities([]);
            setSelectedActivityIds([]);
            pushToast('Failed to load activity feed.', 'error');
        } finally {
            setIsActivityLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab !== 'activity') return;
        loadActivities(1);
        loadUnreadCount();
    }, [activeTab]);

    useEffect(() => {
        if (!userInfo) return;
        loadUnreadCount();
    }, [userInfo]);

    const handlePrevActivityPage = async () => {
        if (activityPage <= 1) return;
        await loadActivities(activityPage - 1);
    };

    const handleNextActivityPage = async () => {
        if (activityPage >= Math.max(activityTotalPages, 1)) return;
        await loadActivities(activityPage + 1);
    };

    const handleMarkActivityAsRead = async (id: string | number) => {
        const target = activities.find((item) => String(item.id) === String(id));
        if (!target || target.isRead) return;

        try {
            setMarkingActivityIds((prev) => [...prev, id]);
            const numericId = Number(id);
            if (!Number.isFinite(numericId)) {
                pushToast('Invalid notification id.', 'error');
                return;
            }
            const response = await notificationApi.markMany({ ids: [numericId], isRead: true });

            if (!response.success) {
                pushToast(response.message || 'Failed to mark notification as read.', 'error');
                return;
            }

            setActivities((prev) => prev.map((item) => (
                String(item.id) === String(id)
                    ? { ...item, isRead: true }
                    : item
            )));
            setActivityUnreadCount((prev) => Math.max(prev - 1, 0));
        } catch {
            pushToast('Failed to mark notification as read.', 'error');
        } finally {
            setMarkingActivityIds((prev) => prev.filter((itemId) => String(itemId) !== String(id)));
        }
    };

    const handleMarkAllActivitiesAsRead = async () => {
        if (activities.length === 0 || unreadActivityCount === 0) return;

        try {
            setIsMarkingAllActivityRead(true);
            const response = await notificationApi.readAll();

            if (!response.success) {
                pushToast(response.message || 'Failed to mark all notifications as read.', 'error');
                return;
            }

            setActivities((prev) => prev.map((item) => ({ ...item, isRead: true })));
            setActivityUnreadCount(0);
            pushToast('All notifications marked as read.', 'success');
        } catch {
            pushToast('Failed to mark all notifications as read.', 'error');
        } finally {
            setIsMarkingAllActivityRead(false);
        }
    };

    const handleToggleActivitySelection = (id: string | number, checked: boolean) => {
        setSelectedActivityIds((prev) => {
            if (checked) {
                if (prev.some((item) => String(item) === String(id))) return prev;
                return [...prev, id];
            }

            return prev.filter((item) => String(item) !== String(id));
        });
    };

    const handleToggleSelectAllVisible = (checked: boolean) => {
        if (checked) {
            setSelectedActivityIds((prev) => {
                const merged = [...prev, ...visibleActivityIds];
                return Array.from(new Map(merged.map((id) => [String(id), id])).values());
            });
            return;
        }

        setSelectedActivityIds((prev) => prev.filter((id) => !visibleActivityIds.some((visibleId) => String(visibleId) === String(id))));
    };

    const handleBatchUpdateSelectedActivities = async (isRead: boolean) => {
        const idNumbers = selectedActivityIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id));

        if (idNumbers.length === 0) {
            pushToast('Please select at least one notification.', 'error');
            return;
        }

        try {
            setIsBatchUpdatingActivities(true);
            const response = await notificationApi.markMany({ ids: idNumbers, isRead });

            if (!response.success) {
                pushToast(response.message || 'Failed to update selected notifications.', 'error');
                return;
            }

            const idSet = new Set(idNumbers.map((id) => String(id)));
            setActivities((prev) => prev.map((item) => (idSet.has(String(item.id)) ? { ...item, isRead } : item)));
            setSelectedActivityIds([]);
            loadUnreadCount();
            pushToast(isRead ? 'Selected notifications marked as read.' : 'Selected notifications marked as unread.', 'success');
        } catch {
            pushToast('Failed to update selected notifications.', 'error');
        } finally {
            setIsBatchUpdatingActivities(false);
        }
    };

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

    const handleChangeTab = (nextTab: DashboardTab) => {
        setActiveTab(nextTab);
        if (nextTab !== 'devices') {
            setSelectedDeviceId(null);
        }
    };

    const closeAddDevicePopup = () => {
        setIsAddDevicePopupOpen(false);
        setMacAddress('');
        setAddDeviceLatitude('');
        setAddDeviceLongitude('');
    };

    if (isLoading) {
        return <div className="flex min-h-screen items-center justify-center text-slate-700">Loading...</div>;
    }

    return (
        <div className="h-screen w-full overflow-y-auto bg-slate-50">
            <Surface className="flex h-full w-full max-w-none flex-col gap-4 rounded-none border-0 bg-slate-50 p-4 shadow-none md:p-5">
                <DashboardHeader
                    userInfo={userInfo}
                    userInitial={userInitial}
                    isUploading={isUploading}
                    isSettingsOpen={isSettingsOpen}
                    fileInputRef={fileInputRef}
                    onToggleSettings={() => setIsSettingsOpen((prev) => !prev)}
                    onFileChange={handleFileChange}
                    onOpenAddDeviceFromSettings={() => {
                        setIsSettingsOpen(false);
                        setIsAddDevicePopupOpen(true);
                    }}
                    onLogout={() => {
                        localStorage.removeItem('access_token');
                        localStorage.removeItem('refresh_token');
                        router.push('/auth/login');
                    }}
                />

                <DashboardTabNav
                    activeTab={activeTab}
                    unreadActivityCount={unreadActivityCount}
                    onChangeTab={handleChangeTab}
                />

                <section className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto lg:flex-row lg:overflow-hidden">
                    {activeTab === 'devices' ? (
                        <DevicesTab
                            hasDevices={hasDevices}
                            isDeviceLoading={isDeviceLoading}
                            devices={devices}
                            selectedDeviceId={selectedDeviceId}
                            selectedDevice={selectedDevice}
                            selectedDeviceTelemetry={selectedDeviceTelemetry}
                            formatTime={formatTime}
                            onSelectDevice={setSelectedDeviceId}
                            onOpenAddDevice={() => setIsAddDevicePopupOpen(true)}
                            onOpenEditDevice={openEditDevicePopup}
                            onOpenDeleteDevice={() => setIsDeletePopupOpen(true)}
                        />
                    ) : activeTab === 'account' ? (
                        <AccountTab
                            userInfo={userInfo}
                            userInitial={userInitial}
                            isUploading={isUploading}
                            fullName={fullName}
                            isEditingName={isEditingName}
                            editableName={editableName}
                            hasNameChanged={hasNameChanged}
                            greeting={greeting}
                            onPickAvatar={() => fileInputRef.current?.click()}
                            onStartEditingName={() => setIsEditingName(true)}
                            onChangeEditableName={setEditableName}
                            onCancelEditingName={() => {
                                setEditableName(fullName);
                                setIsEditingName(false);
                            }}
                            onConfirmNameChange={handleConfirmNameChange}
                            onFeatureComingSoon={() => pushToast('Feature coming soon.', 'success')}
                        />
                    ) : (
                        <ActivityTab
                            filteredActivities={filteredActivities}
                            selectedActivityIds={selectedActivityIds}
                            markingActivityIds={markingActivityIds}
                            activityFilter={activityFilter}
                            unreadActivityCount={unreadActivityCount}
                            selectedVisibleCount={selectedVisibleCount}
                            allVisibleSelected={allVisibleSelected}
                            activityPage={activityPage}
                            activityTotalPages={activityTotalPages}
                            isActivityLoading={isActivityLoading}
                            isBatchUpdatingActivities={isBatchUpdatingActivities}
                            isMarkingAllActivityRead={isMarkingAllActivityRead}
                            criticalTypes={CRITICAL_NOTIFICATION_TYPES}
                            warningTypes={WARNING_NOTIFICATION_TYPES}
                            formatTime={formatTime}
                            toNotificationLabel={toNotificationLabel}
                            onRefresh={() => loadActivities(activityPage)}
                            onSetFilter={setActivityFilter}
                            onMarkAllRead={handleMarkAllActivitiesAsRead}
                            onToggleSelectAllVisible={handleToggleSelectAllVisible}
                            onToggleActivitySelection={handleToggleActivitySelection}
                            onMarkActivityRead={handleMarkActivityAsRead}
                            onBatchUpdateSelected={handleBatchUpdateSelectedActivities}
                            onPrevPage={handlePrevActivityPage}
                            onNextPage={handleNextActivityPage}
                        />
                    )}
                </section>
            </Surface>

            <DashboardOverlays
                isDeletePopupOpen={isDeletePopupOpen}
                isEditDevicePopupOpen={isEditDevicePopupOpen}
                isAddDevicePopupOpen={isAddDevicePopupOpen}
                imageSrc={imageSrc}
                selectedDevice={selectedDevice}
                isSubmittingDeviceAction={isSubmittingDeviceAction}
                editDeviceName={editDeviceName}
                editDeviceLatitude={editDeviceLatitude}
                editDeviceLongitude={editDeviceLongitude}
                editLocation={editLocation}
                macAddress={macAddress}
                isMacValid={isMacValid}
                addDeviceLatitude={addDeviceLatitude}
                addDeviceLongitude={addDeviceLongitude}
                addLocation={addLocation}
                canSubmitAddDevice={canSubmitAddDevice}
                isUploading={isUploading}
                crop={crop}
                zoom={zoom}
                onSetImageSrc={setImageSrc}
                onCloseDeletePopup={() => setIsDeletePopupOpen(false)}
                onConfirmDeleteDevice={handleDeleteDevice}
                onCloseEditPopup={() => setIsEditDevicePopupOpen(false)}
                onEditDeviceNameChange={setEditDeviceName}
                onEditDeviceLatitudeChange={setEditDeviceLatitude}
                onEditDeviceLongitudeChange={setEditDeviceLongitude}
                onEditLocationChange={(location) => {
                    setEditDeviceLatitude(location.latitude.toFixed(6));
                    setEditDeviceLongitude(location.longitude.toFixed(6));
                }}
                onSaveDeviceChanges={handleUpdateDevice}
                onCloseAddPopup={closeAddDevicePopup}
                onMacAddressChange={handleMacAddressChange}
                onAddLatitudeChange={setAddDeviceLatitude}
                onAddLongitudeChange={setAddDeviceLongitude}
                onAddLocationChange={(location) => {
                    setAddDeviceLatitude(location.latitude.toFixed(6));
                    setAddDeviceLongitude(location.longitude.toFixed(6));
                }}
                onAddDevice={handleAddDevice}
                onSetCrop={setCrop}
                onSetZoom={setZoom}
                onCropComplete={onCropComplete}
                onSaveCroppedImage={handleSaveCroppedImage}
            />

            <ToastStack toasts={toasts} />
        </div>
    );
}