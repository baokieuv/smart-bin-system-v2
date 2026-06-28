import { api } from "@/lib/api-client";
import type { AddDeviceRequest, DeviceDto, RpcRequestPayload, TelemetryParams, UpdateDeviceRequest, FilterDeviceParams } from "@/types/device";

type ListPayload = DeviceDto[] | { content?: DeviceDto[] };

export const deviceApi = {
  add: async (formData: AddDeviceRequest) => {
    return api.post<DeviceDto>("/devices/claim", formData);
  },

  getFilterList: async (params?: FilterDeviceParams) => {
    // Đổi từ "/devices" thành "/devices/filter"
    const res = await api.get<ListPayload>("/devices/filter", params, { cacheTTL: 300000 });
    
    return res;
  },

  getList: async (params?: { page?: number; size?: number }) => {
    return api.get<ListPayload>("/devices", params, { cacheTTL: 300000 });
  },

  getDetail: async (deviceId: string) => {
    return api.get<DeviceDto>(`/devices/${deviceId}`, { cacheTTL: 300000 });
  },

  update: async (deviceId: string, formData: UpdateDeviceRequest) => {
    return api.put<DeviceDto>(`/devices/${deviceId}`, formData);
  },

  delete: async (deviceId: string) => {
    return api.delete<string>(`/devices/${deviceId}`);
  },

  getTelemetries: async (deviceId: string, params?: TelemetryParams) => {
    return api.get(`/devices/${deviceId}/telemetries`, params, { cacheTTL: 60000 });
  },

  executeRpc: async (deviceId: string, payload: RpcRequestPayload) => {
    return api.post(`/devices/${deviceId}/rpc`, payload);
  },

  getBulkTelemetries: (keys: string[]) => {
    return api.get<Record<string, number>>(
      `/devices/bulk-telemetries`, 
      { keys: keys.join(',') },
      { cacheTTL: 60000 }
    );
  }
};