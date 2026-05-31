export type UserState = "ACTIVE" | "PENDING" | "SUSPENDED" | "DELETED";

export interface UserDto {
  id: string;
  keycloakId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  state: UserState;
}
