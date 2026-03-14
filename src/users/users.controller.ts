/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
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
import type { UserRole } from '../auth/auth.types';
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

  private async resolveActorPermissions(authorization?: string): Promise<string[]> {
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

      return actor.permissions;
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  @Get()
  listUsers(): Promise<UserResponse[]> {
    return this.usersService.listUsers();
  }

  @Get(':userId')
  getUserById(@Param('userId') userId: string): Promise<UserResponse> {
    return this.usersService.getUserById(userId);
  }

  @Post()
  @HttpCode(201)
  createUser(@Body() payload: CreateUserRequest): Promise<UserResponse> {
    return this.usersService.createByAdmin(payload);
  }

  @Patch(':userId')
  updateUser(
    @Param('userId') userId: string,
    @Body() payload: UpdateUserRequest,
  ): Promise<UserResponse> {
    return this.usersService.updateByAdmin(userId, payload);
  }

  @Patch(':userId/suspend')
  suspendUser(@Param('userId') userId: string): Promise<UserResponse> {
    return this.usersService.setStatus(userId, 'suspended');
  }

  @Patch(':userId/ban')
  banUser(@Param('userId') userId: string): Promise<UserResponse> {
    return this.usersService.setStatus(userId, 'banned');
  }

  @Patch(':userId/activate')
  activateUser(@Param('userId') userId: string): Promise<UserResponse> {
    return this.usersService.setStatus(userId, 'active');
  }

  @Get(':userId/permissions')
  async getPermissionsByUser(
    @Param('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const actorPermissions = await this.resolveActorPermissions(authorization);

    return this.usersService.getUserPermissionsForEditor(userId, actorPermissions);
  }

  @Put(':userId/permissions')
  async updatePermissionsByUser(
    @Param('userId') userId: string,
    @Body() payload: UpdatePermissionsRequest,
    @Headers('authorization') authorization?: string,
  ) {
    const actorPermissions = await this.resolveActorPermissions(authorization);

    return this.usersService.updateUserPermissionsByAdmin(
      userId,
      payload.permissions ?? [],
      actorPermissions,
    );
  }
}
