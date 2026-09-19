import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { MarketDataService } from '../market-data/market-data.service';
import { WS_TOPICS } from '@wcu/shared';

/**
 * Socket.IO gateway (§10). One client connection receives market fan-out plus the
 * user's private portfolio/orders/notifications channels. Market data is pushed from
 * the single upstream collector — clients never connect to providers directly.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  @WebSocketServer() server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly md: MarketDataService,
  ) {}

  onModuleInit() {
    // Fan out market updates to symbol rooms.
    this.md.onQuote((q) => this.server?.to(`sym:${q.symbol}`).emit(WS_TOPICS.quote(q.symbol), q));
    this.md.onTrade((t) => this.server?.to(`sym:${t.symbol}`).emit(WS_TOPICS.trade(t.symbol), t));

    // Broadcast market-data status changes each second so clients show LIVE/DELAYED/etc.
    setInterval(() => {
      this.server?.emit('market.status', this.md.health());
    }, 1000).unref?.();
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');
      if (!token) throw new Error('no token');
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.accessSecret'),
      });
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
      client.emit('market.status', this.md.health());
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  onSubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { symbols: string[] }) {
    for (const s of body?.symbols ?? []) client.join(`sym:${s}`);
    // Send an immediate snapshot for each subscribed symbol.
    for (const s of body?.symbols ?? []) {
      const q = this.md.getLatest(s);
      if (q) client.emit(WS_TOPICS.quote(s), q);
    }
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  onUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() body: { symbols: string[] }) {
    for (const s of body?.symbols ?? []) client.leave(`sym:${s}`);
    return { ok: true };
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }
}
