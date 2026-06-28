import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { CreateTenantRequest, TenantDto, UpdateTenantStatusRequest } from "@/types/tenant";

export const tenantsAdminApi = {
  getTenants: async (params?: { page?: number; size?: number }) => api.get<PagedPayload<TenantDto>>("/tenants", params, { cacheTTL: 300000 }),
  createTenant: async (request: CreateTenantRequest) => api.post<TenantDto>("/tenants", request),
  updateTenantStatus: async (id: string, request: UpdateTenantStatusRequest) => api.put<TenantDto>(`/tenants/${id}/status`, request),
};