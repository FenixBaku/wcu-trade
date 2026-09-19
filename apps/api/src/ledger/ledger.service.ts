import { Injectable } from '@nestjs/common';
import { Prisma, LedgerType } from '@prisma/client';
import { D } from '@wcu/shared';

type Tx = Prisma.TransactionClient;

/**
 * Append-only virtual ledger (§11). Every financial mutation is a signed entry.
 * The account cash balance is kept in lock-step with the entries so that the
 * invariant `cashBalance == Σ entries.amount` always holds.
 * All calls must run inside a transaction that already holds a row lock on the account.
 */
@Injectable()
export class LedgerService {
  async post(
    tx: Tx,
    accountId: string,
    type: LedgerType,
    amount: Prisma.Decimal.Value,
    opts: { refOrderId?: string; refTradeId?: string; memo?: string } = {},
  ) {
    const account = await tx.virtualAccount.findUniqueOrThrow({ where: { id: accountId } });
    const balanceAfter = D(account.cashBalance.toString()).plus(amount);
    await tx.ledgerEntry.create({
      data: {
        accountId,
        type,
        amount: amount.toString(),
        balanceAfter: balanceAfter.toString(),
        refOrderId: opts.refOrderId,
        refTradeId: opts.refTradeId,
        memo: opts.memo,
      },
    });
    await tx.virtualAccount.update({
      where: { id: accountId },
      data: { cashBalance: balanceAfter.toString() },
    });
    return balanceAfter;
  }

  /** Adjust the account's cumulative realized P&L counter (derived total also recomputable). */
  async addRealizedPnl(tx: Tx, accountId: string, pnl: Prisma.Decimal.Value) {
    const account = await tx.virtualAccount.findUniqueOrThrow({ where: { id: accountId } });
    const next = D(account.realizedPnl.toString()).plus(pnl);
    await tx.virtualAccount.update({
      where: { id: accountId },
      data: { realizedPnl: next.toString() },
    });
  }
}
