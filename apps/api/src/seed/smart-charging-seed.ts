import { SMART_CHARGING } from '@demo/shared';
import { prng } from '../common/numbers.js';
import type { Db } from '../db/db.service.js';
import type { CustomerDoc } from '../db/schemas.js';

/** Share of synthetic enrolled EV homes that have smart charging on. */
const SHARE = 0.3;

/**
 * Turns smart charging on (default settings, TOU) for a deterministic ~30% of the synthetic enrolled EV customers
 * (after customers and enrollments are inserted). Demo customers always stay off (smartCharging null).
 */
export async function seedSmartCharging(db: Db, customers: Partial<CustomerDoc>[]): Promise<void> {
  const enrolled = new Set((await db.enrollments.find({ status: 'ACTIVE' }, { customerId: 1 }).lean()).map((e) => String(e.customerId)));
  const rnd = prng(20261023);
  const ids = customers.filter((c) => c.synthetic && enrolled.has(String(c._id))).filter(() => rnd() < SHARE).flatMap((c) => (c._id ? [c._id] : []));
  if (!ids.length) return;
  await db.customers.updateMany(
    { _id: { $in: ids }, synthetic: true },
    {
      $set: {
        smartCharging: {
          enabled: true,
          readyBy: SMART_CHARGING.defaultReadyBy,
          targetKwh: SMART_CHARGING.defaultTargetKwh,
          ratePlan: 'TOU',
          boostUntil: null,
        },
      },
    },
  );
}
