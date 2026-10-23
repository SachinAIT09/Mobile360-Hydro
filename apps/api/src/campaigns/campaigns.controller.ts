import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsIn,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  AudiencePreview,
  AudiencePreviewRequest,
  Campaign,
  CampaignAudience,
  CampaignCreateRequest,
  CampaignSegment,
  CampaignType,
  CampaignVariantCopy,
  VariantId,
} from '@demo/shared';
import { Roles } from '../auth/auth.js';
import { CampaignsService } from './campaigns.service.js';

class AudienceDto {
  @IsIn(['FEEDER', 'LIVE_EVENT', 'FEEDERS']) kind: 'FEEDER' | 'LIVE_EVENT' | 'FEEDERS';
  @ValidateIf((o: AudienceDto) => o.kind === 'FEEDER') @IsString() @Matches(/^SUB-\d+-F\d+$/) feederCode?: string;
  @ValidateIf((o: AudienceDto) => o.kind === 'LIVE_EVENT') @IsMongoId() liveEventId?: string;
  @ValidateIf((o: AudienceDto) => o.kind === 'FEEDERS')
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Matches(/^SUB-\d+-F\d+$/, { each: true })
  feederCodes?: string[];
  @IsIn(['UNENROLLED_EV', 'ENROLLED_EV']) segment: CampaignSegment;
}

class ExclusionsDto {
  @IsBoolean() optedOut: boolean;
  @IsBoolean() contactedLast7Days: boolean;
  @IsBoolean() lifeSupport: boolean;
}

class ChannelsDto {
  @IsBoolean() push: boolean;
  @IsBoolean() inApp: boolean;
  @IsBoolean() sms: boolean;
  @IsBoolean() email: boolean;
}

class ScheduleDto {
  @IsBoolean() sendNow: boolean;
  @IsNumber() @Min(1) @Max(24 * 30) expiresInHours: number;
  /** Planned send time when sendNow is false (handled by the dispatcher). */
  @IsOptional() @IsISO8601() sendAt?: string;
}

class VariantDto implements CampaignVariantCopy {
  @IsIn(['A', 'B']) id: VariantId;
  @IsString() @MinLength(3) @MaxLength(140) title: string;
  @IsString() @MinLength(3) @MaxLength(1000) body: string;
  @IsString() @MinLength(1) @MaxLength(40) cta: string;
}

class PreviewDto {
  @ValidateNested() @Type(() => AudienceDto) audience: AudienceDto;
  @ValidateNested() @Type(() => ExclusionsDto) exclusions: ExclusionsDto;
}

class CreateCampaignDto {
  @IsIn(['ENROLL_OFFER', 'STOP_CHARGING']) type: CampaignType;
  @ValidateNested() @Type(() => AudienceDto) audience: AudienceDto;
  @ValidateNested() @Type(() => ExclusionsDto) exclusions: ExclusionsDto;
  @IsString() @MinLength(3) @MaxLength(140) title: string;
  @IsString() @MinLength(3) @MaxLength(1000) body: string;
  @IsString() @MinLength(1) @MaxLength(40) cta: string;
  @ValidateNested() @Type(() => ChannelsDto) channels: ChannelsDto;
  @ValidateNested() @Type(() => ScheduleDto) schedule: ScheduleDto;
  @IsOptional() @IsMongoId() testCustomerId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => VariantDto)
  variants?: VariantDto[];
}

const toAudience = (a: AudienceDto): CampaignAudience =>
  a.kind === 'FEEDER'
    ? { kind: 'FEEDER', feederCode: a.feederCode ?? '', segment: a.segment }
    : a.kind === 'FEEDERS'
      ? { kind: 'FEEDERS', feederCodes: [...(a.feederCodes ?? [])], segment: a.segment }
      : { kind: 'LIVE_EVENT', liveEventId: a.liveEventId ?? '', segment: a.segment };

@Roles('STAFF')
@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(): Promise<Campaign[]> {
    return this.campaigns.list();
  }

  @Post('preview-audience')
  preview(@Body() body: PreviewDto): Promise<AudiencePreview> {
    const req: AudiencePreviewRequest = { audience: toAudience(body.audience), exclusions: { ...body.exclusions } };
    return this.campaigns.preview(req);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Campaign> {
    return this.campaigns.get(id);
  }

  @Post()
  create(@Body() body: CreateCampaignDto): Promise<Campaign> {
    const req: CampaignCreateRequest = {
      type: body.type,
      audience: toAudience(body.audience),
      exclusions: { ...body.exclusions },
      title: body.title,
      body: body.body,
      cta: body.cta,
      channels: { ...body.channels },
      schedule: { ...body.schedule },
      testCustomerId: body.testCustomerId,
      variants: body.variants?.length === 2 ? [{ ...body.variants[0] }, { ...body.variants[1] }] : undefined,
    };
    return this.campaigns.create(req);
  }
}
