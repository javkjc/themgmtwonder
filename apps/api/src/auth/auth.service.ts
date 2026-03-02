import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  private readonly maxFailedAttempts = 5;
  private readonly lockoutMinutes = 15;
  private readonly resetTokenTtlMinutes = 30;

  async register(email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await argon2.hash(password);
    const user = await this.users.create(email, passwordHash);

    return this.sign(user.id, user.email);
  }

  async requestPasswordReset(email: string) {
    const user = await this.users.findByEmail(email);
    const expiresAt = new Date(
      Date.now() + this.resetTokenTtlMinutes * 60 * 1000,
    );

    if (!user) {
      // Uniform response to avoid account enumeration
      return { resetToken: null, expiresAt };
    }

    await this.users.invalidateResetTokens(user.id);

    const token = randomBytes(32).toString('hex');
    await this.users.createPasswordResetToken(user.id, token, expiresAt);

    // In production, send this token via email. Never expose it in API responses.
    // For local development, the token is logged here only when NODE_ENV=development.
    if (process.env.NODE_ENV === 'development') {
      this.logger.warn(`[DEV ONLY] Password reset token for ${email}: ${token}`);
    }

    return { resetToken: token, expiresAt };
  }

  async resetPassword(token: string, newPassword: string) {
    const result = await this.users.findValidResetToken(token);
    if (!result) {
      throw new BadRequestException('Reset link is invalid or expired.');
    }

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.users.updatePasswordHash(result.user.id, passwordHash);
    await this.users.resetLoginFailures(result.user.id);
    await this.users.markResetTokenUsed(result.token.id);

    return { userId: result.user.id };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const now = new Date();
    if (user.lockUntil && user.lockUntil.getTime() > now.getTime()) {
      const minutesLeft = Math.ceil(
        (user.lockUntil.getTime() - now.getTime()) / 60000,
      );
      throw new UnauthorizedException(
        `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
      );
    }

    const hash = user.passwordHash;
    if (!hash || !hash.startsWith('$')) {
      throw new UnauthorizedException('Invalid credentials');
    }

    let ok = false;
    try {
      ok = await argon2.verify(hash, password);
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!ok) {
      const attempts = (user.failedLoginAttempts ?? 0) + 1;
      const shouldLock = attempts >= this.maxFailedAttempts;
      const lockUntil = shouldLock
        ? new Date(now.getTime() + this.lockoutMinutes * 60 * 1000)
        : null;

      await this.users.recordLoginFailure(
        user.id,
        shouldLock ? 0 : attempts,
        lockUntil,
      );

      if (shouldLock) {
        throw new UnauthorizedException(
          `Account temporarily locked. Try again in ${this.lockoutMinutes} minute(s).`,
        );
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    await this.users.resetLoginFailures(user.id);

    return this.sign(user.id, user.email);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (currentPassword === newPassword) {
      throw new BadRequestException('New password must be different.');
    }

    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedException();

    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) throw new UnauthorizedException('Current password is incorrect.');

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.users.updatePasswordHash(userId, passwordHash);

    return { ok: true };
  }

  async getUserWithTheme(userId: string) {
    return await this.users.findById(userId);
  }

  async updateThemePreference(userId: string, theme: 'light' | 'dark') {
    await this.users.updateThemePreference(userId, theme);
  }

  sign(userId: string, email: string) {
    const payload = { sub: userId, email };
    const token = this.jwt.sign(payload);
    return { token, userId };
  }
}
