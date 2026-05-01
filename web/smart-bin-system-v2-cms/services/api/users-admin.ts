import { api } from "@/lib/api-client";
import type { UserDto } from "@/types/user";

export const usersAdminApi = {
  getUsers: async (params?: { page?: number; size?: number }) => api.get<UserDto[] | { items?: UserDto[]; content?: UserDto[] }>("/users", params),
  updateUserState: async (userId: string, state: UserDto["state"]) => api.patch<UserDto>(`/users/${userId}/state`, { state }),
};
