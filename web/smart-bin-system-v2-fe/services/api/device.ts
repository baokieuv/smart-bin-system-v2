// Service layer for device CRUD and telemetry endpoints.

import { api } from "@/lib/api-client";
import { DeviceDto, TelemetryParams, UpdateDeviceRequest } from "@/types/device";

export const deviceApi = {
    // Add device requires auth and uses auto-refresh
    add: async (formData: {
        mac: string;
        longitude: number;
        latitude: number;
        name: string;
    }) => {
        return api.post<DeviceDto>('/devices/', formData);
    },

    // Get device list requires auth and uses auto-refresh
    getList: async () => {
        return api.get('/devices/');
    },

    // Get device detail requires auth and uses auto-refresh
    getDetail: async (deviceId: string) => {
        return api.get<DeviceDto>(`/devices/${deviceId}`);
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
    },

    // Get attributes requires auth and uses auto-refresh
    getAttributes: async (deviceId: string) => {
        return api.get(`/devices/${deviceId}/attributes`);
    }
}