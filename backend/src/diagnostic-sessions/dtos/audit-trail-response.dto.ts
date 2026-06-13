import { DiagnosticSessionAuditRecord } from '@prisma/client';

/**
 * AuditTrailEntryDto — single audit record in the session audit trail.
 */
export class AuditTrailEntryDto {
  id: string;
  action: string;
  userId: string;
  sessionId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;

  static fromEntity(entity: DiagnosticSessionAuditRecord): AuditTrailEntryDto {
    const dto = new AuditTrailEntryDto();
    dto.id = entity.id;
    dto.action = entity.action;
    dto.userId = entity.userId;
    dto.sessionId = entity.sessionId;
    dto.metadata = entity.metadata as Record<string, unknown> | null;
    dto.createdAt = entity.createdAt.toISOString();
    return dto;
  }
}

/**
 * AuditTrailResponseDto — paginated audit trail for a session.
 */
export class AuditTrailResponseDto {
  sessionId: string;
  entries: AuditTrailEntryDto[];
  total: number;

  static fromEntries(
    sessionId: string,
    entries: DiagnosticSessionAuditRecord[],
  ): AuditTrailResponseDto {
    const dto = new AuditTrailResponseDto();
    dto.sessionId = sessionId;
    dto.entries = entries.map(AuditTrailEntryDto.fromEntity);
    dto.total = entries.length;
    return dto;
  }
}