import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { AuditService } from './audit.service';

@Controller('audit-log')
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  private async ensureCanViewAudit(authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      throw new UnauthorizedException('Access token is required');
    }

    try {
      const decoded = await this.jwtService.verifyAsync<{ sub?: string }>(token);
      if (!decoded.sub) {
        throw new UnauthorizedException('Invalid access token');
      }

      const actor = await this.usersService.getAuthUserById(decoded.sub);
      if (!actor) {
        throw new UnauthorizedException('User not found');
      }

      if (!actor.permissions.includes('audit.view')) {
        throw new ForbiddenException('Missing required permission: audit.view');
      }
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Invalid access token');
    }
  }

  @Get()
  async listAuditLogs(
    @Query('limit') limit?: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.ensureCanViewAudit(authorization);

    const parsedLimit = Number(limit ?? 100);
    const safeLimit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(500, parsedLimit))
      : 100;

    return this.auditService.listRecent(safeLimit);
  }
}
