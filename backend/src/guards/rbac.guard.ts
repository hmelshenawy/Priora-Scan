import '../types/auth.types';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user?.permissions || !Array.isArray(user.permissions)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: this.buildForbiddenMessage(requiredPermissions),
      });
    }

    const hasPermission = requiredPermissions.every((permission) =>
      user.permissions.includes(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: this.buildForbiddenMessage(requiredPermissions),
      });
    }

    return true;
  }

  private buildForbiddenMessage(requiredPermissions: string[]): string {
    const resource = requiredPermissions.some((permission) =>
      permission.includes('diagnostic-session'),
    )
      ? 'diagnostic sessions'
      : requiredPermissions.some((permission) => permission.includes('vehicle'))
        ? 'vehicles'
        : 'this resource';

    return `You do not have permission to perform this action on ${resource}.`;
  }
}
