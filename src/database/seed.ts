import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { Company } from '../entities/company.entity';
import { User } from '../entities/user.entity';
import { Department } from '../entities/department.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { PublicHoliday } from '../entities/public-holiday.entity';
import { Invite } from '../entities/invite.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Role, LeaveStatus } from '../entities/enums';
import { ROMANIAN_HOLIDAYS } from '../holidays/data/romanian-holidays';
import { UuidV7Subscriber } from './subscribers/uuid-v7.subscriber';

dotenv.config();

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Company, User, Department, LeaveType, LeaveBalance,
    LeaveRequest, PublicHoliday, Invite, RefreshToken,
  ],
  subscribers: [UuidV7Subscriber],
  synchronize: true,
});

const LEAVE_TYPE_DEFAULTS = [
  { name: 'Concediu de odihna', color: '#0B7A75', requiresApproval: true, isPaid: true, defaultDays: 21 },
  { name: 'Concediu medical', color: '#F57C00', requiresApproval: false, isPaid: true, defaultDays: 0 },
  { name: 'Concediu fara plata', color: '#9E9E9E', requiresApproval: true, isPaid: false, defaultDays: 0 },
  { name: 'Zi libera personala', color: '#5C6BC0', requiresApproval: true, isPaid: true, defaultDays: 3 },
  { name: 'Concediu de maternitate', color: '#E91E63', requiresApproval: true, isPaid: true, defaultDays: 126 },
  { name: 'Concediu de paternitate', color: '#2196F3', requiresApproval: true, isPaid: true, defaultDays: 10 },
];

const EMPLOYEES = [
  { name: 'Stefan Admin', email: 'admin@techro.ro', role: Role.ADMIN, dept: null },
  { name: 'Maria Popescu', email: 'maria@techro.ro', role: Role.MANAGER, dept: 'Engineering' },
  { name: 'Andrei Ionescu', email: 'andrei@techro.ro', role: Role.MANAGER, dept: 'Design' },
  { name: 'Elena Dumitrescu', email: 'elena@techro.ro', role: Role.MANAGER, dept: 'Marketing' },
  { name: 'Mihai Stanescu', email: 'mihai@techro.ro', role: Role.EMPLOYEE, dept: 'Engineering' },
  { name: 'Ana Moldovan', email: 'ana@techro.ro', role: Role.EMPLOYEE, dept: 'Engineering' },
  { name: 'Cristian Radu', email: 'cristian@techro.ro', role: Role.EMPLOYEE, dept: 'Design' },
  { name: 'Ioana Vasile', email: 'ioana@techro.ro', role: Role.EMPLOYEE, dept: 'Design' },
  { name: 'Alexandru Popa', email: 'alex@techro.ro', role: Role.EMPLOYEE, dept: 'Marketing' },
  { name: 'Diana Gheorghe', email: 'diana@techro.ro', role: Role.EMPLOYEE, dept: 'Marketing' },
];

async function seed() {
  await dataSource.initialize();
  console.log('Connected to database');

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  // Clean existing data in correct order (respect FK constraints)
  await queryRunner.query('DELETE FROM leave_request');
  await queryRunner.query('DELETE FROM leave_balance');
  await queryRunner.query('DELETE FROM refresh_token');
  await queryRunner.query('DELETE FROM invite');
  await queryRunner.query('UPDATE department SET manager_id = NULL');
  await queryRunner.query('DELETE FROM app_user');
  await queryRunner.query('DELETE FROM department');
  await queryRunner.query('DELETE FROM leave_type');
  await queryRunner.query('DELETE FROM company');
  await queryRunner.query('DELETE FROM public_holiday');
  await queryRunner.release();

  console.log('Cleaned existing data');

  // Create company
  const companyRepo = dataSource.getRepository(Company);
  const company = await companyRepo.save(companyRepo.create({ name: 'TechRo Solutions SRL' }));
  console.log(`Created company: ${company.name}`);

  // Seed holidays
  const holidayRepo = dataSource.getRepository(PublicHoliday);
  for (const [yearStr, holidays] of Object.entries(ROMANIAN_HOLIDAYS)) {
    const year = Number(yearStr);
    for (const h of holidays) {
      await holidayRepo.save(holidayRepo.create({
        country: 'RO',
        date: new Date(h.date),
        name: h.name,
        year,
      }));
    }
  }
  console.log('Seeded Romanian holidays (2024-2028)');

  // Create leave types
  const ltRepo = dataSource.getRepository(LeaveType);
  const leaveTypes: LeaveType[] = [];
  for (const d of LEAVE_TYPE_DEFAULTS) {
    leaveTypes.push(await ltRepo.save(ltRepo.create({ ...d, companyId: company.id })));
  }
  console.log(`Created ${leaveTypes.length} leave types`);

  // Create departments
  const deptRepo = dataSource.getRepository(Department);
  const depts = new Map<string, Department>();
  for (const name of ['Engineering', 'Design', 'Marketing']) {
    const dept = await deptRepo.save(deptRepo.create({ name, companyId: company.id }));
    depts.set(name, dept);
  }
  console.log('Created 3 departments');

  // Create users
  const userRepo = dataSource.getRepository(User);
  const passwordHash = await bcrypt.hash('password123', 12);
  const users = new Map<string, User>();

  for (const emp of EMPLOYEES) {
    const deptId = emp.dept ? depts.get(emp.dept)?.id ?? null : null;
    const user = await userRepo.save(userRepo.create({
      name: emp.name,
      email: emp.email,
      passwordHash,
      role: emp.role,
      companyId: company.id,
      departmentId: deptId,
    }));
    users.set(emp.email, user);
  }
  console.log(`Created ${users.size} users`);

  // Set department managers
  for (const emp of EMPLOYEES) {
    if (emp.role === Role.MANAGER && emp.dept) {
      const dept = depts.get(emp.dept)!;
      dept.managerId = users.get(emp.email)!.id;
      await deptRepo.save(dept);
    }
  }
  console.log('Assigned department managers');

  // Create leave balances for all users
  const balanceRepo = dataSource.getRepository(LeaveBalance);
  const year = new Date().getFullYear();
  for (const [, user] of users) {
    for (const lt of leaveTypes) {
      await balanceRepo.save(balanceRepo.create({
        userId: user.id,
        leaveTypeId: lt.id,
        year,
        allowanceDays: lt.defaultDays,
        usedDays: 0,
      }));
    }
  }
  console.log(`Created leave balances for ${year}`);

  // Create sample leave requests
  const requestRepo = dataSource.getRepository(LeaveRequest);
  const annualType = leaveTypes.find((lt) => lt.name.includes('odihna'))!;
  const sickType = leaveTypes.find((lt) => lt.name.includes('medical'))!;
  const personalType = leaveTypes.find((lt) => lt.name.includes('personala'))!;

  const admin = users.get('admin@techro.ro')!;
  const maria = users.get('maria@techro.ro')!;
  const mihai = users.get('mihai@techro.ro')!;
  const ana = users.get('ana@techro.ro')!;
  const cristian = users.get('cristian@techro.ro')!;
  const alex = users.get('alex@techro.ro')!;

  const sampleRequests = [
    // Past approved requests
    { userId: mihai.id, type: annualType, start: '2026-03-16', end: '2026-03-20', status: LeaveStatus.APPROVED, approverId: maria.id, days: 5 },
    { userId: ana.id, type: sickType, start: '2026-04-07', end: '2026-04-08', status: LeaveStatus.APPROVED, approverId: null, days: 2 },
    { userId: cristian.id, type: annualType, start: '2026-05-04', end: '2026-05-08', status: LeaveStatus.APPROVED, approverId: users.get('andrei@techro.ro')!.id, days: 5 },
    { userId: alex.id, type: personalType, start: '2026-05-25', end: '2026-05-25', status: LeaveStatus.APPROVED, approverId: users.get('elena@techro.ro')!.id, days: 1 },

    // Upcoming approved
    { userId: mihai.id, type: annualType, start: '2026-07-13', end: '2026-07-17', status: LeaveStatus.APPROVED, approverId: maria.id, days: 5 },
    { userId: ana.id, type: annualType, start: '2026-08-03', end: '2026-08-14', status: LeaveStatus.APPROVED, approverId: maria.id, days: 10 },

    // Pending requests (for demo approvals)
    { userId: cristian.id, type: annualType, start: '2026-07-20', end: '2026-07-24', status: LeaveStatus.PENDING, approverId: null, days: 5 },
    { userId: alex.id, type: annualType, start: '2026-07-27', end: '2026-07-31', status: LeaveStatus.PENDING, approverId: null, days: 5 },
    { userId: users.get('diana@techro.ro')!.id, type: personalType, start: '2026-07-06', end: '2026-07-06', status: LeaveStatus.PENDING, approverId: null, days: 1 },

    // Declined
    { userId: mihai.id, type: annualType, start: '2026-06-01', end: '2026-06-12', status: LeaveStatus.DECLINED, approverId: maria.id, days: 0 },
  ];

  for (const req of sampleRequests) {
    const lr = await requestRepo.save(requestRepo.create({
      userId: req.userId,
      leaveTypeId: req.type.id,
      startDate: new Date(req.start),
      endDate: new Date(req.end),
      status: req.status,
      approverId: req.approverId,
      decidedAt: req.status !== LeaveStatus.PENDING ? new Date() : null,
    }));

    // Update balances for approved requests
    if (req.status === LeaveStatus.APPROVED && req.days > 0) {
      const balance = await balanceRepo.findOne({
        where: { userId: req.userId, leaveTypeId: req.type.id, year },
      });
      if (balance) {
        balance.usedDays = Number(balance.usedDays) + req.days;
        await balanceRepo.save(balance);
      }
    }
  }
  console.log(`Created ${sampleRequests.length} sample leave requests`);

  console.log('\n✓ Seed complete!');
  console.log('  Login: admin@techro.ro / password123');
  console.log('  All employees use password: password123');

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
