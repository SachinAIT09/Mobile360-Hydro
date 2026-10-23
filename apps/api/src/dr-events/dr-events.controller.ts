import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import type { DrEvent, DrEventForCustomer, DrEventResultMe, DrRespondRequest, DrResponse } from '@demo/shared';
import { CustomerId, Roles } from '../auth/auth.js';
import { DrEventsService } from './dr-events.service.js';

class RespondDto implements DrRespondRequest {
  @IsIn(['PAUSE', 'REMIND', 'OPT_OUT']) response: DrResponse;
}

@Controller('dr-events')
export class DrEventsController {
  constructor(private readonly drEvents: DrEventsService) {}

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
  start(@Param('id') id: string): Promise<DrEvent> {
    return this.drEvents.start(id);
  }

  @Roles('STAFF')
  @Post(':id/end')
  end(@Param('id') id: string): Promise<DrEvent> {
    return this.drEvents.end(id);
  }
}
