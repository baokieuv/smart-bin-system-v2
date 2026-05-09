import { api } from "@/lib/api-client";
import type { PagedPayload } from "@/types/core";
import type { UserDto } from "@/types/user";

export const usersAdminApi = {
  getUsers: async (params?: { page?: number; size?: number }) => api.get<PagedPayload<UserDto>>("/users", params, { cacheTTL: 60000 }),
  updateUserState: async (userId: string, state: UserDto["state"]) => api.patch<UserDto>(`/users/${userId}/state`, { state }),
};
