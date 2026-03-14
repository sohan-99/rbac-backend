import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../permissions/permission.entity';
import { RolePermission } from '../roles/role-permission.entity';
import { Role } from '../roles/role.entity';
import { User } from './user.entity';
import { UserPermission } from './user-permission.entity';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Permission, RolePermission, UserPermission]),
  ],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
