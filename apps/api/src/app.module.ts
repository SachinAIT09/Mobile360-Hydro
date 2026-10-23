import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { config } from './config.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthGuard, AuthTokens } from './auth/auth.js';
import { CampaignStatsService } from './campaigns/campaign-stats.service.js';
import { CampaignsController } from './campaigns/campaigns.controller.js';
import { CampaignsService } from './campaigns/campaigns.service.js';
import { SimulationScheduler } from './campaigns/simulation.scheduler.js';
import { CustomersService } from './customers/customers.service.js';
import { MeController } from './customers/me.controller.js';
import { Db } from './db/db.service.js';
import { ALL_SCHEMAS } from './db/schemas.js';
import { DemoController } from './demo/demo.controller.js';
import { DrEventsController } from './dr-events/dr-events.controller.js';
import { DrEventsService } from './dr-events/dr-events.service.js';
import { EnergyService } from './energy/energy.service.js';
import { EnrollmentsController } from './enrollments/enrollments.controller.js';
import { EnrollmentsService } from './enrollments/enrollments.service.js';
import { GridController } from './grid/grid.controller.js';
import { GridService } from './grid/grid.service.js';
import { ReportsService } from './grid/reports.service.js';
import { LiveEventsService } from './live-events/live-events.service.js';
import { MessagesController } from './messages/messages.controller.js';
import { MessagesService } from './messages/messages.service.js';
import { OutagesController } from './outages/outages.controller.js';
import { MockKubraProvider, PaymentProvider } from './payments/payment-provider.js';
import { PaymentsController } from './payments/payments.controller.js';
import { RealtimeGateway } from './realtime/realtime.gateway.js';
import { RealtimeService } from './realtime/realtime.service.js';
import { SeedService } from './seed/seed.service.js';
import { EvDetectionSource, SimulatedNet2GridSource } from './sim/ev-detection-source.js';
import { SimController } from './sim/sim.controller.js';
import { SimService } from './sim/sim.service.js';

@Module({
  imports: [MongooseModule.forRootAsync({ useFactory: () => ({ uri: config.mongoUrl }) }), MongooseModule.forFeature(ALL_SCHEMAS)],
  controllers: [
    AuthController,
    MeController,
    PaymentsController,
    OutagesController,
    MessagesController,
    EnrollmentsController,
    DrEventsController,
    GridController,
    CampaignsController,
    SimController,
    DemoController,
  ],
  providers: [
    Db,
    AuthTokens,
    { provide: APP_GUARD, useClass: AuthGuard },
    RealtimeService,
    RealtimeGateway,
    SeedService,
    GridService,
    ReportsService,
    LiveEventsService,
    EnergyService,
    CampaignStatsService,
    MessagesService,
    EnrollmentsService,
    DrEventsService,
    CampaignsService,
    SimulationScheduler,
    CustomersService,
    SimService,
    { provide: EvDetectionSource, useClass: SimulatedNet2GridSource },
    { provide: PaymentProvider, useClass: MockKubraProvider },
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly seed: SeedService) {}

  /** Seed automatically the first time the API starts against an empty database. */
  async onApplicationBootstrap() {
    if (await this.seed.seedIfEmpty()) new Logger('Seed').log('Empty database: demo data seeded');
  }
}
