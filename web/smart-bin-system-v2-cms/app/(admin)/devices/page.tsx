"use client";

import ImportDevicesPanel from "@/components/devices/import-devices";
import Modal from "@/components/ui/modal";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { getCmsAccessRole } from "@/lib/auth-session";
import { useLanguage, type TranslationKey } from "@/lib/language";
import { emitToast } from "@/lib/toast";
import { deviceApi } from "@/services/api/device";
import { deviceGroupsAdminApi } from "@/services/api/device-groups-admin";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import { tenantsAdminApi } from "@/services/api/tenants-admin";
import { usersAdminApi } from "@/services/api/users-admin";
import type { DeviceDto, TelemetryPayload } from "@/types/device";
import type { FirmwareDto } from "@/types/firmware";
import type { UserDto } from "@/types/user";
import { FormEvent, useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AddDeviceModal from "@/components/devices/add-device-modal";
import AssignDevicesPanel from "@/components/devices/assign-devices-panel";
import ConfigureFirmwareModal from "@/components/devices/configure-firmware-modal";
import DeviceControlModal from "@/components/devices/device-control-modal";
import DeviceDetailsModal from "@/components/devices/device-details-modal";
import DevicesFilterPanel, { type FilterProps } from "@/components/devices/devices-filter-panel";
import DevicesTable from "@/components/devices/devices-table";
import DeviceCameraModal from "@/components/devices/device-camera-modal";
import {
    CLAIM_CODE_PATTERN,
    firmwareTimestamp,
    getDefaultRpcParams,
    getLatestFirmware,
    getRpcMethodOptions,
    MAC_PATTERN,
    parseCoordinatePair,
    parseOptionalNumber,
    toCoordinateText,
    toLocationKey,
} from "./utils";

// ==========================================
// 1. EXTRACTED COMPONENT LOGIC
// ==========================================
function DevicesPageContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    const { t } = useLanguage();

    const [partners, setPartners] = useState<{ id: string; name: string; keycloakId: string }[]>([]);
    // const [searchQuery, setSearchQuery] = useState(searchParams.get("search") || "");
    const [showFilterModal, setShowFilterModal] = useState(false);
    const [filterInputs, setFilterInputs] = useState<FilterProps>({
        name: searchParams.get("name") || "",
        mac: searchParams.get("mac") || "",
        groupId: searchParams.get("groupId") || "",
        status: searchParams.get("status") || "",
        tenantId: searchParams.get("tenantId") || "",
    });
    const [devices, setDevices] = useState<DeviceDto[]>([]);
    const [firmwares, setFirmwares] = useState<FirmwareDto[]>([]);
    const [users, setUsers] = useState<UserDto[]>([]);
    const [role, setRole] = useState<"super_admin" | "admin" | "user" | null>(null);
    const [form, setForm] = useState({
        mac: "",
        name: "",
        claimCode: "",
        latitude: "21.0056",
        longitude: "105.8434",
        pollingInterval: "",
        fullThreshold: "",
    });
    const [deviceGroups, setDeviceGroups] = useState<{ id: string; code: string; name: string }[]>([]);
    const [message, setMessage] = useState("");
    const [showQuickAddModal, setShowQuickAddModal] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
    const [assignMode, setAssignMode] = useState<"group" | "user">("group");
    const [assignGroupId, setAssignGroupId] = useState("");
    const [assignUserId, setAssignUserId] = useState("");
    const [assignMessage, setAssignMessage] = useState("");
    const [assignLoading, setAssignLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [size, setSize] = useState(10);
    const [totalPages, setTotalPages] = useState(1);

    const [selectedDeviceId, setSelectedDeviceId] = useState("");
    const [selectedDevice, setSelectedDevice] = useState<DeviceDto | null>(null);

    const [selectedDeviceDetails, setSelectedDeviceDetails] = useState<DeviceDto | null>(null);
    const [editDeviceLoading, setEditDeviceLoading] = useState(false);
    const [editDeviceMessage, setEditDeviceMessage] = useState("");
    const [editDeviceForm, setEditDeviceForm] = useState({
        name: "",
        latitude: "",
        longitude: "",
        pollingInterval: "",
        fullThreshold: "",
    });

    const [telemetryLoading, setTelemetryLoading] = useState(false);
    const [telemetryHistory, setTelemetryHistory] = useState<Array<{ timestamp: number; fillLevel: number | null; throwCount: number | null; battery: number | null }>>([]);
    const [telemetryMessage, setTelemetryMessage] = useState("");

    const [configForm, setConfigForm] = useState({ targetBinFirmwareId: "", targetDesktopFirmwareId: "", targetAiModelFirmwareId: "" });
    const [configInitial, setConfigInitial] = useState({ targetBinFirmwareId: "", targetDesktopFirmwareId: "", targetAiModelFirmwareId: "" });
    const [configMessage, setConfigMessage] = useState("");
    const [configLoading, setConfigLoading] = useState(false);
    const [configFetchingId, setConfigFetchingId] = useState<string | null>(null);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showControlModal, setShowControlModal] = useState(false);

    const initialRpcMethod = getRpcMethodOptions(t)[0].method;
    const [selectedRpcMethod, setSelectedRpcMethod] = useState(initialRpcMethod);
    const [rpcParamsText, setRpcParamsText] = useState(getDefaultRpcParams(initialRpcMethod));
    const [rpcMessage, setRpcMessage] = useState("");
    const [rpcLoading, setRpcLoading] = useState(false);
    const [rpcResponseText, setRpcResponseText] = useState("");
    const [locationTextByKey, setLocationTextByKey] = useState<Record<string, string>>({});
    const [loadingLocationKeys, setLoadingLocationKeys] = useState<Record<string, boolean>>({});
    const [isClosing, setIsClosing] = useState(false);

    const [showCameraModal, setShowCameraModal] = useState(false);
    const [cameraDevice, setCameraDevice] = useState<DeviceDto | null>(null);

    const openLiveCamera = (device: DeviceDto) => {
        setCameraDevice(device);
        setShowCameraModal(true);
    };

    const sortedFirmwares = useMemo(
        () =>
            [...firmwares].sort(
                (left, right) => firmwareTimestamp(right) - firmwareTimestamp(left) || right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" })
            ),
        [firmwares]
    );

    const binFirmwares = useMemo(() => sortedFirmwares.filter((firmware) => firmware.type === "ESP32"), [sortedFirmwares]);
    const desktopFirmwares = useMemo(
        () => sortedFirmwares.filter((firmware) => firmware.type === "RASPBERRY_PI"),
        [sortedFirmwares]
    );

    const aiModelFirmwares = useMemo(
        () => sortedFirmwares.filter((firmware) => firmware.type === "AI_MODEL"),
        [sortedFirmwares]
    );

    const sortedUsers = useMemo(
        () =>
            [...users].sort(
                (left, right) =>
                    Number(right.state === "ACTIVE") - Number(left.state === "ACTIVE") ||
                    left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) ||
                    left.email.localeCompare(right.email, undefined, { sensitivity: "base" })
            ),
        [users]
    );

    const availableRpcOptions = useMemo(() => {
        const rpcMethodOptions = getRpcMethodOptions(t);
        if (role === "user") {
            const allowedMethods = ["openLid", "closeLid", "lockBin", "unlockBin", "forceSync"];
            return rpcMethodOptions.filter((option) => allowedMethods.includes(option.method));
        }
        return rpcMethodOptions;
    }, [role, t]);

    const isConfigDirty =
        Boolean(selectedDeviceId) &&
        Boolean(configForm?.targetBinFirmwareId || configForm?.targetDesktopFirmwareId || configForm?.targetAiModelFirmwareId) &&
        (configForm?.targetBinFirmwareId !== configInitial?.targetBinFirmwareId ||
            configForm?.targetDesktopFirmwareId !== configInitial?.targetDesktopFirmwareId ||
            configForm?.targetAiModelFirmwareId !== configInitial?.targetAiModelFirmwareId);

    const canAssignDevices = role === "admin";
    const canConfigureFirmware = role === "super_admin";
    const canControlDevice = role === "super_admin" || role === "admin" || role === "user";
    const canQuickAddDevice = role === "admin" || role === "user";
    const canBulkImportDevices = role === "admin";

    const addLocation = parseCoordinatePair(form.latitude, form.longitude);
    const editLocation = parseCoordinatePair(editDeviceForm.latitude, editDeviceForm.longitude);
    const canSubmitAddDevice = MAC_PATTERN.test(form.mac.trim()) && CLAIM_CODE_PATTERN.test(form.claimCode.trim()) && form.name.trim().length > 0 && addLocation !== null && !createLoading;

    const buildTelemetryHistory = useCallback((telemetries: TelemetryPayload) => {
        const binKeys = ['bin1', 'bin2', 'bin3', 'bin4'];
        const binPoints = binKeys.flatMap((k) => telemetries[k] ?? []);
        const totalPoints = telemetries['total_waste_count'] ?? [];
        const batteryPoints = telemetries['pin'] ?? [];

        type TempEntry = { timestamp: number; bins: number[]; throwCount: number | null; battery: number | null };
        const grouped = new Map<number, TempEntry>();

        binPoints.forEach((point) => {
            const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null, battery: null };
            const val = Number(point.value);
            if (!Number.isNaN(val)) existing.bins.push(val);
            grouped.set(point.ts, existing);
        });

        totalPoints.forEach((point) => {
            const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null, battery: null };
            const val = Number(point.value);
            existing.throwCount = Number.isNaN(val) ? null : val;
            grouped.set(point.ts, existing);
        });

        batteryPoints.forEach((point) => {
            const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null, battery: null };
            const val = Number(point.value);
            existing.battery = Number.isNaN(val) ? null : val;
            grouped.set(point.ts, existing);
        });

        const results = Array.from(grouped.values())
            .map((entry) => ({
                timestamp: entry.timestamp,
                fillLevel: entry.bins.length > 0 ? Math.round((entry.bins.reduce((s, v) => s + v, 0) / entry.bins.length) * 100) / 100 : null,
                throwCount: entry.throwCount,
                battery: entry.battery,
            }))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 50);

        return results;
    }, []);

    const loadRole = () => {
        const cachedRole = typeof window !== "undefined" ? localStorage.getItem("admin_role") : null;
        if (cachedRole === "super_admin" || cachedRole === "admin" || cachedRole === "user") {
            setRole(cachedRole);
            return;
        }

        const cachedRoles = typeof window !== "undefined" ? localStorage.getItem("admin_roles") : null;
        if (cachedRoles) {
            try {
                const parsedRoles = JSON.parse(cachedRoles) as unknown;
                if (Array.isArray(parsedRoles)) {
                    const accessRole = getCmsAccessRole(parsedRoles.filter((candidate): candidate is string => typeof candidate === "string"));
                    setRole(accessRole);
                }
            } catch {
                setRole(null);
            }
        }
    };

    const load = useCallback(async () => {
        const page = Number(searchParams.get("page")) || 1;
        const size = Number(searchParams.get("size")) || 10;

        const filterParams: Record<string, string | number> = {
            page,
            size,
        };

        // Chỉ lấy trực tiếp từ các param của bộ lọc Filter Modal
        const name = searchParams.get("name");
        if (name) filterParams.name = name;

        const mac = searchParams.get("mac");
        if (mac) filterParams.mac = mac;

        const groupId = searchParams.get("groupId");
        if (groupId) filterParams.groupId = groupId;

        const status = searchParams.get("status");
        if (status) filterParams.state = status; // Map "status" sang "state" cho API Backend

        const tenantId = searchParams.get("tenantId");
        if (tenantId) filterParams.tenantId = tenantId;

        // Gọi API Filter
        const response = await deviceApi.getFilterList(filterParams);

        setDevices(unwrapListPayload(response.data));
        setPage(page);
        setSize(size);

        if (!Array.isArray(response.data) && response.data) {
            const payload = response.data as Record<string, unknown>;
            const backendTotalPages = payload.totalPages;
            if (typeof backendTotalPages === "number" && Number.isFinite(backendTotalPages)) {
                setTotalPages(Math.max(1, backendTotalPages));
            } else {
                setTotalPages(1);
            }
        } else {
            setTotalPages(1);
        }
    }, [searchParams]);

    const loadFirmwares = async () => {
        const response = await firmwaresAdminApi.getFirmwares({ page: 1, size: 1000 });
        const items = unwrapListPayload(response.data);
        setFirmwares(items);
        return items;
    };

    useEffect(() => {
        void load();
        loadRole();
    }, [load]);

    useEffect(() => {
        void loadFirmwares().catch(() => {
            emitToast(t("loadFirmwareListError"), "error");
        });
        void (async () => {
            try {
                const resp = await deviceGroupsAdminApi.getDeviceGroups({ page: 1, size: 200 });
                const items = unwrapListPayload(resp.data);
                setDeviceGroups(items.map((item) => ({ id: item.id, code: item.code, name: item.name })));
            } catch {
                // ignore
            }
        })();

        if (role === "super_admin" || role === "admin") {
            (async () => {
                try {
                    const response = await usersAdminApi.getUsers({ page: 1, size: 200 });
                    setUsers(unwrapListPayload(response.data));
                } catch {
                    // ignore
                }
            })();
        }

        if (role === "super_admin") {
            (async () => {
                try {
                    const response = await tenantsAdminApi.getTenants({ page: 1, size: 100 });
                    const items = unwrapListPayload(response.data);
                    setPartners(items.map((item) => ({ id: item.id, name: item.name, keycloakId: item.keycloakId })));
                } catch {
                    // ignore
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role]);

    // useEffect(() => {
    //   setSearchQuery(searchParams.get("search") || "");
    // }, [searchParams]);

    useEffect(() => {
        setFilterInputs({
            name: searchParams.get("name") || "",
            mac: searchParams.get("mac") || "",
            groupId: searchParams.get("groupId") || "",
            status: searchParams.get("status") || "",
            tenantId: searchParams.get("tenantId") || "",
        });
    }, [searchParams]);

    // const handleSearch = (e: React.FormEvent) => {
    //   e.preventDefault();
    //   const params = new URLSearchParams();
    //   if (searchQuery.trim()) {
    //     params.set("search", searchQuery.trim());
    //   }
    //   params.set("page", "1");
    //   params.set("size", String(size));
    //   router.push(`${pathname}?${params.toString()}`);
    // };

    const handleApplyFilters = () => {
        const params = new URLSearchParams();
        Object.entries(filterInputs).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            }
        });
        params.set("page", "1");
        params.set("size", String(size));
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleClearFilters = () => {
        setFilterInputs({ name: "", mac: "", groupId: "", status: "", tenantId: "" });
        // setSearchQuery("");
        router.push(`${pathname}?page=1&size=${size}`);
    };

    const handleApplyFiltersAndClose = () => {
        handleApplyFilters();
        setShowFilterModal(false);
    };

    const handleClearFiltersAndClose = () => {
        handleClearFilters();
        setShowFilterModal(false);
    };

    const toggleDeviceSelection = (deviceId: string) => {
        setSelectedDeviceIds((current) =>
            current.includes(deviceId) ? current.filter((id) => id !== deviceId) : [...current, deviceId]
        );
    };

    const selectAllVisibleDevices = () => {
        setSelectedDeviceIds(devices.map((device) => device.id));
    };

    const assignSelectedDevices = async (event: FormEvent) => {
        event.preventDefault();

        if (!selectedDeviceIds.length) {
            emitToast(t("selectDeviceFirst"), "error");
            return;
        }

        if (assignMode === "group" && !assignGroupId) {
            emitToast(t("chooseTargetGroup"), "error");
            return;
        }

        if (assignMode === "user" && !assignUserId) {
            emitToast(t("chooseTargetUser"), "error");
            return;
        }

        setAssignLoading(true);

        try {
            const selectedDevices = devices.filter((device) => selectedDeviceIds.includes(device.id));

            if (assignMode === "group") {
                const response = await devicesAdminApi.assignDevicesToGroup({
                    groupId: assignGroupId,
                    macAddresses: selectedDevices.map((device) => device.mac),
                });

                const updatedCount = response.data?.length ?? selectedDevices.length;
                emitToast(t("assignGroupSuccess").replace("{count}", String(updatedCount)), "success");
            } else {
                const response = await devicesAdminApi.assignDevicesToUser({
                    userId: assignUserId,
                    macAddresses: selectedDevices.map((device) => device.mac),
                });

                const results = response.data ?? [];
                const successCount = results.filter((item) => item.status).length;
                const failedCount = results.length - successCount;

                const toastMessage = failedCount > 0
                    ? t("assignUserSuccessPartial")
                        .replace("{successCount}", String(successCount))
                        .replace("{total}", String(results.length))
                        .replace("{failedCount}", String(failedCount))
                    : t("assignUserSuccess").replace("{count}", String(successCount));
                emitToast(toastMessage, failedCount > 0 ? "info" : "success");
            }

            setSelectedDeviceIds([]);
            setAssignGroupId("");
            setAssignUserId("");
            await load();
        } catch (error) {
            emitToast(error instanceof Error ? error.message : t("assignmentFailed"), "error");
        } finally {
            setAssignLoading(false);
        }
    };

    const create = async (event: FormEvent) => {
        event.preventDefault();

        const normalizedMac = form.mac.trim().toUpperCase();
        const normalizedClaimCode = form.claimCode.trim();
        const normalizedName = form.name.trim();
        const normalizedLocation = addLocation;

        if (!MAC_PATTERN.test(normalizedMac)) {
            emitToast(t("invalidMacFormat"), "error");
            return;
        }

        if (!CLAIM_CODE_PATTERN.test(normalizedClaimCode)) {
            emitToast(t("invalidClaimCode"), "error");
            return;
        }

        if (!normalizedName) {
            emitToast(t("deviceNameRequired"), "error");
            return;
        }

        if (!normalizedLocation) {
            emitToast(t("invalidLocationSelected"), "error");
            return;
        }

        setCreateLoading(true);

        try {
            if (role === "admin") {
                const importResponse = await devicesAdminApi.importDevices({
                    devices: [
                        {
                            mac: normalizedMac,
                            claimCode: normalizedClaimCode,
                            name: normalizedName,
                            latitude: normalizedLocation.latitude,
                            longitude: normalizedLocation.longitude,
                        },
                    ],
                });

                const result = importResponse.data?.[0];
                const success = result?.status ? String(result.status).toLowerCase() : "";

                if (success !== "success" && success !== "ok" && success !== "created" && success !== "imported") {
                    emitToast(result?.message || t("addDeviceError"), "error");
                    return;
                }
            } else {
                const claimResponse = await deviceApi.add({
                    mac: normalizedMac,
                    name: normalizedName,
                    claimCode: normalizedClaimCode,
                    latitude: normalizedLocation.latitude,
                    longitude: normalizedLocation.longitude,
                });

                if (!claimResponse.success || !claimResponse.data) {
                    emitToast(claimResponse.message || t("addDeviceError"), "error");
                    return;
                }

                const createdDevice = claimResponse.data;
                const pollingInterval = parseOptionalNumber(form.pollingInterval);
                const fullThreshold = parseOptionalNumber(form.fullThreshold);

                if (pollingInterval !== undefined || fullThreshold !== undefined) {
                    const updateResponse = await deviceApi.update(createdDevice.id, {
                        name: normalizedName,
                        latitude: normalizedLocation.latitude,
                        longitude: normalizedLocation.longitude,
                        pollingInterval,
                        fullThreshold,
                        scope: "SERVER_SCOPE",
                        additionalAttributes: {},
                    });

                    if (!updateResponse.success) {
                        emitToast(updateResponse.message || t("deviceConfigFailed"), "error");
                        return;
                    }
                }
            }

            setForm({
                mac: "",
                name: "",
                claimCode: "",
                latitude: "",
                longitude: "",
                pollingInterval: "",
                fullThreshold: "",
            });
            emitToast(t("deviceAddedSuccess"), "success");
            setShowQuickAddModal(false);
            await load();
        } catch (error) {
            emitToast(error instanceof Error ? error.message : t("addDeviceError"), "error");
        } finally {
            setCreateLoading(false);
        }
    };

    const openQuickAddModal = () => {
        setForm({
            mac: "",
            name: "",
            claimCode: "",
            latitude: "21.0056",
            longitude: "105.8434",
            pollingInterval: "",
            fullThreshold: "",
        });
        setShowQuickAddModal(true);
    };

    const closeQuickAddModal = () => {
        setShowQuickAddModal(false);
        setForm({
            mac: "",
            name: "",
            claimCode: "",
            latitude: "",
            longitude: "",
            pollingInterval: "",
            fullThreshold: "",
        });
    };

    const openDeviceDetails = useCallback(async (device: DeviceDto) => {
        setSelectedDeviceDetails(device);
        setEditDeviceForm({
            name: device.name || "",
            latitude: device.latitude?.toString() || "21.0056",
            longitude: device.longitude?.toString() || "105.8434",
            pollingInterval: device.userConfigs?.polling_interval?.toString() || "",
            fullThreshold: device.userConfigs?.full_threshold?.toString() || "",
        });
        setEditDeviceMessage("");

        setTelemetryMessage("");
        setTelemetryLoading(true);
        try {
            const now = Date.now();
            const response = await devicesAdminApi.getTelemetries(device.id, {
                keys: 'bin1,bin2,bin3,bin4,total_waste_count,pin',
                startTs: now - 7 * 24 * 60 * 60 * 1000,
                endTs: now,
                limit: 200,
            });

            if (!response || !response.success || !response.data) {
                setTelemetryHistory([]);
                emitToast(response?.message || t("noTelemetryData"), "info");
                return;
            }

            const history = buildTelemetryHistory(response.data as TelemetryPayload);
            setTelemetryHistory(history);
            if (history.length === 0) emitToast(t("noTelemetryPoints"), "info");
        } catch (err) {
            setTelemetryHistory([]);
            emitToast(err instanceof Error ? err.message : t("loadTelemetryError"), "error");
        } finally {
            setTelemetryLoading(false);
        }
    }, [buildTelemetryHistory, t]);

    const openDeviceDetailsById = useCallback(
        async (deviceId: string) => {
            const existingDevice = devices.find((device) => device.id === deviceId);

            if (existingDevice) {
                await openDeviceDetails(existingDevice);
                return;
            }

            try {
                const response = await deviceApi.getDetail(deviceId);
                if (response.success && response.data) {
                    await openDeviceDetails(response.data);
                    return;
                }

                emitToast(t("loadDeviceError"), "error");
            } catch (error) {
                emitToast(error instanceof Error ? error.message : t("loadDeviceError"), "error");
            }
        },
        [devices, openDeviceDetails, t],
    );

    const closeDeviceDetails = () => {
        if (editDeviceLoading) return;

        setIsClosing(true);
        setSelectedDeviceDetails(null);

        const params = new URLSearchParams(searchParams.toString());
        params.delete("deviceId");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const saveDeviceDetails = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedDeviceDetails) return;

        setEditDeviceLoading(true);

        const loc = parseCoordinatePair(editDeviceForm.latitude, editDeviceForm.longitude);
        if (!loc && (editDeviceForm.latitude || editDeviceForm.longitude)) {
            emitToast(t("provideValidCoordinates"), "error");
            setEditDeviceLoading(false);
            return;
        }

        try {
            await deviceApi.update(selectedDeviceDetails.id, {
                name: editDeviceForm.name.trim(),
                latitude: loc?.latitude,
                longitude: loc?.longitude,
                pollingInterval: parseOptionalNumber(editDeviceForm.pollingInterval),
                fullThreshold: parseOptionalNumber(editDeviceForm.fullThreshold),
                scope: "SERVER_SCOPE",
                additionalAttributes: {},
            });

            emitToast(t("deviceDetailsUpdated"), "success");
            await load();

            setSelectedDeviceDetails(current =>
                current ? {
                    ...current,
                    name: editDeviceForm.name.trim(),
                    latitude: loc?.latitude,
                    longitude: loc?.longitude,
                    pollingInterval: parseOptionalNumber(editDeviceForm.pollingInterval),
                    fullThreshold: parseOptionalNumber(editDeviceForm.fullThreshold),
                } : null
            );
        } catch (error) {
            emitToast(error instanceof Error ? error.message : t("updateDeviceDetailsError"), "error");
        } finally {
            setEditDeviceLoading(false);
        }
    };

    const openConfig = async (device: DeviceDto) => {
        setConfigFetchingId(device.id);
        setSelectedDeviceId(device.id);
        setSelectedDevice(device);
        setConfigLoading(true);
        setShowConfigModal(true);

        try {
            const firmwareItems = firmwares.length > 0 ? firmwares : await loadFirmwares();
            const response = await devicesAdminApi.getDeviceConfig(device.id);
            const config = response?.data || {};

            const targetBinFirmwareId =
                config.targetBinFirmwareId || firmwareItems.find((firmware) => firmware.type === "ESP32" && firmware.version === config.targetBinVersion)?.id || getLatestFirmware(firmwareItems, "ESP32")?.id || "";
            const targetDesktopFirmwareId =
                config.targetDesktopFirmwareId || firmwareItems.find((firmware) => firmware.type === "RASPBERRY_PI" && firmware.version === config.targetDesktopVersion)?.id || getLatestFirmware(firmwareItems, "RASPBERRY_PI")?.id || "";
            const targetAiModelFirmwareId =
                config.targetAiModelFirmwareId || firmwareItems.find((firmware) => firmware.type === "AI_MODEL" && firmware.version === config.targetAiModelVersion)?.id || getLatestFirmware(firmwareItems, "AI_MODEL")?.id || "";

            setConfigForm({ targetBinFirmwareId, targetDesktopFirmwareId, targetAiModelFirmwareId });
            setConfigInitial({ targetBinFirmwareId, targetDesktopFirmwareId, targetAiModelFirmwareId });
            setDevices((current) =>
                current.map((item) =>
                    item.id === device.id
                        ? {
                            ...item,
                            targetBinVersion: config.targetBinVersion || item.binFirmware?.targetVersion,
                            targetDesktopVersion: config.targetDesktopVersion || item.desktopFirmware?.targetVersion,
                            targetAiModelVersion: config.targetAiModelVersion || item.aiModelFirmware?.targetVersion,
                        }
                        : item
                )
            );
        } catch (error) {
            const fallbackBin = getLatestFirmware(firmwares.length > 0 ? firmwares : await loadFirmwares(), "ESP32")?.id || "";
            const fallbackDesktop = getLatestFirmware(firmwares.length > 0 ? firmwares : await loadFirmwares(), "RASPBERRY_PI")?.id || "";
            const fallbackAiModel = getLatestFirmware(firmwares.length > 0 ? firmwares : await loadFirmwares(), "AI_MODEL")?.id || "";
            setConfigForm({ targetBinFirmwareId: fallbackBin, targetDesktopFirmwareId: fallbackDesktop, targetAiModelFirmwareId: fallbackAiModel });
            setConfigInitial({ targetBinFirmwareId: fallbackBin, targetDesktopFirmwareId: fallbackDesktop, targetAiModelFirmwareId: fallbackAiModel });
            emitToast(error instanceof Error ? error.message : t("loadCurrentConfigError"), "error");
        } finally {
            setConfigLoading(false);
            setConfigFetchingId(null);
        }
    };

    const openControlModal = (device: DeviceDto) => {
        if (!canControlDevice) return;

        const defaultMethod = availableRpcOptions[0]?.method ?? "openLid";

        setSelectedDeviceId(device.id);
        setSelectedDevice(device);
        setSelectedRpcMethod(defaultMethod);
        setRpcParamsText(getDefaultRpcParams(defaultMethod));
        setRpcResponseText("");
        setShowControlModal(true);
    };

    const closeControlModal = () => {
        if (rpcLoading) return;
        setShowControlModal(false);
        setSelectedDeviceId("");
        setSelectedDevice(null);

        const defaultMethod = availableRpcOptions[0]?.method ?? "openLid";
        setSelectedRpcMethod(defaultMethod);
        setRpcParamsText(getDefaultRpcParams(defaultMethod));
        setRpcResponseText("");
    };

    const executeSelectedRpc = async (event: FormEvent) => {
        event.preventDefault();

        if (!selectedDevice || !canControlDevice) return;

        let parsedParams: unknown = {};
        if (rpcParamsText.trim()) {
            try {
                parsedParams = JSON.parse(rpcParamsText);
            } catch {
                emitToast(t("invalidJsonParams"), "error");
                return;
            }
        }

        setRpcLoading(true);
        setRpcResponseText("");

        try {
            const response = await devicesAdminApi.executeRpc(selectedDevice.id, {
                method: selectedRpcMethod,
                params: parsedParams,
            });

            setRpcResponseText(JSON.stringify(response.data ?? response, null, 2));
            emitToast(response.message || t("commandSentSuccess"), "success");
        } catch (error) {
            emitToast(error instanceof Error ? error.message : t("sendCommandError"), "error");
        } finally {
            setRpcLoading(false);
        }
    };

    const closeConfigModal = () => {
        if (configLoading) return;
        setShowConfigModal(false);
        setSelectedDeviceId("");
        setSelectedDevice(null);
        setConfigForm({ targetBinFirmwareId: "", targetDesktopFirmwareId: "", targetAiModelFirmwareId: "" });
        setConfigInitial({ targetBinFirmwareId: "", targetDesktopFirmwareId: "", targetAiModelFirmwareId: "" });
        setConfigMessage("");
    };

    const confirmConfig = async (event: FormEvent) => {
        event.preventDefault();
        if (!selectedDevice) return;

        if (!isConfigDirty) {
            emitToast(t("noChangesDetected"), "info");
            return;
        }

        setConfigLoading(true);

        try {
            await devicesAdminApi.updateAdminConfig(selectedDevice.id, {
                targetBinFirmwareId: configForm.targetBinFirmwareId || undefined,
                targetDesktopFirmwareId: configForm.targetDesktopFirmwareId || undefined,
                targetAiModelFirmwareId: configForm.targetAiModelFirmwareId || undefined,
            });

            const binFirmware = firmwares.find((firmware) => firmware.id === configForm.targetBinFirmwareId);
            const desktopFirmware = firmwares.find((firmware) => firmware.id === configForm.targetDesktopFirmwareId);
            const aiModelFirmware = firmwares.find((firmware) => firmware.id === configForm.targetAiModelFirmwareId);
            setDevices((current) =>
                current.map((item) =>
                    item.id === selectedDevice.id
                        ? {
                            ...item,
                            targetBinVersion: binFirmware?.version || item.binFirmware?.targetVersion,
                            targetDesktopVersion: desktopFirmware?.version || item.desktopFirmware?.targetVersion,
                            targetAiModelVersion: aiModelFirmware?.version || item.aiModelFirmware?.targetVersion,
                        }
                        : item
                )
            );
            setSelectedDevice((current) =>
                current
                    ? {
                        ...current,
                        targetBinVersion: binFirmware?.version || current.binFirmware?.targetVersion,
                        targetDesktopVersion: desktopFirmware?.version || current.desktopFirmware?.targetVersion,
                        targetAiModelVersion: aiModelFirmware?.version || current.aiModelFirmware?.targetVersion,
                    }
                    : current
            );
            setConfigInitial(configForm);
            emitToast(t("targetVersionsUpdated"), "success");
        } catch (error) {
            emitToast(error instanceof Error ? error.message : t("saveConfigError"), "error");
        } finally {
            setConfigLoading(false);
        }
    };

    const resolveLocationText = useCallback(
        async (latitude?: number, longitude?: number) => {
            const key = toLocationKey(latitude, longitude);
            if (!key) return;
            if (locationTextByKey[key] || loadingLocationKeys[key]) return;

            setLoadingLocationKeys((current) => ({ ...current, [key]: true }));

            try {
                if (!mapboxToken) {
                    setLocationTextByKey((current) => ({ ...current, [key]: toCoordinateText(latitude, longitude, t) }));
                    return;
                }

                const response = await fetch(
                    `https://api.mapbox.com/geocoding/v5/mapbox.places/${Number(longitude).toFixed(6)},${Number(latitude).toFixed(6)}.json?types=address,place,locality,neighborhood,region,district&limit=1&language=en&access_token=${mapboxToken}`,
                );

                if (!response.ok) {
                    setLocationTextByKey((current) => ({ ...current, [key]: toCoordinateText(latitude, longitude, t) }));
                    return;
                }

                const payload = (await response.json()) as {
                    features?: Array<{ place_name?: string }>;
                };
                const placeName = payload.features?.[0]?.place_name?.trim();

                setLocationTextByKey((current) => ({
                    ...current,
                    [key]: placeName || toCoordinateText(latitude, longitude, t),
                }));
            } catch {
                setLocationTextByKey((current) => ({ ...current, [key]: toCoordinateText(latitude, longitude, t) }));
            } finally {
                setLoadingLocationKeys((current) => ({ ...current, [key]: false }));
            }
        },
        [loadingLocationKeys, locationTextByKey, mapboxToken, t],
    );

    useEffect(() => {
        if (!selectedDeviceDetails) return;
        void resolveLocationText(selectedDeviceDetails.latitude, selectedDeviceDetails.longitude);
    }, [resolveLocationText, selectedDeviceDetails]);

    useEffect(() => {
        const deviceId = searchParams.get("deviceId");

        if (!deviceId) {
            setIsClosing(false);
            return;
        }

        if (isClosing || selectedDeviceDetails?.id === deviceId) return;

        void openDeviceDetailsById(deviceId);
    }, [openDeviceDetailsById, searchParams, selectedDeviceDetails?.id, isClosing]);

    useEffect(() => {
        if (!selectedDevice) return;
        void resolveLocationText(selectedDevice.latitude, selectedDevice.longitude);
    }, [resolveLocationText, selectedDevice]);

    useEffect(() => {
        devices.forEach((device) => {
            if (device.latitude !== undefined && device.longitude !== undefined) {
                void resolveLocationText(device.latitude, device.longitude);
            }
        });
    }, [devices, resolveLocationText]);

    const handleSetPage = (newPage: number) => {
        const params = new URLSearchParams(searchParams);
        params.set("page", String(newPage));
        router.push(`${pathname}?${params.toString()}`);
    };

    const handleSetSize = (newSize: number) => {
        const params = new URLSearchParams(searchParams);
        params.set("size", String(newSize));
        params.set("page", "1");
        router.push(`${pathname}?${params.toString()}`);
    };

    const getLocationText = (lat?: number, lng?: number) => {
        const key = toLocationKey(lat, lng);
        const isResolving = key ? Boolean(loadingLocationKeys[key]) : false;
        const text = key ? locationTextByKey[key] : "";
        return isResolving ? t("resolvingAddress") : (text || toCoordinateText(lat, lng, t));
    };

    return (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
            <Panel
                title={t("devicesTitle")}
                subtitle={t("devicesSubtitle")}
                action={
                    <div className="flex items-center gap-2">
                        {/* Chỉ giữ lại mỗi nút Filter */}
                        <button
                            type="button"
                            onClick={() => setShowFilterModal(true)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {t("filterBtn")}
                        </button>
                    </div>
                }
            >
                <DevicesTable
                    devices={devices}
                    selectedDeviceIds={selectedDeviceIds}
                    selectedDeviceId={selectedDeviceId}
                    canAssignDevices={canAssignDevices}
                    canControlDevice={canControlDevice}
                    canConfigureFirmware={canConfigureFirmware}
                    configLoading={configLoading}
                    configFetchingId={configFetchingId}
                    onToggleSelection={toggleDeviceSelection}
                    onOpenControlModal={openControlModal}
                    onOpenDetails={role !== 'super_admin' ? openDeviceDetails : undefined}
                    onOpenConfig={openConfig}
                    getLocationText={getLocationText}
                    onOpenLiveCamera={openLiveCamera}
                    t={t}
                    page={page}
                    totalPages={totalPages}
                    size={size}
                    setPage={handleSetPage}
                    setSize={handleSetSize}
                />
            </Panel>

            <div className="space-y-4">
                {canAssignDevices ? (
                    <AssignDevicesPanel
                        canAssignDevices={canAssignDevices}
                        selectedDeviceIds={selectedDeviceIds}
                        devices={devices}
                        deviceGroups={deviceGroups}
                        sortedUsers={sortedUsers}
                        assignSelectedDevices={assignSelectedDevices}
                        selectAllVisibleDevices={selectAllVisibleDevices}
                        setSelectedDeviceIds={setSelectedDeviceIds}
                        assignMode={assignMode}
                        setAssignMode={setAssignMode}
                        assignGroupId={assignGroupId}
                        setAssignGroupId={setAssignGroupId}
                        assignUserId={assignUserId}
                        setAssignUserId={setAssignUserId}
                        assignMessage={assignMessage}
                        assignLoading={assignLoading}
                        t={t}
                    />
                ) : null}

                {canBulkImportDevices ? (
                    <Panel title={t("bulkImportTitle")}>
                        <ImportDevicesPanel onImported={() => void load()} />
                    </Panel>
                ) : null}

                {canQuickAddDevice ? (
                    <Panel
                        title={t("quickAddTitle")}
                        subtitle={t("quickAddSubtitle")}
                        action={canQuickAddDevice ? (
                            <button type="button" onClick={openQuickAddModal} className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white">
                                {t("addDeviceBtn")}
                            </button>
                        ) : null}
                    >
                        <p className="text-sm text-slate-600">{t("quickAddDesc")}</p>
                    </Panel>
                ) : null}
            </div>

            <DeviceDetailsModal
                device={selectedDeviceDetails}
                onClose={closeDeviceDetails}
                onSave={saveDeviceDetails}
                editDeviceForm={editDeviceForm}
                setEditDeviceForm={setEditDeviceForm}
                editDeviceLoading={editDeviceLoading}
                editDeviceMessage={editDeviceMessage}
                editLocation={editLocation}
                telemetryLoading={telemetryLoading}
                telemetryMessage={telemetryMessage}
                telemetryHistory={telemetryHistory}
                locationTextByKey={locationTextByKey}
                loadingLocationKeys={loadingLocationKeys}
                t={t}
            />

            <DeviceControlModal
                isOpen={showControlModal && canControlDevice}
                onClose={closeControlModal}
                onExecute={executeSelectedRpc}
                device={selectedDevice}
                availableRpcOptions={availableRpcOptions}
                selectedRpcMethod={selectedRpcMethod}
                setSelectedRpcMethod={setSelectedRpcMethod}
                rpcParamsText={rpcParamsText}
                setRpcParamsText={setRpcParamsText}
                rpcMessage={rpcMessage}
                setRpcMessage={setRpcMessage}
                rpcLoading={rpcLoading}
                rpcResponseText={rpcResponseText}
                setRpcResponseText={setRpcResponseText}
                t={t}
            />

            <ConfigureFirmwareModal
                isOpen={showConfigModal}
                onClose={closeConfigModal}
                onConfirm={confirmConfig}
                device={selectedDevice}
                form={configForm}
                setForm={setConfigForm}
                binFirmwares={binFirmwares}
                desktopFirmwares={desktopFirmwares}
                aiModelFirmwares={aiModelFirmwares}
                isDirty={isConfigDirty}
                isLoading={configLoading}
                message={configMessage}
                locationTextByKey={locationTextByKey}
                loadingLocationKeys={loadingLocationKeys}
                t={t}
            />

            <AddDeviceModal
                isOpen={showQuickAddModal}
                onClose={closeQuickAddModal}
                onCreate={create}
                form={form}
                setForm={setForm}
                message={message}
                createLoading={createLoading}
                canSubmitAddDevice={canSubmitAddDevice}
                addLocation={addLocation}
                t={t}
            />

            {showFilterModal && (
                <Modal title={t("filterDevicesTitle")} subtitle={t("applyFiltersToView")} onClose={() => setShowFilterModal(false)}>
                    <DevicesFilterPanel
                        filters={filterInputs}
                        onFiltersChange={setFilterInputs}
                        onApply={handleApplyFiltersAndClose}
                        onClear={handleClearFiltersAndClose}
                        deviceGroups={deviceGroups}
                        tenants={role === "super_admin" ? partners : undefined}
                        t={t}
                    />
                </Modal>
            )}

            <DeviceCameraModal
                isOpen={showCameraModal}
                onClose={() => {
                    setShowCameraModal(false);
                    setCameraDevice(null);
                }}
                device={cameraDevice}
                t={t}
            />

            {!showQuickAddModal && !showConfigModal && message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
    );
}

// ==========================================
// 2. EXPORTED DEFAULT COMPONENT WRAPPED IN SUSPENSE
// ==========================================
export default function DevicesPage() {
    const { t } = useLanguage();
    return (
        <Suspense fallback={<div className="p-4 text-slate-500">{t("loading")}...</div>}>
            <DevicesPageContent />
        </Suspense>
    );
}