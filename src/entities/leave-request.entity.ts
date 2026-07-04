import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { LeaveType } from './leave-type.entity';
import { LeaveStatus } from './enums';

@Entity('leave_request')
export class LeaveRequest {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'leave_type_id' })
  leaveTypeId: string;

  @Column({ name: 'start_date', type: 'date' })
  startDate: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate: Date;

  @Column({ type: 'enum', enum: LeaveStatus, default: LeaveStatus.PENDING })
  status: LeaveStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'approver_id', nullable: true })
  approverId: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, (user) => user.leaveRequests)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => LeaveType, (lt) => lt.leaveRequests)
  @JoinColumn({ name: 'leave_type_id' })
  leaveType: LeaveType;

  @ManyToOne(() => User, (user) => user.approvedRequests, { nullable: true })
  @JoinColumn({ name: 'approver_id' })
  approver: User | null;
}
