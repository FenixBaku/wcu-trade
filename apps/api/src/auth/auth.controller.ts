import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto } from './dto';
import { Public, CurrentUser, JwtUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards';
import { AuditService } from '../audit/audit.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: any) {
    const meta = { ip: req.ip, userAgent: req.headers['user-agent'] };
    const result = await this.auth.login(dto.email, dto.password, meta);
    await this.audit.log({ actorId: result.user.id, action: 'auth.login', ip: req.ip });
    return result;
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: any) {
    return this.auth.refresh(dto.refreshToken, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: JwtUser, @Req() req: any) {
    await this.audit.log({ actorId: user.sub, action: 'auth.logout', ip: req.ip });
    return this.auth.logout(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return { id: user.sub, email: user.email, roles: user.roles };
  }
}
