import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MarketSymbol } from '@wcu/shared';

/**
 * Symbol Registry (§9). Normalizes internal symbols (BTC-USDT) to provider
 * symbols (Binance BTCUSDT, TwelveData BTC/USD) — always on the backend.
 */
@Injectable()
export class SymbolRegistryService implements OnModuleInit {
  private readonly logger = new Logger(SymbolRegistryService.name);
  private assets = new Map<string, MarketSymbol & { id: string }>();
  // provider -> internalSymbol -> providerSymbol
  private providerMap = new Map<string, Map<string, string>>();
  // provider -> providerSymbol(lower) -> internalSymbol
  private reverseMap = new Map<string, Map<string, string>>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload() {
    let assets;
    try {
      assets = await this.prisma.asset.findMany({
        where: { active: true },
        include: { providerSymbols: { include: { provider: true } } },
        orderBy: { sortOrder: 'asc' },
      });
    } catch (e) {
      this.logger.warn(`Symbol registry reload skipped (DB unavailable): ${(e as Error).message}`);
      return;
    }
    this.assets.clear();
    this.providerMap.clear();
    this.reverseMap.clear();
    for (const a of assets) {
      this.assets.set(a.symbol, {
        id: a.id,
        symbol: a.symbol,
        base: a.base,
        quote: a.quote,
        name: a.name,
        assetClass: a.assetClass as any,
        pricePrecision: a.pricePrecision,
        qtyPrecision: a.qtyPrecision,
      });
      for (const ps of a.providerSymbols) {
        const pname = ps.provider.name;
        if (!this.providerMap.has(pname)) this.providerMap.set(pname, new Map());
        if (!this.reverseMap.has(pname)) this.reverseMap.set(pname, new Map());
        this.providerMap.get(pname)!.set(a.symbol, ps.providerSymbol);
        this.reverseMap.get(pname)!.set(ps.providerSymbol.toLowerCase(), a.symbol);
      }
    }
    this.logger.log(`Symbol registry loaded: ${this.assets.size} assets`);
  }

  all(): (MarketSymbol & { id: string })[] {
    return [...this.assets.values()];
  }

  get(internalSymbol: string) {
    return this.assets.get(internalSymbol);
  }

  assetId(internalSymbol: string): string | undefined {
    return this.assets.get(internalSymbol)?.id;
  }

  toProvider(provider: string, internalSymbol: string): string | undefined {
    return this.providerMap.get(provider)?.get(internalSymbol);
  }

  toInternal(provider: string, providerSymbol: string): string | undefined {
    return this.reverseMap.get(provider)?.get(providerSymbol.toLowerCase());
  }

  internalSymbolsForProvider(provider: string): string[] {
    return [...(this.providerMap.get(provider)?.keys() ?? [])];
  }
}
