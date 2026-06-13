/**
 * DtcClearResponseDto — response shape for POST /fault-codes/clear.
 *
 * Matches the API contract from `contracts/dtc-clear-api-contract.md`.
 */
export class DtcClearResponseDto {
  sessionId: string;
  status: string;
  previousFaultCodeCount?: number;
  message: string;

  static queued(
    sessionId: string,
    previousFaultCodeCount: number,
  ): DtcClearResponseDto {
    const dto = new DtcClearResponseDto();
    dto.sessionId = sessionId;
    dto.status = 'CLEAR_PENDING';
    dto.previousFaultCodeCount = previousFaultCodeCount;
    dto.message = 'DTC clear command queued.';
    return dto;
  }

  static permanentWarning(
    sessionId: string,
    previousFaultCodeCount: number,
  ): DtcClearResponseDto {
    const dto = new DtcClearResponseDto();
    dto.sessionId = sessionId;
    dto.status = 'CLEAR_PENDING';
    dto.previousFaultCodeCount = previousFaultCodeCount;
    dto.message =
      'This session contains only permanent fault codes, which may not be clearable through standard OBD-II Mode 04. The clear command will still be attempted.';
    return dto;
  }
}

/**
 * DtcClearStatusResponseDto — response shape for GET /fault-codes/clear-status.
 */
export class DtcClearStatusResponseDto {
  sessionId: string;
  clearStatus: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED';
  lastClearAt: string | null;
  lastClearResult: 'SUCCESS' | 'FAILED' | null;

  static fromData(
    sessionId: string,
    clearStatus: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILED',
    lastClearAt: Date | null,
    lastClearResult: 'SUCCESS' | 'FAILED' | null,
  ): DtcClearStatusResponseDto {
    const dto = new DtcClearStatusResponseDto();
    dto.sessionId = sessionId;
    dto.clearStatus = clearStatus;
    dto.lastClearAt = lastClearAt?.toISOString() ?? null;
    dto.lastClearResult = lastClearResult;
    return dto;
  }
}

/**
 * DTC clear event payload shapes from the agent.
 */
export interface DtcClearedPayload {
  success: true;
}

export interface DtcClearFailedPayload {
  success: false;
  reason: string;
}