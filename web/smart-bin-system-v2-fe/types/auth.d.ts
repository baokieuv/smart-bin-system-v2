export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginGoogleRequest {
  token: string;
}

export interface RefreshTokenRequest {
  refreshToken: string; // Lưu ý: Ở backend Java bạn để biến là refreshToken (camelCase)
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ResendVerificationRequest {
  email: string;
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
