import { FaultCodeSystem } from '@prisma/client';

/**
 * Map the first character of an OBD-II code to its system/category.
 * Returns UNKNOWN for any prefix that is not P, B, C, or U, or for empty input.
 */
export function inferSystem(code: string | null | undefined): FaultCodeSystem {
  if (!code || code.length === 0) {
    return FaultCodeSystem.UNKNOWN;
  }
  const prefix = code.charAt(0).toUpperCase();
  switch (prefix) {
    case 'P':
      return FaultCodeSystem.POWERTRAIN;
    case 'B':
      return FaultCodeSystem.BODY;
    case 'C':
      return FaultCodeSystem.CHASSIS;
    case 'U':
      return FaultCodeSystem.NETWORK;
    default:
      return FaultCodeSystem.UNKNOWN;
  }
}
