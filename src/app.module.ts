import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
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

function loadEnvFile() {
  const envPath = resolve(process.cwd(), '.env');
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;
const sslEnabled = process.env.DB_SSL === 'true';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      ...(databaseUrl
        ? { url: databaseUrl }
        : {
            host: process.env.DB_HOST ?? 'localhost',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASSWORD ?? 'postgres',
            database: process.env.DB_NAME ?? 'rbac_db',
          }),
      ssl: sslEnabled ? { rejectUnauthorized: false } : false,
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
