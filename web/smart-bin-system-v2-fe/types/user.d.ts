export type UserState = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'DELETED'; 

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string; 
  state: UserState;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

