import { Body, Controller, Get, Patch, Query, BadRequestException } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import type {
  AutoPayUpdateRequest,
  Bill,
  BillSummary,
  Channels,
  CustomerProfile,
  EnergyRange,
  EnergyReading,
  EnergySummary,
  MeSummary,
  Outage,
  PaymentMethodKind,
  Program,
  UsageMonth,
} from '@demo/shared';
import { CustomerId, Roles } from '../auth/auth.js';
import { Db } from '../db/db.service.js';
import { EnergyService } from '../energy/energy.service.js';
import { CustomersService } from './customers.service.js';

class ChannelsDto implements Channels {
  @IsBoolean() push: boolean;
  @IsBoolean() sms: boolean;
  @IsBoolean() email: boolean;
}

class AutoPayDto implements AutoPayUpdateRequest {
  @IsBoolean() enabled: boolean;
  @IsOptional() @IsIn(['SAVED_CARD', 'BANK_PAD', 'WALLET']) method?: PaymentMethodKind;
}

const RANGES: EnergyRange[] = ['day', 'week', 'month', 'year'];

/** Customer-facing read endpoints (mobile app). */
@Roles('CUSTOMER')
@Controller()
export class MeController {
  constructor(
    private readonly customers: CustomersService,
    private readonly energy: EnergyService,
    private readonly db: Db,
  ) {}

  @Get('me/summary')
  summary(@CustomerId() id: string): Promise<MeSummary> {
    return this.customers.summary(id);
  }

  @Patch('me/channels')
  channels(@CustomerId() id: string, @Body() body: ChannelsDto): Promise<Channels> {
    return this.customers.updateChannels(id, { push: body.push, sms: body.sms, email: body.email });
  }

  /** Turn AutoPay on (method required) or off. Demo only: no real payment details are stored. */
  @Patch('me/autopay')
  autoPay(@CustomerId() id: string, @Body() body: AutoPayDto): Promise<CustomerProfile> {
    if (body.enabled && !body.method) throw new BadRequestException('method is required when enabling AutoPay');
    return this.customers.updateAutoPay(id, body.enabled, body.enabled ? (body.method as PaymentMethodKind) : null);
  }

  @Get('energy/live')
  live(@CustomerId() id: string): Promise<EnergyReading> {
    return this.energy.live(id);
  }

  @Get('energy/summary')
  energySummary(@CustomerId() id: string, @Query('range') range = 'day'): Promise<EnergySummary> {
    if (!RANGES.includes(range as EnergyRange)) throw new BadRequestException(`range must be one of ${RANGES.join(', ')}`);
    return this.energy.summary(id, range as EnergyRange);
  }

  @Get('bills')
  bills(@CustomerId() id: string): Promise<BillSummary[]> {
    return this.customers.bills(id);
  }

  @Get('bills/current')
  async bill(@CustomerId() id: string): Promise<Bill> {
    return this.customers.bill(await this.customers.get(id));
  }

  @Get('bills/usage-history')
  usage(@CustomerId() id: string): Promise<UsageMonth[]> {
    return this.customers.usageHistory(id);
  }

  @Get('outages/near-me')
  async outage(@CustomerId() id: string): Promise<Outage | null> {
    return this.customers.nearbyOutage(await this.customers.get(id));
  }

  @Get('programs/current')
  async program(): Promise<Program> {
    const p = await this.db.programs.findOne().lean();
    if (!p) throw new BadRequestException('No program configured');
    return CustomersService.program(p);
  }
}
