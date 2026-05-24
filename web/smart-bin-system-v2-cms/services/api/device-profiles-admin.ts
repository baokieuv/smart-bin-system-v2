import { api } from "@/lib/api-client";
import type { DeviceProfileDto, DeviceProfileListPayload } from "@/types/device-profile";

export const deviceProfilesAdminApi = {
  getDeviceProfiles: async (params?: { page?: number; size?: number }) =>
    api.get<DeviceProfileListPayload>("/device-profiles", params, { cacheTTL: 30000 }),
  getDeviceProfileById: async (id: string) => api.get<DeviceProfileDto>(`/device-profiles/${id}`),
  createDeviceProfile: async (payload: Partial<DeviceProfileDto>) => api.post<DeviceProfileDto>("/device-profiles", payload),
  updateDeviceProfile: async (id: string, payload: Partial<DeviceProfileDto>) =>
    api.put<DeviceProfileDto>(`/device-profiles/${id}`, payload),
  deleteDeviceProfile: async (id: string) => api.delete<string>(`/device-profiles/${id}`),
};