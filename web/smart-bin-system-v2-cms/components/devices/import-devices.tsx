"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { emitToast } from "@/lib/toast";
import { devicesAdminApi } from "@/services/api/devices-admin";
import { useLanguage } from "@/lib/language"; // IMPORT HOOK NGÔN NGỮ

type DeviceImportItem = { 
  mac: string; 
  claimCode: string;
  name?: string;
  lat?: number;
  lon?: number;
};

type ImportResultItem = { mac?: unknown; status?: unknown; message?: unknown };

const isSuccessfulStatus = (status: unknown) => {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "success" || normalized === "ok" || normalized === "created" || normalized === "imported";
};

const extractImportResults = (data: unknown): ImportResultItem[] => {
  if (Array.isArray(data)) {
    return data as ImportResultItem[];
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  const payload = data as Record<string, unknown>;
  const candidates = [payload.results, payload.items, payload.content, payload.data, payload.failed, payload.failedDevices];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? (list as ImportResultItem[]) : [];
};

export default function ImportDevicesPanel({ onImported }: { onImported?: () => void }) {
  const { t } = useLanguage(); // GỌI HOOK
  
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeviceImportItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const parseFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const ab = await file.arrayBuffer();
      const workbook = XLSX.read(ab, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows: unknown[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      const items: DeviceImportItem[] = [];

      if (rows.length === 0) {
        setError(t("importEmptyFile"));
        setPreview([]);
        return;
      }

      // If rows are objects (header present)
      if (rows.length > 0 && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
        const first = rows[0] as Record<string, unknown>;
        const keys = Object.keys(first);
        
        // Regex để tìm tên cột tương ứng
        const macKey = keys.find((k) => /mac|ma[cC]|mac_address|macaddress/.test(k.toLowerCase()));
        const claimCodeKey = keys.find((k) => /claim[_\s-]?code|claimcode|activation[_\s-]?code|code[_\s-]?claim/.test(k.toLowerCase()));
        const nameKey = keys.find((k) => /name|device[_\s-]?name/.test(k.toLowerCase()));
        const latKey = keys.find((k) => /lat|latitude/.test(k.toLowerCase()));
        const lonKey = keys.find((k) => /lon|lng|longitude/.test(k.toLowerCase()));

        for (const r of rows as Record<string, unknown>[]) {
          const mac = macKey ? String(r[macKey] ?? "").trim() : "";
          const claimCode = claimCodeKey ? String(r[claimCodeKey] ?? "").trim() : "";
          const name = nameKey ? String(r[nameKey] ?? "").trim() : undefined;
          
          const rawLat = latKey ? r[latKey] : undefined;
          const rawLon = lonKey ? r[lonKey] : undefined;
          
          const lat = rawLat !== undefined && rawLat !== "" && !isNaN(Number(rawLat)) ? Number(rawLat) : undefined;
          const lon = rawLon !== undefined && rawLon !== "" && !isNaN(Number(rawLon)) ? Number(rawLon) : undefined;

          if (mac && claimCode) {
            items.push({ mac, claimCode, name, lat, lon });
          }
        }
      } else {
        // Rows are arrays (Fallback cho file không có header chuẩn)
        for (const r of rows as unknown[]) {
          const arr = Array.isArray(r) ? (r as unknown[]) : Object.values(r as Record<string, unknown>);
          const mac = String(arr[0] ?? "").trim();
          const claimCode = String(arr[1] ?? "").trim();
          const name = arr[2] ? String(arr[2]).trim() : undefined;
          const lat = arr[3] && !isNaN(Number(arr[3])) ? Number(arr[3]) : undefined;
          const lon = arr[4] && !isNaN(Number(arr[4])) ? Number(arr[4]) : undefined;
          
          if (mac && claimCode) items.push({ mac, claimCode, name, lat, lon });
        }
      }

      if (items.length === 0) {
        setError(t("importInvalidData"));
        setPreview([]);
        return;
      }

      setPreview(items.slice(0, 1000));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview([]);
    }
  };

  const handleFile = (files: FileList | null) => {
    const f = files && files[0];
    if (!f) return;
    void parseFile(f);
  };

  const doImport = async () => {
    if (preview.length === 0) return setError(t("importNoDevices"));
    setLoading(true);
    try {
      const response = await devicesAdminApi.importDevices({
        devices: preview.map((p) => ({
          mac: p.mac,
          claimCode: p.claimCode,
          name: p.name,
          latitude: p.lat,
          longitude: p.lon,
        })),
      });

      const results = extractImportResults(response.data);
      const failed = results.filter((item) => !isSuccessfulStatus(item.status));
      if (failed.length > 0) {
        const failedMacs = failed
          .map((item) => String(item.mac ?? "").trim())
          .filter(Boolean);
        const previewMacs = failedMacs.slice(0, 10).join(", ");
        const suffix = failedMacs.length > 10 ? `, ... (+${failedMacs.length - 10})` : "";
        const detail = previewMacs ? `: ${previewMacs}${suffix}` : "";
        
        const failedMsg = t("importFailedPartial").replace("{count}", String(failed.length));
        emitToast(`${failedMsg} ${detail}`, "error");
        setError(failedMsg);
      } else {
        const successMsg = t("importSuccess").replace("{count}", String(preview.length));
        emitToast(successMsg, "success");
        setError(null);
      }

      setPreview([]);
      setFileName(null);
      if (onImported) onImported();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      emitToast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">{t("importLabel")}</label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => handleFile(e.target.files)}
          className="text-sm"
        />
        <span className="text-sm text-slate-500">{fileName ?? t("noFileSelected")}</span>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {preview.length > 0 ? (
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-sm text-slate-600">
            {t("importPreviewText").replace("{count}", String(preview.length))}
          </div>
          <div className="mt-2 overflow-x-auto max-h-56">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1 pr-4">{t("deviceName")}</th>
                  <th className="py-1 pr-4">{t("macAddress")}</th>
                  <th className="py-1 pr-4">{t("claimCode")}</th>
                  <th className="py-1 pr-4">{t("latitude")}</th>
                  <th className="py-1">{t("longitude")}</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 pr-4 text-slate-800">{p.name || "-"}</td>
                    <td className="py-1 pr-4 font-medium">{p.mac}</td>
                    <td className="py-1 pr-4 text-slate-600">{p.claimCode}</td>
                    <td className="py-1 pr-4 text-slate-500">{p.lat ?? "-"}</td>
                    <td className="py-1 text-slate-500">{p.lon ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-sky-700 px-3 py-1 text-sm font-semibold text-white hover:bg-sky-800 transition-colors"
              onClick={doImport}
              disabled={loading}
            >
              {loading ? t("importing") : t("importDevicesBtn")}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 transition-colors"
              onClick={() => {
                setPreview([]);
                setFileName(null);
                setError(null);
              }}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}