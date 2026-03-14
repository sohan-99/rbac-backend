export const roleSeeds = [
  {
    name: 'Business Owner / IT Admin',
    slug: 'admin',
    description:
      'Complete control over users, permissions, and system configuration.',
  },
  {
    name: 'Team Lead / Department Head',
    slug: 'manager',
    description: 'Manages teams and controls features within their scope.',
  },
  {
    name: 'Staff / Operator',
    slug: 'agent',
    description: 'Works within modules unlocked by manager/admin.',
  },
  {
    name: 'End Client / User',
    slug: 'customer',
    description: 'Self-service access with limited visibility.',
  },
] as const;

export const permissionSeeds = [
  { key: 'dashboard.view', name: 'View Dashboard' },
  { key: 'users.view', name: 'View Users' },
  { key: 'users.create', name: 'Create Users' },
  { key: 'leads.view', name: 'View Leads' },
  { key: 'tasks.view', name: 'View Tasks' },
  { key: 'reports.view', name: 'View Reports' },
  { key: 'audit.view', name: 'View Audit Log' },
  { key: 'settings.view', name: 'View Settings' },
  { key: 'portal.view', name: 'View Self-Service Portal' },
] as const;

export const rolePermissionMap: Record<string, string[]> = {
  admin: [
    'dashboard.view',
    'users.view',
    'users.create',
    'leads.view',
    'tasks.view',
    'reports.view',
    'audit.view',
    'settings.view',
    'portal.view',
  ],
  manager: [
    'dashboard.view',
    'users.view',
    'leads.view',
    'tasks.view',
    'reports.view',
    'audit.view',
  ],
  agent: ['dashboard.view', 'leads.view', 'tasks.view', 'reports.view'],
  customer: ['portal.view'],
};

export const demoUserSeeds = [
  {
    name: 'System Admin',
    email: 'admin@rbac.local',
    password: 'admin123',
    roleSlug: 'admin',
  },
  {
    name: 'Team Manager',
    email: 'manager@rbac.local',
    password: 'manager123',
    roleSlug: 'manager',
  },
  {
    name: 'Support Agent',
    email: 'agent@rbac.local',
    password: 'agent123',
    roleSlug: 'agent',
  },
  {
    name: 'Customer User',
    email: 'customer@rbac.local',
    password: 'customer123',
    roleSlug: 'customer',
  },
] as const;
