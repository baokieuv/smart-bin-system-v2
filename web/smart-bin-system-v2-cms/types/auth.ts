export interface LoginRequest {
  email: string;
  password: string;
  captcha: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}
