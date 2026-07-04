import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { LeaveType } from './leave-type.entity';

@Entity('leave_balance')
@Unique(['userId', 'leaveTypeId', 'year'])
export class LeaveBalance {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'leave_type_id' })
  leaveTypeId: string;

  @Column()
  year: number;

  @Column({ name: 'allowance_days', type: 'decimal', precision: 5, scale: 1 })
  allowanceDays: number;

  @Column({ name: 'used_days', type: 'decimal', precision: 5, scale: 1, default: 0 })
  usedDays: number;

  @ManyToOne(() => User, (user) => user.leaveBalances)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => LeaveType, (lt) => lt.leaveBalances)
  @JoinColumn({ name: 'leave_type_id' })
  leaveType: LeaveType;
}
