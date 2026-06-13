export interface LoginRequest {
  email: string;
  password: string;
  captcha: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  name: string;
  captcha: string;
}

export interface AdminSessionUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

export interface UpdateProfileRequest {
  name: string;
  avatarUrl?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface LoginGoogleRequest {
  token: string;
}

export interface ConfirmResetPassword {
    token: string;
    newPassword: string;
}

export interface ResendVerificationRequest {
    email: string;
    captcha: string;
}