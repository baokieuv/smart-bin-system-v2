"use client";

import { FormEvent } from "react";
import Modal from "@/components/ui/modal";
import { LocationPickerMap, type LocationValue } from "@/components/layout/location-picker-map";
import type { TranslationKey } from "@/lib/language";
import type { DeviceDto } from "@/types/device";
import { toLocationKey, toCoordinateText } from "@/app/(admin)/devices/utils";

interface EditDeviceForm {
  name: string;
  latitude: string;
  longitude: string;
  pollingInterval: string;
  fullThreshold: string;
}

interface TelemetryHistoryItem {
  timestamp: number;
  fillLevel: number | null;
  throwCount: number | null;
  battery: number | null;
}

interface DeviceDetailsModalProps {
  device: DeviceDto | null;
  onClose: () => void;
  onSave: (event: FormEvent) => void;
  onDelete: () => void;
  editDeviceForm: EditDeviceForm;
  setEditDeviceForm: (updater: (prev: EditDeviceForm) => EditDeviceForm) => void;
  editDeviceLoading: boolean;
  editDeviceMessage: string;
  editLocation: LocationValue | null;
  canDeleteDevice: boolean;
  telemetryLoading: boolean;
  telemetryMessage: string;
  telemetryHistory: TelemetryHistoryItem[];
  locationTextByKey: Record<string, string>;
  loadingLocationKeys: Record<string, boolean>;
  t: (key: TranslationKey) => string;
}

export default function DeviceDetailsModal({
  device,
  onClose,
  onSave,
  onDelete,
  editDeviceForm,
  setEditDeviceForm,
  editDeviceLoading,
  editDeviceMessage,
  editLocation,
  canDeleteDevice,
  telemetryLoading,
  telemetryMessage,
  telemetryHistory,
  locationTextByKey,
  loadingLocationKeys,
  t,
}: DeviceDetailsModalProps) {
  if (!device) return null;

  const formatTimeShort = (ts: number) => new Date(ts).toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  const getLocationText = (lat?: number, lng?: number) => {
    const key = toLocationKey(lat, lng);
    const isResolving = key ? Boolean(loadingLocationKeys[key]) : false;
    const text = key ? locationTextByKey[key] : "";
    return isResolving ? t("resolvingAddress") : text || toCoordinateText(lat, lng, t);
  };

  return (
    <Modal title={t("deviceDetailsTitle")} subtitle={t("deviceDetailsSubtitle")} onClose={onClose} widthClassName="w-[min(1100px,98vw)]">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Read-Only Info & Telemetry */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-sm text-slate-700">
            <h4 className="font-semibold text-slate-900 border-b border-slate-200 pb-2">{t("systemInfoLabel")}</h4>
            <div className="grid grid-cols-2 gap-2">
              <span className="font-medium text-slate-900">{t("macAddress")}:</span>
              <span>{device.mac}</span>

              <span className="font-medium text-slate-900">{t("groupCol")}:</span>
              <span>{device.groupCode || "-"}</span>

              <span className="font-medium text-slate-900">{t("statusCol")}:</span>
              <span className="capitalize">{device.status || "offline"}</span>

              <span className="font-medium text-slate-900">{t("accountState")}:</span>
              <span>{device.state || "-"}</span>

              <span className="font-medium text-slate-900">{t("locationCol")}:</span>
              <span className="truncate" title={getLocationText(device.latitude, device.longitude)}>
                {getLocationText(device.latitude, device.longitude)}
              </span>

              <span className="font-medium text-slate-900">{t("claimedAtLabel")}:</span>
              <span>{device.claimedAt || "-"}</span>

              <span className="font-medium text-slate-900">{t("createdDateLabel")}:</span>
              <span>{device.createdDate || "-"}</span>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 mb-2">{t("deviceTelemetryLabel")}</h4>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              {telemetryLoading ? (
                <div className="py-4 text-center text-slate-500">{t("loadingTelemetry")}</div>
              ) : telemetryMessage ? (
                <div className="py-4 text-center text-sm text-slate-600">{telemetryMessage}</div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">{t("latestFillLevel")}</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{telemetryHistory.length > 0 && telemetryHistory[0].fillLevel !== null ? `${telemetryHistory[0].fillLevel}cm` : "-"}</div>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">{t("latestThrows")}</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{telemetryHistory.length > 0 && telemetryHistory[0].throwCount !== null ? telemetryHistory[0].throwCount : "-"}</div>
                    </div>
                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="text-xs text-slate-500">{t("latestBattery")}</div>
                      <div className="mt-1 text-lg font-semibold text-foreground">{telemetryHistory.length > 0 && telemetryHistory[0].battery !== null ? `${telemetryHistory[0].battery}%` : "-"}</div>
                    </div>
                  </div>

                  <div className="text-xs font-semibold text-slate-900 mt-2 mb-1">{t("recentHistoryLabel")}</div>
                  <div className="max-h-40 overflow-auto border border-slate-100 rounded-lg">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr className="text-slate-500">
                          <th className="py-1.5 px-3 font-medium">{t("timeCol")}</th>
                          <th className="py-1.5 px-3 font-medium">{t("fillLevelCol")}</th>
                          <th className="py-1.5 px-3 font-medium">{t("throwsCol")}</th>
                          <th className="py-1.5 px-3 font-medium">{t("batteryCol")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {telemetryHistory.slice(0, 15).map((row) => (
                          <tr key={row.timestamp} className="border-t border-slate-100">
                            <td className="py-1.5 px-3 text-slate-600">{formatTimeShort(row.timestamp)}</td>
                            <td className="py-1.5 px-3 text-slate-700">{row.fillLevel !== null ? `${row.fillLevel}%` : "-"}</td>
                            <td className="py-1.5 px-3 text-slate-700">{row.throwCount !== null ? row.throwCount : "-"}</td>
                            <td className="py-1.5 px-3 text-slate-700">{row.battery !== null ? `${row.battery}%` : "-"}</td>
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
            <h4 className="text-sm font-semibold text-slate-900 mb-2">{t("firmwareStatusLabel")}</h4>
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-slate-900 mb-1">{t("edgeNodeLabel")}</p>
                <div className="flex items-center justify-between text-xs">
                  <span>{t("currentLabel")} <span className="font-mono">{device.binFirmware?.currentVersion || t("unknownVersion")}</span></span>
                  <span>{t("targetLabel")} <span className="font-mono">{device.binFirmware?.targetVersion || t("notSetVersion")}</span></span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="font-semibold text-slate-900 mb-1">{t("masterHubLabel")}</p>
                <div className="flex items-center justify-between text-xs">
                  <span>{t("currentLabel")} <span className="font-mono">{device.desktopFirmware?.currentVersion || t("unknownVersion")}</span></span>
                  <span>{t("targetLabel")} <span className="font-mono">{device.desktopFirmware?.targetVersion || t("notSetVersion")}</span></span>
                </div>
              </div>
              <div className="border-t border-slate-100 pt-3">
                <p className="font-semibold text-slate-900 mb-1">{t("aiModelLabel")}</p>
                <div className="flex items-center justify-between text-xs">
                  <span>{t("currentLabel")} <span className="font-mono">{device.aiModelFirmware?.currentVersion || t("unknownVersion")}</span></span>
                  <span>{t("targetLabel")} <span className="font-mono">{device.aiModelFirmware?.targetVersion || t("notSetVersion")}</span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Editable Form */}
        <form onSubmit={onSave} className="space-y-4 flex flex-col h-full">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 flex-1">
            <h4 className="font-semibold text-slate-900 border-b border-slate-200 pb-2 mb-3 text-sm">{t("editableConfigLabel")}</h4>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("deviceName")}</label>
              <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Smart Bin 01" value={editDeviceForm.name} onChange={(event) => setEditDeviceForm((v) => ({ ...v, name: event.target.value }))} required />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("pollingIntervalLabel")}</label>
                <input type="number" min="0" step="1" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={t("secondsPlaceholder")} value={editDeviceForm.pollingInterval} onChange={(event) => setEditDeviceForm((v) => ({ ...v, pollingInterval: event.target.value }))} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{t("fullThresholdLabel")}</label>
                <input type="number" min="0" step="0.01" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder={t("percentPlaceholder")} value={editDeviceForm.fullThreshold} onChange={(event) => setEditDeviceForm((v) => ({ ...v, fullThreshold: event.target.value }))} />
              </div>
            </div>

            <div className="pt-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{t("locationMapLabel")}</label>
              <LocationPickerMap
                className="h-48 w-full rounded-xl border border-slate-200"
                value={editLocation}
                onChange={(location) => setEditDeviceForm((v) => ({ ...v, latitude: location.latitude.toFixed(6), longitude: location.longitude.toFixed(6) }))}
              />
              <div className="mt-2 grid grid-cols-2 gap-3">
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 bg-slate-50" placeholder="Lat" readOnly value={editDeviceForm.latitude} />
                <input className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-500 bg-slate-50" placeholder="Lng" readOnly value={editDeviceForm.longitude} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
            {editDeviceMessage ? <p className="text-sm text-slate-600 mr-auto">{editDeviceMessage}</p> : null}
            {canDeleteDevice ? (
              <button
                type="button"
                className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                onClick={onDelete}
                disabled={editDeviceLoading}
              >
                {editDeviceLoading ? t("removingBtn") : t("removeBtn")}
              </button>
            ) : null}
            <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200" onClick={onClose}>
              {t("cancel")}
            </button>
            <button className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60" type="submit" disabled={editDeviceLoading}>
              {editDeviceLoading ? t("saving") : t("saveChangesBtn")}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}