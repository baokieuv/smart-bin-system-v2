import { api } from "@/lib/api-client";

export const usersApi = {
    // Register không cần auth, skip refresh token mechanism
    register: async (formData: {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
    }) => {
        return api.post('/users/', formData, { skipAuthRefresh: true });
    },

    // Get user info cần auth, sử dụng auto refresh
    me: async () => {
        return api.get('/users/me');
    },

    // Upload image cần auth, sử dụng auto refresh
    uploadImage: async (formData: FormData) => {
        return api.post('/users/upload-image', formData);
    }
}