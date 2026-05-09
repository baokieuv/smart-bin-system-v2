import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { DeviceDto } from "@/types/device";

export const devicesAdminApi = {
  getDevices: async (params?: { page?: number; size?: number }) =>
    api.get<PagedPayload<DeviceDto>>("/devices/admin", params, { cacheTTL: 30000 }),
  importDevices: async (payload: { devices: { mac: string; name?: string }[] }) => api.post("/devices/import", payload),
  updateDevice: async (deviceId: string, payload: Partial<DeviceDto>) => api.put<DeviceDto>(`/devices/${deviceId}`, payload),
  deleteDevice: async (deviceId: string) => api.delete<string>(`/devices/${deviceId}`),
};
