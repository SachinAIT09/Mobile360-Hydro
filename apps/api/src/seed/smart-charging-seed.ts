import type { Db } from '../db/db.service.js';
import type { CustomerDoc } from '../db/schemas.js';

/**
 * Turns smart charging on for a share of the synthetic enrolled EV customers (after customers are inserted).
 * Demo customers always stay off (smartCharging null). Filled in by the smart-charging workstream.
 */
export function seedSmartCharging(db: Db, customers: Partial<CustomerDoc>[]): Promise<void> {
  void db;
  void customers;
  return Promise.resolve();
}
