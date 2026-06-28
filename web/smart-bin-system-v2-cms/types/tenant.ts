export interface TenantDto {
  id: string;
  name: string;
  email: string;
  state: string;
  avatarUrl: string | null;
}

export interface CreateTenantRequest {
  name: string;
  email: string;
}

export interface UpdateTenantStatusRequest {
  status: string;
}