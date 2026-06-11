import { EnrichedFaultCodeDto } from '../dtos/enriched-fault-code.dto';

export interface SessionFaultCodeLite {
  code: string;
  status: string;
  ecu?: string | null;
}

export const FAULT_CODE_ENRICHMENT = Symbol('FAULT_CODE_ENRICHMENT');

export interface FaultCodeEnrichment {
  /**
   * Enrich a single fault code value. Returns the enriched payload, or the
   * "unknown" fallback shape if the code is not in MasterFaultCode.
   */
  enrichOne(code: string): Promise<EnrichedFaultCodeDto>;

  /**
   * Enrich a list of session fault codes. Each unique code is looked up
   * once and the result is mapped back to its source row(s).
   */
  enrichMany(
    rows: SessionFaultCodeLite[],
  ): Promise<Map<string, EnrichedFaultCodeDto>>;
}
