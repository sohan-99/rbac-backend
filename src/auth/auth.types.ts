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

export type SignupRequest = {
  name: string;
  email: string;
  password: string;
};

export type AuthResponse = {
  success: boolean;
  message?: string;
  data: {
    accessToken: string;
    user: AuthUser;
  };
};

export type RefreshResponse = {
  success: boolean;
  message?: string;
  data: {
    accessToken: string;
  };
};