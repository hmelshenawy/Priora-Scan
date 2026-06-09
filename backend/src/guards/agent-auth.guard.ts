import '../types/auth.types';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers['x-agent-token'] as string | undefined;
    const agentId = request.params.id;

    if (!token) {
      throw new UnauthorizedException({
        code: 'AGENT_TOKEN_MISSING',
        message: 'Agent token is missing. Provide X-Agent-Token header.',
      });
    }

    if (!agentId) {
      throw new UnauthorizedException({
        code: 'AGENT_ID_MISSING',
        message: 'Agent ID is required in the route.',
      });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const agent = await this.prisma.desktopAgent.findFirst({
      where: {
        id: agentId,
        accessTokenHash: tokenHash,
      },
    });

    if (!agent) {
      throw new UnauthorizedException({
        code: 'AGENT_TOKEN_INVALID',
        message: 'Agent token is invalid or agent does not exist.',
      });
    }

    request.agent = agent;
    request.organizationId = agent.organizationId;
    return true;
  }
}
