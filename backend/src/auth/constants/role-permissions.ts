export const ROLE_PERMISSIONS: Record<string, string[]> = {
  technician: ['read:vehicle', 'create:vehicle'],
  service_advisor: ['read:vehicle'],
  workshop_manager: ['read:vehicle', 'create:vehicle', 'update:vehicle'],
};
