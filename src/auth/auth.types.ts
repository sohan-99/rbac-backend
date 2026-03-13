export type UserRole = 'admin' | 'manager' | 'agent' | 'customer';

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: string[];
};

export type LoginRequest = {
  email: string;
  password: string;
};

export type AuthResponse = {
  success: boolean;
  message?: string;
  data: {
    accessToken: string;
    refreshToken: string;
    user: AuthUser;
  };
};