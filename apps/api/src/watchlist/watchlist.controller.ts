import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards';
import { CurrentUser, JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { SymbolRegistryService } from '../market-data/symbol-registry.service';

@UseGuards(JwtAuthGuard)
@Controller('watchlist')
export class WatchlistController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: SymbolRegistryService,
  ) {}

  private async ensure(userId: string) {
    let wl = await this.prisma.watchlist.findFirst({ where: { userId } });
    if (!wl) wl = await this.prisma.watchlist.create({ data: { userId } });
    return wl;
  }

  @Get()
  async get(@CurrentUser() user: JwtUser) {
    const wl = await this.ensure(user.sub);
    const items = await this.prisma.watchlistItem.findMany({
      where: { watchlistId: wl.id },
      include: { asset: true },
      orderBy: { sortOrder: 'asc' },
    });
    return items.map((i) => i.asset.symbol);
  }

  @Post(':symbol')
  async add(@CurrentUser() user: JwtUser, @Param('symbol') symbol: string) {
    const wl = await this.ensure(user.sub);
    const assetId = this.registry.assetId(symbol);
    if (!assetId) return { ok: false };
    await this.prisma.watchlistItem.upsert({
      where: { watchlistId_assetId: { watchlistId: wl.id, assetId } },
      create: { watchlistId: wl.id, assetId },
      update: {},
    });
    return { ok: true };
  }

  @Delete(':symbol')
  async remove(@CurrentUser() user: JwtUser, @Param('symbol') symbol: string) {
    const wl = await this.ensure(user.sub);
    const assetId = this.registry.assetId(symbol);
    if (assetId) {
      await this.prisma.watchlistItem.deleteMany({ where: { watchlistId: wl.id, assetId } });
    }
    return { ok: true };
  }
}
