import type { BaseResponse } from "@/types/core";
import { emitToast } from "@/lib/toast";

export class ApiError extends Error {
  status?: number;
  constructor(message?: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9999/api/v1";

interface RequestOptions extends RequestInit {
  skipAuthRefresh?: boolean;
  suppressPermissionToast?: boolean;
  /** milliseconds to keep GET responses in cache */
  cacheTTL?: number;
  /** optional explicit cache key */
  cacheKey?: string;
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: () => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((item) => {
    if (error) item.reject(error);
    else item.resolve();
  });
  failedQueue = [];
};

// Simple in-memory cache for GET list endpoints. Keys are strings (endpoint + query by default).
const getCache = new Map<string, { expiresAt: number; response: BaseResponse<unknown> }>();

const isPermissionRelatedError = (status: number, message: string) => {
  if (status === 403) {
    return true;
  }

  return /(role|permission|forbidden|unauthori[sz]ed|không có quyền|khong co quyen)/i.test(message);
};

export const apiClient = async <T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<BaseResponse<T>> => {
  const { skipAuthRefresh = false, suppressPermissionToast = false, cacheTTL, cacheKey, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toString().toUpperCase();

  // Return cached GET response when available and fresh
  if (method === "GET" && typeof cacheTTL === "number" && cacheTTL > 0) {
    const key = cacheKey || endpoint;
    const cached = getCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.response as BaseResponse<T>;
    }
  }
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (token && !skipAuthRefresh) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (fetchOptions.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const config: RequestInit = {
    ...fetchOptions,
    headers,
  };

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, config);
  } catch {
    const message = "Không thể kết nối đến máy chủ";
    emitToast(message, "error");
    throw new ApiError(message);
  }

  if (response.status !== 401 || skipAuthRefresh) {
    let data: BaseResponse<T>;

    try {
      data = (await response.json()) as BaseResponse<T>;
    } catch {
      data = { success: false, message: response.statusText || "Request failed", data: undefined as T };
    }

    if (!response.ok) {
      const message = data.message || response.statusText || "Request failed";
      if (!suppressPermissionToast && isPermissionRelatedError(response.status, message)) {
        emitToast(message || "Không có quyền truy cập");
      }
      throw new ApiError(message, response.status);
    }

    // Cache successful GET list responses when requested
    if (method === "GET" && typeof cacheTTL === "number" && cacheTTL > 0) {
      const key = cacheKey || endpoint;
      getCache.set(key, { expiresAt: Date.now() + cacheTTL, response: data as BaseResponse<unknown> });
    }
    return data;
  }

  if (isRefreshing) {
    return new Promise<void>((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    }).then(() => apiClient<T>(endpoint, fetchOptions));
  }

  isRefreshing = true;

  try {
    const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refresh_token") : null;
    if (!refreshToken) {
      throw new ApiError("No refresh token available", 401);
    }

    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResponse.ok) {
      throw new ApiError("Refresh token failed", refreshResponse.status);
    }

    const refreshData = (await refreshResponse.json()) as BaseResponse<{ access_token: string; refresh_token?: string }>;

    if (!refreshData.success || !refreshData.data?.access_token) {
      throw new ApiError("Invalid refresh token response", refreshResponse.status);
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("access_token", refreshData.data.access_token);
      if (refreshData.data.refresh_token) {
        localStorage.setItem("refresh_token", refreshData.data.refresh_token);
      }
    }

    processQueue(null);
    return apiClient<T>(endpoint, fetchOptions);
  } catch (error) {
    processQueue(error as Error);
    if (typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/auth/login";
    }
    throw error;
  } finally {
    isRefreshing = false;
  }
};

export const api = {
  get: <T = unknown>(endpoint: string, params?: Record<string, unknown>, options?: RequestOptions) => {
    let fullEndpoint = endpoint;

    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const query = searchParams.toString();
      if (query) fullEndpoint += `?${query}`;
    }

    return apiClient<T>(fullEndpoint, { ...options, method: "GET" });
  },

  post: <T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "POST",
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  put: <T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "PUT",
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  patch: <T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: data instanceof FormData ? data : JSON.stringify(data),
    }),

  delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
    apiClient<T>(endpoint, {
      ...options,
      method: "DELETE",
    }),
};
