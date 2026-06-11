import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import {
  FAULT_CODE_ENRICHMENT,
  FaultCodeEnrichment,
} from '../services/fault-code-enrichment.service';
import { AuthGuard } from '../../guards/auth.guard';
import { TenantGuard } from '../../guards/tenant.guard';

const MAX_CODE_LENGTH = 10;

/**
 * HTTP boundary for the Fault Code Intelligence feature.
 *
 * Exposes a single endpoint:
 *  - GET /api/v1/fault-codes/:code
 *
 * Returns 200 with the enriched payload (or the "unknown" fallback) for
 * both known and unknown codes. Returns 401 for unauthenticated requests
 * and 400 for malformed path params. Never returns 404 for an unknown
 * code (the spec requires graceful fallback).
 */
@Controller('/api/v1/fault-codes')
@UseGuards(AuthGuard, TenantGuard)
export class FaultCodesController {
  constructor(
    @Inject(FAULT_CODE_ENRICHMENT)
    private readonly enrichment: FaultCodeEnrichment,
  ) {}

  @Get(':code')
  async getByCode(
    @Param('code') code: string,
    @Req() _req: Request,
  ) {
    const normalized = (code ?? '').trim();
    if (normalized.length === 0 || normalized.length > MAX_CODE_LENGTH) {
      throw new BadRequestException({
        code: 'INVALID_CODE',
        message: `code must be 1-${MAX_CODE_LENGTH} characters`,
      });
    }
    return this.enrichment.enrichOne(normalized);
  }
}
