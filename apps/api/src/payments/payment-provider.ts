import { Injectable } from '@nestjs/common';
import type { PaymentMethodKind } from '@demo/shared';

export interface ChargeResult {
  confirmationNo: string;
  provider: 'KUBRA_MOCK';
}

/**
 * Payment processor boundary. Production would hand off to Kubra's hosted checkout;
 * the demo never sees or stores card/bank details.
 */
export abstract class PaymentProvider {
  abstract charge(input: { amount: number; method: PaymentMethodKind; reference: string }): Promise<ChargeResult>;
}

@Injectable()
export class MockKubraProvider extends PaymentProvider {
  async charge(): Promise<ChargeResult> {
    const n = Math.floor(10_000_000 + Math.random() * 89_999_999);
    return { confirmationNo: `KB-${n}`, provider: 'KUBRA_MOCK' };
  }
}
