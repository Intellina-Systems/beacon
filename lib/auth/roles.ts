import { ACCESS_ROLES, type AccessRole } from '@/lib/db/schema'

// ACCESS_ROLES is already ordered low → high (see its declaration in
// schema.ts) — reusing it directly instead of a separate literal array means
// there's exactly one place that ordering can be defined or get out of sync.
export function roleAtLeast(role: AccessRole, minimum: AccessRole): boolean {
  return ACCESS_ROLES.indexOf(role) >= ACCESS_ROLES.indexOf(minimum)
}

// admin OR superadmin — superadmin inherits every admin capability by
// construction, rather than needing every isAdmin() call site touched.
export function isAdminRole(role: AccessRole): boolean {
  return roleAtLeast(role, 'admin')
}

export const ROLE_LABEL: Record<AccessRole, string> = {
  engineer: 'Engineer',
  manager: 'Manager',
  admin: 'Admin',
  superadmin: 'Super Admin',
}
