import { api } from "@/lib/api-client";
import type { AdminSessionUser, ChangePasswordRequest, LoginRequest, TokenResponse, UpdateProfileRequest } from "@/types/auth";

export const authApi = {
  loginPassword: async (request: LoginRequest) => {
    return api.post<TokenResponse>(
      "/auth/login-password",
      { username: request.email, password: request.password, captcha: request.captcha },
      { skipAuthRefresh: true, suppressPermissionToast: true },
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
};
