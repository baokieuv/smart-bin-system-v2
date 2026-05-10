"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Panel from "@/components/ui/panel";
import { unwrapListPayload } from "@/lib/admin-utils";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import type { FirmwareDto } from "@/types/firmware";

const acceptedFileExtensions = [".bin", ".exe"];

const isValidFirmwareFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return acceptedFileExtensions.some((extension) => lowerName.endsWith(extension));
};

export default function FirmwaresPage() {
  const [items, setItems] = useState<FirmwareDto[]>([]);
  const [form, setForm] = useState({ version: "", type: "ESP32", description: "" });
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const acceptedFilesText = useMemo(() => acceptedFileExtensions.join(", "), []);

  const load = async (nextPage = page, nextSize = size) => {
    const response = await firmwaresAdminApi.getFirmwares({ page: nextPage, size: nextSize });
    setItems(unwrapListPayload(response.data));

    if (!Array.isArray(response.data) && response.data) {
      const payload = response.data as Record<string, unknown>;
      const backendTotalPages = payload.totalPages;
      if (typeof backendTotalPages === "number" && Number.isFinite(backendTotalPages)) {
        setTotalPages(Math.max(1, backendTotalPages));
      }
    }
  };

  useEffect(() => {
    void load(page, size).catch((error) => {
      setMessage(error instanceof Error ? error.message : "Load failed");
    });
  }, [page, size]);

  const onUpload = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");

    if (!file) {
      setMessage("Please select a firmware file");
      return;
    }

    if (!isValidFirmwareFile(file)) {
      setMessage(`Invalid file type. Allowed: ${acceptedFilesText}`);
      return;
    }

    try {
      setUploading(true);
      console.log(`[FirmwareUpload] Starting upload: file=${file.name}, size=${file.size} bytes, version=${form.version}`);
      
      await firmwaresAdminApi.uploadFirmware({
        file,
        version: form.version.trim(),
        type: form.type,
        description: form.description,
      });
      
      console.log(`[FirmwareUpload] Upload successful`);
      setForm({ version: "", type: "ESP32", description: "" });
      setFile(null);
      setMessage("Firmware uploaded");
      await load(page, size);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Upload failed";
      console.error(`[FirmwareUpload] Upload failed:`, error);
      setMessage(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await firmwaresAdminApi.deleteFirmware(id);
      setMessage("Firmware deleted");
      await load(page, size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel title="Firmwares" subtitle="Manage uploaded firmware packages (.bin and .exe)">
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-200 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3 whitespace-nowrap">Version</th>
                <th className="py-2 px-3 whitespace-nowrap">Type</th>
                <th className="py-2 px-3 whitespace-nowrap">File URL</th>
                <th className="py-2 px-3 whitespace-nowrap">Description</th>
                <th className="py-2 px-3 whitespace-nowrap">Created Date</th>
                <th className="py-2 px-3 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-slate-200/70">
                  <td className="py-2 font-medium text-foreground whitespace-nowrap">{item.version}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{item.type}</td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">
                    {item.objectPath ? (
                      <a href={item.objectPath} target="_blank" rel="noreferrer" className="text-sky-700 underline">
                        {item.objectPath}
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 text-slate-600">
                    <div className="max-w-[28rem] max-h-20 overflow-auto whitespace-pre-wrap break-words">{item.description || "-"}</div>
                  </td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{item.createdDate || "-"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700"
                    >
                      Delete
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
        <Panel title="Upload Firmware">
          <form onSubmit={onUpload} className="space-y-3">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Version (e.g. 1.0.3)"
              value={form.version}
              onChange={(event) => setForm((v) => ({ ...v, version: event.target.value }))}
              required
            />

            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2"
              value={form.type}
              onChange={(event) => setForm((v) => ({ ...v, type: event.target.value }))}
              required
            >
              <option value="ESP32">ESP32 (Bin)</option>
              <option value="RASPBERRY_PI">RASPBERRY_PI (Desktop)</option>
            </select>

            <textarea
              className="h-24 w-full rounded-xl border border-slate-200 px-3 py-2"
              placeholder="Description (optional)"
              value={form.description}
              onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))}
            />

            <div className="space-y-2">
              <input
                type="file"
                accept=".bin,.exe,application/octet-stream,application/x-msdownload"
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  setFile(selected);
                  if (selected) {
                    const sizeMB = (selected.size / (1024 * 1024)).toFixed(2);
                    console.log(`[FileInput] Selected file: ${selected.name}, size: ${sizeMB}MB`);
                  }
                }}
                required
                className="w-full text-sm"
              />
              <p className="text-xs text-slate-500">Allowed file types: {acceptedFilesText}</p>
              {file && (
                <p className="text-xs text-slate-600">
                  Selected: {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              )}
            </div>

            <button
              className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              type="submit"
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload firmware"}
            </button>

            {message ? <p className="text-sm text-slate-600">{message}</p> : null}
          </form>
        </Panel>
      </div>
    </div>
  );
}
