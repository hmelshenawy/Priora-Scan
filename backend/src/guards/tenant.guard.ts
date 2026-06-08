import '../types/auth.types';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user?.organizationId) {
      throw new ForbiddenException({
        code: 'TENANT_MISMATCH',
        message: 'You do not have access to this organization\'s data.',
      });
    }

    request.organizationId = user.organizationId;
    return true;
  }
}
