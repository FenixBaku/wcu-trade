import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RoleName } from '@prisma/client';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  private async issueTokens(
    userId: string,
    email: string,
    roles: RoleName[],
    meta: { ip?: string; userAgent?: string },
  ): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, roles },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<number>('jwt.accessTtl'),
      },
    );
    const jti = randomUUID();
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, jti },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<number>('jwt.refreshTtl'),
      },
    );
    const ttl = this.config.get<number>('jwt.refreshTtl')!;
    await this.prisma.authSession.create({
      data: {
        id: jti,
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        userAgent: meta.userAgent,
        ip: meta.ip,
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });
    return { accessToken, refreshToken };
  }

  async login(email: string, password: string, meta: { ip?: string; userAgent?: string }) {
    const user = await this.validateUser(email, password);
    const roles = user.roles.map((r) => r.role.name);
    const tokens = await this.issueTokens(user.id, user.email, roles, meta);
    return {
      ...tokens,
      user: { id: user.id, email: user.email, fullName: user.fullName, roles, avatarUrl: user.avatarUrl },
    };
  }

  /** Rotating refresh: verify, revoke the old session, issue a fresh pair. */
  async refresh(refreshToken: string, meta: { ip?: string; userAgent?: string }) {
    let payload: { sub: string; jti: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const session = await this.prisma.authSession.findUnique({ where: { id: payload.jti } });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.refreshTokenHash !== this.hashToken(refreshToken)
    ) {
      throw new UnauthorizedException('Refresh token no longer valid');
    }
    await this.prisma.authSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const roles = user.roles.map((r) => r.role.name);
    return this.issueTokens(user.id, user.email, roles, meta);
  }

  async logout(userId: string) {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
