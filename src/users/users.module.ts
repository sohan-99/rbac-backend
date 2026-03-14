import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from '../permissions/permission.entity';
import { RolePermission } from '../roles/role-permission.entity';
import { Role } from '../roles/role.entity';
import { UsersController } from './users.controller';
import { User } from './user.entity';
import { UserPermission } from './user-permission.entity';
import { UsersService } from './users.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_jwt_secret',
    }),
    TypeOrmModule.forFeature([User, Role, Permission, RolePermission, UserPermission]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
