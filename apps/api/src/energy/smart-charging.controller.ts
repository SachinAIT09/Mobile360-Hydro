import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, Matches, Max, Min } from 'class-validator';
import { SMART_CHARGING, type RatePlanComparison, type RatePlanId, type SmartChargingPlan, type SmartChargingUpdateRequest } from '@demo/shared';
import { CustomerId, Roles } from '../auth/auth.js';
import { SmartChargingService } from './smart-charging.service.js';

class SmartChargingUpdateDto implements SmartChargingUpdateRequest {
  @IsBoolean() enabled: boolean;
  /** "HH:MM" on a 15-minute boundary. */
  @Matches(/^([01]\d|2[0-3]):(00|15|30|45)$/) readyBy: string;
  @IsInt() @Min(SMART_CHARGING.minTargetKwh) @Max(SMART_CHARGING.maxTargetKwh) targetKwh: number;
  @IsIn(['TOU', 'ULO', 'TIERED']) ratePlan: RatePlanId;
}

@Roles('CUSTOMER')
@Controller('me')
export class SmartChargingController {
  constructor(private readonly smart: SmartChargingService) {}

  @Get('smart-charging')
  get(@CustomerId() id: string): Promise<SmartChargingPlan> {
    return this.smart.get(id);
  }

  @Put('smart-charging')
  update(@CustomerId() id: string, @Body() body: SmartChargingUpdateDto): Promise<SmartChargingPlan> {
    return this.smart.update(id, { enabled: body.enabled, readyBy: body.readyBy, targetKwh: body.targetKwh, ratePlan: body.ratePlan });
  }

  @Post('smart-charging/boost')
  boost(@CustomerId() id: string): Promise<SmartChargingPlan> {
    return this.smart.boost(id);
  }

  @Get('rate-plans')
  ratePlans(@CustomerId() id: string): Promise<RatePlanComparison> {
    return this.smart.ratePlans(id);
  }
}
