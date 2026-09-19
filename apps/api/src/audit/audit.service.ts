import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditInput {
  actorId?: string | null;
  action: string;
  target?: string;
  oldData?: unknown;
  newData?: unknown;
  ip?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: input.actorId ?? null,
          action: input.action,
          target: input.target,
          oldData: input.oldData as any,
          newData: input.newData as any,
          ip: input.ip,
          requestId: input.requestId,
        },
      });
    } catch (e) {
      // Audit must never break the primary operation.
      this.logger.warn(`Failed to write audit log for ${input.action}: ${(e as Error).message}`);
    }
  }
}
