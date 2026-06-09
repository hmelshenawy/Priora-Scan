import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AgentPairingService } from '../services/agent-pairing.service';
import { DesktopAgentRepository } from '../repositories/desktop-agent.repository';
import { PairingTokenRequestDto } from '../dtos/pairing-token-request.dto';
import { AgentStatusResponseDto } from '../dtos/agent-status-response.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';
import { RbacGuard } from '../../guards/rbac.guard';
import { Permissions } from '../../decorators/permissions.decorator';

@Controller('obd/agents')
@UseGuards(AuthGuard, TenantGuard, RbacGuard)
export class AgentPairingController {
  constructor(
    private pairingService: AgentPairingService,
    private agentRepository: DesktopAgentRepository,
  ) {}

  @Post('pair')
  @Permissions('obd:agent:pair')
  async generatePairingToken(
    @Body() dto: PairingTokenRequestDto,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    return this.pairingService.generatePairingToken(
      organizationId,
      userId,
      dto.agentName,
    );
  }

  @Delete(':id/unpair')
  @Permissions('obd:agent:pair')
  async unpairAgent(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const userId = req.user!.sub;
    await this.pairingService.unpairAgent(id, organizationId, userId);
    return { success: true };
  }

  @Get()
  @Permissions('obd:agent:read')
  async listAgents(@Req() req: Request) {
    const organizationId = req.organizationId!;
    const agents = await this.agentRepository.findByOrganization(organizationId);
    return agents.map(
      (a) =>
        new AgentStatusResponseDto({
          id: a.id,
          name: a.name ?? undefined,
          version: a.version,
          status: a.status as any,
          lastSeenAt: a.lastSeenAt ?? undefined,
          adapterConnected: false,
        }),
    );
  }

  @Get(':id/status')
  @Permissions('obd:agent:read')
  async getAgentStatus(
    @Param('id') id: string,
    @Req() req: Request,
  ) {
    const organizationId = req.organizationId!;
    const agent = await this.agentRepository.findById(id, organizationId);
    if (!agent) {
      return { error: 'AGENT_NOT_FOUND' };
    }
    return new AgentStatusResponseDto({
      id: agent.id,
      name: agent.name ?? undefined,
      version: agent.version,
      status: agent.status as any,
      lastSeenAt: agent.lastSeenAt ?? undefined,
      adapterConnected: false,
    });
  }
}
