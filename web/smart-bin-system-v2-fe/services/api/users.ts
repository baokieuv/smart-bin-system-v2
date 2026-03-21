import { api } from "@/lib/api-client";
import { UserDto } from "@/types/user";

export const usersApi = {
    // Register không cần auth, skip refresh token mechanism
    register: async (formData: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    }) => {
        return api.post<UserDto>('/users/', formData, { skipAuthRefresh: true });
    },

    // Get user info cần auth, sử dụng auto refresh
    me: async () => {
        return api.get<UserDto>('/users/me');
    },

    // Update user info cần auth, sử dụng auto refresh
    update: async (formData: {
        firstName: string;
        lastName: string;
    }) => {
        return api.put<UserDto>('/users/', formData);
    },

    // Upload image cần auth, sử dụng auto refresh
    uploadImage: async (formData: FormData) => {
        return api.post<string>('/users/upload-image', formData);
    }
}