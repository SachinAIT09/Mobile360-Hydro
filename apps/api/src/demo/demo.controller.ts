import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { IsBoolean, IsOptional } from 'class-validator';
import type { Request } from 'express';
import QRCode from 'qrcode';
import type { DemoPhone, DemoResetRequest, DemoState } from '@demo/shared';
import { Roles } from '../auth/auth.js';
import { config } from '../config.js';
import { nextEventWindow } from '../common/time.js';
import { QR_OPTIONS } from '../static.js';
import { phoneAppUrl } from './phone-url.js';
import { SimulationScheduler } from '../campaigns/simulation.scheduler.js';
import { CustomersService } from '../customers/customers.service.js';
import { Db } from '../db/db.service.js';
import { DrEventsService } from '../dr-events/dr-events.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { SeedService } from '../seed/seed.service.js';

class DemoResetDto implements DemoResetRequest {
  @IsOptional() @IsBoolean() keepSessions?: boolean;
}

@Roles('STAFF')
@Controller('demo')
export class DemoController {
  constructor(
    private readonly db: Db,
    private readonly customers: CustomersService,
    private readonly drEvents: DrEventsService,
    private readonly realtime: RealtimeService,
    private readonly seed: SeedService,
    private readonly scheduler: SimulationScheduler,
  ) {}

  @Get('state')
  async state(@Req() req: Request): Promise<DemoState> {
    const now = new Date();
    const window = nextEventWindow(now);
    const [demo, cfg, activeDrEvent] = await Promise.all([
      this.db.customers.find({ demoRole: { $ne: null } }).lean(),
      this.db.config.findOne({ key: 'main' }).lean(),
      this.drEvents.latestOpen(),
    ]);
    const customers = await Promise.all(
      demo
        .sort((a, b) => (a.demoRole === 'UNENROLLED_DEMO' ? -1 : 1) - (b.demoRole === 'UNENROLLED_DEMO' ? -1 : 1))
        .map(async (c) => ({
          customerId: String(c._id),
          firstName: c.firstName,
          email: c.email,
          feederCode: c.feederCode,
          evStatus: (await this.customers.evStatus(c)).status,
          role: (c.demoRole ?? 'UNENROLLED_DEMO') as 'UNENROLLED_DEMO' | 'ENROLLED_DEMO',
          online: this.realtime.isOnline(String(c._id)),
        })),
    );
    return {
      customers,
      staffSockets: this.realtime.staffSockets(),
      activeDrEvent,
      lastReset: (cfg?.lastReset ?? now).toISOString(),
      serverTime: now.toISOString(),
      timezone: config.timezone,
      evAlwaysCharging: config.evAlwaysCharging,
      nextEventWindow: { start: window.start.toISOString(), end: window.end.toISOString() },
      phoneAppUrl: phoneAppUrl(req),
    };
  }

  /** URL + QR code for opening the customer app on a phone on the same network (same as the start page). */
  @Get('phone')
  async phone(@Req() req: Request): Promise<DemoPhone> {
    const url = phoneAppUrl(req);
    return { url, qrSvg: await QRCode.toString(url, QR_OPTIONS) };
  }

  /**
   * Drop everything and re-seed; every client is told to refetch. Demo ids are stable across resets, so
   * with keepSessions (default) customers stay signed in; keepSessions=false asks them to sign out.
   */
  @Post('reset')
  async reset(@Body() body: DemoResetDto): Promise<{ ok: true }> {
    const keepSessions = body?.keepSessions ?? true;
    this.scheduler.clearAll();
    await this.seed.reset();
    this.realtime.toAll('demo:reset', { keepSessions });
    return { ok: true };
  }
}
