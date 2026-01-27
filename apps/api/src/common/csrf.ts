import { randomBytes, timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';

export const CSRF_COOKIE_NAME = process.env.CSRF_COOKIE_NAME ?? 'todo_csrf';
export const CSRF_HEADER_NAME = (
  process.env.CSRF_HEADER_NAME ?? 'x-csrf-token'
).toLowerCase();

type AuthedRequest = Request & { user?: unknown };

export function createCsrfToken(): string {
  return randomBytes(32).toString('hex');
}

export function setCsrfCookie(res: Response, token: string) {
  const secure = (process.env.COOKIE_SECURE ?? 'false') === 'true';
  const sameSite = (process.env.COOKIE_SAMESITE ?? 'lax') as
    | 'lax'
    | 'strict'
    | 'none';

  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false,
    secure,
    sameSite,
    path: '/',
  });
}

function isSafeMethod(method: string) {
  const upper = method.toUpperCase();
  return upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS';
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    if (isSafeMethod(req.method)) {
      return true;
    }

    if (!req.user) {
      // Only enforce CSRF for authenticated routes
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);

    if (cookieBuffer.length !== headerBuffer.length) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    if (!timingSafeEqual(cookieBuffer, headerBuffer)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
