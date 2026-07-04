import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { Department } from './department.entity';
import { LeaveType } from './leave-type.entity';
import { Invite } from './invite.entity';

@Entity('company')
export class Company {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => User, (user) => user.company)
  users: User[];

  @OneToMany(() => Department, (dept) => dept.company)
  departments: Department[];

  @OneToMany(() => LeaveType, (lt) => lt.company)
  leaveTypes: LeaveType[];

  @OneToMany(() => Invite, (invite) => invite.company)
  invites: Invite[];
}
