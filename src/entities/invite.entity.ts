import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Role } from './enums';

@Entity('invite')
export class Invite {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  token: string;

  @Column()
  email: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ type: 'enum', enum: Role, default: Role.EMPLOYEE })
  role: Role;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, (company) => company.invites)
  @JoinColumn({ name: 'company_id' })
  company: Company;
}
