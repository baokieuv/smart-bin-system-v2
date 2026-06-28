export type UserState = "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED";

export interface UserDto {
  id: string;
  keycloakId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  state: UserState;
  userRole: string; 
  devicePermissions: string[];
}

export interface UpdateUserByTenantRequest {
  name?: string;
  avatarUrl?: string;
  state?: UserDto["state"];
  devicePermissions?: string[];
}
