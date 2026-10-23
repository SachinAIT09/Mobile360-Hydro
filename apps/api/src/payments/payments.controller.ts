import { BadRequestException, Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { IsIn, IsMongoId, IsNumber, Min } from 'class-validator';
import { Types } from 'mongoose';
import type { Payment, PaymentMethodKind, PaymentRequest } from '@demo/shared';
import { CustomerId, Roles } from '../auth/auth.js';
import { Db } from '../db/db.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { PaymentProvider } from './payment-provider.js';

class PaymentDto implements PaymentRequest {
  @IsMongoId() billId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsIn(['SAVED_CARD', 'BANK_PAD', 'WALLET']) method: PaymentMethodKind;
}

@Roles('CUSTOMER')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly db: Db,
    private readonly provider: PaymentProvider,
    private readonly realtime: RealtimeService,
  ) {}

  @Post()
  async pay(@CustomerId() customerId: string, @Body() body: PaymentDto): Promise<Payment> {
    const bill = await this.db.bills.findOne({ _id: new Types.ObjectId(body.billId), customerId: new Types.ObjectId(customerId) }).lean();
    if (!bill) throw new NotFoundException('Bill not found');
    if (body.amount > 100000) throw new BadRequestException('Amount too large');
    const charge = await this.provider.charge({ amount: body.amount, method: body.method, reference: String(bill._id) });
    const doc = await this.db.payments.create({
      customerId: new Types.ObjectId(customerId),
      billId: bill._id,
      amount: body.amount,
      method: body.method,
      status: 'CONFIRMED',
      confirmationNo: charge.confirmationNo,
      provider: charge.provider,
      createdAt: new Date(),
    });
    if (body.amount + 0.001 >= bill.total) await this.db.bills.updateOne({ _id: bill._id }, { $set: { status: 'PAID' } });
    this.realtime.toCustomer(customerId, 'me:changed');
    return {
      id: String(doc._id),
      billId: String(bill._id),
      amount: doc.amount,
      method: doc.method,
      status: 'CONFIRMED',
      confirmationNo: doc.confirmationNo,
      provider: 'KUBRA_MOCK',
      createdAt: doc.createdAt.toISOString(),
    };
  }
}
