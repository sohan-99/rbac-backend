import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import type { AuthUser, UserRole } from '../auth/auth.types';
import { Permission } from '../permissions/permission.entity';
import { RolePermission } from '../roles/role-permission.entity';
import { Role } from '../roles/role.entity';
import { User } from './user.entity';
import { demoUserSeeds, permissionSeeds, rolePermissionMap, roleSeeds } from './rbac.seed';
import { UserPermission } from './user-permission.entity';

export type UserListItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'active' | 'suspended' | 'banned';
  permissions: string[];
  createdAt: Date;
  updatedAt: Date;
};

export type PermissionEditorItem = {
  key: string;
  name: string;
  granted: boolean;
  inherited: boolean;
  grantable: boolean;
};

export type UserPermissionsEditorData = {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: 'active' | 'suspended' | 'banned';
  };
  directPermissions: string[];
  rolePermissions: string[];
  effectivePermissions: string[];
  grantablePermissions: string[];
  permissions: PermissionEditorItem[];
};

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepo: Repository<Permission>,
    @InjectRepository(RolePermission)
    private readonly rolePermissionRepo: Repository<RolePermission>,
    @InjectRepository(UserPermission)
    private readonly userPermissionRepo: Repository<UserPermission>,
  ) {}

  async onModuleInit() {
    await this.seedRbacData();
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email: email.toLowerCase() },
      relations: { roleRecord: true },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id }, relations: { roleRecord: true } });
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
  }): Promise<User> {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const customerRole = await this.roleRepo.findOne({ where: { slug: 'customer' } });
    if (!customerRole) {
      throw new ConflictException('Default customer role is not configured');
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = this.userRepo.create({
      name: data.name,
      email: data.email.toLowerCase(),
      password: hashed,
      roleId: customerRole.id,
      role: 'customer',
      permissions: [],
      status: 'active',
    });

    return this.userRepo.save(user);
  }

  async listUsers(): Promise<UserListItem[]> {
    const users = await this.userRepo.find({
      relations: { roleRecord: true },
      order: { createdAt: 'DESC' },
    });

    const hydrated = await Promise.all(
      users.map(async (user) => {
        const authUser = await this.buildAuthUser(user);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: authUser.role,
          status: user.status,
          permissions: authUser.permissions,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        } satisfies UserListItem;
      }),
    );

    return hydrated;
  }

  async getUserById(userId: string): Promise<UserListItem> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const authUser = await this.buildAuthUser(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: authUser.role,
      status: user.status,
      permissions: authUser.permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  async createByAdmin(data: {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
  }): Promise<UserListItem> {
    const existing = await this.findByEmail(data.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const roleSlug = data.role ?? 'customer';
    const roleRecord = await this.roleRepo.findOne({ where: { slug: roleSlug } });

    if (!roleRecord) {
      throw new NotFoundException('Role not found');
    }

    const hashed = await bcrypt.hash(data.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({
        name: data.name,
        email: data.email.toLowerCase(),
        password: hashed,
        roleId: roleRecord.id,
        role: roleSlug,
        permissions: [],
        status: 'active',
      }),
    );

    return this.getUserById(user.id);
  }

  async updateByAdmin(
    userId: string,
    data: {
      name?: string;
      email?: string;
      role?: UserRole;
    },
  ): Promise<UserListItem> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (data.email && data.email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.findByEmail(data.email);
      if (existing && existing.id !== user.id) {
        throw new ConflictException('Email already in use');
      }
      user.email = data.email.toLowerCase();
    }

    if (data.name) {
      user.name = data.name;
    }

    if (data.role) {
      const roleRecord = await this.roleRepo.findOne({ where: { slug: data.role } });
      if (!roleRecord) {
        throw new NotFoundException('Role not found');
      }
      user.role = data.role;
      user.roleId = roleRecord.id;
    }

    await this.userRepo.save(user);
    return this.getUserById(user.id);
  }

  async setStatus(
    userId: string,
    status: 'active' | 'suspended' | 'banned',
  ): Promise<UserListItem> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.status = status;
    await this.userRepo.save(user);
    return this.getUserById(user.id);
  }

  async getUserPermissionsForEditor(
    userId: string,
    actorPermissions: string[],
  ): Promise<UserPermissionsEditorData> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const allPermissions = await this.permissionRepo.find({
      order: { name: 'ASC' },
    });

    const rolePermissions = user.roleId
      ? (
          await this.rolePermissionRepo.find({
            where: { roleId: user.roleId },
            relations: { permission: true },
          })
        ).map((item) => item.permission.key)
      : [];

    const directPermissions = (
      await this.userPermissionRepo.find({
        where: { userId: user.id },
        relations: { permission: true },
      })
    ).map((item) => item.permission.key);

    const effectivePermissions = [...new Set([...rolePermissions, ...directPermissions])];
    const grantablePermissions = [...new Set(actorPermissions)];

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: (user.roleRecord?.slug ?? user.role) as UserRole,
        status: user.status,
      },
      directPermissions,
      rolePermissions,
      effectivePermissions,
      grantablePermissions,
      permissions: allPermissions.map((permission) => ({
        key: permission.key,
        name: permission.name,
        granted: effectivePermissions.includes(permission.key),
        inherited: rolePermissions.includes(permission.key),
        grantable: grantablePermissions.includes(permission.key),
      })),
    };
  }

  async updateUserPermissionsByAdmin(
    userId: string,
    permissionKeys: string[],
    actorPermissions: string[],
  ): Promise<UserPermissionsEditorData> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const uniqueKeys = [...new Set(permissionKeys)];

    const invalidGrants = uniqueKeys.filter(
      (permissionKey) => !actorPermissions.includes(permissionKey),
    );
    if (invalidGrants.length > 0) {
      throw new ForbiddenException(
        `Grant ceiling exceeded. You cannot grant: ${invalidGrants.join(', ')}`,
      );
    }

    const existingPermissions = uniqueKeys.length
      ? await this.permissionRepo.find({ where: { key: In(uniqueKeys) } })
      : [];

    if (existingPermissions.length !== uniqueKeys.length) {
      throw new NotFoundException('One or more permissions do not exist');
    }

    await this.userPermissionRepo.delete({ userId });

    if (existingPermissions.length > 0) {
      await this.userPermissionRepo.save(
        existingPermissions.map((permission) =>
          this.userPermissionRepo.create({
            userId,
            permissionId: permission.id,
          }),
        ),
      );
    }

    return this.getUserPermissionsForEditor(userId, actorPermissions);
  }

  async getAuthPrincipalByEmail(email: string): Promise<{
    authUser: AuthUser;
    passwordHash: string;
    status: 'active' | 'suspended' | 'banned';
  } | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const authUser = await this.buildAuthUser(user);
    return { authUser, passwordHash: user.password, status: user.status };
  }

  async getAuthUserById(id: string): Promise<AuthUser | null> {
    const user = await this.findById(id);
    if (!user) {
      return null;
    }

    return this.buildAuthUser(user);
  }

  async validatePassword(plain: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plain, hashed);
  }

  private async buildAuthUser(user: User): Promise<AuthUser> {
    const roleSlug = (user.roleRecord?.slug ?? user.role ?? 'customer') as UserRole;
    const permissions = await this.resolveEffectivePermissions(user.id, user.roleId);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: roleSlug,
      permissions,
    };
  }

  private async resolveEffectivePermissions(
    userId: string,
    roleId: string | null,
  ): Promise<string[]> {
    const rolePermissionKeys = roleId
      ? (
          await this.rolePermissionRepo.find({
            where: { roleId },
            relations: { permission: true },
          })
        ).map((item) => item.permission.key)
      : [];

    const userPermissionKeys = (
      await this.userPermissionRepo.find({
        where: { userId },
        relations: { permission: true },
      })
    ).map((item) => item.permission.key);

    return [...new Set([...rolePermissionKeys, ...userPermissionKeys])];
  }

  private async seedRbacData() {
    await this.seedRoles();
    await this.seedPermissions();
    await this.seedRolePermissions();
    await this.seedDemoUsers();
  }

  private async seedRoles() {
    for (const roleSeed of roleSeeds) {
      const existing = await this.roleRepo.findOne({ where: { slug: roleSeed.slug } });
      if (!existing) {
        await this.roleRepo.save(
          this.roleRepo.create({
            name: roleSeed.name,
            slug: roleSeed.slug,
            description: roleSeed.description,
          }),
        );
      }
    }
  }

  private async seedPermissions() {
    for (const permissionSeed of permissionSeeds) {
      const existing = await this.permissionRepo.findOne({
        where: { key: permissionSeed.key },
      });
      if (!existing) {
        await this.permissionRepo.save(
          this.permissionRepo.create({
            key: permissionSeed.key,
            name: permissionSeed.name,
            description: permissionSeed.name,
          }),
        );
      }
    }
  }

  private async seedRolePermissions() {
    for (const [roleSlug, permissionKeys] of Object.entries(rolePermissionMap)) {
      const role = await this.roleRepo.findOne({ where: { slug: roleSlug } });
      if (!role) {
        continue;
      }

      for (const permissionKey of permissionKeys) {
        const permission = await this.permissionRepo.findOne({
          where: { key: permissionKey },
        });

        if (!permission) {
          continue;
        }

        const existing = await this.rolePermissionRepo.findOne({
          where: { roleId: role.id, permissionId: permission.id },
        });

        if (!existing) {
          await this.rolePermissionRepo.save(
            this.rolePermissionRepo.create({
              roleId: role.id,
              permissionId: permission.id,
            }),
          );
        }
      }
    }
  }

  private async seedDemoUsers() {
    for (const demoUser of demoUserSeeds) {
      const role = await this.roleRepo.findOne({ where: { slug: demoUser.roleSlug } });
      if (!role) {
        continue;
      }

      const password = await bcrypt.hash(demoUser.password, 10);
      const existing = await this.findByEmail(demoUser.email);

      if (existing) {
        await this.userRepo.update(existing.id, {
          name: demoUser.name,
          password,
          roleId: role.id,
          role: role.slug as UserRole,
          status: 'active',
        });
      } else {
        await this.userRepo.save(
          this.userRepo.create({
            name: demoUser.name,
            email: demoUser.email,
            password,
            roleId: role.id,
            role: role.slug as UserRole,
            permissions: [],
            status: 'active',
          }),
        );
      }
    }
  }
}
