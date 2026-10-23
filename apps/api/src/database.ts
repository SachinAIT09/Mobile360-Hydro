import { Logger } from '@nestjs/common';
import './config.js'; // loads .env first

/**
 * Database start-up, called by main.ts after the HTTP port is already open.
 *
 * - MONGO_URL set (Docker compose, MongoDB Atlas, a server's own MongoDB): use it.
 * - MONGO_URL not set: start a built-in MongoDB inside this process (mongodb-memory-server).
 *   Data lives in memory: every restart begins from fresh demo data, which suits a demo.
 *   Locally the first start downloads the MongoDB binary once (~100 MB). The Docker image ships the
 *   binary and points MONGOMS_SYSTEM_BINARY at it, so hosted starts (e.g. Catalyst AppSail) never download.
 *
 * Sets process.env.MONGO_URL before AppModule is imported.
 */
export async function startDatabase(): Promise<void> {
  const log = new Logger('Database');
  const wanted = (process.env.MONGO_URL || '').trim();
  if (wanted && wanted !== 'memory') {
    log.log(`Using MongoDB at ${wanted.replace(/\/\/[^@]*@/, '//***@')}`);
    return;
  }
  const t0 = Date.now();
  const prebuilt = !!process.env.MONGOMS_SYSTEM_BINARY;
  log.log(
    prebuilt
      ? 'MONGO_URL not set: starting the built-in database...'
      : 'MONGO_URL not set: starting the built-in database (first start downloads MongoDB once, please wait)...',
  );
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create({
    // A small cache keeps mongod comfortable next to Node in a 1 GB container; demo data is tiny.
    instance: { args: ['--wiredTigerCacheSizeGB', '0.25'] },
  });
  process.env.MONGO_URL = server.getUri('hydro_one_demo');
  log.log(`Built-in database ready in ${Date.now() - t0} ms (in memory; restarting the app resets the demo data).`);
  const stop = () => {
    void server.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}
