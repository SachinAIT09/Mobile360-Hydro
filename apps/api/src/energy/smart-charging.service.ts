import { Injectable, NotImplementedException } from '@nestjs/common';
import type { RatePlanComparison, SmartChargingPlan, SmartChargingUpdateRequest } from '@demo/shared';
import type { CustomerDoc } from '../db/schemas.js';

/** Smart-charging settings, planner and rate-plan comparison. Filled in by the smart-charging workstream. */
@Injectable()
export class SmartChargingService {
  get(customerId: string): Promise<SmartChargingPlan> {
    void customerId;
    return Promise.reject(new NotImplementedException('Smart charging is not implemented yet'));
  }

  update(customerId: string, dto: SmartChargingUpdateRequest): Promise<SmartChargingPlan> {
    void customerId;
    void dto;
    return Promise.reject(new NotImplementedException('Smart charging is not implemented yet'));
  }

  /** Charge now for one hour, regardless of the plan. */
  boost(customerId: string): Promise<SmartChargingPlan> {
    void customerId;
    return Promise.reject(new NotImplementedException('Smart charging is not implemented yet'));
  }

  ratePlans(customerId: string): Promise<RatePlanComparison> {
    void customerId;
    return Promise.reject(new NotImplementedException('Smart charging is not implemented yet'));
  }

  /** The plan in force for this customer at `at`, or null when smart charging is off (energy model unchanged). */
  planFor(customer: CustomerDoc, at: Date = new Date()): Promise<SmartChargingPlan | null> {
    void customer;
    void at;
    return Promise.resolve(null);
  }
}
