const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9999/api/v1';

interface RequestOptions extends RequestInit {
    skipAuthRefresh?: boolean; // Flag để tránh vòng lặp vô hạn khi refresh token
}

let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value?: unknown) => void;
    reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });

    failedQueue = [];
};

export const apiClient = async (endpoint: string, options: RequestOptions = {}): Promise<any> => {
    const { skipAuthRefresh = false, ...fetchOptions } = options;

    // Thêm Authorization header nếu có access_token (trừ các endpoint không cần auth)
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(fetchOptions.headers as Record<string, string>),
    };

    // Chỉ thêm Authorization header nếu có token và không phải là FormData
    if (token && !skipAuthRefresh) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Xóa Content-Type nếu body là FormData
    if (fetchOptions.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    const config: RequestInit = {
        ...fetchOptions,
        headers,
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // Nếu không phải 401 hoặc đã skip auth refresh, xử lý response bình thường
        if (response.status !== 401 || skipAuthRefresh) {
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Có lỗi xảy ra, vui lòng thử lại sau.');
            }

            return data;
        }

        // Xử lý 401 - Token hết hạn, thử refresh
        const originalRequest = { endpoint, options: fetchOptions };

        if (isRefreshing) {
            // Nếu đang refresh, đợi kết quả
            return new Promise((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            })
                .then((token) => {
                    // Retry request với token mới
                    return apiClient(endpoint, fetchOptions);
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

            // Gọi API refresh token
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

                // Lưu token mới
                if (typeof window !== 'undefined') {
                    localStorage.setItem('access_token', access_token);
                    if (refresh_token) {
                        localStorage.setItem('refresh_token', refresh_token);
                    }
                }

                // Xử lý queue
                processQueue(null, access_token);

                // Retry request ban đầu với token mới
                return apiClient(originalRequest.endpoint, originalRequest.options);
            } else {
                throw new Error('Refresh token không hợp lệ');
            }
        } catch (refreshError) {
            processQueue(refreshError as Error, null);

            // Clear tokens và redirect đến login
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

// Helper functions cho các HTTP methods
export const api = {
    get: (endpoint: string, options?: RequestOptions) =>
        apiClient(endpoint, { ...options, method: 'GET' }),

    post: (endpoint: string, data?: any, options?: RequestOptions) =>
        apiClient(endpoint, {
            ...options,
            method: 'POST',
            body: data instanceof FormData ? data : JSON.stringify(data),
        }),

    put: (endpoint: string, data?: any, options?: RequestOptions) =>
        apiClient(endpoint, {
            ...options,
            method: 'PUT',
            body: data instanceof FormData ? data : JSON.stringify(data),
        }),

    delete: (endpoint: string, options?: RequestOptions) =>
        apiClient(endpoint, { ...options, method: 'DELETE' }),

    patch: (endpoint: string, data?: any, options?: RequestOptions) =>
        apiClient(endpoint, {
            ...options,
            method: 'PATCH',
            body: data instanceof FormData ? data : JSON.stringify(data),
        }),
};
