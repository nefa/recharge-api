import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { Department } from '../entities/department.entity';
import { LeaveStatus } from '../entities/enums';
import { LeaveBalancesService } from '../leave-balances/leave-balances.service';
import { LeaveRequestsService } from '../leave-requests/leave-requests.service';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(LeaveRequest) private requestRepo: Repository<LeaveRequest>,
    @InjectRepository(Department) private deptRepo: Repository<Department>,
    private leaveBalancesService: LeaveBalancesService,
    private leaveRequestsService: LeaveRequestsService,
  ) {}

  async getMyDashboard(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { company: true },
    });

    const year = new Date().getFullYear();
    const balances = await this.leaveBalancesService.getByUser(userId, year);

    const today = new Date().toISOString().split('T')[0];

    const allRequests = await this.requestRepo.find({
      where: { userId },
      relations: { leaveType: true, approver: true, user: true },
      order: { createdAt: 'DESC' },
    });

    const upcomingRequests = allRequests
      .filter(
        (r) =>
          r.status === LeaveStatus.APPROVED &&
          String(r.startDate) >= today,
      )
      .slice(0, 5);

    const recentRequests = allRequests.slice(0, 10);

    return {
      user: {
        id: user!.id,
        email: user!.email,
        name: user!.name,
        role: user!.role,
        companyId: user!.companyId,
        departmentId: user!.departmentId,
        companyName: user!.company?.name ?? '',
      },
      balances,
      upcomingRequests: await Promise.all(
        upcomingRequests.map((r) =>
          this.leaveRequestsService.findOne(r.id),
        ),
      ),
      recentRequests: await Promise.all(
        recentRequests.map((r) =>
          this.leaveRequestsService.findOne(r.id),
        ),
      ),
    };
  }

  async getTeamDashboard(userId: string, companyId: string, role: string) {
    const pendingRequests =
      role === 'admin'
        ? await this.leaveRequestsService.findByCompany(
            companyId,
            LeaveStatus.PENDING,
          )
        : await this.leaveRequestsService.findPendingByManager(
            userId,
            companyId,
          );

    const today = new Date().toISOString().split('T')[0];

    const onLeaveToday = await this.requestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.leaveType', 'leaveType')
      .where('user.companyId = :companyId', { companyId })
      .andWhere('r.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('r.start_date <= :today', { today })
      .andWhere('r.end_date >= :today', { today })
      .getMany();

    const teamOnLeaveToday = onLeaveToday.map((r) => ({
      userId: r.userId,
      userName: r.user?.name ?? '',
      leaveType: r.leaveType?.name ?? '',
      leaveColor: r.leaveType?.color ?? '#0B7A75',
    }));

    const departments = await this.deptRepo.find({
      where: { companyId },
      relations: { members: true },
    });

    const departmentSummary = departments.map((dept) => {
      const onLeaveCount = onLeaveToday.filter(
        (r) => r.user?.departmentId === dept.id,
      ).length;

      return {
        departmentName: dept.name,
        memberCount: dept.members?.length ?? 0,
        onLeaveCount,
      };
    });

    return {
      pendingRequests,
      teamOnLeaveToday,
      departmentSummary,
    };
  }
}
