import { api } from "@/lib/api-client";
import type { FirmwareListPayload } from "@/types/firmware";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9999/api/v1";

export const firmwaresAdminApi = {
  getFirmwares: async (params?: { page?: number; size?: number }) =>
    api.get<FirmwareListPayload>("/configs/firmwares", params, { cacheTTL: 30000 }),

  uploadFirmware: async (payload: { file: File; version: string; type: string; description?: string }) => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("version", payload.version);
      formData.append("type", payload.type);
      if (payload.description?.trim()) {
        formData.append("description", payload.description.trim());
      }

      const xhr = new XMLHttpRequest();
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          console.log(`[Upload] Progress: ${percentComplete.toFixed(2)}% (${(event.loaded / 1024 / 1024).toFixed(2)}MB / ${(event.total / 1024 / 1024).toFixed(2)}MB)`);
        }
      });

      xhr.addEventListener("load", () => {
        console.log(`[Upload] Request completed with status: ${xhr.status}`);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            console.log(`[Upload] Response:`, response);
            resolve(response);
          } catch {
            reject(new Error("Failed to parse upload response"));
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.message || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
          }
        }
      });

      xhr.addEventListener("error", () => {
        console.error(`[Upload] Network error`);
        reject(new Error("Network error during upload"));
      });

      xhr.addEventListener("abort", () => {
        console.log(`[Upload] Upload cancelled`);
        reject(new Error("Upload cancelled"));
      });

      // Set timeout: 5 minutes
      xhr.timeout = 300000;
      xhr.addEventListener("timeout", () => {
        console.error(`[Upload] Request timeout`);
        reject(new Error("Upload timeout - request took too long"));
      });

      console.log(`[Upload] Starting XMLHttpRequest upload to ${API_BASE_URL}/configs/firmwares`);
      xhr.open("POST", `${API_BASE_URL}/configs/firmwares`);
      
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      try {
        console.log(`[Upload] Sending FormData with file size: ${(payload.file.size / 1024 / 1024).toFixed(2)}MB`);
        xhr.send(formData);
      } catch (error) {
        console.error(`[Upload] Failed to send request:`, error);
        reject(error);
      }
    });
  },

  deleteFirmware: async (id: string) => api.delete<string>(`/configs/firmwares/${id}`),
};
