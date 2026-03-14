import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '../auth/auth.types';
import { Role } from '../roles/role.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ unique: true, length: 200 })
  email!: string;

  @Column()
  password!: string;

  @Column('uuid', { nullable: true })
  roleId!: string | null;

  @Column({ default: 'customer' })
  role!: UserRole;

  @Column('text', { array: true, default: '{}' })
  permissions!: string[];

  @ManyToOne(() => Role, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'roleId' })
  roleRecord!: Role | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
