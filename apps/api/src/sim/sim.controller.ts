import { Body, Controller, Post } from '@nestjs/common';
import { IsMongoId, Matches } from 'class-validator';
import type { LiveEvent, SimClusterRequest, SimEvDetectedRequest, SimForecastRequest } from '@demo/shared';
import { Roles } from '../auth/auth.js';
import { SimService } from './sim.service.js';

class EvDetectedDto implements SimEvDetectedRequest {
  @IsMongoId() customerId: string;
}
class ClusterDto implements SimClusterRequest {
  @Matches(/^SUB-\d+$/) substationCode: string;
}
class ForecastDto implements SimForecastRequest {
  @Matches(/^SUB-\d+-F\d+$/) feederCode: string;
}

/** Simulated Net2Grid / grid events, fired from the /demo control panel. */
@Roles('STAFF')
@Controller('sim')
export class SimController {
  constructor(private readonly sim: SimService) {}

  @Post('ev-detected')
  evDetected(@Body() b: EvDetectedDto): Promise<LiveEvent> {
    return this.sim.evDetected(b.customerId);
  }

  @Post('stopped-charging-cluster')
  cluster(@Body() b: ClusterDto): Promise<LiveEvent> {
    return this.sim.stoppedChargingCluster(b.substationCode);
  }

  @Post('feeder-forecast-high')
  forecast(@Body() b: ForecastDto): Promise<LiveEvent> {
    return this.sim.feederForecastHigh(b.feederCode);
  }
}
