import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';

/** Domain-specific trading error → professional UI message with a stable code. */
export class TradingError extends BadRequestException {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super({ code, message });
  }
}

// Catalogue of professional financial error messages (§53).
export const TradingErrors = {
  INSUFFICIENT_BALANCE: () =>
    new TradingError('INSUFFICIENT_BALANCE', 'Insufficient virtual balance for this order.'),
  INSUFFICIENT_MARGIN: () =>
    new TradingError('INSUFFICIENT_MARGIN', 'Insufficient margin available for this position.'),
  INVALID_QUANTITY: () =>
    new TradingError('INVALID_QUANTITY', 'Order quantity is invalid.'),
  MARKET_UNAVAILABLE: (s: string) =>
    new TradingError('MARKET_UNAVAILABLE', `Market ${s} is currently unavailable.`),
  MARKET_STALE: (s: string) =>
    new TradingError('MARKET_STALE', `Live data for ${s} is stale — market orders are paused until a fresh quote arrives.`),
  TRADING_SUSPENDED: () =>
    new TradingError('TRADING_SUSPENDED', 'Trading has been suspended by your instructor.'),
  MAX_LEVERAGE_EXCEEDED: (m: number) =>
    new TradingError('MAX_LEVERAGE_EXCEEDED', `Maximum leverage for this class is ${m}x.`),
  SHORT_DISABLED: () =>
    new TradingError('SHORT_DISABLED', 'Short selling is disabled for this class.'),
  INSTRUMENT_NOT_ALLOWED: (s: string) =>
    new TradingError('INSTRUMENT_NOT_ALLOWED', `${s} is not permitted for this class.`),
  MARKET_CLOSED: (s: string) =>
    new TradingError('MARKET_CLOSED', `${s} market is currently closed.`),
  INVALID_STOP_LOSS: () =>
    new TradingError('INVALID_STOP_LOSS', 'Stop loss is on the wrong side of the entry price.'),
  INVALID_TAKE_PROFIT: () =>
    new TradingError('INVALID_TAKE_PROFIT', 'Take profit is on the wrong side of the entry price.'),
  RISK_LIMIT: (msg: string) => new TradingError('RISK_LIMIT', msg),
  POSITION_NOT_FOUND: () =>
    new TradingError('POSITION_NOT_FOUND', 'Position not found or already closed.'),
  ORDER_NOT_FOUND: () => new TradingError('ORDER_NOT_FOUND', 'Order not found.'),
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: any = { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') body = { code: 'ERROR', message: r };
      else {
        const rr = r as any;
        body = {
          code: rr.code ?? (Array.isArray(rr.message) ? 'VALIDATION_ERROR' : 'ERROR'),
          message: Array.isArray(rr.message) ? rr.message.join('; ') : rr.message ?? 'Error',
        };
      }
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    res.status(status).json({ ...body, statusCode: status, path: req.url, timestamp: new Date().toISOString() });
  }
}
