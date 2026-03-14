import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import type { AuthUser, UserRole } from '../auth/auth.types';
import { Permission } from '../permissions/permission.entity';
import { RolePermission } from '../roles/role-permission.entity';
import { Role } from '../roles/role.entity';
import { User } from './user.entity';
import { demoUserSeeds, permissionSeeds, rolePermissionMap, roleSeeds } from './rbac.seed';
import { UserPermission } from './user-permission.entity';

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
    });

    return this.userRepo.save(user);
  }

  async getAuthPrincipalByEmail(email: string): Promise<{
    authUser: AuthUser;
    passwordHash: string;
  } | null> {
    const user = await this.findByEmail(email);
    if (!user) {
      return null;
    }

    const authUser = await this.buildAuthUser(user);
    return { authUser, passwordHash: user.password };
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
      const existing = await this.findByEmail(demoUser.email);
      if (existing) {
        continue;
      }

      const role = await this.roleRepo.findOne({ where: { slug: demoUser.roleSlug } });
      if (!role) {
        continue;
      }

      const password = await bcrypt.hash(demoUser.password, 10);

      await this.userRepo.save(
        this.userRepo.create({
          name: demoUser.name,
          email: demoUser.email,
          password,
          roleId: role.id,
          role: role.slug as UserRole,
          permissions: [],
        }),
      );
    }
  }
}
