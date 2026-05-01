import type { BaseResponse } from "@/types/core";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9999/api/v1";

interface RequestOptions extends RequestInit {
  skipAuthRefresh?: boolean;
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

export const apiClient = async <T = unknown>(endpoint: string, options: RequestOptions = {}): Promise<BaseResponse<T>> => {
  const { skipAuthRefresh = false, ...fetchOptions } = options;
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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

  if (response.status !== 401 || skipAuthRefresh) {
    const data = (await response.json()) as BaseResponse<T>;
    if (!response.ok) {
      throw new Error(data.message || "Request failed");
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
      throw new Error("No refresh token available");
    }

    const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (!refreshResponse.ok) {
      throw new Error("Refresh token failed");
    }

    const refreshData = (await refreshResponse.json()) as BaseResponse<{ access_token: string; refresh_token?: string }>;

    if (!refreshData.success || !refreshData.data?.access_token) {
      throw new Error("Invalid refresh token response");
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
