import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DesktopAgentRepository } from '../repositories/desktop-agent.repository';
import { PairingTokenResponseDto } from '../dtos/pairing-token-response.dto';
import * as crypto from 'crypto';

@Injectable()
export class AgentPairingService {
  private readonly TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private prisma: PrismaService,
    private agentRepository: DesktopAgentRepository,
  ) {}

  async generatePairingToken(
    organizationId: string,
    userId: string,
    agentName?: string,
  ): Promise<PairingTokenResponseDto> {
    const token = this.generateRandomToken();
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.TOKEN_TTL_MS);

    await this.prisma.pairingToken.create({
      data: {
        organizationId,
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return new PairingTokenResponseDto(token, expiresAt);
  }

  async exchangePairingToken(
    pairingToken: string,
    agentName: string,
    version: string,
  ): Promise<{
    agentId: string;
    accessToken: string;
    organizationId: string;
    userId: string;
  }> {
    const tokenHash = this.hashToken(pairingToken);

    const tokenRecord = await this.prisma.pairingToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException({
        code: 'PAIRING_TOKEN_INVALID',
        message: 'The pairing token is invalid or has expired.',
      });
    }

    const accessToken = this.generateAccessToken();

    const agent = await this.prisma.$transaction(async (tx) => {
      await tx.pairingToken.update({
        where: { id: tokenRecord.id },
        data: { consumedAt: new Date() },
      });

      const accessTokenHash = this.hashToken(accessToken);

      return tx.desktopAgent.create({
        data: {
          organizationId: tokenRecord.organizationId,
          userId: tokenRecord.userId,
          name: agentName || null,
          version,
          status: 'OFFLINE',
          accessTokenHash,
        },
      });
    });

    return {
      agentId: agent.id,
      accessToken,
      organizationId: tokenRecord.organizationId,
      userId: tokenRecord.userId,
    };
  }

  async unpairAgent(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<void> {
    const agent = await this.agentRepository.findById(id, organizationId);
    if (!agent) {
      throw new NotFoundException({
        code: 'AGENT_NOT_FOUND',
        message: 'The agent does not exist or you do not have access to it.',
      });
    }

    await this.agentRepository.delete(id, organizationId);
  }

  private generateRandomToken(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let token = '';
    for (let i = 0; i < 12; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
      if (i === 3 || i === 7) token += '-';
    }
    return token;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private generateAccessToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
