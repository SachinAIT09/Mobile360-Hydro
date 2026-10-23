import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { ServerToClientEvents } from '@demo/shared';
import { AuthTokens, type RequestUser } from '../auth/auth.js';
import { RealtimeService } from './realtime.service.js';

/** Socket.IO on the API's own port. Clients connect with io(API_URL, { auth: { token } }). */
// Ping well inside 30 s so HTTP long-poll requests finish within hosting request limits (Catalyst AppSail: 30 s).
@WebSocketGateway({ cors: { origin: '*' }, pingInterval: 20000, pingTimeout: 20000 })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('Socket');

  constructor(
    private readonly tokens: AuthTokens,
    private readonly realtime: RealtimeService,
  ) {}

  afterInit(server: Server<Record<string, never>, ServerToClientEvents>) {
    this.realtime.attach(server);
  }

  handleConnection(client: Socket) {
    const auth = client.handshake.auth as { token?: string } | undefined;
    const q = client.handshake.query as Record<string, string | undefined>;
    const user = this.tokens.verify(auth?.token ?? q?.token);
    if (!user) {
      client.disconnect(true);
      return;
    }
    (client.data as { user?: RequestUser }).user = user;
    if (user.role === 'STAFF') {
      void client.join('staff');
      this.realtime.trackStaff(1);
    } else if (user.customerId) {
      void client.join(`customer:${user.customerId}`);
      this.realtime.trackCustomer(user.customerId, 1);
    }
    this.log.log(`connected ${user.role}${user.customerId ? ' ' + user.customerId : ''}`);
  }

  handleDisconnect(client: Socket) {
    const user = (client.data as { user?: RequestUser }).user;
    if (!user) return;
    if (user.role === 'STAFF') this.realtime.trackStaff(-1);
    else if (user.customerId) this.realtime.trackCustomer(user.customerId, -1);
  }
}
