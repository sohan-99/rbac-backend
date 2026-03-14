import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type RevokedTokenType = 'access' | 'refresh';

@Entity('revoked_tokens')
export class RevokedToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ length: 128 })
  tokenId!: string;

  @Column({ length: 16 })
  tokenType!: RevokedTokenType;

  @Column('uuid', { nullable: true })
  userId!: string | null;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
