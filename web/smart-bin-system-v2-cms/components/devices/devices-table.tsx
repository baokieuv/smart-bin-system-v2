"use client";

import type { DeviceDto } from "@/types/device";
import type { TranslationKey } from "@/lib/language";

interface DevicesTableProps {
  devices: DeviceDto[];
  selectedDeviceIds: string[];
  selectedDeviceId: string;
  canAssignDevices: boolean;
  canControlDevice: boolean;
  canConfigureFirmware: boolean;
  configLoading: boolean;
  configFetchingId: string | null;
  onToggleSelection: (deviceId: string) => void;
  onOpenControlModal: (device: DeviceDto) => void;
  onOpenDetails?: (device: DeviceDto) => void;
  onOpenConfig: (device: DeviceDto) => void;
  getLocationText: (lat?: number, lng?: number) => string;
  t: (key: TranslationKey) => string;
  page: number;
  totalPages: number;
  size: number;
  setPage: (page: number) => void;
  setSize: (size: number) => void;
}

export default function DevicesTable({
  devices,
  selectedDeviceIds,
  selectedDeviceId,
  canAssignDevices,
  canControlDevice,
  canConfigureFirmware,
  configLoading,
  configFetchingId,
  onToggleSelection,
  onOpenControlModal,
  onOpenDetails,
  onOpenConfig,
  getLocationText,
  t,
  page,
  totalPages,
  size,
  setPage,
  setSize,
}: DevicesTableProps) {
  return (
    <>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-300 text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              {canAssignDevices ? <th className="w-10 py-2 px-3 whitespace-nowrap">{t("selectCol")}</th> : null}
              <th className="py-2 px-3 whitespace-nowrap">{t("deviceName")}</th>
              <th className="py-2 px-3 whitespace-nowrap">{t("macAddress")}</th>
              <th className="py-2 px-3 whitespace-nowrap">{t("locationCol")}</th>
              <th className="py-2 px-3 whitespace-nowrap">{t("groupCol")}</th>
              <th className="py-2 px-3 whitespace-nowrap">{t("statusCol")}</th>
              <th className="py-2 px-3 whitespace-nowrap">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {devices.map((device) => (
              <tr key={device.id} className={`border-b border-slate-200/70 ${selectedDeviceId === device.id ? "bg-sky-50/60" : ""}`}>
                {canAssignDevices ? (
                  <td className="py-2 px-3 whitespace-nowrap">
                    <input type="checkbox" checked={selectedDeviceIds.includes(device.id)} onChange={() => onToggleSelection(device.id)} aria-label={`Select ${device.name}`} />
                  </td>
                ) : null}
                <td className="py-2 px-3 font-medium text-foreground whitespace-nowrap">
                  {canControlDevice ? (
                    <button type="button" onClick={() => onOpenControlModal(device)} className="text-left font-medium text-sky-800 underline decoration-sky-300 underline-offset-4 hover:text-sky-900">
                      {device.name}
                    </button>
                  ) : (
                    device.name
                  )}
                </td>
                <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.mac}</td>
                <td className="py-2 px-3 text-slate-600 max-w-50 truncate" title={getLocationText(device.latitude, device.longitude)}>
                  {getLocationText(device.latitude, device.longitude)}
                </td>
                <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{device.groupCode || "-"}</td>
                <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-500/10">
                    {device.status} {device.state ? `(${device.state})` : ""}
                  </span>
                </td>
                <td className="py-2 px-3 flex gap-2">
                  {onOpenDetails && (
                    <button type="button" onClick={() => onOpenDetails(device)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                      {t("detailsBtn")}
                    </button>
                  )}
                  {canConfigureFirmware ? (
                    <button type="button" onClick={() => onOpenConfig(device)} disabled={configLoading || configFetchingId === device.id} className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50">
                      {configFetchingId === device.id ? t("loading") : t("configureBtn")}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-slate-600">{t("pageText")} {page} {t("ofText")} {totalPages}</div>
        <div className="flex items-center gap-2">
          <select className="rounded-lg border border-slate-200 px-2 py-1" value={size} onChange={(e) => { setPage(1); setSize(Number(e.target.value)); }}>
            <option value={10}>10 {t("perPage")}</option>
            <option value={20}>20 {t("perPage")}</option>
            <option value={50}>50 {t("perPage")}</option>
            <option value={100}>100 {t("perPage")}</option>
          </select>
          <button className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))} type="button">{t("previousBtn")}</button>
          <button className="rounded-lg border border-slate-200 px-3 py-1 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage(Math.min(totalPages, page + 1))} type="button">{t("nextBtn")}</button>
        </div>
      </div>
    </>
  );
}