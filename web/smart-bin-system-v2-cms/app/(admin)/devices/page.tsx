"use client";

import ImportDevicesPanel from "@/components/devices/import-devices";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import type { DeviceDto } from "@/types/device";
import type { FirmwareDto } from "@/types/firmware";
import { FormEvent, useEffect, useMemo, useState } from "react";

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
  const [form, setForm] = useState({ name: "", mac: "", groupCode: "" });
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<DeviceDto | null>(null);
  const [configForm, setConfigForm] = useState({ targetBinFirmwareId: "", targetDesktopFirmwareId: "" });
  const [configInitial, setConfigInitial] = useState({ targetBinFirmwareId: "", targetDesktopFirmwareId: "" });
  const [configMessage, setConfigMessage] = useState("");
  const [configLoading, setConfigLoading] = useState(false);

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

  const isConfigDirty =
    Boolean(selectedDeviceId) &&
    (configForm.targetBinFirmwareId !== configInitial.targetBinFirmwareId ||
      configForm.targetDesktopFirmwareId !== configInitial.targetDesktopFirmwareId);

  const load = async (nextPage = page, nextSize = size) => {
    const response = await devicesAdminApi.getDevices({ page: nextPage, size: nextSize });
    setDevices(unwrapListPayload(response.data));

    if (!Array.isArray(response.data) && response.data) {
      const payload = response.data as Record<string, unknown>;
      const backendTotalPages = payload.totalPages;
      if (typeof backendTotalPages === "number" && Number.isFinite(backendTotalPages)) {
        setTotalPages(Math.max(1, backendTotalPages));
      }
    }
  };

  const loadFirmwares = async () => {
    const response = await firmwaresAdminApi.getFirmwares({ page: 1, size: 1000 });
    const items = unwrapListPayload(response.data);
    setFirmwares(items);
    return items;
  };

  useEffect(() => {
    void load(page, size);
  }, [page, size]);

  useEffect(() => {
    void loadFirmwares().catch(() => {
      setConfigMessage("Unable to load firmware list");
    });
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await devicesAdminApi.importDevices({
        devices: [{ name: form.name, mac: form.mac, groupCode: form.groupCode.trim() || undefined }],
      });
      setForm({ name: "", mac: "", groupCode: "" });
      setMessage("Imported 1 device");
      await load(page, size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    }
  };

  const openConfig = async (device: DeviceDto) => {
    setSelectedDeviceId(device.id);
    setSelectedDevice(device);
    setConfigMessage("");
    setConfigLoading(true);

    try {
      const firmwareItems = firmwares.length > 0 ? firmwares : await loadFirmwares();
      const response = await devicesAdminApi.getDeviceConfig(device.id);
      const config = response.data;

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
      setConfigMessage(error instanceof Error ? error.message : "Load config failed");
    } finally {
      setConfigLoading(false);
    }
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
                <th className="py-2 whitespace-nowrap">Name</th>
                <th className="py-2 whitespace-nowrap">MAC</th>
                <th className="py-2 whitespace-nowrap">Group Code</th>
                <th className="py-2 whitespace-nowrap">Target Bin Version</th>
                <th className="py-2 whitespace-nowrap">Target Desktop Version</th>
                <th className="py-2 whitespace-nowrap">Access Token</th>
                <th className="py-2 whitespace-nowrap">Status</th>
                <th className="py-2 whitespace-nowrap">State</th>
                <th className="py-2 whitespace-nowrap">Latitude</th>
                <th className="py-2 whitespace-nowrap">Longitude</th>
                <th className="py-2 whitespace-nowrap">Desktop Ver</th>
                <th className="py-2 whitespace-nowrap">Bin Ver</th>
                <th className="py-2 whitespace-nowrap">Claimed At</th>
                <th className="py-2 whitespace-nowrap">Created Date</th>
                <th className="py-2 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr key={device.id} className={`border-b border-slate-200/70 ${selectedDeviceId === device.id ? "bg-sky-50/60" : ""}`}>
                  <td className="py-2 font-medium text-foreground whitespace-nowrap">{device.name}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.mac}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.groupCode || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.targetBinVersion || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.targetDesktopVersion || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">
                    <div className="max-w-55 overflow-x-auto whitespace-nowrap">{device.accessToken || "-"}</div>
                  </td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.status}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.state || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.latitude ?? "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.longitude ?? "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.desktopVersion || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.binVersion || "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.claimedAt ?? "-"}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{device.createdDate || "-"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void openConfig(device)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800"
                    >
                      Configure
                    </button>
                  </td>
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
        <Panel title="Target Versions" subtitle="Select a device, then choose target firmware versions and confirm changes">
          {selectedDevice ? (
            <form onSubmit={confirmConfig} className="space-y-3">
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
                  value={configForm.targetBinFirmwareId}
                  onChange={(event) => setConfigForm((current) => ({ ...current, targetBinFirmwareId: event.target.value }))}
                  disabled={binFirmwares.length === 0}
                >
                  <option value="">{binFirmwares.length > 0 ? "Select target bin firmware" : "No bin firmware available"}</option>
                  {binFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmwareLabel(firmware)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  Current saved version: {selectedDevice.targetBinVersion || "-"}
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">Target Desktop Firmware</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  value={configForm.targetDesktopFirmwareId}
                  onChange={(event) => setConfigForm((current) => ({ ...current, targetDesktopFirmwareId: event.target.value }))}
                  disabled={desktopFirmwares.length === 0}
                >
                  <option value="">
                    {desktopFirmwares.length > 0 ? "Select target desktop firmware" : "No desktop firmware available"}
                  </option>
                  {desktopFirmwares.map((firmware) => (
                    <option key={firmware.id} value={firmware.id}>
                      {firmwareLabel(firmware)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">
                  Current saved version: {selectedDevice.targetDesktopVersion || "-"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  type="submit"
                  disabled={!isConfigDirty || configLoading}
                >
                  {configLoading ? "Saving..." : "Confirm change"}
                </button>
                {configMessage ? <p className="text-sm text-slate-600">{configMessage}</p> : null}
              </div>
            </form>
          ) : (
            <p className="text-sm text-slate-600">Click Configure on a device to edit target versions.</p>
          )}
        </Panel>

        <Panel title="Import Devices">
          <ImportDevicesPanel onImported={() => void load(page, size)} />
        </Panel>

        <Panel title="Quick Add (uses import API)">
          <form onSubmit={create} className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Device name"
              value={form.name}
              onChange={(event) => setForm((v) => ({ ...v, name: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="MAC address"
              value={form.mac}
              onChange={(event) => setForm((v) => ({ ...v, mac: event.target.value }))}
              required
            />
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Group code"
              value={form.groupCode}
              onChange={(event) => setForm((v) => ({ ...v, groupCode: event.target.value }))}
            />
            <div className="flex items-center gap-2">
              <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white" type="submit">
                Add 1 device via import
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Panel>
      </div>
    </div>
  );
}

