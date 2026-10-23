import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import jwt from 'jsonwebtoken';
import type { Role } from '@demo/shared';
import { config } from '../config.js';

export interface TokenPayload {
  sub: string; // user id
  role: Role;
  customerId?: string;
}

export interface RequestUser {
  userId: string;
  role: Role;
  customerId: string | null;
}

@Injectable()
export class AuthTokens {
  sign(p: TokenPayload): string {
    return jwt.sign(p, config.jwtSecret, { algorithm: 'HS256', expiresIn: '7d' });
  }
  verify(token: string | undefined | null): RequestUser | null {
    if (!token) return null;
    try {
      const p = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as TokenPayload;
      return { userId: p.sub, role: p.role, customerId: p.customerId ?? null };
    } catch {
      return null;
    }
  }
}

const ROLES_KEY = 'roles';
const OPTIONAL_KEY = 'optionalAuth';
const PUBLIC_KEY = 'public';

/** Restrict a route/controller to these roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** No auth at all. */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Attach the user if a valid token is present, but allow anonymous calls. */
export const OptionalAuth = () => SetMetadata(OPTIONAL_KEY, true);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AuthTokens,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: RequestUser | null }>();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = this.tokens.verify(token);
    req.user = user;
    if (this.reflector.getAllAndOverride<boolean>(OPTIONAL_KEY, targets)) return true;
    if (!user) throw new UnauthorizedException('Sign in required');
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && roles.length && !roles.includes(user.role)) throw new ForbiddenException('Not allowed for this role');
    if (user.role === 'CUSTOMER' && !user.customerId) throw new ForbiddenException('No customer on this account');
    return true;
  }
}

/** The signed-in user (or null on OptionalAuth routes). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser | null => {
  const req = ctx.switchToHttp().getRequest<{ user?: RequestUser | null }>();
  return req.user ?? null;
});

/** The signed-in customer's id (route must be @Roles('CUSTOMER')). */
export const CustomerId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<{ user?: RequestUser | null }>();
  const id = req.user?.customerId;
  if (!id) throw new UnauthorizedException('Customer sign-in required');
  return id;
});
