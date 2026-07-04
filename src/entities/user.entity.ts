import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Company } from './company.entity';
import { Department } from './department.entity';
import { LeaveBalance } from './leave-balance.entity';
import { LeaveRequest } from './leave-request.entity';
import { RefreshToken } from './refresh-token.entity';
import { Role } from './enums';

@Entity('app_user')
export class User {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, default: Role.EMPLOYEE })
  role: Role;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'department_id', nullable: true })
  departmentId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Company, (company) => company.users)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Department, (dept) => dept.members, { nullable: true })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  @OneToMany(() => Department, (dept) => dept.manager)
  managedDepartments: Department[];

  @OneToMany(() => LeaveBalance, (lb) => lb.user)
  leaveBalances: LeaveBalance[];

  @OneToMany(() => LeaveRequest, (lr) => lr.user)
  leaveRequests: LeaveRequest[];

  @OneToMany(() => LeaveRequest, (lr) => lr.approver)
  approvedRequests: LeaveRequest[];

  @OneToMany(() => RefreshToken, (rt) => rt.user)
  refreshTokens: RefreshToken[];
}
