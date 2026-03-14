import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from '../audit/audit-log.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RevokedToken } from './revoked-token.entity';

@Module({
  imports: [
    UsersModule,
    TypeOrmModule.forFeature([RevokedToken, AuditLog]),
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev_jwt_secret',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}