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
    const createdUser = await this.usersService.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
    });

    const authUser = await this.usersService.getAuthUserById(createdUser.id);

    if (!authUser) {
      throw new UnauthorizedException('User not found');
    }

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
    const principal = await this.usersService.getAuthPrincipalByEmail(payload.email);

    if (!principal) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (principal.status !== 'active') {
      throw new UnauthorizedException('User account is not active');
    }

    const passwordValid = await this.usersService.validatePassword(
      payload.password,
      principal.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = principal.authUser;

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
    const authUser = await this.usersService.getAuthUserById(decoded.sub);

    if (!authUser) {
      throw new UnauthorizedException('User not found');
    }

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
    const authUser = await this.usersService.getAuthUserById(userId);

    if (!authUser) {
      throw new UnauthorizedException('User not found');
    }

    return {
      success: true,
      data: authUser,
    };
  }

  private async issueTokens(user: AuthUser) {
    const payload = {
      sub: user.id,
      role: user.role,
      permissions: user.permissions,
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
