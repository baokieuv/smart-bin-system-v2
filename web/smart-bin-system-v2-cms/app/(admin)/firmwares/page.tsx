"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Panel from "@/components/ui/panel";
import Modal from "@/components/ui/modal";
import { unwrapListPayload } from "@/lib/admin-utils";
import { firmwaresAdminApi } from "@/services/api/firmwares-admin";
import { useLanguage } from "@/lib/language"; // IMPORT HOOK NGÔN NGỮ
import type { FirmwareDto } from "@/types/firmware";

const acceptedFileExtensions = [
  // 1. File thực thi và nhị phân cơ bản
  ".bin", 
  ".exe",

  // 2. PyTorch
  ".pt", 
  ".pth",

  // 3. TensorFlow / Keras
  ".pb", 
  ".h5", 
  ".hdf5", 
  ".keras", 
  ".tflite",

  // 4. Định dạng chuyển đổi chung (Interoperability)
  ".onnx",

  // 5. LLMs / Stable Diffusion (Hugging Face, LLaMA...)
  ".safetensors", 
  ".gguf", 
  ".ggml",

  // 6. Machine Learning truyền thống (Scikit-learn...)
  ".pkl", 
  ".joblib"
];

const isValidFirmwareFile = (file: File) => {
  const lowerName = file.name.toLowerCase();
  return acceptedFileExtensions.some((extension) => lowerName.endsWith(extension));
};

export default function FirmwaresPage() {
  const { t } = useLanguage(); // GỌI HOOK
  
  const [items, setItems] = useState<FirmwareDto[]>([]);
  const [form, setForm] = useState({ version: "", type: "ESP32", description: "" });
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteLoadingId, setDeleteLoadingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);

  const acceptedFilesText = useMemo(() => acceptedFileExtensions.join(", "), []);

  const load = useCallback(async (nextPage = page, nextSize = size) => {
    const response = await firmwaresAdminApi.getFirmwares({ page: nextPage, size: nextSize });
    setItems(unwrapListPayload(response.data));

    if (!Array.isArray(response.data) && response.data) {
      const payload = response.data as Record<string, unknown>;
      const backendTotalPages = payload.totalPages;
      if (typeof backendTotalPages === "number" && Number.isFinite(backendTotalPages)) {
        setTotalPages(Math.max(1, backendTotalPages));
      }
    }
  }, [page, size]);

  useEffect(() => {
    void load(page, size).catch((error) => {
      setMessage(error instanceof Error ? error.message : t("loadFirmwaresError"));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, page, size]);

  const onUpload = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");

    if (!file) {
      setMessage(t("selectFirmwareFile"));
      return;
    }

    if (!isValidFirmwareFile(file)) {
      setMessage(`${t("invalidFileType")} ${acceptedFilesText}`);
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
      setMessage(t("uploadFirmwareSuccess"));
      await load(page, size);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : t("uploadFirmwareError");
      console.error(`[FirmwareUpload] Upload failed:`, error);
      setMessage(errorMsg);
    } finally {
      setUploading(false);
    }
  };

  const openUploadModal = () => {
    setForm({ version: "", type: "ESP32", description: "" });
    setFile(null);
    setMessage("");
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setShowUploadModal(false);
    setForm({ version: "", type: "ESP32", description: "" });
    setFile(null);
  };

  const onDelete = async (id: string) => {
    try {
      setDeleteLoadingId(id);
      await firmwaresAdminApi.deleteFirmware(id);
      setMessage(t("removePackageSuccess"));
      await load(page, size);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("removePackageError"));
    } finally {
      setDeleteLoadingId(null);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
      <Panel
        title={t("firmwarePackagesTitle")}
        subtitle={t("firmwarePackagesSubtitle")}
        action={
          <button type="button" onClick={openUploadModal} className="rounded-xl bg-sky-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-700">
            {t("uploadUpdateBtn")}
          </button>
        }
      >
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-200 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2 px-3 whitespace-nowrap">{t("versionCol")}</th>
                <th className="py-2 px-3 whitespace-nowrap">{t("targetPlatformCol")}</th>
                <th className="py-2 px-3 whitespace-nowrap">{t("fileLinkCol")}</th>
                <th className="py-2 px-3 whitespace-nowrap">{t("descriptionCol")}</th>
                <th className="py-2 px-3 whitespace-nowrap">{t("dateAddedCol")}</th>
                <th className="py-2 px-3 whitespace-nowrap">{t("actions")}</th>
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
                    <div className="max-w-md max-h-20 overflow-auto whitespace-pre-wrap wrap-break-word">{item.description || "-"}</div>
                  </td>
                  <td className="py-2 text-slate-600 whitespace-nowrap">{item.createdDate || "-"}</td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void onDelete(item.id)}
                      disabled={deleteLoadingId === item.id}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                    >
                      {deleteLoadingId === item.id ? t("removingBtn") : t("removeBtn")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="text-slate-600">
            {t("pageText")} {page} {t("ofText")} {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <select
              className="rounded-lg border border-slate-200 px-2 py-1 outline-none focus:border-sky-500"
              value={size}
              onChange={(e) => {
                setPage(1);
                setSize(Number(e.target.value));
              }}
            >
              {[10, 20, 50, 100].map((val) => (
                <option key={val} value={val}>
                  {val} {t("perPage")}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              {t("previousBtn")}
            </button>
            <button
              className="rounded-lg border border-slate-200 px-3 py-1 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              type="button"
            >
              {t("nextBtn")}
            </button>
          </div>
        </div>
      </Panel>

      {showUploadModal ? (
        <Modal title={t("uploadModalTitle")} subtitle={t("uploadModalSubtitle")} onClose={closeUploadModal}>
          <form onSubmit={onUpload} className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 transition"
              placeholder={t("versionPlaceholder")}
              value={form.version}
              onChange={(event) => setForm((v) => ({ ...v, version: event.target.value }))}
              required
            />

            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 transition"
              value={form.type}
              onChange={(event) => setForm((v) => ({ ...v, type: event.target.value }))}
              required
            >
              <option value="ESP32">{t("esp32Option")}</option>
              <option value="RASPBERRY_PI">{t("piOption")}</option>
              <option value="AI_MODEL">{t("aiModelOption")}</option>
            </select>

            <textarea
              className="h-32 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-sky-500 transition"
              placeholder={t("releaseNotesPlaceholder")}
              value={form.description}
              onChange={(event) => setForm((v) => ({ ...v, description: event.target.value }))}
            />

            <div className="space-y-2">
              <input
                type="file"
                accept=".bin,.exe,.pt,.pth,.h5,.hdf5,.pb,.tflite,.keras,.onnx,.safetensors,.gguf,.ggml,.pkl,.joblib,application/octet-stream,application/x-msdownload"
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
              <p className="text-xs text-slate-500">{t("allowedFormats")} {acceptedFilesText}</p>
              {file && (
                <p className="text-xs text-slate-600">
                  {t("selectedFileText")} {file.name} ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 border-t border-slate-200 pt-4">
              <button
                className="rounded-xl bg-sky-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
                type="submit"
                disabled={uploading}
              >
                {uploading ? t("uploading") : t("uploadUpdateBtn")}
              </button>
              <button type="button" className="rounded-xl bg-slate-100 px-4 py-2 text-sm transition hover:bg-slate-200" onClick={closeUploadModal}>
                {t("cancel")}
              </button>
              {message ? <p className="text-sm text-slate-600">{message}</p> : null}
            </div>
          </form>
        </Modal>
      ) : null}

      {!showUploadModal && message ? <p className="text-sm text-slate-600">{message}</p> : null}
    </div>
  );
}