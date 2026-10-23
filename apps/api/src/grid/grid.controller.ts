import { Controller, Get, Param } from '@nestjs/common';
import type { BlindSpot, DeadSubstation, FeederStat, LiveEvent, ReportsSummary, StatsOverview, SubstationStat } from '@demo/shared';
import { Roles } from '../auth/auth.js';
import { LiveEventsService } from '../live-events/live-events.service.js';
import { GridService } from './grid.service.js';
import { ReportsService } from './reports.service.js';

/** Feeder visibility dashboard (staff). */
@Roles('STAFF')
@Controller()
export class GridController {
  constructor(
    private readonly grid: GridService,
    private readonly liveEvents: LiveEventsService,
    private readonly reports: ReportsService,
  ) {}

  @Get('stats/overview')
  overview(): Promise<StatsOverview> {
    return this.grid.overview();
  }

  @Get('stats/blind-spots')
  blindSpots(): Promise<BlindSpot[]> {
    return this.grid.blindSpots();
  }

  @Get('stats/dead-substations')
  dead(): Promise<DeadSubstation[]> {
    return this.grid.deadSubstations();
  }

  @Get('stats/reports')
  reportsSummary(): Promise<ReportsSummary> {
    return this.reports.summary();
  }

  @Get('substations')
  substations(): Promise<SubstationStat[]> {
    return this.grid.substations();
  }

  @Get('substations/:code/feeders')
  feeders(@Param('code') code: string): Promise<FeederStat[]> {
    return this.grid.substationFeeders(code);
  }

  @Get('feeders/:code')
  feeder(@Param('code') code: string): Promise<FeederStat> {
    return this.grid.feeder(code);
  }

  @Get('live-events')
  live(): Promise<LiveEvent[]> {
    return this.liveEvents.latest();
  }
}
