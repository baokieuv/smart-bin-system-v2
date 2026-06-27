import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { DeviceAdminConfigDto, DeviceDto, DeviceOperationResult, TelemetryParams, DeviceImportRequestItem, ImportDeviceResponseItem, RpcRequestPayload } from "@/types/device";

export const devicesAdminApi = {
  getDevices: async (params?: { page?: number; size?: number }) =>
    api.get<PagedPayload<DeviceDto>>("/devices/admin", params, { cacheTTL: 300000 }),

  getDeviceConfig: async (deviceId: string) => api.get<DeviceAdminConfigDto>(`/configs/devices/${deviceId}`, undefined, { cacheTTL: 300000 }),

  importDevices: async (payload: { devices: DeviceImportRequestItem[] }) => api.post<ImportDeviceResponseItem[]>("/devices/import", payload),
  
  assignDevicesToGroup: async (payload: { groupId: string; macAddresses: string[] }) =>
    api.post<string[]>("/devices/assign-group", payload),
  
  assignDevicesToUser: async (payload: { userId: string; macAddresses: string[] }) =>
    api.post<DeviceOperationResult[]>("/devices/assign-user", payload),
  
  updateAdminConfig: async (
    deviceId: string,
    payload: { targetBinFirmwareId?: string; targetDesktopFirmwareId?: string; targetAiModelFirmwareId?: string }
  ) => api.put(`/configs/devices/${deviceId}/firmware`, payload),
  
  executeRpc: async (deviceId: string, payload: RpcRequestPayload) => api.post(`/devices/${deviceId}/rpc`, payload),
  
  updateDevice: async (deviceId: string, payload: Partial<DeviceDto>) => api.put<DeviceDto>(`/devices/${deviceId}`, payload),
  
  deleteDevice: async (deviceId: string) => api.delete<string>(`/devices/${deviceId}`),

  // Get telemetries requires auth and uses auto-refresh
  getTelemetries: async (deviceId: string, params?: TelemetryParams) => {
      return api.get(`/devices/${deviceId}/telemetries`, params, { cacheTTL: 60000 });
  },
};
