"use client";

import ImportDevicesPanel from "@/components/devices/import-devices";
import Modal from "@/components/ui/modal";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { getCmsAccessRole } from "@/lib/auth-session";
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
  { method: "openLid", label: "Open lid", type: "TWO_WAY", description: "Send the device command to open the lid." },
  { method: "closeLid", label: "Close lid", type: "TWO_WAY", description: "Send the device command to close the lid." },
  { method: "lockBin", label: "Lock bin", type: "TWO_WAY", description: "Lock the bin mechanism remotely." },
  { method: "unlockBin", label: "Unlock bin", type: "TWO_WAY", description: "Unlock the bin mechanism remotely." },
  { method: "forceSync", label: "Force sync", type: "ONE_WAY", description: "Force the device to sync state and telemetry." },
  { method: "triggerAlarmAlert", label: "Trigger alarm alert", type: "ONE_WAY", description: "Trigger a manual alarm alert on the device." },
  { method: "rebootDevice", label: "Reboot device", type: "ONE_WAY", description: "Restart the device remotely." },
  { method: "calibrateSensor", label: "Calibrate sensor", type: "TWO_WAY", description: "Start a sensor calibration workflow." },
  { method: "setPollingInterval", label: "Set polling interval", type: "TWO_WAY", description: "Update the device polling interval." },
  { method: "clearHardwareError", label: "Clear hardware error", type: "TWO_WAY", description: "Clear a hardware-level error state." },
  { method: "triggerOtaUpdate", label: "Trigger OTA update", type: "ONE_WAY", description: "Start the over-the-air update flow." },
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

export default function DevicesPage() {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [firmwares, setFirmwares] = useState<FirmwareDto[]>([]);
  const [users, setUsers] = useState<UserDto[]>([]);
  const [role, setRole] = useState<"super_admin" | "admin" | null>(null);
  const [form, setForm] = useState({ mac: "", claimCode: "" });
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

  const isConfigDirty =
    Boolean(selectedDeviceId) &&
    Boolean(configForm?.targetBinFirmwareId || configForm?.targetDesktopFirmwareId) &&
    (configForm?.targetBinFirmwareId !== configInitial?.targetBinFirmwareId ||
      configForm?.targetDesktopFirmwareId !== configInitial?.targetDesktopFirmwareId);

  const canAssignDevices = role !== "super_admin";
  const canConfigureFirmware = role !== "admin";
  const canControlDevice = role === "admin";

  const loadRole = () => {
    const cachedRole = typeof window !== "undefined" ? localStorage.getItem("admin_role") : null;
    if (cachedRole === "super_admin" || cachedRole === "admin") {
      setRole(cachedRole);
      return;
    }

    const cachedRoles = typeof window !== "undefined" ? localStorage.getItem("admin_roles") : null;
    if (cachedRoles) {
      try {
        const parsedRoles = JSON.parse(cachedRoles) as unknown;
        if (Array.isArray(parsedRoles)) {
          setRole(getCmsAccessRole(parsedRoles.filter((candidate): candidate is string => typeof candidate === "string")));
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
      setConfigMessage("Unable to load firmware list");
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
      setAssignMessage("Select at least one device first");
      return;
    }

    if (assignMode === "group" && !assignGroupId) {
      setAssignMessage("Choose a device group first");
      return;
    }

    if (assignMode === "user" && !assignUserId) {
      setAssignMessage("Choose a user first");
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
        setAssignMessage(`Assigned ${updatedCount} device${updatedCount !== 1 ? "s" : ""} to group`);
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
            ? `Assigned ${successCount}/${results.length} devices to user. ${failedCount} device(s) need attention.`
            : `Assigned ${successCount} device${successCount !== 1 ? "s" : ""} to user`
        );
      }

      setSelectedDeviceIds([]);
      setAssignGroupId("");
      setAssignUserId("");
      await load(page, size);
    } catch (error) {
      setAssignMessage(error instanceof Error ? error.message : "Assignment failed");
    } finally {
      setAssignLoading(false);
    }
  };

  // Debug: log isConfigDirty changes
  useEffect(() => {
    if (selectedDeviceId) {
      console.log(`[ConfigState] dirty=${isConfigDirty}, form=${JSON.stringify(configForm)}, initial=${JSON.stringify(configInitial)}`);
    }
  }, [isConfigDirty, configForm, configInitial, selectedDeviceId]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreateLoading(true);
    try {
      await devicesAdminApi.importDevices({
        devices: [{ mac: form.mac, claimCode: form.claimCode }],
      });
      setForm({ mac: "", claimCode: "" });
      setMessage("Imported 1 device");
      setShowQuickAddModal(false);
      await load(page, size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setCreateLoading(false);
    }
  };

  const openQuickAddModal = () => {
    setForm({ mac: "", claimCode: "" });
    setMessage("");
    setShowQuickAddModal(true);
  };

  const closeQuickAddModal = () => {
    setShowQuickAddModal(false);
    setForm({ mac: "", claimCode: "" });
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

      console.log(`[DeviceConfig] Device: ${device.name}, Bin FW ID: ${targetBinFirmwareId}, Desktop FW ID: ${targetDesktopFirmwareId}`);
      
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
      setConfigMessage(error instanceof Error ? error.message : "Load config failed");
    } finally {
      setConfigLoading(false);
      setConfigFetchingId(null);
    }
  };

  const openControlModal = (device: DeviceDto) => {
    if (!canControlDevice) {
      return;
    }

    setSelectedDeviceId(device.id);
    setSelectedDevice(device);
    setSelectedRpcMethod(rpcMethodOptions[0].method);
    setRpcParamsText(getDefaultRpcParams(rpcMethodOptions[0].method));
    setRpcMessage("");
    setRpcResponseText("");
    setShowControlModal(true);
  };

  const closeControlModal = () => {
    if (rpcLoading) return;
    setShowControlModal(false);
    setSelectedDeviceId("");
    setSelectedDevice(null);
    setSelectedRpcMethod(rpcMethodOptions[0].method);
    setRpcParamsText(getDefaultRpcParams(rpcMethodOptions[0].method));
    setRpcMessage("");
    setRpcResponseText("");
  };

  const executeSelectedRpc = async (event: FormEvent) => {
    event.preventDefault();

    if (!selectedDevice || !canControlDevice) {
      return;
    }

    let parsedParams: unknown = {};
    if (rpcParamsText.trim()) {
      try {
        parsedParams = JSON.parse(rpcParamsText);
      } catch {
        setRpcMessage("Params must be valid JSON");
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
      setRpcMessage(response.message || "RPC command sent");
    } catch (error) {
      setRpcMessage(error instanceof Error ? error.message : "Failed to send RPC command");
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
      setConfigMessage("No target version changes to confirm");
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
      setConfigMessage("Firmware target updated");
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : "Update config failed");
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Devices" subtitle="Admin device list with server pagination">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-300 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                  {canAssignDevices ? <th className="w-10 py-2 px-3 whitespace-nowrap">Select</th> : null}
                  <th className="py-2 px-3 whitespace-nowrap">Name</th>
                  <th className="py-2 px-3 whitespace-nowrap">MAC</th>
                  <th className="py-2 px-3 whitespace-nowrap">Group Code</th>
                  <th className="py-2 px-3 whitespace-nowrap">Target Bin</th>
                  <th className="py-2 px-3 whitespace-nowrap">Target Desktop</th>
                  <th className="py-2 px-3 whitespace-nowrap">Status</th>
                  <th className="py-2 px-3 whitespace-nowrap">State</th>
                  <th className="py-2 px-3 whitespace-nowrap">Desktop Ver</th>
                  <th className="py-2 px-3 whitespace-nowrap">Bin Ver</th>
                  <th className="py-2 px-3 whitespace-nowrap">Claimed At</th>
                  <th className="py-2 px-3 whitespace-nowrap">Created Date</th>
                  {canConfigureFirmware ? <th className="py-2 px-3 whitespace-nowrap">Action</th> : null}
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
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.targetBinVersion || "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.targetDesktopVersion || "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.status}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.state || "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.desktopVersion || "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.binVersion || "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.claimedAt ?? "-"}</td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.createdDate || "-"}</td>
                  {canConfigureFirmware ? (
                    <td className="py-2">
                      <button
                        type="button"
                        onClick={() => void openConfig(device)}
                        disabled={configLoading || configFetchingId === device.id}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800"
                      >
                        {configFetchingId === device.id ? "Loading..." : "Configure"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-slate-600">Page {page} / {totalPages}</div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-2 py-1"
              value={size}
              onChange={(e) => {
                setPage(1);
                setSize(Number(e.target.value));
              }}
            >
              <option value={10}>10 / page</option>
              <option value={20}>20 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              Prev
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
          <Panel title="Assign Devices" subtitle="Pick devices once, then assign them to a group or a user in one step">
            <form className="space-y-4" onSubmit={assignSelectedDevices}>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">Selected devices: {selectedDeviceIds.length}</p>
                    <p>
                      {selectedDeviceIds.length > 0
                        ? `${selectedDeviceIds.length} device(s) are queued for assignment.`
                        : "Select one or more devices from the table to start."}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisibleDevices}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      disabled={devices.length === 0}
                    >
                      Select all on page
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDeviceIds([])}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                      disabled={selectedDeviceIds.length === 0}
                    >
                      Clear selection
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setAssignMode("group")}
                  className={`rounded-xl px-4 py-3 text-left transition ${
                    assignMode === "group"
                      ? "border border-sky-300 bg-sky-50 text-sky-800"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-sm font-semibold">Assign to group</div>
                  <div className="mt-1 text-xs">Best when devices belong to the same operational area.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode("user")}
                  className={`rounded-xl px-4 py-3 text-left transition ${
                    assignMode === "user"
                      ? "border border-sky-300 bg-sky-50 text-sky-800"
                      : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-sm font-semibold">Assign to user</div>
                  <div className="mt-1 text-xs">Best when devices should be owned by a specific account.</div>
                </button>
              </div>

              {assignMode === "group" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Target device group</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={assignGroupId}
                    onChange={(event) => setAssignGroupId(event.target.value)}
                  >
                    <option value="">Choose a group</option>
                    {deviceGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.code} - {group.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">The selected devices will be reassigned to the chosen group immediately.</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700">Target user</label>
                  <select
                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
                    value={assignUserId}
                    onChange={(event) => setAssignUserId(event.target.value)}
                  >
                    <option value="">Choose a user</option>
                    {sortedUsers.map((user) => (
                      <option key={user.id} value={user.keycloakId}>
                        {user.name} - {user.email} {user.state !== "ACTIVE" ? `(${user.state})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-2 text-xs text-slate-500">Only active users should usually be used for ownership assignment.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={assignLoading || selectedDeviceIds.length === 0 || (assignMode === "group" ? !assignGroupId : !assignUserId)}
                >
                  {assignLoading
                    ? "Applying..."
                    : assignMode === "group"
                      ? "Assign selected devices to group"
                      : "Assign selected devices to user"}
                </button>
                {assignMessage ? <p className="text-sm text-slate-600">{assignMessage}</p> : null}
              </div>
            </form>
          </Panel>
        ) : null}

        <Panel title="Import Devices">
          <ImportDevicesPanel onImported={() => void load(page, size)} />
        </Panel>

        <Panel
          title="Quick Add (uses import API)"
          subtitle="Open the popup editor to add a single device"
          action={
            <button type="button" onClick={openQuickAddModal} className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white">
              Add device
            </button>
          }
        >
          <p className="text-sm text-slate-600">Use the popup editor when you need to add one device quickly.</p>
        </Panel>
      </div>

      {showControlModal && canControlDevice ? (
        <Modal title="Device Control" subtitle="Choose an RPC method, review params, then send the command" onClose={closeControlModal} widthClassName="w-[min(1120px,98vw)]">
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
                    <h4 className="text-sm font-semibold text-slate-900">ONE_WAY methods</h4>
                    <p className="text-xs text-slate-500">Commands that do not expect a device response.</p>
                  </div>
                  <div className="grid gap-2">
                    {rpcMethodOptions.filter((option) => option.type === "ONE_WAY").map((option) => (
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
                    <h4 className="text-sm font-semibold text-slate-900">TWO_WAY methods</h4>
                    <p className="text-xs text-slate-500">Commands that typically wait for an acknowledgment.</p>
                  </div>
                  <div className="grid gap-2">
                    {rpcMethodOptions.filter((option) => option.type === "TWO_WAY").map((option) => (
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
                  <label className="block text-sm font-medium text-slate-700">RPC params JSON</label>
                  <span className="text-xs text-slate-500">Selected: {getRpcMethodOption(selectedRpcMethod).method}</span>
                </div>
                <textarea
                  className="min-h-35 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                  value={rpcParamsText}
                  onChange={(event) => setRpcParamsText(event.target.value)}
                  placeholder="{}"
                />
                <p className="text-xs text-slate-500">Leave it as <span className="font-mono">{`{}`}</span> for methods that do not need parameters.</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-foreground">Selected method: {getRpcMethodOption(selectedRpcMethod).label}</p>
                <p>{getRpcMethodOption(selectedRpcMethod).description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={rpcLoading}
                >
                  {rpcLoading ? "Sending..." : "Send RPC command"}
                </button>
                <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm" onClick={closeControlModal}>
                  Cancel
                </button>
                {rpcMessage ? <p className="text-sm text-slate-600">{rpcMessage}</p> : null}
              </div>

              {rpcResponseText ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-slate-100">
                  <div className="mb-2 text-xs uppercase tracking-wide text-slate-400">Response payload</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap wrap-break-word font-mono text-xs leading-6">{rpcResponseText}</pre>
                </div>
              ) : null}
            </form>
          ) : (
            <p className="text-sm text-slate-600">Choose a device to control.</p>
          )}
        </Modal>
      ) : null}

      {showConfigModal ? (
        <Modal title="Target Versions" subtitle="Select a device, then choose target firmware versions and confirm changes" onClose={closeConfigModal} widthClassName="w-[min(1100px,98vw)]">
          {selectedDevice ? (
            <form onSubmit={confirmConfig} className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p className="font-semibold text-foreground">{selectedDevice.name}</p>
                <p>MAC: {selectedDevice.mac}</p>
                <p>Current Bin Target: {selectedDevice.targetBinVersion || "-"}</p>
                <p>Current Desktop Target: {selectedDevice.targetDesktopVersion || "-"}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Target Bin Firmware</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={configForm?.targetBinFirmwareId || ""}
                  onChange={(event) => {
                    const newId = event.target.value;
                    console.log(`[Select] Bin firmware changed to: ${newId}`);
                    setConfigForm((current) => ({ ...current, targetBinFirmwareId: newId }));
                  }}
                  disabled={binFirmwares.length === 0}
                >
                  <option value="">{binFirmwares.length > 0 ? "Select target bin firmware" : "No bin firmware available"}</option>
                  {binFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmwareLabel(firmware)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Current saved version: {selectedDevice?.targetBinVersion || "-"}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Target Desktop Firmware</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={configForm?.targetDesktopFirmwareId || ""}
                  onChange={(event) => {
                    const newId = event.target.value;
                    console.log(`[Select] Desktop firmware changed to: ${newId}`);
                    setConfigForm((current) => ({ ...current, targetDesktopFirmwareId: newId }));
                  }}
                  disabled={desktopFirmwares.length === 0}
                >
                  <option value="">{desktopFirmwares.length > 0 ? "Select target desktop firmware" : "No desktop firmware available"}</option>
                  {desktopFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmwareLabel(firmware)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Current saved version: {selectedDevice?.targetDesktopVersion || "-"}</p>
              </div>

              <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={!isConfigDirty || configLoading}
                  onClick={() => console.log(`[Button] isConfigDirty=${isConfigDirty}, configLoading=${configLoading}, configForm=${JSON.stringify(configForm)}, configInitial=${JSON.stringify(configInitial)}`)}
                >
                  {configLoading ? "Saving..." : "Confirm change"}
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
        <Modal title="Quick Add Device" subtitle="Add one device via import API" onClose={closeQuickAddModal}>
          <form onSubmit={create} className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="MAC address"
              value={form.mac}
              onChange={(event) => setForm((v) => ({ ...v, mac: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Claim code"
              value={form.claimCode}
              onChange={(event) => setForm((v) => ({ ...v, claimCode: event.target.value }))}
              required
            />
            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={createLoading}>
                {createLoading ? "Adding..." : "Add 1 device via import"}
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

