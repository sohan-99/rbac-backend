/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
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

type UserResponse = Awaited<ReturnType<UsersService['getUserById']>>;

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}
