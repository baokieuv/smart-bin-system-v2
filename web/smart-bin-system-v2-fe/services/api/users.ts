// Service layer for user profile and avatar endpoints.

import { api } from "@/lib/api-client";
import { CreateUserRequest, UserDto } from "@/types/user";

type UploadFileResponse = {
    objectName: string;
    objectUrl: string;
    contentType: string;
    size: number;
};

const sanitizeAvatarUrl = (avatarUrl: string) => {
    const trimmed = avatarUrl.trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(trimmed);
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return trimmed.replace(/[?#].*$/, '');
    }
};

const toObjectNameFromAvatarUrl = (avatarUrl: string) => {
    const trimmed = avatarUrl.trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(trimmed);
        return parsed.pathname.replace(/^\/+/, '');
    } catch {
        return trimmed
            .replace(/^https?:\/\/[^/]+\/?/i, '')
            .replace(/^\/+/, '')
            .replace(/[?#].*$/, '');
    }
};

export const usersApi = {
    // Register does not require auth; skip refresh-token mechanism
    register: async (formData: CreateUserRequest) => {
        return api.post<UserDto>('/users', formData, { skipAuthRefresh: true });
    },

    // Get user info requires auth and uses auto-refresh
    me: async () => {
        return api.get<UserDto>('/users/me');
    },

    // Update user info requires auth and uses auto-refresh
    update: async (formData: {
        name?: string;
        avatarUrl?: string;
    }) => {
        return api.put<UserDto>('/users/me', formData);
    },

    uploadAvatar: async (
        file: File,
        options?: { folder?: string; oldObjectName?: string },
    ) => {
        const formData = new FormData();
        formData.append('file', file);

        if (options?.folder) {
            formData.append('folder', options.folder);
        }

        if (options?.oldObjectName) {
            formData.append('oldObjectName', options.oldObjectName);
        }

        return api.post<UploadFileResponse>('/media/upload', formData);
    },

    sanitizeAvatarUrl,
    toObjectNameFromAvatarUrl,
};