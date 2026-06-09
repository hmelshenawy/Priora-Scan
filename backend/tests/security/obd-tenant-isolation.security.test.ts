import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from '../../src/guards/tenant.guard';
import { RbacGuard } from '../../src/guards/rbac.guard';
import { Reflector } from '@nestjs/core';
import { ScanJobRepository } from '../../src/obd/repositories/scan-job.repository';
import { DesktopAgentRepository } from '../../src/obd/repositories/desktop-agent.repository';
import { SessionFaultCodeRepository } from '../../src/obd/repositories/session-fault-code.repository';

describe('OBD Tenant Isolation', () => {
  describe('TenantGuard', () => {
    let guard: TenantGuard;

    beforeEach(() => {
      guard = new TenantGuard();
    });

    it('should block request without organizationId in JWT', () => {
      const request: any = { user: { sub: 'user-1', permissions: [] } };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      };

      expect(() => guard.canActivate(context as any)).toThrow(
        ForbiddenException,
      );
    });

    it('should inject organizationId into request when present', () => {
      const request: any = {
        user: { sub: 'user-1', organizationId: 'org-1' },
      };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      };

      expect(guard.canActivate(context as any)).toBe(true);
      expect(request.organizationId).toBe('org-1');
    });
  });

  describe('RbacGuard', () => {
    let guard: RbacGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      guard = new RbacGuard(reflector);
    });

    function createRbacContext(request: any): any {
      return {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };
    }

    it('should block request without required OBD permission', () => {
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['obd:scan:create']);
      const request: any = {
        user: { sub: 'user-1', permissions: ['obd:scan:read'] },
      };

      expect(() => guard.canActivate(createRbacContext(request))).toThrow(
        ForbiddenException,
      );
    });

    it('should allow request with exact permission', () => {
      reflector.getAllAndOverride = jest.fn().mockReturnValue(['obd:scan:create']);
      const request: any = {
        user: { sub: 'user-1', permissions: ['obd:scan:create'] },
      };

      expect(guard.canActivate(createRbacContext(request))).toBe(true);
    });
  });

  describe('Repository tenant scoping', () => {
    const mockPrisma = {
      scanJob: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
      },
      desktopAgent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      sessionFaultCode: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    it('ScanJobRepository.findById includes organizationId filter', async () => {
      const repo = new ScanJobRepository(mockPrisma as any);
      await repo.findById('scan-1', 'org-1');
      expect(mockPrisma.scanJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'scan-1', organizationId: 'org-1' }),
        }),
      );
    });

    it('DesktopAgentRepository.findById includes organizationId filter', async () => {
      const repo = new DesktopAgentRepository(mockPrisma as any);
      await repo.findById('agent-1', 'org-1');
      expect(mockPrisma.desktopAgent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'agent-1', organizationId: 'org-1' }),
        }),
      );
    });

    it('SessionFaultCodeRepository.findByScanJob includes organizationId filter', async () => {
      const repo = new SessionFaultCodeRepository(mockPrisma as any);
      await repo.findByScanJob('scan-1', 'org-1');
      expect(mockPrisma.sessionFaultCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scanJobId: 'scan-1', organizationId: 'org-1' }),
        }),
      );
    });
  });
});
