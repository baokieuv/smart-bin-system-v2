// HTTP client wrapper with auth token refresh and retry queue.

import { BaseResponse } from "@/types/core";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9999/api/v1';

interface RequestOptions extends RequestInit {
    skipAuthRefresh?: boolean; // Flag to avoid infinite refresh-token retry loops
}

let isRefreshing = false;
let failedQueue: Array<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve();
        }
    });

    failedQueue = [];
};

export const apiClient = async <T = unknown> (endpoint: string, options: RequestOptions = {}): Promise<BaseResponse<T>> => {
    const { skipAuthRefresh = false, ...fetchOptions } = options;

    // Add Authorization header if access_token exists (except public endpoints)
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string>),
    };

    // Add Authorization header only when token exists and body is not FormData
    if (token && !skipAuthRefresh) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Remove Content-Type when body is FormData
    if (fetchOptions.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    const config: RequestInit = {
        ...fetchOptions,
        headers,
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // If not 401, handle response normally
        if (response.status !== 401) {
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error((data && (data as any).message) || 'An error occurred. Please try again later.');
            }

            return data;
        }

        // If 401 and this was a call with skipAuthRefresh (public endpoint), don't try to refresh
        // because public endpoints shouldn't require auth in the first place
        if (skipAuthRefresh) {
            const errBody = await response.json().catch(() => ({ message: 'Unauthorized' }));
            throw new Error((errBody && (errBody as any).message) || 'Unauthorized');
        }

        // Handle 401 - token expired, attempt refresh
        const originalRequest = { endpoint, options: fetchOptions };

        if (isRefreshing) {
            // If token refresh is in progress, wait for the result
            return new Promise<void>((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            })
                .then(() => {
                    // Retry request with new token
                    return apiClient<T>(endpoint, fetchOptions);
                })
                .catch((err) => {
                    return Promise.reject(err);
                });
        }

        isRefreshing = true;

        try {
            const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null;

            if (!refreshToken) {
                throw new Error('No refresh token available');
            }

            // Call refresh token API
            const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken }),
            });

            if (!refreshResponse.ok) {
                throw new Error('Refresh token failed');
            }

            const refreshData = await refreshResponse.json();

            if (refreshData.success && refreshData.data) {
                const { access_token, refresh_token } = refreshData.data;

                // Save new token
                if (typeof window !== 'undefined') {
                    localStorage.setItem('access_token', access_token);
                    if (refresh_token) {
                        localStorage.setItem('refresh_token', refresh_token);
                    }
                }

                // Process queued requests
                processQueue(null);

                // Retry original request with new token
                return apiClient(originalRequest.endpoint, originalRequest.options);
            } else {
                throw new Error('Invalid refresh token');
            }
        } catch (refreshError) {
            processQueue(refreshError as Error);

            // Clear tokens and redirect to login
            if (typeof window !== 'undefined') {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/auth/login';
            }

            throw refreshError;
        } finally {
            isRefreshing = false;
        }
    } catch (error) {
        throw error;
    }
};

// Helper functions for HTTP methods
export const api = {
    get: <T = unknown>(endpoint: string, params?: Record<string, unknown>, options?: RequestOptions) => {
        let fullEndpoint = endpoint;

        if (params) {
            const searchParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    searchParams.append(key, value.toString());
                }
            });
            const queryString = searchParams.toString();
            if (queryString) {
                fullEndpoint += `?${queryString}`;
            }
        }

        return apiClient<T>(fullEndpoint, { ...options, method: 'GET' });
    },

    post: <T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions) =>
        apiClient<T>(endpoint, {
            ...options,
            method: 'POST',
            body: data instanceof FormData ? data : JSON.stringify(data),
        }),

    put: <T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions) =>
        apiClient<T>(endpoint, {
            ...options,
            method: 'PUT',
            body: data instanceof FormData ? data : JSON.stringify(data),
        }),

    delete: <T = unknown>(endpoint: string, options?: RequestOptions) =>
        apiClient<T>(endpoint, { ...options, method: 'DELETE' }),

    patch: <T = unknown>(endpoint: string, data?: unknown, options?: RequestOptions) =>
        apiClient<T>(endpoint, {
            ...options,
            method: 'PATCH',
            body: data instanceof FormData ? data : JSON.stringify(data),
        }),
};
