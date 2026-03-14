import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditLog } from './audit/audit-log.entity';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { RevokedToken } from './auth/revoked-token.entity';
import { Permission } from './permissions/permission.entity';
import { RolePermission } from './roles/role-permission.entity';
import { Role } from './roles/role.entity';
import { User } from './users/user.entity';
import { UserPermission } from './users/user-permission.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'rbac_db',
      entities: [
        User,
        Role,
        Permission,
        RolePermission,
        UserPermission,
        AuditLog,
        RevokedToken,
      ],
      synchronize: true,
    }),
    UsersModule,
    AuthModule,
    AuditModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
