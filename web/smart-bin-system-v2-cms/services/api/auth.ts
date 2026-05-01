import { api } from "@/lib/api-client";
import type { LoginRequest, TokenResponse } from "@/types/auth";

export const authApi = {
  loginPassword: async (request: LoginRequest) => {
    return api.post<TokenResponse>(
      "/auth/login-password",
      { username: request.email, password: request.password, captcha: "cms-login" },
      { skipAuthRefresh: true },
    );
  },

  me: async () => {
    return api.get<{ id: string; email: string; firstName?: string; lastName?: string; role?: string }>("/users/me");
  },
};
