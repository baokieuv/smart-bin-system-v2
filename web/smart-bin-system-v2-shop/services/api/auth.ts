import { api } from '@/lib/api-client';
import type { LoginGoogleRequest, LoginRequest, TokenResponse } from '@/types/auth';

export const authApi = {
  loginPassword: async (request: LoginRequest) => {
    return api.post<TokenResponse>('/auth/login-password',
      { username: request.email, password: request.password, captcha: request.captcha },
      { skipAuthRefresh: true },
    );
  },

  loginGoogle: async (request: LoginGoogleRequest) => {
    return api.post<TokenResponse>('/auth/login-google',
      { token: request.token },
      { skipAuthRefresh: true },
    );
  },

  refresh: async (refreshToken: string) => {
    return api.post('/auth/refresh',
      { refreshToken },
      { skipAuthRefresh: true },
    );
  },

  logout: async (refreshToken: string) => {
    return api.post('/auth/logout',
      { refreshToken },
      { skipAuthRefresh: true },
    );
  },
};
