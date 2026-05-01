import { api } from "@/lib/api-client";
import type { DeviceDto } from "@/types/device";

export const devicesAdminApi = {
  getDevices: async () => api.get<DeviceDto[] | { items?: DeviceDto[]; content?: DeviceDto[] }>("/devices"),
  createDevice: async (payload: Partial<DeviceDto>) => api.post<DeviceDto>("/devices", payload),
  updateDevice: async (deviceId: string, payload: Partial<DeviceDto>) => api.put<DeviceDto>(`/devices/${deviceId}`, payload),
  deleteDevice: async (deviceId: string) => api.delete<string>(`/devices/${deviceId}`),
};
