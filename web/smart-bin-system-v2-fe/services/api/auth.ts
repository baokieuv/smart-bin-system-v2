import { ChangePasswordRequest, ConfirmResetPassword, LoginGoogleRequest, LoginRequest } from "@/types/auth";
import { api } from "@/lib/api-client";

export const authApi = {
    // Login không cần auth, skip refresh token mechanism
    loginPassword: async (request: LoginRequest) => {
        return api.post('/auth/login-password', 
            { email: request.email, password: request.password },
            { skipAuthRefresh: true }
        );
    },

    // Login Google không cần auth, skip refresh token mechanism
    loginGoogle: async (request: LoginGoogleRequest) => {
        return api.post('/auth/login-google',
            { token: request.token },
            { skipAuthRefresh: true }
        );
    },

    // Complete profile cần auth, sử dụng auto refresh
    completeProfile: async (password: string) => {
        return api.post('/auth/complete-profile', { password });
    },

    // Refresh token không cần auth, skip refresh token mechanism
    refresh: async (refresh_token: string) => {
        return api.post('/auth/refresh',
            { refreshToken: refresh_token },
            { skipAuthRefresh: true }
        );
    },

    // Logout không cần auth refresh vì đang logout
    logout: async (refresh_token: string) => {
        return api.post('/auth/logout',
            { refreshToken: refresh_token },
            { skipAuthRefresh: true }
        );
    },

    // Change password cần auth, sử dụng auto refresh
    changePassword: async (request: ChangePasswordRequest) => {
        return api.post('/auth/change-password', {
            currentPassword: request.currentPassword,
            newPassword: request.newPassword,
            confirmPassword: request.confirmPassword
        });
    },

    // Reset password không cần auth, skip refresh token mechanism
    resetPassword: async (email: string) => {
        return api.post('/auth/reset-password',
            { email },
            { skipAuthRefresh: true }
        );
    },

    // Confirm reset password không cần auth, skip refresh token mechanism
    confirmResetPassword: async(request: ConfirmResetPassword) => {
        return api.post('/auth/confirm-reset',
            { token: request.token, newPassword: request.newPassword },
            { skipAuthRefresh: true }
        );
    },

    // Verify email không cần auth, skip refresh token mechanism
    verifyEmail: async (token: string) => {
        return api.get(`/auth/verify-email?token=${token}`,
            { skipAuthRefresh: true }
        );
    },

    // Resend verification không cần auth, skip refresh token mechanism
    resendVerification: async (email: string) => {
        return api.post('/auth/resend-verification',
            { email },
            { skipAuthRefresh: true }
        );
    }
}