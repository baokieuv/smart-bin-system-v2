// Service layer for user-facing device endpoints.

import { api } from "@/lib/api-client";
import { getCache, setCache } from "@/lib/cache";
import type { AddDeviceRequest, DeviceDto, RpcRequestPayload, TelemetryParams, UpdateDeviceRequest } from "@/types/device";

type ListPayload = DeviceDto[] | { content?: DeviceDto[] };

type ApiResult<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

export const deviceApi = {
  add: async (formData: AddDeviceRequest) => {
    return api.post<DeviceDto>("/devices/claim", formData);
  },

  getList: async () => {
    const key = "devices:list";
    const cached = getCache<DeviceDto[]>(key);
    if (cached) return { success: true, data: cached } satisfies ApiResult<DeviceDto[]>;

    const res = await api.get<ListPayload>("/devices");
    if (res && res.success && res.data) {
      const maybePage = res.data;
      if (Array.isArray(maybePage)) {
        setCache(key, maybePage, 2 * 60 * 1000);
      } else if (maybePage && Array.isArray(maybePage.content)) {
        res.data = maybePage.content;
        setCache(key, maybePage.content, 2 * 60 * 1000);
      } else {
        setCache(key, res.data, 2 * 60 * 1000);
      }
    }

    return res;
  },

  getDetail: async (deviceId: string) => {
    const key = `device:${deviceId}`;
    const cached = getCache<DeviceDto>(key);
    if (cached) return { success: true, data: cached } satisfies ApiResult<DeviceDto>;

    const res = await api.get<DeviceDto>(`/devices/${deviceId}`);
    if (res && res.success && res.data) {
      setCache(key, res.data, 3 * 60 * 1000);
    }
    return res;
  },

  update: async (deviceId: string, formData: UpdateDeviceRequest) => {
    return api.put<DeviceDto>(`/devices/${deviceId}`, formData);
  },

  delete: async (deviceId: string) => {
    return api.delete<string>(`/devices/${deviceId}`);
  },

  getTelemetries: async (deviceId: string, params?: TelemetryParams) => {
    return api.get(`/devices/${deviceId}/telemetries`, params);
  },

  executeRpc: async (deviceId: string, payload: RpcRequestPayload) => {
    return api.post(`/devices/${deviceId}/rpc`, payload);
  },
};