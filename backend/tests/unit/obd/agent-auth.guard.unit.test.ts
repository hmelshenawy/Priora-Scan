import { UnauthorizedException } from '@nestjs/common';
import { AgentAuthGuard } from '../../../src/guards/agent-auth.guard';
import { PrismaService } from '../../../src/prisma/prisma.service';

function createMockExecutionContext(
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
): any {
  const request: any = { headers, params };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  };
}

describe('AgentAuthGuard', () => {
  let guard: AgentAuthGuard;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      desktopAgent: {
        findFirst: jest.fn(),
      } as any,
    } as any;
    guard = new AgentAuthGuard(prisma);
  });

  it('should reject when X-Agent-Token header is missing', async () => {
    const context = createMockExecutionContext({}, { id: 'agent-1' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err.response.code).toBe('AGENT_TOKEN_MISSING');
    }
  });

  it('should reject when agent id is missing from route', async () => {
    const context = createMockExecutionContext(
      { 'x-agent-token': 'tok' },
      {},
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err.response.code).toBe('AGENT_ID_MISSING');
    }
  });

  it('should reject when token does not match any agent', async () => {
    (prisma.desktopAgent.findFirst as jest.Mock).mockResolvedValue(null);

    const context = createMockExecutionContext(
      { 'x-agent-token': 'bad-token' },
      { id: 'agent-1' },
    );

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err.response.code).toBe('AGENT_TOKEN_INVALID');
    }
  });

  it('should allow request with valid token and attach agent to request', async () => {
    const agent = {
      id: 'agent-1',
      organizationId: 'org-1',
      accessTokenHash: 'abcd',
    };
    (prisma.desktopAgent.findFirst as jest.Mock).mockImplementation(
      async (args: any) => {
        const expectedHash = require('crypto')
          .createHash('sha256')
          .update('valid-token')
          .digest('hex');
        if (args.where.accessTokenHash === expectedHash) {
          return agent;
        }
        return null;
      },
    );

    const request: any = {
      headers: { 'x-agent-token': 'valid-token' },
      params: { id: 'agent-1' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    };

    const result = await guard.canActivate(context as any);
    expect(result).toBe(true);
    expect(request.agent).toEqual(agent);
    expect(request.organizationId).toBe('org-1');
  });
});
