import { PrismaClient, RoleName, AssetClass } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const START_BALANCE = '100000';
const PASSWORD = 'Passw0rd!';

// symbol, base, quote, name, class, pricePrec, qtyPrec, binanceSymbol?, marketHours
const ASSETS: [string, string, string, string, AssetClass, number, number, string | null, string][] = [
  ['BTC-USDT', 'BTC', 'USDT', 'Bitcoin', 'CRYPTO', 2, 6, 'BTCUSDT', '24/7'],
  ['ETH-USDT', 'ETH', 'USDT', 'Ethereum', 'CRYPTO', 2, 5, 'ETHUSDT', '24/7'],
  ['SOL-USDT', 'SOL', 'USDT', 'Solana', 'CRYPTO', 3, 3, 'SOLUSDT', '24/7'],
  ['BNB-USDT', 'BNB', 'USDT', 'BNB', 'CRYPTO', 2, 4, 'BNBUSDT', '24/7'],
  ['XRP-USDT', 'XRP', 'USDT', 'XRP', 'CRYPTO', 4, 1, 'XRPUSDT', '24/7'],
  ['ADA-USDT', 'ADA', 'USDT', 'Cardano', 'CRYPTO', 4, 1, 'ADAUSDT', '24/7'],
  ['DOGE-USDT', 'DOGE', 'USDT', 'Dogecoin', 'CRYPTO', 5, 0, 'DOGEUSDT', '24/7'],
  // Non-crypto: no live provider in Phase 1 (kept honest — shown as data-unavailable until a provider key is configured)
  ['EUR-USD', 'EUR', 'USD', 'Euro / US Dollar', 'FOREX', 5, 2, null, 'forex'],
  ['GBP-USD', 'GBP', 'USD', 'Pound / US Dollar', 'FOREX', 5, 2, null, 'forex'],
  ['USD-JPY', 'USD', 'JPY', 'US Dollar / Yen', 'FOREX', 3, 2, null, 'forex'],
  ['XAU-USD', 'XAU', 'USD', 'Gold', 'METAL', 2, 3, null, 'forex'],
  ['XAG-USD', 'XAG', 'USD', 'Silver', 'METAL', 3, 2, null, 'forex'],
  ['AAPL', 'AAPL', 'USD', 'Apple Inc.', 'STOCK', 2, 2, null, 'equity'],
  ['MSFT', 'MSFT', 'USD', 'Microsoft Corp.', 'STOCK', 2, 2, null, 'equity'],
  ['NVDA', 'NVDA', 'USD', 'NVIDIA Corp.', 'STOCK', 2, 2, null, 'equity'],
  ['TSLA', 'TSLA', 'USD', 'Tesla Inc.', 'STOCK', 2, 2, null, 'equity'],
  ['AMZN', 'AMZN', 'USD', 'Amazon.com', 'STOCK', 2, 2, null, 'equity'],
  ['GOOGL', 'GOOGL', 'USD', 'Alphabet Inc.', 'STOCK', 2, 2, null, 'equity'],
  ['META', 'META', 'USD', 'Meta Platforms', 'STOCK', 2, 2, null, 'equity'],
  ['SPX', 'SPX', 'USD', 'S&P 500 Index', 'INDEX', 2, 2, null, 'equity'],
  ['NDX', 'NDX', 'USD', 'NASDAQ 100', 'INDEX', 2, 2, null, 'equity'],
  ['DJI', 'DJI', 'USD', 'Dow Jones', 'INDEX', 2, 2, null, 'equity'],
  ['WTI', 'WTI', 'USD', 'WTI Crude Oil', 'COMMODITY', 2, 2, null, 'equity'],
  ['BRENT', 'BRENT', 'USD', 'Brent Crude', 'COMMODITY', 2, 2, null, 'equity'],
  ['NATGAS', 'NG', 'USD', 'Natural Gas', 'COMMODITY', 3, 2, null, 'equity'],
];

async function main() {
  console.log('Seeding WCU TRADE...');

  // Roles
  const roleIds: Record<string, number> = {};
  for (const name of Object.values(RoleName)) {
    const r = await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
    roleIds[name] = r.id;
  }

  // Market provider
  const binance = await prisma.marketProvider.upsert({
    where: { name: 'binance' },
    create: { name: 'binance', enabled: true },
    update: { enabled: true },
  });

  // Assets + provider symbols
  let sort = 0;
  for (const [symbol, base, quote, name, cls, pp, qp, bin, hours] of ASSETS) {
    const asset = await prisma.asset.upsert({
      where: { symbol },
      create: { symbol, base, quote, name, assetClass: cls, pricePrecision: pp, qtyPrecision: qp, marketHours: hours, sortOrder: sort++ },
      update: { name, pricePrecision: pp, qtyPrecision: qp, marketHours: hours, sortOrder: sort },
    });
    if (bin) {
      await prisma.providerSymbol.upsert({
        where: { providerId_assetId: { providerId: binance.id, assetId: asset.id } },
        create: { providerId: binance.id, assetId: asset.id, providerSymbol: bin },
        update: { providerSymbol: bin },
      });
    }
  }

  // Users
  const hash = await bcrypt.hash(PASSWORD, 10);
  async function createUser(email: string, fullName: string, roles: RoleName[]) {
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, fullName, passwordHash: hash },
      update: { fullName },
    });
    for (const role of roles) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: roleIds[role] } },
        create: { userId: user.id, roleId: roleIds[role] },
        update: {},
      });
    }
    return user;
  }

  const admin = await createUser('admin@wcu.edu', 'System Administrator', ['SUPER_ADMIN', 'UNIVERSITY_ADMIN']);
  const instructor = await createUser('instructor@wcu.edu', 'Dr. Instructor', ['INSTRUCTOR']);
  const student1 = await createUser('student1@wcu.edu', 'Demo Student', ['STUDENT']);
  const student2 = await createUser('student2@wcu.edu', 'Ayla Mammadova', ['STUDENT']);

  // Virtual accounts + initial deposit ledger (only if the student has none)
  async function ensureAccount(userId: string) {
    const existing = await prisma.virtualAccount.findFirst({ where: { userId, status: { not: 'ARCHIVED' } } });
    if (existing) return existing;
    const acc = await prisma.virtualAccount.create({
      data: { userId, cashBalance: START_BALANCE, startingBalance: START_BALANCE, currency: 'USD' },
    });
    await prisma.ledgerEntry.create({
      data: { accountId: acc.id, type: 'INITIAL_DEPOSIT', amount: START_BALANCE, balanceAfter: START_BALANCE, memo: 'Initial virtual deposit' },
    });
    return acc;
  }
  await ensureAccount(student1.id);
  await ensureAccount(student2.id);
  await ensureAccount(instructor.id); // instructor can trade too

  // Class + enrollment
  const cls = await prisma.class.upsert({
    where: { code: 'FIN-302' },
    create: {
      name: 'FIN-302 Trading Lab (Fall 2026)',
      code: 'FIN-302',
      instructorId: instructor.id,
      startingBalance: START_BALANCE,
      maxLeverage: 10,
      startDate: new Date('2026-09-20'),
      endDate: new Date('2026-12-20'),
    },
    update: { instructorId: instructor.id },
  });
  for (const s of [student1, student2]) {
    await prisma.classStudent.upsert({
      where: { classId_userId: { classId: cls.id, userId: s.id } },
      create: { classId: cls.id, userId: s.id },
      update: {},
    });
  }

  // Default watchlist for student1
  const watchSymbols = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XAU-USD', 'EUR-USD', 'AAPL', 'NVDA', 'SPX'];
  for (const student of [student1, student2]) {
    let wl = await prisma.watchlist.findFirst({ where: { userId: student.id } });
    if (!wl) wl = await prisma.watchlist.create({ data: { userId: student.id } });
    let o = 0;
    for (const sym of watchSymbols) {
      const asset = await prisma.asset.findUnique({ where: { symbol: sym } });
      if (!asset) continue;
      await prisma.watchlistItem.upsert({
        where: { watchlistId_assetId: { watchlistId: wl.id, assetId: asset.id } },
        create: { watchlistId: wl.id, assetId: asset.id, sortOrder: o++ },
        update: { sortOrder: o },
      });
    }
  }

  // Sample competition
  await prisma.competition.upsert({
    where: { id: 'seed-competition' },
    create: {
      id: 'seed-competition',
      name: 'WCU Trading Challenge — Fall 2026',
      startingBalance: START_BALANCE,
      maxLeverage: 5,
      startDate: new Date('2026-10-01'),
      endDate: new Date('2026-10-31'),
    },
    update: {},
  });

  console.log('Seed complete.');
  console.log('Demo logins (password for all: Passw0rd!):');
  console.log('  admin@wcu.edu       (SUPER_ADMIN)');
  console.log('  instructor@wcu.edu  (INSTRUCTOR)');
  console.log('  student1@wcu.edu    (STUDENT)  <- start here');
  console.log('  student2@wcu.edu    (STUDENT)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
