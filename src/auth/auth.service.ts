import {
  Injectable,
  TooManyRequestsException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { AuditLog } from '../audit/audit-log.entity';
import { UsersService } from '../users/users.service';
import type {
  AuthResponse,
  AuthUser,
  LoginRequest,
  RefreshResponse,
  SignupRequest,
} from './auth.types';
import { RevokedToken, type RevokedTokenType } from './revoked-token.entity';

type TokenClaims = {
  sub?: string;
  jti?: string;
  exp?: number;
  tokenType?: RevokedTokenType;
};

type LoginAttemptState = {
  count: number;
  windowStartedAt: number;
  blockedUntil: number;
};

@Injectable()
export class AuthService {
  private readonly loginAttempts = new Map<string, LoginAttemptState>();
  private readonly maxFailedAttempts = 5;
  private readonly attemptWindowMs = 15 * 60 * 1000;
  private readonly blockDurationMs = 15 * 60 * 1000;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepo: Repository<RevokedToken>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async signup(
    payload: SignupRequest,
    clientIp?: string,
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
    await this.writeAuditLog('auth.signup', authUser.id, clientIp, {
      email: authUser.email,
    });

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
    clientIp?: string,
  ): Promise<{ response: AuthResponse; refreshToken: string }> {
    const attemptKey = this.toAttemptKey(payload.email, clientIp);
    this.assertLoginAllowed(attemptKey);

    const principal = await this.usersService.getAuthPrincipalByEmail(payload.email);

    if (!principal) {
      this.recordLoginFailure(attemptKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (principal.status !== 'active') {
      this.recordLoginFailure(attemptKey);
      throw new UnauthorizedException('User account is not active');
    }

    const passwordValid = await this.usersService.validatePassword(
      payload.password,
      principal.passwordHash,
    );

    if (!passwordValid) {
      this.recordLoginFailure(attemptKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    this.clearLoginFailures(attemptKey);

    const user = principal.authUser;

    const { accessToken, refreshToken } = await this.issueTokens(user);
    await this.writeAuditLog('auth.login', user.id, clientIp, {
      email: user.email,
    });

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

    await this.revokeTokenByClaims(decoded, 'refresh');

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

  async logout(refreshToken?: string, accessToken?: string, clientIp?: string) {
    const accessClaims = await this.decodeToken(accessToken);
    const refreshClaims = await this.decodeToken(refreshToken);

    if (accessClaims) {
      await this.revokeTokenByClaims(accessClaims, 'access');
    }

    if (refreshClaims) {
      await this.revokeTokenByClaims(refreshClaims, 'refresh');
    }

    await this.writeAuditLog(
      'auth.logout',
      accessClaims?.sub ?? refreshClaims?.sub ?? null,
      clientIp,
      null,
    );

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
    await this.cleanupExpiredRevokedTokens();

    const accessTokenId = randomUUID();
    const refreshTokenId = randomUUID();

    const payload = {
      sub: user.id,
      role: user.role,
      permissions: user.permissions,
    };

    const accessToken = await this.jwtService.signAsync(
      {
        ...payload,
        jti: accessTokenId,
        tokenType: 'access' as const,
      },
      {
      expiresIn: '15m',
      },
    );
    const refreshToken = await this.jwtService.signAsync(
      {
        ...payload,
        jti: refreshTokenId,
        tokenType: 'refresh' as const,
      },
      {
      expiresIn: '7d',
      },
    );

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(
    token: string,
  ): Promise<{ sub: string; jti: string; exp: number; tokenType: RevokedTokenType }> {
    try {
      const decoded = await this.jwtService.verifyAsync<TokenClaims>(token);

      if (!decoded.sub || !decoded.jti || !decoded.exp || !decoded.tokenType) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (decoded.tokenType !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const isRevoked = await this.isTokenRevoked(decoded.jti);
      if (isRevoked) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }

      return {
        sub: decoded.sub,
        jti: decoded.jti,
        exp: decoded.exp,
        tokenType: decoded.tokenType,
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async resolveUserIdFromToken(token: string): Promise<string> {
    if (!token) {
      throw new UnauthorizedException('Invalid access token');
    }

    try {
      const decoded = await this.jwtService.verifyAsync<TokenClaims>(token);

      if (!decoded.sub || !decoded.jti || decoded.tokenType !== 'access') {
        throw new UnauthorizedException('Invalid access token');
      }

      const isRevoked = await this.isTokenRevoked(decoded.jti);
      if (isRevoked) {
        throw new UnauthorizedException('Access token has been revoked');
      }

      return decoded.sub;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private toAttemptKey(email: string, clientIp?: string) {
    const normalizedEmail = email.trim().toLowerCase();
    return `${clientIp ?? 'unknown'}:${normalizedEmail}`;
  }

  private assertLoginAllowed(key: string) {
    const current = this.loginAttempts.get(key);
    if (!current) {
      return;
    }

    const now = Date.now();

    if (current.blockedUntil > now) {
      throw new TooManyRequestsException(
        'Too many failed login attempts. Try again later.',
      );
    }

    if (now - current.windowStartedAt > this.attemptWindowMs) {
      this.loginAttempts.delete(key);
    }
  }

  private recordLoginFailure(key: string) {
    const now = Date.now();
    const current = this.loginAttempts.get(key);

    if (!current || now - current.windowStartedAt > this.attemptWindowMs) {
      this.loginAttempts.set(key, {
        count: 1,
        windowStartedAt: now,
        blockedUntil: 0,
      });
      return;
    }

    current.count += 1;

    if (current.count >= this.maxFailedAttempts) {
      current.blockedUntil = now + this.blockDurationMs;
      this.loginAttempts.set(key, current);
      throw new TooManyRequestsException(
        'Too many failed login attempts. Try again later.',
      );
    }

    this.loginAttempts.set(key, current);
  }

  private clearLoginFailures(key: string) {
    this.loginAttempts.delete(key);
  }

  private async isTokenRevoked(jti: string): Promise<boolean> {
    const entry = await this.revokedTokenRepo.findOne({ where: { tokenId: jti } });
    if (!entry) {
      return false;
    }

    if (entry.expiresAt.getTime() <= Date.now()) {
      await this.revokedTokenRepo.delete({ id: entry.id });
      return false;
    }

    return true;
  }

  private async decodeToken(token?: string): Promise<TokenClaims | null> {
    if (!token) {
      return null;
    }

    try {
      const decoded = await this.jwtService.verifyAsync<TokenClaims>(token);
      if (!decoded.jti || !decoded.exp || !decoded.tokenType) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  private async revokeTokenByClaims(
    claims: TokenClaims,
    expectedType: RevokedTokenType,
  ) {
    if (!claims.jti || !claims.exp || !claims.tokenType) {
      return;
    }

    if (claims.tokenType !== expectedType) {
      return;
    }

    const existing = await this.revokedTokenRepo.findOne({
      where: { tokenId: claims.jti },
    });

    if (existing) {
      return;
    }

    await this.revokedTokenRepo.save(
      this.revokedTokenRepo.create({
        tokenId: claims.jti,
        tokenType: claims.tokenType,
        userId: claims.sub ?? null,
        expiresAt: new Date(claims.exp * 1000),
      }),
    );
  }

  private async cleanupExpiredRevokedTokens() {
    await this.revokedTokenRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt <= :now', { now: new Date() })
      .execute();
  }

  private async writeAuditLog(
    action: string,
    userId: string | null,
    clientIp?: string,
    metadata?: Record<string, unknown> | null,
  ) {
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        userId,
        action,
        entityType: 'auth',
        entityId: userId,
        metadata: metadata ?? null,
        ipAddress: clientIp ?? null,
      }),
    );
  }
}
