import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Types } from 'mongoose';
import type { OutageReportRequest, OutageReportResponse, OutageReportType } from '@demo/shared';
import { CurrentUser, OptionalAuth, type RequestUser } from '../auth/auth.js';
import { Db } from '../db/db.service.js';
import { CustomersService } from '../customers/customers.service.js';

class OutageReportDto implements OutageReportRequest {
  @IsIn(['NO_POWER', 'PARTIAL', 'FLICKER']) type: OutageReportType;
  @IsBoolean() notifyOnRestore: boolean;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) address?: string;
}

@Controller('outage-reports')
export class OutagesController {
  constructor(private readonly db: Db) {}

  /** Signed-in customers report for their premise; anonymous callers must give an address. */
  @OptionalAuth()
  @Post()
  async report(@CurrentUser() user: RequestUser | null, @Body() body: OutageReportDto): Promise<OutageReportResponse> {
    const customer = user?.customerId ? await this.db.customers.findById(user.customerId).lean() : null;
    const address = customer?.address ?? body.address;
    if (!address) throw new BadRequestException('Please enter the address without power');
    const outage = customer
      ? await this.db.outages.findOne({ substationCode: customer.substationCode, status: { $ne: 'RESTORED' } }).lean()
      : await this.db.outages.findOne({ status: { $ne: 'RESTORED' } }).lean();
    const reference = `OR-${Math.floor(100000 + Math.random() * 899999)}`;
    const doc = await this.db.outageReports.create({
      customerId: customer ? customer._id : null,
      address,
      type: body.type,
      notifyOnRestore: body.notifyOnRestore,
      reference,
      outageId: outage ? (outage._id as Types.ObjectId) : null,
      createdAt: new Date(),
    });
    return { id: String(doc._id), reference, linkedOutage: outage ? CustomersService.outage(outage) : null };
  }
}
