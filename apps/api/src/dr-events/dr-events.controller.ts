import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { DrEvent, DrEventForCustomer, DrEventResultMe, DrRespondRequest, DrResponse } from '@demo/shared';
import { AuditService, actorFromUser } from '../audit/audit.service.js';
import { CurrentUser, CustomerId, Roles, type RequestUser } from '../auth/auth.js';
import { Db } from '../db/db.service.js';
import { DrEventsService } from './dr-events.service.js';

class RespondDto implements DrRespondRequest {
  @IsIn(['PAUSE', 'REMIND', 'OPT_OUT']) response: DrResponse;
}

@Controller('dr-events')
export class DrEventsController {
  constructor(
    private readonly drEvents: DrEventsService,
    private readonly audit: AuditService,
    private readonly db: Db,
  ) {}

  private async record(user: RequestUser | null, action: 'DR_STARTED' | 'DR_ENDED', e: DrEvent, before: DrEvent['status'] | null) {
    const feeders = e.feederCodes?.length ? e.feederCodes : [e.feederCode];
    const where = feeders.length > 1 ? `${feeders[0]} +${feeders.length - 1}` : feeders[0];
    const summary =
      action === 'DR_STARTED'
        ? `Started the DR event on ${where} now (was scheduled)`
        : `Ended the DR event on ${where}${before === 'ACTIVE' ? '' : ' (fast-forwarded through its planned window)'}`;
    await this.audit.record(await actorFromUser(this.db, user), action, { kind: 'drEvent', id: e.id, label: `DR event · ${where}` }, summary);
  }

  /** Staff list (DR events page). */
  @Roles('STAFF')
  @Get()
  list(): Promise<DrEvent[]> {
    return this.drEvents.list();
  }

  @Roles('CUSTOMER')
  @Get(':id')
  get(@CustomerId() customerId: string, @Param('id') id: string): Promise<DrEventForCustomer> {
    return this.drEvents.forCustomer(customerId, id);
  }

  @Roles('CUSTOMER')
  @Post(':id/responses')
  respond(@CustomerId() customerId: string, @Param('id') id: string, @Body() body: RespondDto): Promise<DrEventForCustomer> {
    return this.drEvents.respond(customerId, id, body.response);
  }

  @Roles('CUSTOMER')
  @Get(':id/result/me')
  result(@CustomerId() customerId: string, @Param('id') id: string): Promise<DrEventResultMe> {
    return this.drEvents.resultMe(customerId, id);
  }

  @Roles('STAFF')
  @Post(':id/start')
  async start(@Param('id') id: string, @CurrentUser() user: RequestUser | null): Promise<DrEvent> {
    const e = await this.drEvents.start(id);
    await this.record(user, 'DR_STARTED', e, 'SCHEDULED');
    return e;
  }

  @Roles('STAFF')
  @Post(':id/end')
  async end(@Param('id') id: string, @CurrentUser() user: RequestUser | null): Promise<DrEvent> {
    const before = (await this.drEvents.getDto(id))?.status ?? null;
    const e = await this.drEvents.end(id);
    // Ending an already-ended event is a no-op and is not audited again.
    if (before !== 'ENDED') await this.record(user, 'DR_ENDED', e, before);
    return e;
  }
}
