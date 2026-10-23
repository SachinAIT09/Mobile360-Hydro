import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ServerToClientEvents } from '@demo/shared';

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>;

/**
 * Emit helpers. The gateway hands over the Socket.IO server in afterInit.
 * Rooms: "staff" for staff sockets, "customer:<id>" for each customer.
 */
@Injectable()
export class RealtimeService {
  private server: Server<Record<string, never>, ServerToClientEvents> | null = null;
  private readonly log = new Logger('Realtime');
  /** customerId -> number of connected sockets */
  private readonly online = new Map<string, number>();
  private staffCount = 0;

  attach(server: Server<Record<string, never>, ServerToClientEvents>) {
    this.server = server;
  }

  trackCustomer(customerId: string, delta: 1 | -1) {
    const n = (this.online.get(customerId) ?? 0) + delta;
    if (n <= 0) this.online.delete(customerId);
    else this.online.set(customerId, n);
  }
  trackStaff(delta: 1 | -1) {
    this.staffCount = Math.max(0, this.staffCount + delta);
  }
  onlineCustomerIds(): string[] {
    return [...this.online.keys()];
  }
  isOnline(customerId: string): boolean {
    return this.online.has(customerId);
  }
  staffSockets(): number {
    return this.staffCount;
  }

  toStaff<E extends EventName>(event: E, ...args: Payload<E>) {
    this.emit('staff', event, args);
  }
  toCustomer<E extends EventName>(customerId: string, event: E, ...args: Payload<E>) {
    this.emit(`customer:${customerId}`, event, args);
  }
  toAll<E extends EventName>(event: E, ...args: Payload<E>) {
    if (!this.server) return;
    (this.server.emit as (ev: string, ...a: unknown[]) => boolean)(event, ...args);
  }

  private emit(room: string, event: EventName, args: unknown[]) {
    if (!this.server) {
      this.log.debug(`socket server not ready; dropped ${event}`);
      return;
    }
    (this.server.to(room).emit as (ev: string, ...a: unknown[]) => boolean)(event, ...args);
  }
}
