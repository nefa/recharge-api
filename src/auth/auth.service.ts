import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../entities/user.entity';
import { Role } from '../entities/enums';
import { Company } from '../entities/company.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { RegisterDto } from './dto/register.dto';
import { LeaveTypesService } from '../leave-types/leave-types.service';
import { HolidaysService } from '../holidays/holidays.service';
import { LeaveBalancesService } from '../leave-balances/leave-balances.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(RefreshToken) private refreshTokenRepo: Repository<RefreshToken>,
    private jwtService: JwtService,
    private config: ConfigService,
    private dataSource: DataSource,
    private leaveTypesService: LeaveTypesService,
    private holidaysService: HolidaysService,
    private leaveBalancesService: LeaveBalancesService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.userRepo.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    return this.dataSource.transaction(async (manager) => {
      const company = manager.create(Company, { name: dto.companyName });
      await manager.save(company);

      const passwordHash = await bcrypt.hash(dto.password, 12);
      const user = manager.create(User, {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: Role.ADMIN,
        companyId: company.id,
      });
      await manager.save(user);

      await this.leaveTypesService.seedDefaults(company.id, manager);
      await this.holidaysService.seed(manager);
      await this.leaveBalancesService.createDefaults(
        user.id,
        company.id,
        new Date().getFullYear(),
        manager,
      );

      const tokens = await this.generateTokens(user, manager);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.sanitizeUser(user, company.name),
      };
    });
  }

  async validateUser(email: string, password: string) {
    const user = await this.userRepo.findOne({
      where: { email },
      relations: { company: true },
    });
    if (!user) return null;

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return null;

    return user;
  }

  async login(user: User) {
    const tokens = await this.generateTokens(user);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user, user.company?.name),
    };
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }

    const stored = await this.refreshTokenRepo.findOne({
      where: { token: refreshToken },
      relations: { user: { company: true } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await this.refreshTokenRepo.remove(stored);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.refreshTokenRepo.remove(stored);

    const tokens = await this.generateTokens(stored.user);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(stored.user, stored.user.company?.name),
    };
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    const stored = await this.refreshTokenRepo.findOne({
      where: { token: refreshToken },
    });
    if (stored) await this.refreshTokenRepo.remove(stored);
  }

  private async generateTokens(user: User, manager?: import('typeorm').EntityManager) {
    const payload = {
      sub: user.id,
      companyId: user.companyId,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshToken = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const repo = manager
      ? manager.getRepository(RefreshToken)
      : this.refreshTokenRepo;

    const tokenEntity = repo.create({
      token: refreshToken,
      userId: user.id,
      expiresAt,
    });
    await repo.save(tokenEntity);

    return { accessToken, refreshToken };
  }

  sanitizeUser(user: User, companyName?: string) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      departmentId: user.departmentId,
      companyName: companyName ?? user.company?.name ?? '',
    };
  }
}
