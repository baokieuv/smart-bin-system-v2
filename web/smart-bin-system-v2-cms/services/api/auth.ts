import { api } from "@/lib/api-client";
import type { AdminSessionUser, ChangePasswordRequest, 
  ConfirmResetPassword, ResendVerificationRequest } from "@/types/auth";
import type { LoginRequest, TokenResponse, UpdateProfileRequest, LoginGoogleRequest } from "@/types/auth";

export const authApi = {
  loginPassword: async (request: LoginRequest) => {
    return api.post<TokenResponse>(
      "/auth/login-password",
      { username: request.email, password: request.password, captcha: request.captcha },
      { skipAuthRefresh: true, suppressPermissionToast: true },
    );
  },

  // Google login does not require auth; skip refresh-token mechanism
  loginGoogle: async (request: LoginGoogleRequest) => {
      return api.post<TokenResponse>('/auth/login-google',
          { token: request.token },
          { skipAuthRefresh: true }
      );
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

  me: async () => {
    return api.get<AdminSessionUser>("/users/me");
  },

  updateMe: async (request: UpdateProfileRequest) => {
    return api.put<AdminSessionUser>("/users/me", request);
  },

  changePassword: async (request: ChangePasswordRequest) => {
    return api.post<{ success: boolean }>("/auth/change-password", request);
  },

  // Reset password does not require auth; skip refresh-token mechanism
  resetPassword: async (email: string, captcha: string) => {
      return api.post<string>('/auth/reset-password',
          { email, captcha },
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
  resendVerification: async (request: ResendVerificationRequest) => {
      return api.post('/auth/resend-verification',
          { email: request.email, captcha: request.captcha },
          { skipAuthRefresh: true }
      );
  }
};
