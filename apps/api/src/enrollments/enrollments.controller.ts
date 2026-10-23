import { Body, Controller, Post } from '@nestjs/common';
import { Equals, IsBoolean, IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import type { ChargerType, EnrollRequest, Enrollment, EnrollmentSource } from '@demo/shared';
import { CustomerId, Roles } from '../auth/auth.js';
import { EnrollmentsService } from './enrollments.service.js';

class EnrollDto implements EnrollRequest {
  @IsIn(['APP_POPUP', 'CAMPAIGN', 'LEGACY']) source: EnrollmentSource;
  @IsOptional() @IsString() @MaxLength(60) evMake?: string;
  @IsOptional() @IsIn(['LEVEL_1', 'LEVEL_2']) chargerType?: ChargerType;
  @IsOptional() @IsMongoId() messageId?: string;
  @IsBoolean() @Equals(true, { message: 'Consent is required to enroll' }) consent: boolean;
}

@Roles('CUSTOMER')
@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('enrollments')
  enroll(@CustomerId() id: string, @Body() body: EnrollDto): Promise<Enrollment> {
    return this.enrollments.enroll(id, body);
  }

  /** "Not an EV? Let us know" from the EV-detected sheet. */
  @Post('ev-detections/mine/not-ev')
  notEv(@CustomerId() id: string): Promise<{ ok: true }> {
    return this.enrollments.notEv(id);
  }
}
