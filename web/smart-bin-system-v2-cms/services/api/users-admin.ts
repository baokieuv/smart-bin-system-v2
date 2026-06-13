import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { CreateUserRequest } from "@/types/auth";
import type { UserDto, UpdateUserByTenantRequest } from "@/types/user";

export const usersAdminApi = {
  getUsers: async (params?: { page?: number; size?: number }) => api.get<PagedPayload<UserDto>>("/tenants/users", params, { cacheTTL: 60000 }),
  createUser: async (request: CreateUserRequest) => api.post<unknown>("/users", request),
  updateUserState: async (userId: string, state: UserDto["state"]) => api.patch<UserDto>(`/users/${userId}/state`, { state }),

  updateUser: async (userId: string, request: UpdateUserByTenantRequest) => 
    api.put<UserDto>(`/users/${userId}`, request),

  updateUserPermissions: async (userId: string, devicePermissions: string[]) => 
    api.put<UserDto>(`/users/${userId}`, { devicePermissions }),
};
