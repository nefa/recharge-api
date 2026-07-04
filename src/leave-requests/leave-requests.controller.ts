import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { LeaveRequestsService } from './leave-requests.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import {
  CurrentUser,
  JwtPayload,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, LeaveStatus } from '../entities/enums';

@Controller('leave-requests')
export class LeaveRequestsController {
  constructor(private leaveRequestsService: LeaveRequestsService) {}

  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveRequestsService.create(
      user.userId,
      user.companyId,
      dto,
    );
  }

  @Get('me')
  async findMine(@CurrentUser() user: JwtPayload) {
    return this.leaveRequestsService.findByUser(user.userId);
  }

  @Get('pending')
  @Roles(Role.ADMIN, Role.MANAGER)
  async findPending(@CurrentUser() user: JwtPayload) {
    if (user.role === Role.ADMIN) {
      return this.leaveRequestsService.findByCompany(
        user.companyId,
        LeaveStatus.PENDING,
      );
    }
    return this.leaveRequestsService.findPendingByManager(
      user.userId,
      user.companyId,
    );
  }

  @Get('company')
  @Roles(Role.ADMIN, Role.MANAGER)
  async findByCompany(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
  ) {
    const leaveStatus = status
      ? (status as LeaveStatus)
      : undefined;
    return this.leaveRequestsService.findByCompany(
      user.companyId,
      leaveStatus,
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leaveRequestsService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles(Role.ADMIN, Role.MANAGER)
  async approve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leaveRequestsService.approve(
      id,
      user.userId,
      user.role,
      user.companyId,
    );
  }

  @Patch(':id/decline')
  @Roles(Role.ADMIN, Role.MANAGER)
  async decline(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leaveRequestsService.decline(
      id,
      user.userId,
      user.role,
      user.companyId,
    );
  }

  @Patch(':id/cancel')
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.leaveRequestsService.cancel(id, user.userId);
  }
}
