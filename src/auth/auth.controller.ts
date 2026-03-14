import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { LoginRequest, SignupRequest } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getClientIp(request: Request) {
    const forwardedFor = request.headers['x-forwarded-for'];

    if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
      return forwardedFor.split(',')[0]?.trim() ?? request.ip;
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
      return forwardedFor[0] ?? request.ip;
    }

    return request.ip;
  }

  private setRefreshCookie(response: Response, refreshToken: string) {
    response.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('signup')
  @HttpCode(201)
  async signup(
    @Body() payload: SignupRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.signup(payload, this.getClientIp(request));
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() payload: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(payload, this.getClientIp(request));
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refreshToken ?? '';
    const result = await this.authService.refresh(refreshToken);
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post('logout')
  @HttpCode(200)
  logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('authorization') authorization = '',
  ) {
    const accessToken = authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
    const refreshToken = request.cookies?.refreshToken ?? '';

    response.clearCookie('refreshToken', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    return this.authService.logout(
      refreshToken,
      accessToken,
      this.getClientIp(request),
    );
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string) {
    const token = authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
    return this.authService.me(token);
  }
}