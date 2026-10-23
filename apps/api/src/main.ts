import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { config } from './config.js';
import { STARTING_MESSAGE, gateKind, startingPage } from './boot/gate.js';

/**
 * Boot order matters on hosts that kill an app which isn't listening within a few seconds
 * (Catalyst AppSail: 10 s). This file imports only Node's http module and the tiny gate, opens the
 * port and answers "starting" (503) right away. Nest, Express, Socket.IO and the database load
 * afterwards (they take seconds to import and start); Nest and Socket.IO then attach to this server.
 */
const t0 = Date.now();
const state: { ready: boolean; error: string | null; handler: ((req: IncomingMessage, res: ServerResponse) => void) | null } = {
  ready: false,
  error: null,
  handler: null,
};

const server = http.createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const kind = gateKind(state.ready, req.method ?? 'GET', path, req.headers.accept);
  if (kind === 'pass' && state.handler) return state.handler(req, res);
  res.statusCode = 503;
  res.setHeader('Retry-After', '2');
  res.setHeader('Cache-Control', 'no-store');
  if (kind === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(startingPage(state.error));
  } else {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ statusCode: 503, message: state.error ?? STARTING_MESSAGE }));
  }
});

server.listen(config.port, '0.0.0.0', () => {
  console.log(`[Boot] Listening on port ${config.port} after ${Date.now() - t0} ms; starting the app...`);
  void boot();
});

async function boot() {
  try {
    await import('reflect-metadata'); // before any decorated Nest class is evaluated
    const { startDatabase } = await import('./database.js');
    await startDatabase(); // sets MONGO_URL before AppModule is loaded
    const [{ default: express }, { Logger, ValidationPipe }, { NestFactory }, { ExpressAdapter }, { IoAdapter }, { BRAND }] = await Promise.all([
      import('express'),
      import('@nestjs/common'),
      import('@nestjs/core'),
      import('@nestjs/platform-express'),
      import('@nestjs/platform-socket.io'),
      import('@demo/shared'),
    ]);
    const { AppModule } = await import('./app.module.js');
    const { mountStatic } = await import('./static.js');

    const expressApp = express();
    const app = await NestFactory.create<import('@nestjs/platform-express').NestExpressApplication>(AppModule, new ExpressAdapter(expressApp), {
      cors: { origin: true, credentials: true },
    });
    app.useWebSocketAdapter(new IoAdapter(server)); // Socket.IO on the server that is already listening
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidUnknownValues: false }));
    app.enableShutdownHooks();
    app.set('trust proxy', true);
    mountStatic(app);

    try {
      const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .setTitle(`${BRAND.utilityName} EV & Energy demo API`)
          .setDescription(`${BRAND.vendorName} concept demo. Contract types live in packages/shared. Sample data only.`)
          .setVersion('1.0')
          .addBearerAuth()
          .build(),
      );
      SwaggerModule.setup('docs', app, doc);
    } catch (e) {
      new Logger('Swagger').warn(`Swagger disabled: ${(e as Error).message}`);
    }

    await app.init(); // runs the seed (empty database) and starts the timers
    state.handler = expressApp;
    state.ready = true;
    new Logger('Boot').log(`Ready after ${Date.now() - t0} ms`);
    printBanner(BRAND.utilityName);
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
    console.error(`[Boot] Start-up failed: ${state.error}`, e);
    // Let the host restart the process; keep the error page up briefly for anyone watching.
    setTimeout(() => process.exit(1), 5000).unref();
  }
}

function printBanner(utilityName: string) {
  const base = `http://localhost:${config.port}`;
  // Plain console output on purpose: Nest's route log above is long, this must be the obvious last thing on screen.
  console.log(
    [
      '',
      '  ============================================================',
      `   ${utilityName} EV & Energy demo is running`,
      '',
      `   Start page     ${base}/`,
      `   Staff web app  ${base}/staff`,
      `   Customer app   ${base}/app`,
      `   API            ${base}/api   (Swagger: ${base}/docs)`,
      '',
      '   Press Ctrl+C to stop.',
      '  ============================================================',
      '',
    ].join('\n'),
  );
}
