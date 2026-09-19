import { Controller, Get, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard, RolesGuard } from '../common/guards';
import { Roles } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'UNIVERSITY_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('users')
  async users() {
    const rows = await this.prisma.user.findMany({
      include: { roles: { include: { role: true } }, accounts: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      roles: u.roles.map((r) => r.role.name),
      accounts: u.accounts.length,
    }));
  }

  @Get('audit')
  audit() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  }

  @Get('system/flags')
  flags() {
    return {
      flags: this.config.get('flags'),
      sim: this.config.get('sim'),
      marketDataProvider: this.config.get('marketData.provider'),
    };
  }
}
