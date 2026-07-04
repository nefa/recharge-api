import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveStatus, Role } from '../entities/enums';
import { HolidaysService } from '../holidays/holidays.service';
import { DepartmentsService } from '../departments/departments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { calculateWorkingDays } from '../common/working-days';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';

@Injectable()
export class LeaveRequestsService {
  constructor(
    @InjectRepository(LeaveRequest) private requestRepo: Repository<LeaveRequest>,
    @InjectRepository(LeaveBalance) private balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(LeaveType) private leaveTypeRepo: Repository<LeaveType>,
    private holidaysService: HolidaysService,
    private departmentsService: DepartmentsService,
    private notificationsService: NotificationsService,
  ) {}

  async create(userId: string, companyId: string, dto: CreateLeaveRequestDto) {
    const leaveType = await this.leaveTypeRepo.findOne({
      where: { id: dto.leaveTypeId, companyId },
    });
    if (!leaveType) {
      throw new NotFoundException('Leave type not found');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (endDate < startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    const holidayDates = await this.holidaysService.getHolidayDatesForRange(
      startDate,
      endDate,
    );
    const workingDays = calculateWorkingDays(startDate, endDate, holidayDates);

    if (workingDays === 0) {
      throw new BadRequestException(
        'Selected dates contain no working days',
      );
    }

    const year = startDate.getFullYear();
    const balance = await this.balanceRepo.findOne({
      where: { userId, leaveTypeId: dto.leaveTypeId, year },
    });

    if (balance && Number(balance.allowanceDays) > 0) {
      const remaining = Number(balance.allowanceDays) - Number(balance.usedDays);
      if (remaining < workingDays) {
        throw new BadRequestException(
          `Insufficient balance: ${remaining} days remaining, ${workingDays} days requested`,
        );
      }
    }

    await this.checkOverlap(userId, startDate, endDate);

    const request = this.requestRepo.create({
      userId,
      leaveTypeId: dto.leaveTypeId,
      startDate,
      endDate,
      note: dto.note ?? null,
      status: LeaveStatus.PENDING,
    });

    const saved = await this.requestRepo.save(request);

    if (!leaveType.requiresApproval) {
      saved.status = LeaveStatus.APPROVED;
      saved.decidedAt = new Date();
      await this.requestRepo.save(saved);

      if (balance) {
        balance.usedDays = Number(balance.usedDays) + workingDays;
        await this.balanceRepo.save(balance);
      }
    }

    if (leaveType.requiresApproval) {
      const manager = await this.departmentsService.getManagerForUser(userId);
      if (manager) {
        void this.notificationsService.sendRequestSubmitted(manager.email, {
          employeeName: (await this.requestRepo.findOne({ where: { id: saved.id }, relations: { user: true } }))?.user?.name ?? '',
          leaveTypeName: leaveType.name,
          startDate: dto.startDate,
          endDate: dto.endDate,
          workingDays,
        });
      }
    }

    return this.formatRequest(
      await this.requestRepo.findOne({
        where: { id: saved.id },
        relations: { user: true, leaveType: true, approver: true },
      }) as LeaveRequest,
      holidayDates,
    );
  }

  async approve(
    requestId: string,
    approverId: string,
    approverRole: Role,
    approverCompanyId: string,
  ) {
    const request = await this.findOneWithRelations(requestId);

    if (request.user.companyId !== approverCompanyId) {
      throw new ForbiddenException();
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    if (approverRole !== Role.ADMIN) {
      const manager = await this.departmentsService.getManagerForUser(
        request.userId,
      );
      if (!manager || manager.id !== approverId) {
        throw new ForbiddenException(
          'Only the department manager or an admin can approve requests',
        );
      }
    }

    const holidayDates = await this.holidaysService.getHolidayDatesForRange(
      new Date(request.startDate),
      new Date(request.endDate),
    );
    const workingDays = calculateWorkingDays(
      new Date(request.startDate),
      new Date(request.endDate),
      holidayDates,
    );

    const year = new Date(request.startDate).getFullYear();
    const balance = await this.balanceRepo.findOne({
      where: { userId: request.userId, leaveTypeId: request.leaveTypeId, year },
    });

    if (balance) {
      balance.usedDays = Number(balance.usedDays) + workingDays;
      await this.balanceRepo.save(balance);
    }

    request.status = LeaveStatus.APPROVED;
    request.approverId = approverId;
    request.decidedAt = new Date();
    await this.requestRepo.save(request);

    const startStr = request.startDate instanceof Date ? request.startDate.toISOString().split('T')[0] : String(request.startDate);
    const endStr = request.endDate instanceof Date ? request.endDate.toISOString().split('T')[0] : String(request.endDate);
    void this.notificationsService.sendRequestApproved(request.user.email, {
      employeeName: request.user.name,
      leaveTypeName: request.leaveType?.name ?? '',
      startDate: startStr,
      endDate: endStr,
      workingDays,
    });

    return this.formatRequest(request, holidayDates);
  }

  async decline(
    requestId: string,
    approverId: string,
    approverRole: Role,
    approverCompanyId: string,
  ) {
    const request = await this.findOneWithRelations(requestId);

    if (request.user.companyId !== approverCompanyId) {
      throw new ForbiddenException();
    }

    if (request.status !== LeaveStatus.PENDING) {
      throw new BadRequestException('Request is not pending');
    }

    if (approverRole !== Role.ADMIN) {
      const manager = await this.departmentsService.getManagerForUser(
        request.userId,
      );
      if (!manager || manager.id !== approverId) {
        throw new ForbiddenException(
          'Only the department manager or an admin can decline requests',
        );
      }
    }

    request.status = LeaveStatus.DECLINED;
    request.approverId = approverId;
    request.decidedAt = new Date();
    await this.requestRepo.save(request);

    const holidayDates = await this.holidaysService.getHolidayDatesForRange(
      new Date(request.startDate),
      new Date(request.endDate),
    );
    const workingDays = calculateWorkingDays(new Date(request.startDate), new Date(request.endDate), holidayDates);
    const startStr = request.startDate instanceof Date ? request.startDate.toISOString().split('T')[0] : String(request.startDate);
    const endStr = request.endDate instanceof Date ? request.endDate.toISOString().split('T')[0] : String(request.endDate);
    void this.notificationsService.sendRequestDeclined(request.user.email, {
      employeeName: request.user.name,
      leaveTypeName: request.leaveType?.name ?? '',
      startDate: startStr,
      endDate: endStr,
      workingDays,
    });

    return this.formatRequest(request, holidayDates);
  }

  async cancel(requestId: string, userId: string) {
    const request = await this.findOneWithRelations(requestId);

    if (request.userId !== userId) {
      throw new ForbiddenException('You can only cancel your own requests');
    }

    if (
      request.status !== LeaveStatus.PENDING &&
      request.status !== LeaveStatus.APPROVED
    ) {
      throw new BadRequestException('Request cannot be cancelled');
    }

    if (request.status === LeaveStatus.APPROVED) {
      const holidayDates = await this.holidaysService.getHolidayDatesForRange(
        new Date(request.startDate),
        new Date(request.endDate),
      );
      const workingDays = calculateWorkingDays(
        new Date(request.startDate),
        new Date(request.endDate),
        holidayDates,
      );

      const year = new Date(request.startDate).getFullYear();
      const balance = await this.balanceRepo.findOne({
        where: {
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      });

      if (balance) {
        balance.usedDays = Math.max(0, Number(balance.usedDays) - workingDays);
        await this.balanceRepo.save(balance);
      }
    }

    request.status = LeaveStatus.CANCELLED;
    await this.requestRepo.save(request);

    const holidayDates = await this.holidaysService.getHolidayDatesForRange(
      new Date(request.startDate),
      new Date(request.endDate),
    );
    return this.formatRequest(request, holidayDates);
  }

  async findByUser(userId: string) {
    const requests = await this.requestRepo.find({
      where: { userId },
      relations: { leaveType: true, approver: true, user: true },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(requests.map((r) => this.formatRequestWithHolidays(r)));
  }

  async findPendingByManager(managerId: string, companyId: string) {
    const requests = await this.requestRepo.find({
      where: { status: LeaveStatus.PENDING, user: { companyId } },
      relations: { user: { department: true }, leaveType: true, approver: true },
      order: { createdAt: 'ASC' },
    });

    const filtered = requests.filter(
      (r) => r.user.department?.managerId === managerId,
    );

    return Promise.all(filtered.map((r) => this.formatRequestWithHolidays(r)));
  }

  async findByCompany(companyId: string, status?: LeaveStatus) {
    const where: Record<string, unknown> = { user: { companyId } };
    if (status) where.status = status;

    const requests = await this.requestRepo.find({
      where,
      relations: { user: true, leaveType: true, approver: true },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(requests.map((r) => this.formatRequestWithHolidays(r)));
  }

  async findByDateRange(
    companyId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const requests = await this.requestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.user', 'user')
      .leftJoinAndSelect('r.leaveType', 'leaveType')
      .leftJoinAndSelect('r.approver', 'approver')
      .where('user.companyId = :companyId', { companyId })
      .andWhere('r.status = :status', { status: LeaveStatus.APPROVED })
      .andWhere('r.start_date <= :endDate', { endDate })
      .andWhere('r.end_date >= :startDate', { startDate })
      .orderBy('user.name', 'ASC')
      .getMany();

    return Promise.all(requests.map((r) => this.formatRequestWithHolidays(r)));
  }

  async findOne(requestId: string) {
    const request = await this.findOneWithRelations(requestId);
    return this.formatRequestWithHolidays(request);
  }

  private async findOneWithRelations(requestId: string) {
    const request = await this.requestRepo.findOne({
      where: { id: requestId },
      relations: { user: true, leaveType: true, approver: true },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    return request;
  }

  private async checkOverlap(
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const overlap = await this.requestRepo
      .createQueryBuilder('r')
      .where('r.user_id = :userId', { userId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [LeaveStatus.PENDING, LeaveStatus.APPROVED],
      })
      .andWhere('r.start_date <= :endDate', { endDate })
      .andWhere('r.end_date >= :startDate', { startDate })
      .getOne();

    if (overlap) {
      throw new BadRequestException(
        'You already have a leave request overlapping these dates',
      );
    }
  }

  private async formatRequestWithHolidays(request: LeaveRequest) {
    const holidayDates = await this.holidaysService.getHolidayDatesForRange(
      new Date(request.startDate),
      new Date(request.endDate),
    );
    return this.formatRequest(request, holidayDates);
  }

  private formatRequest(
    request: LeaveRequest,
    holidayDates: Set<string>,
  ) {
    const workingDays = calculateWorkingDays(
      new Date(request.startDate),
      new Date(request.endDate),
      holidayDates,
    );

    const startDate =
      request.startDate instanceof Date
        ? request.startDate.toISOString().split('T')[0]
        : String(request.startDate);
    const endDate =
      request.endDate instanceof Date
        ? request.endDate.toISOString().split('T')[0]
        : String(request.endDate);

    return {
      id: request.id,
      userId: request.userId,
      userName: request.user?.name ?? '',
      leaveTypeId: request.leaveTypeId,
      leaveTypeName: request.leaveType?.name ?? '',
      leaveTypeColor: request.leaveType?.color ?? '#0B7A75',
      startDate,
      endDate,
      workingDays,
      status: request.status,
      note: request.note,
      approverId: request.approverId,
      approverName: request.approver?.name ?? null,
      decidedAt: request.decidedAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    };
  }
}
