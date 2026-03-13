import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RefreshResponse,
  SignupRequest,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(
    payload: SignupRequest,
  ): Promise<{ response: AuthResponse; refreshToken: string }> {
    const user = await this.usersService.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
    });

    const authUser: AuthUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
    };

    const { accessToken, refreshToken } = await this.issueTokens(authUser);

    return {
      response: {
        success: true,
        message: 'Signup successful',
        data: {
          accessToken,
          user: authUser,
        },
      },
      refreshToken,
    };
  }

  async login(
    payload: LoginRequest,
  ): Promise<{ response: AuthResponse; refreshToken: string }> {
    const dbUser = await this.usersService.findByEmail(payload.email);

    if (!dbUser) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.usersService.validatePassword(
      payload.password,
      dbUser.password,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user: AuthUser = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      permissions: dbUser.permissions,
    };

    const { accessToken, refreshToken } = await this.issueTokens(user);

    return {
      response: {
        success: true,
        message: 'Login successful',
        data: {
          accessToken,
          user,
        },
      },
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<{
    response: RefreshResponse;
    refreshToken: string;
  }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const decoded = await this.verifyRefreshToken(refreshToken);
    const dbUser = await this.usersService.findById(decoded.sub);

    if (!dbUser) {
      throw new UnauthorizedException('User not found');
    }

    const authUser: AuthUser = {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role,
      permissions: dbUser.permissions,
    };

    const tokens = await this.issueTokens(authUser);

    return {
      response: {
        success: true,
        message: 'Token refreshed',
        data: {
          accessToken: tokens.accessToken,
        },
      },
      refreshToken: tokens.refreshToken,
    };
  }

  logout() {
    return {
      success: true,
      message: 'Logout successful',
    };
  }

  async me(accessToken: string) {
    if (!accessToken) {
      throw new UnauthorizedException('Access token is required');
    }

    const userId = await this.resolveUserIdFromToken(accessToken);
    const dbUser = await this.usersService.findById(userId);

    if (!dbUser) {
      throw new UnauthorizedException('User not found');
    }

    return {
      success: true,
      data: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        role: dbUser.role,
        permissions: dbUser.permissions,
      } as AuthUser,
    };
  }

  private async issueTokens(user: AuthUser) {
    const payload = {
      sub: user.id,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '15m',
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<{ sub: string }> {
    try {
      const decoded = await this.jwtService.verifyAsync<{ sub?: string }>(
        token,
      );

      if (!decoded.sub) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return { sub: decoded.sub };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async resolveUserIdFromToken(token: string): Promise<string> {
    if (!token) {
      throw new UnauthorizedException('Invalid access token');
    }

    try {
      const decoded = await this.jwtService.verifyAsync<{ sub?: string }>(
        token,
      );

      if (!decoded.sub) {
        throw new UnauthorizedException('Invalid access token');
      }

      return decoded.sub;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
