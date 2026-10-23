/**
 * CLI: `pnpm seed` seeds an empty database; `pnpm seed:reset` drops the demo data and reseeds.
 * Running API clients are not notified by this CLI — use the Reset button on /demo for that.
 */
import 'reflect-metadata';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Db } from '../db/db.service.js';
import { ALL_SCHEMAS } from '../db/schemas.js';
import { SeedService } from './seed.service.js';

async function main() {
  const reset = process.argv.includes('--reset');
  const conn = await mongoose.createConnection(config.mongoUrl).asPromise();
  for (const { name, schema } of ALL_SCHEMAS) conn.model(name, schema);
  const seed = new SeedService(new Db(conn));
  if (reset) {
    await seed.reset();
    console.log('Demo data reset.');
  } else if (await seed.seedIfEmpty()) {
    console.log('Demo data seeded.');
  } else {
    console.log('Database already has demo data (use `pnpm seed:reset` to start over).');
  }
  await conn.close();
}

main().catch((e: unknown) => {
  console.error('Seed failed:', (e as Error).message);
  console.error(`Is MongoDB running at ${config.mongoUrl}? Try: docker compose up -d mongo`);
  process.exit(1);
});
