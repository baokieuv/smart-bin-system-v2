// Service layer for user profile and avatar endpoints.

import { api } from "@/lib/api-client";
import { CreateUserRequest, UserDto } from "@/types/user";

type PresignedUrlResponse = {
    objectName: string;
    url: string;
    expiresInSeconds: number;
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

const toPublicObjectUrlFromPresignedUrl = (presignedUrl: string) => {
    const trimmed = presignedUrl.trim();
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
        firstName?: string;
        lastName?: string;
        avatarUrl?: string;
    }) => {
        return api.put<UserDto>('/users', formData);
    },

    createAvatarPresignedUploadUrl: async (
        contentType: string,
        options?: { folder?: string; oldObjectName?: string },
    ) => {
        const params = new URLSearchParams({ contentType });
        if (options?.folder) {
            params.append('folder', options.folder);
        }
        if (options?.oldObjectName) {
            params.append('oldObjectName', options.oldObjectName);
        }

        return api.post<PresignedUrlResponse>(`/media/presigned-upload?${params.toString()}`);
    },

    uploadToPresignedUrl: async (url: string, file: File, contentType: string) => {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': contentType,
            },
            body: file,
        });

        if (!response.ok) {
            throw new Error('Failed to upload avatar to object storage.');
        }
    },

    sanitizeAvatarUrl,
    toPublicObjectUrlFromPresignedUrl,
    toObjectNameFromAvatarUrl,
}