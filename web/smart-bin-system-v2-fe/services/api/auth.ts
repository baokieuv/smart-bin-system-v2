import { ChangePasswordRequest, ConfirmResetPassword, LoginGoogleRequest, LoginRequest } from "@/types/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9999/api/v1';

export const authApi = {
    loginPassword: async (request: LoginRequest) => {
        const response = await fetch(`${API_BASE_URL}/auth/login-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: request.email, password: request.password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    loginGoogle: async (request: LoginGoogleRequest) => {
        const response = await fetch(`${API_BASE_URL}/auth/login-google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: request.token }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    completeProfile: async (password: string, access_token: string) => {

        const response = await fetch(`${API_BASE_URL}/auth/complete-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            },
            body: JSON.stringify({ password }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    refresh: async (refresh_token: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken: refresh_token }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    logout: async (refresh_token: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refreshToken: refresh_token }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    changePassword: async (request: ChangePasswordRequest, access_token: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${access_token}`
            },
            body: JSON.stringify({ currentPassword: request.currentPassword, newPassword: request.newPassword, confirmPassword: request.confirmPassword }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    resetPassword: async (email: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    confirmResetPassword: async(request: ConfirmResetPassword) => {
        const response = await fetch(`${API_BASE_URL}/auth/confirm-reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ token: request.token, newPassword: request.newPassword }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    verifyEmail: async (token: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/verify-email?token=${token}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    },

    resendVerification: async (email: string) => {
        const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error('Có lỗi xảy ra, vui lòng thử lại sau.');
        }

        return data;
    }
}