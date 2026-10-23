import { Logger } from '@nestjs/common';
import './config.js'; // loads .env first

/**
 * Database bootstrap, imported first by main.ts.
 *
 * - MONGO_URL set (Docker, MongoDB Atlas, a server's own MongoDB): use it.
 * - MONGO_URL not set: start a built-in MongoDB inside this process (mongodb-memory-server).
 *   Nothing to install. The first start downloads the MongoDB binary once (~100 MB) and caches it.
 *   Data lives in memory: every restart begins from fresh demo data, which suits a demo.
 *
 * Top-level await: modules imported after this one (AppModule) see MONGO_URL already set.
 */
const log = new Logger('Database');
const wanted = (process.env.MONGO_URL || '').trim();

if (!wanted || wanted === 'memory') {
  log.log('MONGO_URL not set: starting the built-in database (first start downloads MongoDB once, please wait)...');
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const server = await MongoMemoryServer.create();
  process.env.MONGO_URL = server.getUri('hydro_one_demo');
  log.log('Built-in database ready (in memory; restarting the app resets the demo data).');
  const stop = () => {
    void server.stop().finally(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  log.log(`Using MongoDB at ${wanted.replace(/\/\/[^@]*@/, '//***@')}`);
}
