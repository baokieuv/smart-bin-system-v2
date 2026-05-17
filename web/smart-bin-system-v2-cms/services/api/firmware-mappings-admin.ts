import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { FirmwareMappingDto, CreateFirmwareMappingRequest, UpdateFirmwareMappingRequest } from "@/types/firmware-mapping";

export const firmwareMappingsAdminApi = {
  getMappings: async (params?: { page?: number; size?: number }) => api.get<PagedPayload<FirmwareMappingDto>>("/firmware-mappings", params, { cacheTTL: 30000 }),
  createMapping: async (request: CreateFirmwareMappingRequest) => api.post<FirmwareMappingDto>("/firmware-mappings", request),
  getMappingById: async (id: string) => api.get<FirmwareMappingDto>(`/firmware-mappings/${id}`),
  updateMapping: async (id: string, request: UpdateFirmwareMappingRequest) => api.put<FirmwareMappingDto>(`/firmware-mappings/${id}`, request),
  deleteMapping: async (id: string) => api.delete<void>(`/firmware-mappings/${id}`),
};
