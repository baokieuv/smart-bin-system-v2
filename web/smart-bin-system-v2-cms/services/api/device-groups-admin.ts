import { api } from "@/lib/api-client";
import type {
  CreateDeviceGroupRequest,
  DeviceGroupDto,
  DeviceGroupListPayload,
  UpdateDeviceGroupRequest,
} from "@/types/device-group";

export const deviceGroupsAdminApi = {
  getDeviceGroups: async (params?: { page?: number; size?: number }) =>
    api.get<DeviceGroupListPayload>("/device-groups", params, { cacheTTL: 30000 }),
  getDeviceGroupById: async (id: string) => api.get<DeviceGroupDto>(`/device-groups/${id}`),
  createDeviceGroup: async (payload: CreateDeviceGroupRequest) => api.post<DeviceGroupDto>("/device-groups", payload),
  updateDeviceGroup: async (id: string, payload: UpdateDeviceGroupRequest) =>
    api.put<DeviceGroupDto>(`/device-groups/${id}`, payload),
  deleteDeviceGroup: async (id: string) => api.delete<string>(`/device-groups/${id}`),
};
