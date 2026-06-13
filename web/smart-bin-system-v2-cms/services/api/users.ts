// Service layer for user profile and avatar endpoints.

import { api } from "@/lib/api-client";
import { getCache, setCache } from "../../lib/cache";
import type { CreateUserRequest } from "@/types/auth";
import type { UserDto } from "@/types/user";

type ApiResult<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

type UploadFileResponse = {
  objectName: string;
  objectUrl: string;
  contentType: string;
  size: number;
};

const sanitizeAvatarUrl = (avatarUrl: string) => {
  const trimmed = avatarUrl.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return trimmed.replace(/[?#].*$/, "");
  }
};

const toObjectNameFromAvatarUrl = (avatarUrl: string) => {
  const trimmed = avatarUrl.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/^\/+/, "");
  } catch {
    return trimmed
      .replace(/^https?:\/\/[^/]+\/?/i, "")
      .replace(/^\/+/, "")
      .replace(/[?#].*$/, "");
  }
};

export const usersApi = {
  register: async (formData: CreateUserRequest) => {
    return api.post<UserDto>("/users", formData, { skipAuthRefresh: true });
  },

  me: async () => {
    const key = "users:me";
    const cached = getCache<UserDto>(key);
    if (cached) return { success: true, data: cached } satisfies ApiResult<UserDto>;

    const res = await api.get<UserDto>("/users/me");
    if (res && res.success && res.data) {
      setCache(key, res.data, 60 * 1000);
    }
    return res;
  },

  update: async (formData: { name?: string; avatarUrl?: string }) => {
    const res = await api.put<UserDto>("/users/me", formData);
    if (res && res.success && res.data) {
      setCache("users:me", res.data, 60 * 1000);
    }
    return res;
  },

  uploadAvatar: async (file: File, options?: { folder?: string; oldObjectName?: string }) => {
    const formData = new FormData();
    formData.append("file", file);

    if (options?.folder) {
      formData.append("folder", options.folder);
    }

    if (options?.oldObjectName) {
      formData.append("oldObjectName", options.oldObjectName);
    }

    return api.post<UploadFileResponse>("/media/upload", formData);
  },

  sanitizeAvatarUrl,
  toObjectNameFromAvatarUrl,
};