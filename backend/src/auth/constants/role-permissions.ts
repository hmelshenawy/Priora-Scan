export const ROLE_PERMISSIONS: Record<string, string[]> = {
  technician: [
    'read:vehicle',
    'create:vehicle',
    'obd:scan:create',
    'obd:scan:read',
    'obd:scan:cancel',
    'obd:agent:pair',
    'obd:agent:read',
    'obd:fault-code:read',
  ],
  service_advisor: [
    'read:vehicle',
    'obd:scan:read',
    'obd:agent:read',
    'obd:fault-code:read',
  ],
  workshop_manager: [
    'read:vehicle',
    'create:vehicle',
    'update:vehicle',
    'obd:scan:create',
    'obd:scan:read',
    'obd:scan:cancel',
    'obd:agent:pair',
    'obd:agent:read',
    'obd:fault-code:read',
  ],
};
