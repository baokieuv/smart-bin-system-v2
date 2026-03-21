import { api } from "@/lib/api-client";
import { DeviceDto, TelemetryParams, UpdateDeviceRequest } from "@/types/device";

export const deviceApi = {
    // Add device cần auth, sử dụng auto refresh
    add: async (formData: {
        mac: string;
        longitude: number;
        latitude: number;
        name: string;
    }) => {
        return api.post<DeviceDto>('/devices/', formData);
    },

    // Get list device cần auth, sử dụng auto refresh
    getList: async () => {
        return api.get('/devices/');
    },

    // Get device detail cần auth, sử dụng auto refresh
    getDetail: async (deviceId: string) => {
        return api.get<DeviceDto>(`/devices/${deviceId}`);
    },

    // Upload device cần auth, sử dụng auto refresh
    update: async (deviceId: string, formData: UpdateDeviceRequest) => {
        return api.put<DeviceDto>(`/devices/${deviceId}`, formData);
    },

    // Delete device cần auth, sử dụng auto refresh
    delete: async (deviceId: string) => {
        return api.delete<string>(`/devices/${deviceId}`);
    },

    // Get telemetries cần auth, sử dụng auto refresh
    getTelemetries: async (deviceId: string, params?: TelemetryParams) => {
        return api.get(`/devices/${deviceId}/telemetries`, params);
    },

    // Get attributes cần auth, sử dụng auto refresh
    getAttributes: async (deviceId: string) => {
        return api.get(`/devices/${deviceId}/attributes`);
    }
}