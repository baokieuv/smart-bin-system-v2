// TypeScript contracts for auth-related payloads and responses.

export interface LoginRequest {
  email: string;
  password: string;
  captcha: string;
}

export interface LoginGoogleRequest {
  token: string;
}

export interface RefreshTokenRequest {
  refreshToken: string; // Note: backend uses refreshToken (camelCase)
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ResendVerificationRequest {
  email: string;
  captcha: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ConfirmResetPassword {
    token: string;
    newPassword: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
}
