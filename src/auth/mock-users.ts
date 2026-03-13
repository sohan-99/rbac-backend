import type { AuthUser } from './auth.types';

type SeedUser = AuthUser & {
  password: string;
};

export const seedUsers: SeedUser[] = [
  {
    id: 'u_admin_01',
    name: 'System Admin',
    email: 'admin@rbac.local',
    password: 'admin123',
    role: 'admin',
    permissions: [
      'dashboard.view',
      'users.view',
      'users.create',
      'leads.view',
      'tasks.view',
      'reports.view',
      'audit.view',
      'settings.view',
    ],
  },
  {
    id: 'u_manager_01',
    name: 'Team Manager',
    email: 'manager@rbac.local',
    password: 'manager123',
    role: 'manager',
    permissions: [
      'dashboard.view',
      'users.view',
      'leads.view',
      'tasks.view',
      'reports.view',
      'audit.view',
    ],
  },
  {
    id: 'u_agent_01',
    name: 'Support Agent',
    email: 'agent@rbac.local',
    password: 'agent123',
    role: 'agent',
    permissions: ['dashboard.view', 'leads.view', 'tasks.view'],
  },
  {
    id: 'u_customer_01',
    name: 'Customer User',
    email: 'customer@rbac.local',
    password: 'customer123',
    role: 'customer',
    permissions: [],
  },
];