"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { emitToast } from "@/lib/toast";
import { devicesAdminApi } from "@/services/api/devices-admin";

type DeviceImportItem = { mac: string; claimCode: string };

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
        setError("Oops! This file looks empty.");
        setPreview([]);
        return;
      }

      // If rows are objects (header present)
      if (rows.length > 0 && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
        const first = rows[0] as Record<string, unknown>;
        const keys = Object.keys(first);
        const macKey = keys.find((k) => /mac|ma[cC]|mac_address|macaddress/.test(k.toLowerCase()));
        const claimCodeKey = keys.find((k) => /claim[_\s-]?code|claimcode|activation[_\s-]?code|code[_\s-]?claim/.test(k.toLowerCase()));

        for (const r of rows as Record<string, unknown>[]) {
          const mac = macKey ? String((r as Record<string, unknown>)[macKey] ?? "").trim() : "";
          const claimCode = claimCodeKey ? String((r as Record<string, unknown>)[claimCodeKey] ?? "").trim() : "";
          if (mac && claimCode) items.push({ mac, claimCode });
        }
      } else {
        // Rows are arrays, treat as [mac, claimCode]
        for (const r of rows as unknown[]) {
          const arr = Array.isArray(r) ? (r as unknown[]) : Object.values(r as Record<string, unknown>);
          const mac = String(arr[0] ?? "").trim();
          const claimCode = String(arr[1] ?? "").trim();
          if (mac && claimCode) items.push({ mac, claimCode });
        }
      }

      if (items.length === 0) {
        setError("We couldn't find any valid data. Please ensure your file has two columns: MAC and Claim Code.");
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
    if (preview.length === 0) return setError("No devices to import");
    setLoading(true);
    try {
      const response = await devicesAdminApi.importDevices({
        devices: preview.map((p) => ({
          mac: p.mac,
          claimCode: p.claimCode,
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
        emitToast(`Import finished, but ${failed.length} devices failed to import${detail}.`, "error");
        setError(`${failed.length} devices failed to import.`);
      } else {
        emitToast(`Successfully imported ${preview.length} InnoEco devices!`, "success");
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
      <label className="block text-sm font-medium text-slate-700">Import InnoEco Devices (CSV / XLSX)</label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => handleFile(e.target.files)}
          className="text-sm"
        />
        <span className="text-sm text-slate-500">{fileName ?? "No file selected yet"}</span>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {preview.length > 0 ? (
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-sm text-slate-600">Preview ({preview.length} devices). Showing the first 200.</div>
          <div className="mt-2 overflow-x-auto max-h-56">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1">MAC Address</th>
                  <th className="py-1">Claim Code</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 font-medium">{p.mac}</td>
                    <td className="py-1 text-slate-600">{p.claimCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-xl bg-sky-700 px-3 py-1 text-sm font-semibold text-white"
              onClick={doImport}
              disabled={loading}
            >
              {loading ? "Importing..." : "Import Devices"}
            </button>
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-1 text-sm"
              onClick={() => {
                setPreview([]);
                setFileName(null);
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}