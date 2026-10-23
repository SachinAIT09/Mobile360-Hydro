import 'reflect-metadata';
import './database.js'; // must stay before AppModule: sets MONGO_URL (built-in DB when not configured)
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { config } from './config.js';
import { AppModule } from './app.module.js';
import { mountStatic } from './static.js';
import { BRAND } from '@demo/shared';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: { origin: true, credentials: true } });
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

  await app.listen(config.port, '0.0.0.0');
  const base = `http://localhost:${config.port}`;
  // Plain console output on purpose: Nest's route log above is long, this must be the obvious last thing on screen.
  console.log(
    [
      '',
      '  ============================================================',
      `   ${BRAND.utilityName} EV & Energy demo is running`,
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

void bootstrap();
