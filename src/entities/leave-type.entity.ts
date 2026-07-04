import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveRequest } from './leave-request.entity';

@Entity('leave_type')
export class LeaveType {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column()
  name: string;

  @Column({ default: '#0B7A75' })
  color: string;

  @Column({ name: 'requires_approval', default: true })
  requiresApproval: boolean;

  @Column({ name: 'is_paid', default: true })
  isPaid: boolean;

  @Column({ name: 'default_days', default: 0 })
  defaultDays: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, (company) => company.leaveTypes)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => LeaveBalance, (lb) => lb.leaveType)
  leaveBalances: LeaveBalance[];

  @OneToMany(() => LeaveRequest, (lr) => lr.leaveType)
  leaveRequests: LeaveRequest[];
}
