import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service';

function cookieExtractor(req: any) {
  const cookieName = process.env.COOKIE_NAME ?? 'todo_auth';
  return req?.cookies?.[cookieName] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.users.findById(payload.sub);
    if (!user) {
      return null;
    }
    return {
      userId: user.id,
      email: user.email,
      mustChangePassword: user.mustChangePassword,
      role: user.role,
      isAdmin: user.isAdmin,
    };
  }
}
