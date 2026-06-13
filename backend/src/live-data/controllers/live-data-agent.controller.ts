import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import '../../types/auth.types';
import { LiveDataSessionService } from '../services/live-data-session.service';
import { AgentAuthGuard } from '../../guards/agent-auth.guard';

interface PollResultBody {
  readings: Array<{
    shortName: string;
    namespace: string;
    mode: string;
    pid: string;
    rawValue: string;
  }>;
}

@Controller('api/v1/obd/agents/:id')
export class LiveDataAgentController {
  constructor(private readonly service: LiveDataSessionService) {}

  /**
   * Agent command-queue probe. Returns at most one pending command
   * and marks it consumed. Empty array if no commands are queued.
   */
  @Get('live-data/command-queue')
  @UseGuards(AgentAuthGuard)
  async commandQueue(@Param('id') id: string, @Req() req: Request) {
    const agent = req.agent!;
    const cmd = await this.service.consumeNextCommand(
      id,
      agent.organizationId,
    );
    if (!cmd) {
      return [];
    }
    return [
      {
        id: cmd.id,
        commandType: cmd.commandType,
        liveDataSessionId: cmd.liveDataSessionId,
        diagnosticSessionId:
          (cmd.payload as Record<string, unknown> | null)?.diagnosticSessionId ??
          null,
        payload: cmd.payload,
        createdAt: cmd.createdAt,
      },
    ];
  }

  /**
   * Agent posts a poll cycle result. Backend decodes the raw bytes
   * through `PidDecoderService` and stores the resulting map as
   * `LiveDataSession.latestValues`.
   */
  @Post('live-data/:liveDataSessionId/poll-result')
  @UseGuards(AgentAuthGuard)
  async pollResult(
    @Param('id') id: string,
    @Param('liveDataSessionId') liveDataSessionId: string,
    @Body() body: PollResultBody,
    @Req() req: Request,
  ) {
    const agent = req.agent!;
    if (
      !body ||
      !Array.isArray(body.readings) ||
      body.readings.length === 0
    ) {
      throw new BadRequestException({
        code: 'READINGS_REQUIRED',
        message: 'A non-empty readings array is required.',
      });
    }
    const exists = await this.service.sessionExists(
      liveDataSessionId,
      agent.organizationId,
    );
    if (!exists) {
      throw new NotFoundException({
        code: 'LIVE_DATA_SESSION_NOT_FOUND',
        message:
          'The live data session does not exist or you do not have access to it.',
      });
    }
    const values = await this.service.ingestPollResult(
      liveDataSessionId,
      id,
      agent.organizationId,
      body.readings,
    );
    return { success: true, values };
  }
}
