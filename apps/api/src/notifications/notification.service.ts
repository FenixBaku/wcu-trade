import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { NotificationType } from '@prisma/client';
import { WS_TOPICS } from '@wcu/shared';

@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: RealtimeGateway,
  ) {}

  async push(userId: string, type: NotificationType, title: string, body: string, payload?: unknown) {
    const n = await this.prisma.notification.create({
      data: { userId, type, title, body, payload: payload as any },
    });
    this.gateway.emitToUser(userId, WS_TOPICS.notifications(userId), n);
    return n;
  }

  async list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
