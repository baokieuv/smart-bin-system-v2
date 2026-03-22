// Service layer for authentication API endpoints.

import { ChangePasswordRequest, ConfirmResetPassword, LoginGoogleRequest, LoginRequest } from "@/types/auth";
import { api } from "@/lib/api-client";

export const authApi = {
    // Login does not require auth; skip refresh-token mechanism
    loginPassword: async (request: LoginRequest) => {
        return api.post('/auth/login-password', 
            { username: request.email, password: request.password },
            { skipAuthRefresh: true }
        );
    },

    // Google login does not require auth; skip refresh-token mechanism
    loginGoogle: async (request: LoginGoogleRequest) => {
        return api.post('/auth/login-google',
            { token: request.token },
            { skipAuthRefresh: true }
        );
    },

    // Complete profile requires auth and uses auto-refresh
    completeProfile: async (password: string) => {
        return api.post('/auth/complete-profile', { password });
    },

    // Refresh token does not require auth; skip refresh-token mechanism
    refresh: async (refresh_token: string) => {
        return api.post('/auth/refresh',
            { refreshToken: refresh_token },
            { skipAuthRefresh: true }
        );
    },

    // Logout skips auth refresh because session is ending
    logout: async (refresh_token: string) => {
        return api.post('/auth/logout',
            { refreshToken: refresh_token },
            { skipAuthRefresh: true }
        );
    },

    // Change password requires auth and uses auto-refresh
    changePassword: async (request: ChangePasswordRequest) => {
        return api.post('/auth/change-password', {
            currentPassword: request.currentPassword,
            newPassword: request.newPassword,
            confirmPassword: request.confirmPassword
        });
    },

    // Reset password does not require auth; skip refresh-token mechanism
    resetPassword: async (email: string) => {
        return api.post('/auth/reset-password',
            { email },
            { skipAuthRefresh: true }
        );
    },

    // Confirm reset password does not require auth; skip refresh-token mechanism
    confirmResetPassword: async(request: ConfirmResetPassword) => {
        return api.post('/auth/confirm-reset',
            { token: request.token, newPassword: request.newPassword },
            { skipAuthRefresh: true }
        );
    },

    // Verify email does not require auth; skip refresh-token mechanism
    verifyEmail: async (token: string) => {
        return api.get<string>(`/auth/verify-email?token=${token}`,
            { skipAuthRefresh: true }
        );
    },

    // Resend verification does not require auth; skip refresh-token mechanism
    resendVerification: async (email: string) => {
        return api.post('/auth/resend-verification',
            { email },
            { skipAuthRefresh: true }
        );
    }
}