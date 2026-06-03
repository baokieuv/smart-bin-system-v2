// Service layer for device CRUD and telemetry endpoints.

import { api } from "@/lib/api-client";
import { getCache, setCache } from '@/lib/cache';
import { AddDeviceRequest, DeviceDto, TelemetryParams, UpdateDeviceRequest } from "@/types/device";

export const deviceApi = {
    // Add device requires auth and uses auto-refresh
    add: async (formData: AddDeviceRequest) => {
        return api.post<DeviceDto>('/devices/claim', formData);
    },

    // Get device list requires auth and uses auto-refresh
    getList: async () => {
        const key = 'devices:list';
        // const cached = getCache<any>(key);
        // if (cached) return { success: true, data: cached } as any;

        const res = await api.get('/devices');
        if (res && res.success && res.data) {
            // Normalize paginated responses that return { content: [...] }
            const maybePage = res.data as any;
            if (maybePage && Array.isArray(maybePage.content)) {
                // replace data with the content array for backward compatibility
                res.data = maybePage.content;
            }

            setCache(key, res.data, 2 * 60 * 1000);
        }
        return res;
    },

    // Get device detail requires auth and uses auto-refresh
    getDetail: async (deviceId: string) => {
        const key = `device:${deviceId}`;
        const cached = getCache<DeviceDto>(key);
        if (cached) return { success: true, data: cached } as any;

        const res = await api.get<DeviceDto>(`/devices/${deviceId}`);
        if (res && res.success && res.data) {
            setCache(key, res.data, 3 * 60 * 1000);
        }
        return res;
    },

    // Update device requires auth and uses auto-refresh
    update: async (deviceId: string, formData: UpdateDeviceRequest) => {
        return api.put<DeviceDto>(`/devices/${deviceId}`, formData);
    },

    // Delete device requires auth and uses auto-refresh
    delete: async (deviceId: string) => {
        return api.delete<string>(`/devices/${deviceId}`);
    },

    // Get telemetries requires auth and uses auto-refresh
    getTelemetries: async (deviceId: string, params?: TelemetryParams) => {
        return api.get(`/devices/${deviceId}/telemetries`, params);
    }
}