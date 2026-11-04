import type { User } from '../src/lib/types';
import { SUPER_ADMIN_TEMPLATE } from '../src/lib/permissions';
export const DEFAULT_SUPER_ADMIN: User = {
  id: 'test_admin',
  fullName: 'Test Super Admin',
  email: 'admin@example.test',
  phone: '9800000001',
  role: 'SUPER_ADMIN',
  isSuperAdmin: true,
  dutyStatus: 'ONLINE',
  active: true,
  assignedBrands: ['ALL'],
  territory: 'ALL',
  permissions: {
    canViewAnalytics: true,
    canExportSheets: true,
    canManageDispatches: true,
    canManageCheques: true,
    canApproveSkips: true,
    canManageStaff: true,
    canConfigureSettings: true,
  },
  customPermissions: SUPER_ADMIN_TEMPLATE,
};

