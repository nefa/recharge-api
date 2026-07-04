import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { Invite } from '../entities/invite.entity';
import { User } from '../entities/user.entity';
import { Role } from '../entities/enums';
import { LeaveBalancesService } from '../leave-balances/leave-balances.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';

@Injectable()
export class InvitesService {
  constructor(
    @InjectRepository(Invite) private inviteRepo: Repository<Invite>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
    private leaveBalancesService: LeaveBalancesService,
    private notificationsService: NotificationsService,
  ) {}

  async create(companyId: string, dto: CreateInviteDto) {
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    const existingInvite = await this.inviteRepo.findOne({
      where: { email: dto.email, companyId },
    });
    if (existingInvite && !existingInvite.usedAt && existingInvite.expiresAt > new Date()) {
      throw new ConflictException('An active invite already exists for this email');
    }

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const invite = this.inviteRepo.create({
      token,
      email: dto.email,
      companyId,
      role: dto.role ?? Role.EMPLOYEE,
      expiresAt,
    });

    const saved = await this.inviteRepo.save(invite);

    const company = await this.inviteRepo.findOne({
      where: { id: saved.id },
      relations: { company: true },
    });
    void this.notificationsService.sendInviteEmail(
      dto.email,
      company?.company?.name ?? '',
      saved.token,
    );

    return saved;
  }

  async validate(token: string) {
    const invite = await this.inviteRepo.findOne({
      where: { token },
      relations: { company: true },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.usedAt) {
      throw new BadRequestException('Invite has already been used');
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    return {
      email: invite.email,
      companyName: invite.company?.name ?? '',
      role: invite.role,
    };
  }

  async accept(token: string, dto: AcceptInviteDto) {
    const invite = await this.inviteRepo.findOne({
      where: { token },
      relations: { company: true },
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }
    if (invite.usedAt) {
      throw new BadRequestException('Invite has already been used');
    }
    if (invite.expiresAt < new Date()) {
      throw new BadRequestException('Invite has expired');
    }

    const existingUser = await this.userRepo.findOne({
      where: { email: invite.email },
    });
    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
    }

    return this.dataSource.transaction(async (manager) => {
      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = manager.create(User, {
        email: invite.email,
        name: dto.name,
        passwordHash,
        role: invite.role,
        companyId: invite.companyId,
      });
      await manager.save(user);

      invite.usedAt = new Date();
      await manager.save(invite);

      const currentYear = new Date().getFullYear();
      await this.leaveBalancesService.createDefaults(
        user.id,
        invite.companyId,
        currentYear,
        manager,
      );

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        companyName: invite.company?.name ?? '',
      };
    });
  }

  async listByCompany(companyId: string) {
    return this.inviteRepo.find({
      where: { companyId },
      order: { createdAt: 'DESC' },
    });
  }
}
