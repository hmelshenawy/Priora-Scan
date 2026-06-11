import { FaultSeverity, FaultCodeSystem } from '@prisma/client';

export class EnrichedFaultCodeDto {
  code: string;
  title: string | null;
  description: string | null;
  system: FaultCodeSystem;
  severity: FaultSeverity;
  commonCauses: string[];
  recommendedChecks: string[];
  isGeneric: boolean;
  manufacturer: string | null;
  source: string | null;
  hasDescription: boolean;
}
