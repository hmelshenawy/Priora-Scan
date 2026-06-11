import { Injectable } from '@nestjs/common';
import { FaultCodeSystem, FaultSeverity, MasterFaultCode } from '@prisma/client';
import { MasterFaultCodeRepository } from '../repositories/master-fault-code.repository';
import { EnrichedFaultCodeDto } from '../dtos/enriched-fault-code.dto';
import { inferSystem } from '../rules/system-prefix.rules';
import {
  FaultCodeEnrichment,
  SessionFaultCodeLite,
} from './fault-code-enrichment.service';

/**
 * Default implementation of FaultCodeEnrichment. Reads from the
 * MasterFaultCode table, derives system/severity/causes/checks at read
 * time, and returns an "unknown" fallback payload for any code that is
 * not in the knowledge base.
 *
 * Design notes (Feature 005 spec):
 *  - Severity is always UNKNOWN for known or unknown codes in v1.
 *  - commonCauses and recommendedChecks are always empty arrays in v1;
 *    they are reserved for future rule packs.
 *  - hasDescription is derived from the title (the description column
 *    is typically equal to the title in v1; we use title as the
 *    user-facing "is this code known" signal).
 *  - The service depends on the repository directly, but the controller
 *    depends on the FAULT_CODE_ENRICHMENT token so a future caching
 *    decorator can be slotted in without API changes (FR-020).
 */
@Injectable()
export class DefaultFaultCodeEnrichmentService implements FaultCodeEnrichment {
  constructor(
    private readonly repository: MasterFaultCodeRepository,
  ) {}

  async enrichOne(code: string): Promise<EnrichedFaultCodeDto> {
    const normalized = this.normalize(code);
    const row = await this.repository.findByCode(normalized);
    return this.buildPayload(normalized, row);
  }

  async enrichMany(
    rows: SessionFaultCodeLite[],
  ): Promise<Map<string, EnrichedFaultCodeDto>> {
    if (rows.length === 0) {
      return new Map();
    }
    const unique = Array.from(
      new Set(rows.map((r) => this.normalize(r.code))),
    );
    const found = await this.repository.findManyByCodes(unique);
    const lookup = new Map<string, MasterFaultCode>();
    for (const row of found) {
      lookup.set(row.code, row);
    }
    const result = new Map<string, EnrichedFaultCodeDto>();
    for (const code of unique) {
      result.set(code, this.buildPayload(code, lookup.get(code) ?? null));
    }
    return result;
  }

  private normalize(code: string): string {
    return (code ?? '').toUpperCase().trim();
  }

  private buildPayload(
    code: string,
    row: MasterFaultCode | null,
  ): EnrichedFaultCodeDto {
    if (!row) {
      return {
        code,
        title: null,
        description: null,
        system: inferSystem(code),
        severity: FaultSeverity.UNKNOWN,
        commonCauses: [],
        recommendedChecks: [],
        isGeneric: false,
        manufacturer: null,
        source: null,
        hasDescription: false,
      };
    }
    const title = row.title ?? null;
    const description = row.description ?? null;
    return {
      code: row.code,
      title,
      description,
      system: row.system ?? inferSystem(row.code),
      severity: row.severity ?? FaultSeverity.UNKNOWN,
      commonCauses: this.toStringArray(row.commonCauses),
      recommendedChecks: this.toStringArray(row.recommendedChecks),
      isGeneric: row.isGeneric,
      manufacturer: row.manufacturer ?? null,
      source: row.source ?? null,
      hasDescription: title !== null && title !== '',
    };
  }

  private toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((v): v is string => typeof v === 'string');
  }
}
