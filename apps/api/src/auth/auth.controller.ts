import {
  Body,
  Controller,
  Post,
  Res,
  Get,
  Req,
  UseGuards,
  Patch,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { AuditService } from '../audit/audit.service';

import { JwtAuthGuard } from './auth.guard';
import {
  CSRF_COOKIE_NAME,
  createCsrfToken,
  CsrfGuard,
  setCsrfCookie,
} from '../common/csrf';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('register')
  async register(
    @Req() req: Request,
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, userId } = await this.auth.register(dto.email, dto.password);
    this.setAuthCookie(res, token);
    setCsrfCookie(res, createCsrfToken());

    await this.audit.log({
      userId,
      action: 'auth.register',
      module: 'auth',
      resourceType: 'user',
      resourceId: userId,
      details: { email: dto.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true };
  }

  @Post('login')
  async login(
    @Req() req: Request,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, userId } = await this.auth.login(dto.email, dto.password);
    this.setAuthCookie(res, token);
    setCsrfCookie(res, createCsrfToken());

    await this.audit.log({
      userId,
      action: 'auth.login',
      module: 'auth',
      resourceType: 'user',
      resourceId: userId,
      details: { email: dto.email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true };
  }

  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.requestPasswordReset(dto.email);
    // Token is intentionally not returned in the response.
    // In production, deliver it via email. For local dev, check server logs.
    return { ok: true };
  }

  @Post('reset-password')
  async resetPassword(@Req() req: Request, @Body() dto: ResetPasswordDto) {
    const { userId } = await this.auth.resetPassword(
      dto.token,
      dto.newPassword,
    );

    await this.audit.log({
      userId,
      action: 'auth.password_reset',
      module: 'auth',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('logout')
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.audit.log({
      userId: req.user?.userId,
      action: 'auth.logout',
      module: 'auth',
      resourceType: 'user',
      resourceId: req.user?.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.clearCookie(process.env.COOKIE_NAME ?? 'todo_auth');
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.changePassword(
      req.user.userId,
      dto.currentPassword,
      dto.newPassword,
    );

    await this.audit.log({
      userId: req.user.userId,
      action: 'auth.password_change',
      module: 'auth',
      resourceType: 'user',
      resourceId: req.user.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Recommended: force re-login
    res.clearCookie(process.env.COOKIE_NAME ?? 'todo_auth', { path: '/' });
    res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });

    return result;
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Get('me')
  async me(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      setCsrfCookie(res, createCsrfToken());
    }
    // Fetch user theme preference from database
    const userWithTheme = await this.auth.getUserWithTheme(req.user.userId);
    return { ...req.user, themePreference: userWithTheme?.themePreference || 'light' };
  }

  @UseGuards(JwtAuthGuard, CsrfGuard)
  @Patch('theme')
  async updateTheme(@Req() req: any, @Body() body: { theme: 'light' | 'dark' }) {
    await this.auth.updateThemePreference(req.user.userId, body.theme);
    return { ok: true, theme: body.theme };
  }

  private setAuthCookie(res: Response, token: string) {
    const name = process.env.COOKIE_NAME ?? 'todo_auth';
    const secure = (process.env.COOKIE_SECURE ?? 'false') === 'true';
    const sameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as
      | 'lax'
      | 'strict'
      | 'none';

    res.cookie(name, token, {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
    });
  }
}
