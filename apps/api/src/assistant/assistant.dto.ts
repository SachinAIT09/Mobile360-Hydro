import { Type } from 'class-transformer';
import { IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import type { AssistantContext, AssistantRequest } from '@demo/shared';

export class AssistantContextDto implements AssistantContext {
  @IsOptional() @IsString() @Matches(/^SUB-\d+-F\d+$/i) feederCode?: string;
  @IsOptional() @IsMongoId() campaignId?: string;
  @IsOptional() @IsString() @MaxLength(40) lastIntent?: string;
  @IsOptional() @IsString() @MaxLength(120) route?: string;
}

export class AssistantRequestDto implements AssistantRequest {
  @IsString() @MinLength(1) @MaxLength(300) question: string;
  @IsOptional() @ValidateNested() @Type(() => AssistantContextDto) context?: AssistantContextDto;
}

/** Plain copy of a validated context (drops class-transformer prototypes). */
export const toContext = (c: AssistantContextDto | undefined): AssistantContext => ({ ...(c ?? {}) });
