import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';
import { User } from '../entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res() res: Response) {
    const result = await this.authService.register(dto);
    this.setRefreshCookie(res, result.refreshToken);
    return res.status(HttpStatus.CREATED).json({
      accessToken: result.accessToken,
      user: result.user,
    });
  }

  @Public()
  @UseGuards(AuthGuard('local'))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Req() req: Request, @Res() res: Response) {
    const result = await this.authService.login(req.user as User);
    this.setRefreshCookie(res, result.refreshToken);
    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response) {
    const oldToken = req.cookies?.['refresh_token'] as string | undefined;
    const result = await this.authService.refresh(oldToken);
    this.setRefreshCookie(res, result.refreshToken);
    return res.json({
      accessToken: result.accessToken,
      user: result.user,
    });
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies?.['refresh_token'] as string | undefined;
    await this.authService.logout(refreshToken);
    res.clearCookie('refresh_token', { path: '/api/auth' });
    return res.json({ ok: true });
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie('refresh_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/api/auth',
    });
  }
}
