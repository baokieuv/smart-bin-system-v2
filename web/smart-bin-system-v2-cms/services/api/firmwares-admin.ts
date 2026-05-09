import { api } from "@/lib/api-client";
import type { FirmwareListPayload } from "@/types/firmware";

export const firmwaresAdminApi = {
  getFirmwares: async (params?: { page?: number; size?: number }) =>
    api.get<FirmwareListPayload>("/configs/firmwares", params, { cacheTTL: 30000 }),

  uploadFirmware: async (payload: { file: File; version: string; type: string; description?: string }) => {
    const formData = new FormData();
    formData.append("file", payload.file);
    formData.append("version", payload.version);
    formData.append("type", payload.type);
    if (payload.description?.trim()) {
      formData.append("description", payload.description.trim());
    }

    return api.post("/configs/firmwares", formData);
  },

  deleteFirmware: async (id: string) => api.delete<string>(`/configs/firmwares/${id}`),
};
