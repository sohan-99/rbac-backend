import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { AuthResponse, AuthUser, LoginRequest } from './auth.types';
import { seedUsers } from './mock-users';

@Injectable()
export class AuthService {
  login(payload: LoginRequest): AuthResponse {
    const matchedUser = seedUsers.find(
      (user) =>
        user.email.toLowerCase() === payload.email.toLowerCase() &&
        user.password === payload.password,
    );

    if (!matchedUser) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user: AuthUser = {
      id: matchedUser.id,
      name: matchedUser.name,
      email: matchedUser.email,
      role: matchedUser.role,
      permissions: matchedUser.permissions,
    };

    return {
      success: true,
      message: 'Login successful',
      data: {
        accessToken: this.generateToken('access', user),
        refreshToken: this.generateToken('refresh', user),
        user,
      },
    };
  }

  refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return {
      success: true,
      message: 'Token refreshed',
      data: {
        accessToken: `acc_${Date.now()}`,
      },
    };
  }

  logout() {
    return {
      success: true,
      message: 'Logout successful',
    };
  }

  me(accessToken: string) {
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    const user = this.resolveUserFromToken(accessToken);

    return {
      success: true,
      data: user,
    };
  }

  private generateToken(kind: 'access' | 'refresh', user: AuthUser) {
    const payload = Buffer.from(
      JSON.stringify({ userId: user.id, role: user.role, ts: Date.now() }),
    ).toString('base64url');

    return `${kind}.${payload}`;
  }

  private resolveUserFromToken(token: string): AuthUser {
    const payload = token.split('.')[1];

    if (!payload) {
      throw new UnauthorizedException('Invalid access token');
    }

    let userId: string | undefined;
    try {
      const decoded = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { userId?: string };
      userId = decoded.userId;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    const matchedUser = seedUsers.find((seedUser) => seedUser.id === userId);

    if (!matchedUser) {
      throw new UnauthorizedException('Invalid access token');
    }

    return {
      id: matchedUser.id,
      name: matchedUser.name,
      email: matchedUser.email,
      role: matchedUser.role,
      permissions: matchedUser.permissions,
    };
  }
}