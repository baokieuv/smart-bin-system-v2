"use client";

import ImportDevicesPanel from "@/components/devices/import-devices";
import { LocationPickerMap, type LocationValue } from "@/components/layout/location-picker-map";
import Modal from "@/components/ui/modal";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { getCmsAccessRole } from "@/lib/auth-session";
import { deviceApi } from "@/services/api/device";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import { deviceGroupsAdminApi } from "@/services/api/device-groups-admin";
import { usersAdminApi } from "@/services/api/users-admin";
import type { DeviceDto } from "@/types/device";
import type { FirmwareDto } from "@/types/firmware";
import type { UserDto } from "@/types/user";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type RpcMethodOption = {
  method: string;
  label: string;
  type: "ONE_WAY" | "TWO_WAY";
  description: string;
};

const rpcMethodOptions: RpcMethodOption[] = [
  { method: "openLid", label: "Open Lid", type: "TWO_WAY", description: "Send a command to open the device lid." },
  { method: "closeLid", label: "Close Lid", type: "TWO_WAY", description: "Send a command to close the device lid." },
  { method: "lockBin", label: "Lock Bin", type: "TWO_WAY", description: "Remotely lock the bin." },
  { method: "unlockBin", label: "Unlock Bin", type: "TWO_WAY", description: "Remotely unlock the bin." },
  { method: "forceSync", label: "Force Sync", type: "ONE_WAY", description: "Force the device to synchronize its status and data." },
  { method: "triggerAlarmAlert", label: "Trigger Alert", type: "ONE_WAY", description: "Manually trigger an alert on the device." },
  { method: "rebootDevice", label: "Reboot Device", type: "ONE_WAY", description: "Remotely reboot the device." },
  { method: "calibrateSensor", label: "Calibrate Sensors", type: "TWO_WAY", description: "Start the sensor calibration process." },
  { method: "setPollingInterval", label: "Set Polling Interval", type: "TWO_WAY", description: "Update how often the device checks in." },
  { method: "clearHardwareError", label: "Clear Hardware Errors", type: "TWO_WAY", description: "Clear existing hardware error states." },
  { method: "triggerOtaUpdate", label: "Trigger OTA Update", type: "ONE_WAY", description: "Start an over-the-air update process." },
];

const getRpcMethodOption = (method: string) => rpcMethodOptions.find((option) => option.method === method) ?? rpcMethodOptions[0];

const getDefaultRpcParams = (method: string) => {
  switch (method) {
    case "setPollingInterval":
      return JSON.stringify({ intervalSeconds: 60 }, null, 2);
    case "triggerAlarmAlert":
      return JSON.stringify({ message: "Manual alert" }, null, 2);
    case "calibrateSensor":
      return JSON.stringify({}, null, 2);
    default:
      return JSON.stringify({}, null, 2);
  }
};

const firmwareLabel = (firmware: FirmwareDto) => {
  const suffix = firmware.description ? ` - ${firmware.description}` : "";
  return `${firmware.version}${suffix}`;
};

const firmwareTimestamp = (firmware: FirmwareDto) => {
  if (!firmware.createdDate) return 0;
  const parsed = Date.parse(firmware.createdDate);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLatestFirmware = (firmwares: FirmwareDto[], type: "ESP32" | "RASPBERRY_PI") =>
  [...firmwares]
    .filter((firmware) => firmware.type === type)
    .sort((left, right) => firmwareTimestamp(right) - firmwareTimestamp(left) || right.version.localeCompare(left.version, undefined, { numeric: true, sensitivity: "base" }))[0];

const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
const CLAIM_CODE_PATTERN = /^.{6}$/;

const formatMacAddress = (rawValue: string) => {
  const normalized = rawValue
    .toUpperCase()
    .replace(/[^0-9A-F]/g, "")
    .slice(0, 12);

  const pairs = normalized.match(/.{1,2}/g);
  return pairs ? pairs.join(":") : "";
};

const parseCoordinatePair = (latitudeValue: string, longitudeValue: string): LocationValue | null => {
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
};

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const toLocationKey = (latitude?: number, longitude?: number) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  return `${Number(latitude).toFixed(6)},${Number(longitude).toFixed(6)}`;
};

const toCoordinateText = (latitude?: number, longitude?: number) => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "Location unavailable";
  return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
};

export default function DevicesPage() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [firmwares, setFirmwares] = useState<FirmwareDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [role, setRole] = useState<"super_admin" | "admin" | "user" | null>(null);
  const [form, setForm] = useState({
    mac: "",
    name: "",
    claimCode: "",
    latitude: "",
    longitude: "",
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

  // Edit & Details State
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

  // Telemetry state (Integrated into Details Modal)
  const [telemetryLoading, setTelemetryLoading] = useState(false);
  const [telemetryHistory, setTelemetryHistory] = useState<Array<{ timestamp: number; fillLevel: number | null; throwCount: number | null }>>([]);
  const [telemetryMessage, setTelemetryMessage] = useState("");

  const [configForm, setConfigForm] = useState({ targetBinFirmwareId: "", targetDesktopFirmwareId: "" });
  const [configInitial, setConfigInitial] = useState({ targetBinFirmwareId: "", targetDesktopFirmwareId: "" });
  const [configMessage, setConfigMessage] = useState("");
  const [configLoading, setConfigLoading] = useState(false);
  const [configFetchingId, setConfigFetchingId] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showControlModal, setShowControlModal] = useState(false);
  
  const [selectedRpcMethod, setSelectedRpcMethod] = useState(rpcMethodOptions[0].method);
  const [rpcParamsText, setRpcParamsText] = useState(getDefaultRpcParams(rpcMethodOptions[0].method));
  const [rpcMessage, setRpcMessage] = useState("");
  const [rpcLoading, setRpcLoading] = useState(false);
  const [rpcResponseText, setRpcResponseText] = useState("");
  const [locationTextByKey, setLocationTextByKey] = useState<Record<string, string>>({});
  const [loadingLocationKeys, setLoadingLocationKeys] = useState<Record<string, boolean>>({});

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
    if (role === "user") {
      const allowedMethods = ["openLid", "closeLid", "lockBin", "unlockBin", "forceSync"];
      return rpcMethodOptions.filter((option) => allowedMethods.includes(option.method));
    }
    return rpcMethodOptions;
  }, [role]);

  const isConfigDirty =
    Boolean(selectedDeviceId) &&
    Boolean(configForm?.targetBinFirmwareId || configForm?.targetDesktopFirmwareId) &&
    (configForm?.targetBinFirmwareId !== configInitial?.targetBinFirmwareId ||
      configForm?.targetDesktopFirmwareId !== configInitial?.targetDesktopFirmwareId);

  const canAssignDevices = role === "super_admin" || role === "admin";
  const canConfigureFirmware = role === "super_admin";
  const canControlDevice = role === "super_admin" || role === "admin" || role === "user";
  
  const addLocation = parseCoordinatePair(form.latitude, form.longitude);
  const editLocation = parseCoordinatePair(editDeviceForm.latitude, editDeviceForm.longitude);
  const isMacValid = MAC_PATTERN.test(form.mac.trim());
  const isClaimCodeValid = CLAIM_CODE_PATTERN.test(form.claimCode.trim());
  const isNameValid = form.name.trim().length > 0;
  const canSubmitAddDevice = isMacValid && isClaimCodeValid && isNameValid && addLocation !== null && !createLoading;

  const formatTimeShort = (ts: number) =>
    new Date(ts).toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });

  const buildTelemetryHistory = (telemetries: Record<string, Array<{ ts: number; value: string }>>) => {
    const binKeys = ['bin1', 'bin2', 'bin3', 'bin4'];
    const binPoints = binKeys.flatMap((k) => telemetries[k] ?? []);
    const totalPoints = telemetries['total_waste_count'] ?? [];

    type TempEntry = { timestamp: number; bins: number[]; throwCount: number | null };
    const grouped = new Map<number, TempEntry>();

    binPoints.forEach((point) => {
      const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null };
      const val = Number(point.value);
      if (!Number.isNaN(val)) existing.bins.push(val);
      grouped.set(point.ts, existing);
    });

    totalPoints.forEach((point) => {
      const existing = grouped.get(point.ts) ?? { timestamp: point.ts, bins: [], throwCount: null };
      const val = Number(point.value);
      existing.throwCount = Number.isNaN(val) ? null : val;
      grouped.set(point.ts, existing);
    });

    const results = Array.from(grouped.values())
      .map((entry) => ({
        timestamp: entry.timestamp,
        fillLevel: entry.bins.length > 0 ? Math.round((entry.bins.reduce((s, v) => s + v, 0) / entry.bins.length) * 100) / 100 : null,
        throwCount: entry.throwCount,
      }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);

    return results;
  };

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

  const load = useCallback(async (nextPage = page, nextSize = size) => {
    const response = await devicesAdminApi.getDevices({ page: nextPage, size: nextSize });
    setDevices(unwrapListPayload(response.data));

    if (!Array.isArray(response.data) && response.data) {
      const payload = response.data as Record<string, unknown>;
      const backendTotalPages = payload.totalPages;
      if (typeof backendTotalPages === "number" && Number.isFinite(backendTotalPages)) {
        setTotalPages(Math.max(1, backendTotalPages));
      }
    }
  }, [page, size]);

  const loadFirmwares = async () => {
    const response = await firmwaresAdminApi.getFirmwares({ page: 1, size: 1000 });
    const items = unwrapListPayload(response.data);
    setFirmwares(items);
    return items;
  };

  useEffect(() => {
    loadRole();
    void load(page, size);
  }, [load, page, size]);

  useEffect(() => {
    void loadFirmwares().catch(() => {
      setConfigMessage("We couldn't load the firmware list at this time.");
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
    void (async () => {
      try {
        const response = await usersAdminApi.getUsers({ page: 1, size: 200 });
        setUsers(unwrapListPayload(response.data));
      } catch {
        // ignore
      }
    })();
  }, []);

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
      setAssignMessage("Please select at least one device first.");
      return;
    }

    if (assignMode === "group" && !assignGroupId) {
      setAssignMessage("Please choose a target group.");
      return;
    }

    if (assignMode === "user" && !assignUserId) {
      setAssignMessage("Please choose a target user.");
      return;
    }

    setAssignLoading(true);
    setAssignMessage("");

    try {
      const selectedDevices = devices.filter((device) => selectedDeviceIds.includes(device.id));

      if (assignMode === "group") {
        const response = await devicesAdminApi.assignDevicesToGroup({
          groupId: assignGroupId,
          macAddresses: selectedDevices.map((device) => device.mac),
        });

        const updatedCount = response.data?.length ?? selectedDevices.length;
        setAssignMessage(`Assigned ${updatedCount} device${updatedCount !== 1 ? "s" : ""} to the group!`);
      } else {
        const response = await devicesAdminApi.assignDevicesToUser({
          userId: assignUserId,
          macAddresses: selectedDevices.map((device) => device.mac),
        });

        const results = response.data ?? [];
        const successCount = results.filter((item) => item.status).length;
        const failedCount = results.length - successCount;
        setAssignMessage(
          failedCount > 0
            ? `Assigned ${successCount}/${results.length} devices. ${failedCount} device(s) need your attention.`
            : `Assigned ${successCount} device${successCount !== 1 ? "s" : ""} to the user!`
        );
      }

      setSelectedDeviceIds([]);
      setAssignGroupId("");
      setAssignUserId("");
      await load(page, size);
    } catch (error) {
      setAssignMessage(error instanceof Error ? error.message : "Assignment failed. Please try again.");
    } finally {
      setAssignLoading(false);
    }
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();

    const normalizedMac = form.mac.trim().toUpperCase();
    const normalizedClaimCode = form.claimCode.trim();
    const normalizedName = form.name.trim();

    if (!MAC_PATTERN.test(normalizedMac)) {
      setMessage("Invalid MAC address format. Use AA:BB:CC:DD:EE:FF.");
      return;
    }

    if (!CLAIM_CODE_PATTERN.test(normalizedClaimCode)) {
      setMessage("Claim code must be exactly 6 characters.");
      return;
    }

    if (!normalizedName) {
      setMessage("Device name is required.");
      return;
    }

    if (!addLocation) {
      setMessage("Please select a valid location on the map.");
      return;
    }

    setCreateLoading(true);
    setMessage("");

    try {
      const claimResponse = await deviceApi.add({
        mac: normalizedMac,
        name: normalizedName,
        claimCode: normalizedClaimCode,
        latitude: addLocation.latitude,
        longitude: addLocation.longitude,
      });

      if (!claimResponse.success || !claimResponse.data) {
        setMessage(claimResponse.message || "We couldn't add the device right now.");
        return;
      }

      const createdDevice = claimResponse.data;
      const pollingInterval = parseOptionalNumber(form.pollingInterval);
      const fullThreshold = parseOptionalNumber(form.fullThreshold);

      if (pollingInterval !== undefined || fullThreshold !== undefined) {
        const updateResponse = await deviceApi.update(createdDevice.id, {
          name: normalizedName,
          latitude: addLocation.latitude,
          longitude: addLocation.longitude,
          pollingInterval,
          fullThreshold,
          scope: "SERVER_SCOPE",
          additionalAttributes: {},
        });

        if (!updateResponse.success) {
          setMessage(updateResponse.message || "Device was added, but applying configurations failed.");
          return;
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
      setMessage("Device added successfully!");
      setShowQuickAddModal(false);
      await load(page, size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't add the device right now.");
    } finally {
      setCreateLoading(false);
    }
  };

  const openQuickAddModal = () => {
    setForm({
      mac: "",
      name: "",
      claimCode: "",
      latitude: "",
      longitude: "",
      pollingInterval: "",
      fullThreshold: "",
    });
    setMessage("");
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

  const openDeviceDetails = async (device: DeviceDto) => {
    setSelectedDeviceDetails(device);
    setEditDeviceForm({
      name: device.name || "",
      latitude: device.latitude?.toString() || "",
      longitude: device.longitude?.toString() || "",
      pollingInterval: device.userConfigs?.pollingInterval?.toString() || "",
      fullThreshold: device.userConfigs?.fullThreshold?.toString() || "",
    });
    setEditDeviceMessage("");

    setTelemetryMessage("");
    setTelemetryLoading(true);
    try {
      const now = Date.now();
      const response = await devicesAdminApi.getTelemetries(device.id, {
        keys: 'bin1,bin2,bin3,bin4,total_waste_count',
        startTs: now - 7 * 24 * 60 * 60 * 1000,
        endTs: now,
        limit: 200,
      });

      if (!response || !response.success || !response.data) {
        setTelemetryHistory([]);
        setTelemetryMessage(response?.message || 'No telemetry data available.');
        return;
      }

      const history = buildTelemetryHistory(response.data as any);
      setTelemetryHistory(history);
      if (history.length === 0) setTelemetryMessage('No telemetry points in selected range.');
    } catch (err) {
      setTelemetryHistory([]);
      setTelemetryMessage(err instanceof Error ? err.message : 'Failed to load telemetry data.');
    } finally {
      setTelemetryLoading(false);
    }
  };

  const closeDeviceDetails = () => {
    if (editDeviceLoading) return;
    setSelectedDeviceDetails(null);
  };

  const saveDeviceDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDeviceDetails) return;

    setEditDeviceLoading(true);
    setEditDeviceMessage("");

    const loc = parseCoordinatePair(editDeviceForm.latitude, editDeviceForm.longitude);
    if (!loc && (editDeviceForm.latitude || editDeviceForm.longitude)) {
      setEditDeviceMessage("Please provide valid coordinates.");
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

      setEditDeviceMessage("Device details updated successfully!");
      await load(page, size);
      
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
      setEditDeviceMessage(error instanceof Error ? error.message : "Failed to update device details.");
    } finally {
      setEditDeviceLoading(false);
    }
  };

  const openConfig = async (device: DeviceDto) => {
    setConfigFetchingId(device.id);
    setSelectedDeviceId(device.id);
    setSelectedDevice(device);
    setConfigMessage("");
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
      
      setConfigForm({ targetBinFirmwareId, targetDesktopFirmwareId });
      setConfigInitial({ targetBinFirmwareId, targetDesktopFirmwareId });
      setDevices((current) =>
        current.map((item) =>
          item.id === device.id
            ? {
                ...item,
                targetBinVersion: config.targetBinVersion || item.targetBinVersion,
                targetDesktopVersion: config.targetDesktopVersion || item.targetDesktopVersion,
              }
            : item
        )
      );
    } catch (error) {
      const fallbackBin = getLatestFirmware(firmwares.length > 0 ? firmwares : await loadFirmwares(), "ESP32")?.id || "";
      const fallbackDesktop = getLatestFirmware(firmwares.length > 0 ? firmwares : await loadFirmwares(), "RASPBERRY_PI")?.id || "";
      setConfigForm({ targetBinFirmwareId: fallbackBin, targetDesktopFirmwareId: fallbackDesktop });
      setConfigInitial({ targetBinFirmwareId: fallbackBin, targetDesktopFirmwareId: fallbackDesktop });
      setConfigMessage(error instanceof Error ? error.message : "Couldn't load current configurations.");
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
    setRpcMessage("");
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
    setRpcMessage("");
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
        setRpcMessage("Please ensure parameters are valid JSON.");
        return;
      }
    }

    setRpcLoading(true);
    setRpcMessage("");
    setRpcResponseText("");

    try {
      const response = await devicesAdminApi.executeRpc(selectedDevice.id, {
        method: selectedRpcMethod,
        params: parsedParams,
      });

      setRpcResponseText(JSON.stringify(response.data ?? response, null, 2));
      setRpcMessage(response.message || "Command sent successfully!");
    } catch (error) {
      setRpcMessage(error instanceof Error ? error.message : "We couldn't send the command right now.");
    } finally {
      setRpcLoading(false);
    }
  };

  const closeConfigModal = () => {
    if (configLoading) return;
    setShowConfigModal(false);
    setSelectedDeviceId("");
    setSelectedDevice(null);
    setConfigForm({ targetBinFirmwareId: "", targetDesktopFirmwareId: "" });
    setConfigInitial({ targetBinFirmwareId: "", targetDesktopFirmwareId: "" });
    setConfigMessage("");
  };

  const confirmConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedDevice) return;

    if (!isConfigDirty) {
      setConfigMessage("No changes detected to update.");
      return;
    }

    setConfigLoading(true);
    setConfigMessage("");

    try {
      await devicesAdminApi.updateAdminConfig(selectedDevice.id, {
        targetBinFirmwareId: configForm.targetBinFirmwareId || undefined,
        targetDesktopFirmwareId: configForm.targetDesktopFirmwareId || undefined,
      });

      const binFirmware = firmwares.find((firmware) => firmware.id === configForm.targetBinFirmwareId);
      const desktopFirmware = firmwares.find((firmware) => firmware.id === configForm.targetDesktopFirmwareId);

      setDevices((current) =>
        current.map((item) =>
          item.id === selectedDevice.id
            ? {
                ...item,
                targetBinVersion: binFirmware?.version || item.targetBinVersion,
                targetDesktopVersion: desktopFirmware?.version || item.targetDesktopVersion,
              }
            : item
        )
      );
      setSelectedDevice((current) =>
        current
          ? {
              ...current,
              targetBinVersion: binFirmware?.version || current.targetBinVersion,
              targetDesktopVersion: desktopFirmware?.version || current.targetDesktopVersion,
            }
          : current
      );
      setConfigInitial(configForm);
      setConfigMessage("Target versions updated successfully!");
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : "We couldn't save the new configuration.");
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
          setLocationTextByKey((current) => ({ ...current, [key]: toCoordinateText(latitude, longitude) }));
          return;
        }

        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${Number(longitude).toFixed(6)},${Number(latitude).toFixed(6)}.json?types=address,place,locality,neighborhood,region,district&limit=1&language=en&access_token=${mapboxToken}`,
        );

        if (!response.ok) {
          setLocationTextByKey((current) => ({ ...current, [key]: toCoordinateText(latitude, longitude) }));
          return;
        }

        const payload = (await response.json()) as {
          features?: Array<{ place_name?: string }>;
        };
        const placeName = payload.features?.[0]?.place_name?.trim();

        setLocationTextByKey((current) => ({
          ...current,
          [key]: placeName || toCoordinateText(latitude, longitude),
        }));
      } catch {
        setLocationTextByKey((current) => ({ ...current, [key]: toCoordinateText(latitude, longitude) }));
      } finally {
        setLoadingLocationKeys((current) => ({ ...current, [key]: false }));
      }
    },
    [loadingLocationKeys, locationTextByKey, mapboxToken],
  );

  useEffect(() => {
    if (!selectedDeviceDetails) return;
    void resolveLocationText(selectedDeviceDetails.latitude, selectedDeviceDetails.longitude);
  }, [resolveLocationText, selectedDeviceDetails]);

  useEffect(() => {
    if (!selectedDevice) return;
    void resolveLocationText(selectedDevice.latitude, selectedDevice.longitude);
  }, [resolveLocationText, selectedDevice]);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="InnoEco Devices" subtitle="Monitor and manage your active fleet">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-300 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                  {canAssignDevices ? <th className="w-10 py-2 px-3 whitespace-nowrap">Select</th> : null}
                  <th className="py-2 px-3 whitespace-nowrap">Name</th>
                  <th className="py-2 px-3 whitespace-nowrap">MAC Address</th>
                  <th className="py-2 px-3 whitespace-nowrap">Group</th>
                  <th className="py-2 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2 px-3 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} className={`border-b border-slate-200/70 ${selectedDeviceId === device.id ? "bg-sky-50/60" : ""}`}>
                  {canAssignDevices ? (
                    <td className="py-2 px-3 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedDeviceIds.includes(device.id)}
                        onChange={() => toggleDeviceSelection(device.id)}
                        aria-label={`Select ${device.name}`}
                      />
                    </td>
                  ) : null}
                  <td className="py-2 px-3 font-medium text-foreground whitespace-nowrap">
                    {canControlDevice ? (
                      <button
                        type="button"
                        onClick={() => openControlModal(device)}
                        className="text-left font-medium text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-900"
                      >
                        {device.name}
                      </button>
                    ) : (
                      device.name
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.mac}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.groupCode || "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-500/10">
                      {device.status} {device.state ? `(${device.state})` : ""}
                    </span>
                  </td>
                  <td className="py-2 px-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => openDeviceDetails(device)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Details
                    </button>
                    {canConfigureFirmware ? (
                      <button
                        type="button"
                        onClick={() => void openConfig(device)}
                        disabled={configLoading || configFetchingId === device.id}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                      >
                        {configFetchingId === device.id ? "Loading..." : "Configure"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-slate-600">Page {page} of {totalPages}</div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-2 py-1"
              value={size}
              onChange={(e) => {
                setPage(1);
                setSize(Number(e.target.value));
              }}
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Previous
            </button>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </Panel>

      <div className="space-y-4">
        {canAssignDevices ? (
          <Panel title="Assign Devices" subtitle="Select devices from the table to reassign them">
            <form className="space-y-4" onSubmit={assignSelectedDevices}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">Selected devices: {selectedDeviceIds.length}</p>
                    <p>
                      {selectedDeviceIds.length > 0
                        ? `${selectedDeviceIds.length} device(s) queued.`
                        : "Select one or more devices to start."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisibleDevices}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      disabled={devices.length === 0}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceIds([])}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      disabled={selectedDeviceIds.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-1xl border border-slate-200 bg-white p-3 sm:grid-cols-1">
                <button
                  type="button"
                  onClick={() => setAssignMode("group")}
                  className={`rounded-xl px-4 py-3 text-left transition ${
                    assignMode === "group"
                      ? "border border-sky-300 bg-sky-50 text-sky-800"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-sm font-semibold">Assign to Group</div>
                  <div className="mt-1 text-xs">Organize devices into operational areas.</div>
                </button>
              </div>

              {assignMode === "group" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Target Group</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={assignGroupId}
                    onChange={(event) => setAssignGroupId(event.target.value)}
                  >
                    <option value="">Select a group...</option>
                    {deviceGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.code} - {group.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Target User</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={assignUserId}
                    onChange={(event) => setAssignUserId(event.target.value)}
                  >
                    <option value="">Select a user...</option>
                    {sortedUsers.map((user) => (
                      <option key={user.id} value={user.keycloakId}>
                        {user.name} - {user.email} {user.state !== "ACTIVE" ? `(${user.state})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={assignLoading || selectedDeviceIds.length === 0 || (assignMode === "group" ? !assignGroupId : !assignUserId)}
                >
                  {assignLoading ? "Processing..." : "Apply Assignment"}
                </button>
                {assignMessage ? <p className="text-sm text-slate-600">{assignMessage}</p> : null}
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel title="Bulk Import">
          <ImportDevicesPanel onImported={() => void load(page, size)} />
        </Panel>

        <Panel
          title="Quick Add"
          subtitle="Add a single device manually"
          action={
            <button type="button" onClick={openQuickAddModal} className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white">
              Add Device
            </button>
          }
        >
          <p className="text-sm text-slate-600">Use this form to onboard a device with location and optional runtime configuration.</p>
        </Panel>
      </div>

      {/* Device Details & Edit Modal */}
      {selectedDeviceDetails ? (
        <Modal title="Device Details & Edit" subtitle="View system info and update configurations" onClose={closeDeviceDetails} widthClassName="w-[min(1100px,98vw)]">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Left Column: Read-Only Info & Telemetry */}
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm text-slate-700">
                <h4 className="font-semibold text-slate-900 border-b border-slate-200 pb-2">System Information</h4>
                <div className="grid grid-cols-2 gap-2">
                  <span className="font-medium text-slate-900">MAC Address:</span> 
                  <span>{selectedDeviceDetails.mac}</span>
                  
                  <span className="font-medium text-slate-900">Group Code:</span> 
                  <span>{selectedDeviceDetails.groupCode || "-"}</span>
                  
                  <span className="font-medium text-slate-900">Status:</span> 
                  <span className="capitalize">{selectedDeviceDetails.status || "offline"}</span>
                  
                  <span className="font-medium text-slate-900">State:</span> 
                  <span>{selectedDeviceDetails.state || "-"}</span>

                  <span className="font-medium text-slate-900">Location:</span> 
                  <span className="truncate" title={
                    (() => {
                      const key = toLocationKey(selectedDeviceDetails.latitude, selectedDeviceDetails.longitude);
                      const isResolving = key ? Boolean(loadingLocationKeys[key]) : false;
                      const text = key ? locationTextByKey[key] : "";
                      return isResolving ? "Resolving address..." : (text || toCoordinateText(selectedDeviceDetails.latitude, selectedDeviceDetails.longitude));
                    })()
                  }>
                    {(() => {
                      const key = toLocationKey(selectedDeviceDetails.latitude, selectedDeviceDetails.longitude);
                      const isResolving = key ? Boolean(loadingLocationKeys[key]) : false;
                      const text = key ? locationTextByKey[key] : "";
                      return isResolving ? "Resolving address..." : (text || toCoordinateText(selectedDeviceDetails.latitude, selectedDeviceDetails.longitude));
                    })()}
                  </span>
                  
                  <span className="font-medium text-slate-900">Claimed At:</span> 
                  <span>{selectedDeviceDetails.claimedAt || "-"}</span>
                  
                  <span className="font-medium text-slate-900">Created Date:</span> 
                  <span>{selectedDeviceDetails.createdDate || "-"}</span>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Device Telemetry</h4>
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                  {telemetryLoading ? (
                    <div className="py-4 text-center text-slate-500">Loading telemetry data...</div>
                  ) : telemetryMessage ? (
                    <div className="py-4 text-center text-sm text-slate-600">{telemetryMessage}</div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">Latest Fill Level</div>
                          <div className="mt-1 text-lg font-semibold text-foreground">
                            {telemetryHistory.length > 0 && telemetryHistory[0].fillLevel !== null ? `${telemetryHistory[0].fillLevel}%` : "-"}
                          </div>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                          <div className="text-xs text-slate-500">Latest Throw Count</div>
                          <div className="mt-1 text-lg font-semibold text-foreground">
                            {telemetryHistory.length > 0 && telemetryHistory[0].throwCount !== null ? telemetryHistory[0].throwCount : "-"}
                          </div>
                        </div>
                      </div>

                      <div className="text-xs font-semibold text-slate-900 mt-2 mb-1">Recent History</div>
                      <div className="max-h-40 overflow-auto border border-slate-100 rounded-lg">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr className="text-slate-500">
                              <th className="py-1.5 px-3 font-medium">Time</th>
                              <th className="py-1.5 px-3 font-medium">Fill Level</th>
                              <th className="py-1.5 px-3 font-medium">Throws</th>
                            </tr>
                          </thead>
                          <tbody>
                            {telemetryHistory.slice(0, 15).map((row) => (
                              <tr key={row.timestamp} className="border-t border-slate-100">
                                <td className="py-1.5 px-3 text-slate-600">{formatTimeShort(row.timestamp)}</td>
                                <td className="py-1.5 px-3 text-slate-700">{row.fillLevel !== null ? `${row.fillLevel}%` : "-"}</td>
                                <td className="py-1.5 px-3 text-slate-700">{row.throwCount !== null ? row.throwCount : "-"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Firmware Status</h4>
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-sm text-slate-700">
                  <div>
                    <p className="font-semibold text-slate-900 mb-1">InnoEco Edge Node (Bin)</p>
                    <div className="flex items-center justify-between text-xs">
                      <span>Current: <span className="font-mono">{selectedDeviceDetails.binVersion || "Unknown"}</span></span>
                      <span>Target: <span className="font-mono">{selectedDeviceDetails.targetBinVersion || "Not Set"}</span></span>
                    </div>
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="font-semibold text-slate-900 mb-1">InnoEco Master Hub (Desktop)</p>
                    <div className="flex items-center justify-between text-xs">
                      <span>Current: <span className="font-mono">{selectedDeviceDetails.desktopVersion || "Unknown"}</span></span>
                      <span>Target: <span className="font-mono">{selectedDeviceDetails.targetDesktopVersion || "Not Set"}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Editable Form */}
            <form onSubmit={saveDeviceDetails} className="space-y-4 flex flex-col h-full">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 flex-1">
                <h4 className="font-semibold text-slate-900 border-b border-slate-200 pb-2 mb-3 text-sm">Editable Configuration</h4>
                
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Device Name</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Smart Bin 01"
                    value={editDeviceForm.name}
                    onChange={(event) => setEditDeviceForm((v) => ({ ...v, name: event.target.value }))}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Polling Interval</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Seconds"
                      value={editDeviceForm.pollingInterval}
                      onChange={(event) => setEditDeviceForm((v) => ({ ...v, pollingInterval: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Full Threshold</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      placeholder="Percent"
                      value={editDeviceForm.fullThreshold}
                      onChange={(event) => setEditDeviceForm((v) => ({ ...v, fullThreshold: event.target.value }))}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <label className="mb-2 block text-sm font-medium text-slate-700">Location Map</label>
                  <LocationPickerMap
                    className="h-48 w-full rounded-xl border border-slate-200"
                    value={editLocation}
                    onChange={(location) => {
                      setEditDeviceForm((v) => ({
                        ...v,
                        latitude: location.latitude.toFixed(6),
                        longitude: location.longitude.toFixed(6),
                      }));
                    }}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 bg-slate-50"
                      placeholder="Lat"
                      readOnly
                      value={editDeviceForm.latitude}
                    />
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 bg-slate-50"
                      placeholder="Lng"
                      readOnly
                      value={editDeviceForm.longitude}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
                {editDeviceMessage ? <p className="text-sm text-slate-600 mr-auto">{editDeviceMessage}</p> : null}
                <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200" onClick={closeDeviceDetails}>
                  Cancel
                </button>
                <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60" type="submit" disabled={editDeviceLoading}>
                  {editDeviceLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      ) : null}

      {showControlModal && canControlDevice ? (
        <Modal title="Device Command Center" subtitle="Execute remote actions and view device responses" onClose={closeControlModal} widthClassName="w-[min(1120px,98vw)]">
          {selectedDevice ? (
            <form onSubmit={executeSelectedRpc} className="space-y-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-foreground">{selectedDevice.name}</p>
                <p>MAC: {selectedDevice.mac}</p>
                <p>Device ID: {selectedDevice.id}</p>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">One-Way Commands</h4>
                    <p className="text-xs text-slate-500">Fire-and-forget actions that don't wait for a direct response.</p>
                  </div>
                  <div className="grid gap-2">
                    {availableRpcOptions.filter((option) => option.type === "ONE_WAY").map((option) => (
                      <button
                        key={option.method}
                        type="button"
                        onClick={() => {
                          setSelectedRpcMethod(option.method);
                          setRpcParamsText(getDefaultRpcParams(option.method));
                          setRpcMessage("");
                          setRpcResponseText("");
                        }}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          selectedRpcMethod === option.method
                            ? "border-sky-300 bg-sky-50 text-sky-900"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{option.method}</div>
                        <p className="mt-1 text-xs text-slate-600">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold text-slate-900">Two-Way Commands</h4>
                    <p className="text-xs text-slate-500">Actions that wait for the device to acknowledge or return data.</p>
                  </div>
                  <div className="grid gap-2">
                    {availableRpcOptions.filter((option) => option.type === "TWO_WAY").map((option) => (
                      <button
                        key={option.method}
                        type="button"
                        onClick={() => {
                          setSelectedRpcMethod(option.method);
                          setRpcParamsText(getDefaultRpcParams(option.method));
                          setRpcMessage("");
                          setRpcResponseText("");
                        }}
                        className={`rounded-xl border px-3 py-2 text-left transition ${
                          selectedRpcMethod === option.method
                            ? "border-sky-300 bg-sky-50 text-sky-900"
                            : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        <div className="text-sm font-semibold">{option.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{option.method}</div>
                        <p className="mt-1 text-xs text-slate-600">{option.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label className="block text-sm font-medium text-slate-700">JSON Parameters</label>
                  <span className="text-xs text-slate-500">Selected Action: {getRpcMethodOption(selectedRpcMethod).label}</span>
                </div>
                <textarea
                  className="min-h-35 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                  value={rpcParamsText}
                  onChange={(event) => setRpcParamsText(event.target.value)}
                  placeholder="{}"
                />
                <p className="text-xs text-slate-500">Leave it as <span className="font-mono">{`{}`}</span> for methods that don't require parameters.</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-foreground">Action Summary: {getRpcMethodOption(selectedRpcMethod).label}</p>
                <p>{getRpcMethodOption(selectedRpcMethod).description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={rpcLoading}
                >
                  {rpcLoading ? "Sending..." : "Execute Command"}
                </button>
                <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeControlModal}>
                  Cancel
                </button>
                {rpcMessage ? <p className="text-sm text-slate-600">{rpcMessage}</p> : null}
              </div>

              {rpcResponseText ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Device Response</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-6">{rpcResponseText}</pre>
                </div>
              ) : null}
            </form>
          ) : (
            <p className="text-sm text-slate-600">Please select a device to control.</p>
          )}
        </Modal>
      ) : null}

      {showConfigModal ? (
        <Modal title="Firmware Configurations" subtitle="Select target update packages for your InnoEco device" onClose={closeConfigModal} widthClassName="w-[min(1100px,98vw)]">
          {selectedDevice ? (
            <form onSubmit={confirmConfig} className="space-y-4">
              {(() => {
                const key = toLocationKey(selectedDevice.latitude, selectedDevice.longitude);
                const locationText = key ? locationTextByKey[key] : "";
                const isResolvingLocation = key ? Boolean(loadingLocationKeys[key]) : false;

                return (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                    <p>
                      <span className="font-semibold">Location:</span>{" "}
                      {isResolvingLocation
                        ? "Resolving address..."
                        : locationText || toCoordinateText(selectedDevice.latitude, selectedDevice.longitude)}
                    </p>
                  </div>
                );
              })()}

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-foreground">{selectedDevice.name}</p>
                <p>MAC: {selectedDevice.mac}</p>
                <p>Current Bin Target: {selectedDevice.targetBinVersion || "-"}</p>
                <p>Current Desktop Target: {selectedDevice.targetDesktopVersion || "-"}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Edge Node (Bin) Firmware</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={configForm?.targetBinFirmwareId || ""}
                  onChange={(event) => {
                    const newId = event.target.value;
                    setConfigForm((current) => ({ ...current, targetBinFirmwareId: newId }));
                  }}
                  disabled={binFirmwares.length === 0}
                >
                  <option value="">{binFirmwares.length > 0 ? "Select target firmware" : "No firmware available"}</option>
                  {binFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmwareLabel(firmware)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Currently saved target: {selectedDevice?.targetBinVersion || "-"}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Master Hub (Desktop) Firmware</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={configForm?.targetDesktopFirmwareId || ""}
                  onChange={(event) => {
                    const newId = event.target.value;
                    setConfigForm((current) => ({ ...current, targetDesktopFirmwareId: newId }));
                  }}
                  disabled={desktopFirmwares.length === 0}
                >
                  <option value="">{desktopFirmwares.length > 0 ? "Select target firmware" : "No firmware available"}</option>
                  {desktopFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmwareLabel(firmware)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Currently saved target: {selectedDevice?.targetDesktopVersion || "-"}</p>
              </div>

              <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={!isConfigDirty || configLoading}
                >
                  {configLoading ? "Saving..." : "Apply Configuration"}
                </button>
                <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeConfigModal}>
                  Cancel
                </button>
                {configMessage ? <p className="text-sm text-slate-600">{configMessage}</p> : null}
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-600">Click Configure on a device to edit target versions.</p>
          )}
        </Modal>
      ) : null}

      {showQuickAddModal ? (
        <Modal title="Add Device" subtitle="Onboard with location and runtime configuration" onClose={closeQuickAddModal} widthClassName="w-[min(1100px,98vw)]">
          <form onSubmit={create} className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Device Name</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="Smart Bin 01"
                    value={form.name}
                    onChange={(event) => setForm((v) => ({ ...v, name: event.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">MAC Address</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="AA:BB:CC:DD:EE:FF"
                    value={form.mac}
                    onChange={(event) => setForm((v) => ({ ...v, mac: formatMacAddress(event.target.value) }))}
                    required
                  />
                  {!isMacValid && form.mac.trim() ? (
                    <p className="mt-1 text-xs text-rose-600">MAC must match AA:BB:CC:DD:EE:FF format.</p>
                  ) : null}
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Activation Claim Code</label>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                    placeholder="6 characters"
                    value={form.claimCode}
                    onChange={(event) => setForm((v) => ({ ...v, claimCode: event.target.value.slice(0, 6) }))}
                    required
                  />
                  {!isClaimCodeValid && form.claimCode.trim() ? (
                    <p className="mt-1 text-xs text-rose-600">Claim code must be exactly 6 characters.</p>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Latitude</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      placeholder="21.028500"
                      value={form.latitude}
                      onChange={(event) => setForm((v) => ({ ...v, latitude: event.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Longitude</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      placeholder="105.854200"
                      value={form.longitude}
                      onChange={(event) => setForm((v) => ({ ...v, longitude: event.target.value }))}
                      required
                    />
                  </div>
                </div>

                {!addLocation && (form.latitude || form.longitude) ? (
                  <p className="text-xs text-rose-600">Invalid coordinates. Latitude: -90..90, Longitude: -180..180.</p>
                ) : null}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Polling Interval</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      placeholder="Seconds (optional)"
                      value={form.pollingInterval}
                      onChange={(event) => setForm((v) => ({ ...v, pollingInterval: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Full Threshold</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2"
                      placeholder="Percent (optional)"
                      value={form.fullThreshold}
                      onChange={(event) => setForm((v) => ({ ...v, fullThreshold: event.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="mb-2 text-sm font-medium text-slate-700">Pick Location on Map</p>
                <LocationPickerMap
                  className="h-105 w-full rounded-xl border border-slate-200"
                  value={addLocation}
                  onChange={(location) => {
                    setForm((v) => ({
                      ...v,
                      latitude: location.latitude.toFixed(6),
                      longitude: location.longitude.toFixed(6),
                    }));
                  }}
                />
                <p className="mt-2 text-xs text-slate-500">Click map or search address to set coordinates.</p>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={!canSubmitAddDevice}>
                {createLoading ? "Adding..." : "Add Device"}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeQuickAddModal}>
                Cancel
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {!showQuickAddModal && !showConfigModal && message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}