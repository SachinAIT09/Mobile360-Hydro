import type { Db } from '../db/db.service.js';

/** Seeds the audit log at the end of a seed/reset. Filled in by the campaign tools workstream. */
export function seedAudit(db: Db): Promise<void> {
  void db;
  return Promise.resolve();
}
