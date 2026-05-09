"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { devicesAdminApi } from "@/services/api/devices-admin";

type DeviceImportItem = { mac: string; name?: string; groupCode?: string };

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
        setError("Tệp không chứa dữ liệu");
        setPreview([]);
        return;
      }

      // If rows are objects (header present)
      if (rows.length > 0 && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
        const first = rows[0] as Record<string, unknown>;
        const keys = Object.keys(first);
        const macKey = keys.find((k) => /mac|ma[cC]|mac_address|macaddress/.test(k.toLowerCase()));
        const nameKey = keys.find((k) => /name|device|ten/.test(k.toLowerCase()));
        const groupCodeKey = keys.find((k) => /groupcode|group_code|group|nhom|ma_nhom/.test(k.toLowerCase()));

        for (const r of rows as Record<string, unknown>[]) {
          const mac = macKey ? String((r as Record<string, unknown>)[macKey] ?? "").trim() : "";
          const name = nameKey ? String((r as Record<string, unknown>)[nameKey] ?? "").trim() : undefined;
          const groupCode = groupCodeKey ? String((r as Record<string, unknown>)[groupCodeKey] ?? "").trim() : undefined;
          if (mac) items.push({ mac, name, groupCode: groupCode || undefined });
        }
      } else {
        // Rows are arrays, treat as [mac, name, groupCode]
        for (const r of rows as unknown[]) {
          const arr = Array.isArray(r) ? (r as unknown[]) : Object.values(r as Record<string, unknown>);
          const mac = String(arr[0] ?? "").trim();
          const name = String(arr[1] ?? "").trim() || undefined;
          const groupCode = String(arr[2] ?? "").trim() || undefined;
          if (mac) items.push({ mac, name, groupCode });
        }
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
      await devicesAdminApi.importDevices({
        devices: preview.map((p) => ({
          mac: p.mac,
          name: p.name,
          groupCode: p.groupCode,
        })),
      });
      setPreview([]);
      setFileName(null);
      if (onImported) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-slate-700">Import devices (CSV / XLSX)</label>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(e) => handleFile(e.target.files)}
          className="text-sm"
        />
        <span className="text-sm text-slate-500">{fileName ?? "No file chosen"}</span>
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {preview.length > 0 ? (
        <div className="rounded-md border border-slate-200 p-2">
          <div className="text-sm text-slate-600">Preview ({preview.length} items). First 200 shown.</div>
          <div className="mt-2 overflow-x-auto max-h-56">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="py-1">MAC</th>
                  <th className="py-1">Name</th>
                  <th className="py-1">Group Code</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 font-medium">{p.mac}</td>
                    <td className="py-1 text-slate-600">{p.name ?? "-"}</td>
                    <td className="py-1 text-slate-600">{p.groupCode ?? "-"}</td>
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
              {loading ? "Importing..." : "Import devices"}
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
