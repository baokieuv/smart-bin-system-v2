import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { DeviceAdminConfigDto, DeviceDto } from "@/types/device";

export const devicesAdminApi = {
  getDevices: async (params?: { page?: number; size?: number }) =>
    api.get<PagedPayload<DeviceDto>>("/devices/admin", params, { cacheTTL: 30000 }),
  getDeviceConfig: async (deviceId: string) => api.get<DeviceAdminConfigDto>(`/configs/devices/${deviceId}`),
  importDevices: async (payload: { devices: { mac: string; name?: string; groupCode?: string }[] }) =>
    api.post("/devices/import", payload),
  updateAdminConfig: async (
    deviceId: string,
    payload: { targetBinFirmwareId?: string; targetDesktopFirmwareId?: string }
  ) => api.put(`/configs/devices/${deviceId}/admin`, payload),
  updateDevice: async (deviceId: string, payload: Partial<DeviceDto>) => api.put<DeviceDto>(`/devices/${deviceId}`, payload),
  deleteDevice: async (deviceId: string) => api.delete<string>(`/devices/${deviceId}`),
};
