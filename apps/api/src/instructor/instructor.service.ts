import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TradingService } from '../trading/trading.service';
import { NotificationService } from '../notifications/notification.service';
import { D } from '@wcu/shared';

/**
 * Instructor controls (§26, §55). Classes, risk settings, freeze/suspend, close-all,
 * and non-destructive account reset (archives the prior session).
 */
@Injectable()
export class InstructorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly trading: TradingService,
    private readonly notifications: NotificationService,
  ) {}

  async createClass(instructorId: string, data: any) {
    const cls = await this.prisma.class.create({
      data: {
        name: data.name,
        code: data.code,
        instructorId,
        startingBalance: (data.startingBalance ?? 100000).toString(),
        maxLeverage: data.maxLeverage ?? 10,
        marginEnabled: data.marginEnabled ?? true,
        shortEnabled: data.shortEnabled ?? true,
        makerFeeBps: data.makerFeeBps ?? 10,
        takerFeeBps: data.takerFeeBps ?? 10,
        maxCryptoPct: (data.maxCryptoPct ?? 100).toString(),
        confirmOrders: data.confirmOrders ?? true,
      },
    });
    await this.audit.log({ actorId: instructorId, action: 'class.create', target: cls.id, newData: data });
    return cls;
  }

  async listClasses(instructorId: string) {
    return this.prisma.class.findMany({
      where: { instructorId },
      include: { students: { include: { user: true } } },
    });
  }

  async classStudents(instructorId: string, classId: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, instructorId } });
    if (!cls) throw new ForbiddenException();
    const members = await this.prisma.classStudent.findMany({
      where: { classId },
      include: { user: { include: { accounts: true } } },
    });
    return members.map((m) => ({
      userId: m.userId,
      fullName: m.user.fullName,
      email: m.user.email,
      accountStatus: m.user.accounts[0]?.status ?? null,
      cashBalance: m.user.accounts[0]?.cashBalance?.toString() ?? null,
    }));
  }

  async updateRiskSettings(instructorId: string, classId: string, settings: any) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, instructorId } });
    if (!cls) throw new ForbiddenException();
    const updated = await this.prisma.class.update({
      where: { id: classId },
      data: {
        maxLeverage: settings.maxLeverage ?? cls.maxLeverage,
        marginEnabled: settings.marginEnabled ?? cls.marginEnabled,
        shortEnabled: settings.shortEnabled ?? cls.shortEnabled,
        makerFeeBps: settings.makerFeeBps ?? cls.makerFeeBps,
        takerFeeBps: settings.takerFeeBps ?? cls.takerFeeBps,
        maxCryptoPct: (settings.maxCryptoPct ?? cls.maxCryptoPct).toString(),
      },
    });
    await this.audit.log({ actorId: instructorId, action: 'class.risk.update', target: classId, oldData: cls, newData: updated });
    return updated;
  }

  async setAccountStatus(instructorId: string, userId: string, status: 'ACTIVE' | 'FROZEN' | 'SUSPENDED') {
    const account = await this.prisma.virtualAccount.findFirst({ where: { userId, status: { not: 'ARCHIVED' } } });
    if (!account) throw new NotFoundException('Account not found');
    await this.prisma.virtualAccount.update({ where: { id: account.id }, data: { status } });
    await this.audit.log({ actorId: instructorId, action: `account.status.${status}`, target: account.id });
    return { ok: true, status };
  }

  /** Non-destructive reset (§55): archive current account + history, open a fresh one. */
  async resetAccount(
    instructorId: string,
    userId: string,
    opts: { newBalance?: number; closePositions?: boolean; cancelOrders?: boolean } = {},
  ) {
    const account = await this.prisma.virtualAccount.findFirst({ where: { userId, status: { not: 'ARCHIVED' } } });
    if (!account) throw new NotFoundException('Account not found');

    if (opts.closePositions !== false) {
      try {
        await this.trading.closeAll(userId);
      } catch {
        /* ignore in reset */
      }
    }
    if (opts.cancelOrders !== false) {
      await this.prisma.order.updateMany({
        where: { accountId: account.id, status: { in: ['OPEN', 'NEW', 'PARTIALLY_FILLED'] } },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }

    // Archive the previous account (history preserved), open a fresh one.
    await this.prisma.virtualAccount.update({ where: { id: account.id }, data: { status: 'ARCHIVED' } });
    const newBalance = D(opts.newBalance ?? account.startingBalance.toString());
    const fresh = await this.prisma.virtualAccount.create({
      data: {
        userId,
        currency: account.currency,
        cashBalance: newBalance.toString(),
        startingBalance: newBalance.toString(),
        defaultLeverage: account.defaultLeverage,
      },
    });
    await this.prisma.ledgerEntry.create({
      data: {
        accountId: fresh.id,
        type: 'INITIAL_DEPOSIT',
        amount: newBalance.toString(),
        balanceAfter: newBalance.toString(),
        memo: 'Account reset — new simulation session',
      },
    });
    await this.audit.log({ actorId: instructorId, action: 'account.reset', target: account.id, newData: { newBalance: newBalance.toString() } });
    return { ok: true, accountId: fresh.id, startingBalance: newBalance.toString() };
  }
}
