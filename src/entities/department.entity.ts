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
import { User } from './user.entity';

@Entity('department')
export class Department {
  @PrimaryColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ name: 'company_id' })
  companyId: string;

  @Column({ name: 'manager_id', nullable: true })
  managerId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Company, (company) => company.departments)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User, (user) => user.managedDepartments, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: User | null;

  @OneToMany(() => User, (user) => user.department)
  members: User[];
}
