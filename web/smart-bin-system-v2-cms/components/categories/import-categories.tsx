"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { shopAdminApi } from "@/services/api/shop-admin";

type CategoryImportItem = { name: string; description?: string };

export default function ImportCategoriesPanel({ onImported }: { onImported?: () => void }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CategoryImportItem[]>([]);
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

      const items: CategoryImportItem[] = [];
      if (rows.length === 0) {
        setError("Tệp không chứa dữ liệu");
        setPreview([]);
        return;
      }

      if (rows.length > 0 && typeof rows[0] === "object" && !Array.isArray(rows[0])) {
        const first = rows[0] as Record<string, unknown>;
        const keys = Object.keys(first);
        const nameKey = keys.find((k) => /name|title/.test(k.toLowerCase()));
        const descKey = keys.find((k) => /description|desc/.test(k.toLowerCase()));

        for (const r of rows as Record<string, unknown>[]) {
          const name = nameKey ? String(r[nameKey] ?? "").trim() : "";
          const description = descKey ? String(r[descKey] ?? "").trim() : undefined;
          if (name) items.push({ name, description });
        }
      } else {
        for (const r of rows as unknown[]) {
          const arr = Array.isArray(r) ? (r as unknown[]) : Object.values(r as Record<string, unknown>);
          const name = String(arr[0] ?? "").trim();
          const description = String(arr[1] ?? "").trim() || undefined;
          if (name) items.push({ name, description });
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
    if (preview.length === 0) return setError("No categories to import");
    setLoading(true);
    try {
      await shopAdminApi.importCategories({ categories: preview.map((p) => ({ name: p.name, description: p.description })) });
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
      <label className="block text-sm font-medium text-slate-700">Import categories (CSV / XLSX)</label>
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
                  <th className="py-1">Name</th>
                  <th className="py-1">Description</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 200).map((p, idx) => (
                  <tr key={idx} className="border-t border-slate-100">
                    <td className="py-1 font-medium">{p.name}</td>
                    <td className="py-1 text-slate-600">{p.description ?? "-"}</td>
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
              {loading ? "Importing..." : "Import categories"}
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
