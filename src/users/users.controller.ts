/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthUser, UserRole } from '../auth/auth.types';
import { UsersService } from './users.service';

type CreateUserRequest = {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
};

type UpdateUserRequest = {
  name?: string;
  email?: string;
  role?: UserRole;
};

type UpdatePermissionsRequest = {
  permissions: string[];
};

type UserResponse = Awaited<ReturnType<UsersService['getUserById']>>;

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private async resolveActor(authorization?: string): Promise<AuthUser> {
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

      return actor;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private ensurePermission(actor: AuthUser, permission: string) {
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException(`Missing required permission: ${permission}`);
    }
  }

  @Get()
  async listUsers(
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse[]> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.view');
    return this.usersService.listUsers();
  }

  @Get(':userId')
  async getUserById(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.view');
    return this.usersService.getUserById(userId);
  }

  @Post()
  @HttpCode(201)
  async createUser(
    @Body() payload: CreateUserRequest,
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.create');
    return this.usersService.createByAdmin(payload, actor.id);
  }

  @Patch(':userId')
  async updateUser(
    @Param('userId') userId: string,
    @Body() payload: UpdateUserRequest,
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.create');
    return this.usersService.updateByAdmin(userId, payload, actor.id);
  }

  @Patch(':userId/suspend')
  async suspendUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.create');
    return this.usersService.setStatus(userId, 'suspended', actor.id);
  }

  @Patch(':userId/ban')
  async banUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.create');
    return this.usersService.setStatus(userId, 'banned', actor.id);
  }

  @Patch(':userId/activate')
  async activateUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ): Promise<UserResponse> {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.create');
    return this.usersService.setStatus(userId, 'active', actor.id);
  }

  @Get(':userId/permissions')
  async getPermissionsByUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.view');

    return this.usersService.getUserPermissionsForEditor(userId, actor.permissions);
  }

  @Put(':userId/permissions')
  async updatePermissionsByUser(
    @Param('userId') userId: string,
    @Body() payload: UpdatePermissionsRequest,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.resolveActor(authorization);
    this.ensurePermission(actor, 'users.create');

    return this.usersService.updateUserPermissionsByAdmin(
      userId,
      payload.permissions ?? [],
      actor.permissions,
      actor.id,
    );
  }
}
